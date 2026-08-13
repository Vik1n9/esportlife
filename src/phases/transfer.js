/**
 * 轉會窗口。
 *
 * 舊版是棒球的 FA 模型：合約到期才進市場，沒到期的年份休賽期什麼都不會發生。
 * LoL 的年底是全賽區同時洗牌——合約中途被買斷、被掛交易名單都是常態，而且整個
 * 賽區的名單會在同一段時間翻新。
 *
 * 現在窗口每年都開，三拍：
 *   1. 傳聞  被幾支隊點名連結，數量由知名度與上季表現決定
 *   2. 官宣  續約／被挖／買斷／掛交易名單
 *   3. 落定  隊友名單翻新（由 signContract → rollRoster 處理）
 *
 * 風評低而知名度高的人會出現「鬼牧」：傳聞滿天飛，實際報價一個都沒有。
 */
import { LEAGUES } from '../data/leagues.js';
import { effectiveCoachRating } from '../engine/attributes.js';
import {
  academyOffer, annualSalary, clubVerdict, disbandNoteFor, formatMoney,
  generateOffers, renewalTerms, scoutInterest, scoutVerdict, signContract, tryout,
} from '../engine/market.js';
import { homeLeagueName, leagueLabel, teamsOf } from '../engine/roster.js';
import { occupiesImportSlot } from '../engine/imports.js';
import { clamp } from '../core/rng.js';
import { unlockTrait } from '../engine/progression.js';
import { flag } from '../kernel/modifiers.js';
import { retire } from '../engine/retire.js';
import { card, drawRoleplay, fusionBeats } from './shared.js';

export const kind = 'TRANSFER';

/** 教練評價跌破這個數字，連青訓的最低標都算不上，直接判出局（舊 30 × 1.25） */
const FLOOR_RATING = 38;

export function* run(g) {
  const { state, rng } = g;

  // 業餘與青訓的年度流程自成一套，職業選手才走下面的異動主線
  if (state.stage === 'AMATEUR') {
    yield* amateurStage(g);
    return;
  }
  if (state.stage === 'AM2') {
    yield* academyStage(g);
    return;
  }

  /* ---- PRO ---- */

  // 28 歲仍在一軍的老將，這一年覺醒「用頭腦打球」——衰退減緩、可延長生涯
  if (state.age >= 28 && (state.lastDelta || 0) >= 0 && !state.skipSeason && unlockTrait(state, 'veteran')) {
    yield card('gold', '隱藏素質解鎖：老將', '28 歲仍屹立一軍，你學會用頭腦打比賽。<b class="hl">衰退減緩、可延長生涯</b>。');
    yield* fusionBeats(g);
  }

  if (effectiveCoachRating(state) < FLOOR_RATING) retire('能力已跌破青訓最低水準，遭釋出，被迫退役。');

  // 史實解散：拿過世界冠軍就能改寫史實續營，否則合約作廢、強制進市場
  const note = disbandNoteFor(state);
  if (note) {
    if (state.wonWorldsThisYear) {
      yield card('gold', '改寫歷史',
        `你們用一座世界冠軍<b class="hl">改寫了史實</b>——<b class="hl">${state.team}</b> 沒有解散，母公司宣布續營！`);
      state.honors.push(`${state.year} 改寫歷史`);
      tickContract(state);   // 續營＝合約照走
      return;
    }
    yield card('bad', '隊伍解散', `<b class="hl">${state.team}</b> ${note}。合約作廢，你被<b class="hl">強制送入自由市場</b>。`);
    state.contract = null;
    state.forcedFA = true;
    yield* freeAgency(g, { forced: true });
    return;
  }

  // 休息室與輿論的清算：合約還沒到期也擋不住——這是「被開除」跟「約滿不續」的差別
  const verdict = clubVerdict(state, rng);
  if (verdict.kind !== 'none') {
    state.firedTimes += 1;
    state.contract = null;
    state.forcedFA = true;
    if (verdict.kind === 'fired') {
      yield card('bad', '戰隊切割',
        `${verdict.note}。<b class="hl">${state.team}</b> 單方面終止合約，你被<b class="dn">強制推上自由市場</b>，` +
        `而且這次願意接電話的隊伍不多。`);
    } else {
      yield card('bad', '被迫轉隊',
        `${verdict.note}。你跟隊友之間已經沒辦法再同場訓練，<b class="hl">${state.team}</b> 把你掛上交易名單。`);
    }
    yield* drawRoleplay(g, 'media');
    yield* freeAgency(g, { forced: true });
    return;
  }

  // 轉會窗口每年都開，不管合約剩幾年
  const heat = yield* rumours(g);

  if (state.contract && state.contract.years > 1) {
    // 合約中途也擋不住買斷——傳聞夠熱的時候，對方會直接把違約金付掉
    if (yield* buyout(g, heat)) return;
    // 復健年也要走合約時鐘（舊版直接跳過，等於免費續一年）
    tickContract(state);
    return;
  }
  yield* freeAgency(g, { forced: false });
}

/* ================= 第一拍：傳聞 ================= */

/**
 * 被幾支隊點名連結。
 *
 * 知名度決定聲量，上季表現決定可信度。兩者分開的用意是做得出「鬼牧」——風評爛
 * 但很紅的人，傳聞會滿天飛，實際打電話來的一個都沒有。
 *
 * @returns {number} 傳聞熱度（0–5），供買斷判定使用
 */
function* rumours(g) {
  const { state, rng } = g;
  if (state.stage !== 'PRO') return 0;

  const fame = state.fame ?? 0;
  const delta = state.lastDelta || 0;
  // fame 本來就是 0–100，不縮放；delta 是評價量，per-point 係數 ÷1.25（0.6 → 0.48）
  const heat = Math.round(clamp((fame - 32) / 14 + Math.max(0, delta) * 0.48, 0, 5));
  if (heat <= 0) return 0;

  const pool = teamsOf(state, state.league).filter((t) => t !== state.team);
  if (!pool.length) return heat;
  const linked = rng.sample(pool, Math.min(heat, pool.length));

  // 名聲見底的時候，傳聞跟報價會脫節——這就是鬼牧。V4 §9.4 拿掉 `rep` 之後，
  // 「名聲見底」只剩特質副作用一個來源（圈內毒瘤），判準跟著改讀它
  const ghost = flag(state, 'offerPenalty') && heat >= 2;
  yield card(ghost ? '' : 'info', '轉會期傳聞',
    `窗口一開，你的名字被掛在 <b class="hl">${linked.join('、')}</b> 底下。` +
    (ghost
      ? '<br><span class="muted">記者寫得煞有其事，但你的經紀人說，沒有一通電話是真的。</span>'
      : `<br><span class="muted">經紀人的手機這幾天沒停過。</span>`));
  return heat;
}

/* ================= 第二拍：合約中途的買斷 ================= */

/**
 * 合約沒到期也走得掉——對方把違約金付了。
 * @returns {boolean} 是否已經處理完異動
 */
function* buyout(g, heat) {
  const { state, rng } = g;
  // 挖角熱度門檻：delta ≥ 1.25（舊 1 × 1.25，§17.2 二）
  if (heat < 3 || (state.lastDelta || 0) < 1.25) return false;
  if (!rng.chance(10 + heat * 4)) return false;

  const offers = generateOffers(state, rng, { excludeCurrentTeam: true });
  if (!offers.length) return false;
  const offer = offers[0];

  const picked = yield {
    type: 'choice',
    title: `買斷報價 · ${offer.team}`,
    options: [
      {
        id: 'go',
        label: `接受買斷，加盟 ${offer.team}`,
        note: `${offer.years} 年｜年薪估 ${formatMoney(offer.salary)}｜合約還剩 ${state.contract.years} 年，違約金由對方付`,
        main: true,
      },
      { id: 'stay', label: `留在 ${state.team} 走完合約`, note: '把這一季打完再談' },
    ],
  };
  if (picked !== 'go') {
    yield card('', '婉拒買斷', `你選擇留下來。<b class="hl">${state.team}</b> 的休息室鬆了一口氣。`);
    return false;
  }

  const before = state.team;
  signContract(state, rng, offer);
  yield card('info', '買斷成交',
    `<b class="hl">${offer.team}</b> 付掉違約金，把你從 <b class="hl">${before}</b> 帶走。` +
    `${offer.years} 年合約，教練體系：${state.coach}。`);
  return true;
}

/** 合約時鐘：一年走一格，掛零後就是自由球員 */
function tickContract(state) {
  if (state.contract) state.contract.years = Math.max(0, state.contract.years - 1);
  state.teamYears += 1;
}

/* ================= 青訓 ================= */

function* academyStage(g) {
  const { state, rng } = g;
  if (state.age >= 28) retire(`多次試訓落榜，${state.year} 年退出電競圈。`);

  const picked = yield {
    type: 'choice',
    title: '青訓年度結束',
    options: [
      { id: 'try', label: `再次參加${state.am2Track === 'OVERSEAS' ? '海外' : '主場'}賽區試訓`, main: true, note: scoutVerdict(state) },
      { id: 'switch', label: state.am2Track === 'OVERSEAS' ? '轉回主場賽區試訓' : '改走海外賽區路線', note: '海外門檻高、薪資高' },
      { id: 'quit', label: '就此退役', warn: true },
    ],
  };
  if (picked === 'quit') retire('結束短暫的追夢之旅。');
  if (picked === 'switch') state.am2Track = state.am2Track === 'OVERSEAS' ? 'HOME' : 'OVERSEAS';

  const res = tryout(state, rng, state.am2Track);
  if (res.ok) {
    state.stage = 'PRO';
    state.stageYear = 0;
    signContract(state, rng, res);
    yield card('gold', '試訓通過',
      `你被 <b class="hl">${res.team}</b> 簽下，正式踏入 <b class="hl">${leagueLabel(state, res.league)}</b> 職業賽場！教練體系：${state.coach}。`);
  } else {
    yield card('bad', '試訓落榜', '名單公布，沒有你的名字。再練一年。');
  }
}

/* ================= 業餘出路 ================= */

/** 業餘選手直接被一隊簽走：進 PRO、清掉試訓路線偏好 */
function* joinProTeam(g, offer, track, title) {
  const { state, rng } = g;
  state.stage = 'PRO';
  state.stageYear = 0;
  state.am2Track = track;
  signContract(state, rng, offer);
  yield card('gold', title,
    `你被 <b class="hl">${offer.team}</b> 簽下，正式踏入 <b class="hl">${leagueLabel(state, offer.league)}</b>！教練體系：${state.coach}。`);
}

/** 業餘選手被收進二隊：進 AM2，薪水低但有完整的訓練環境 */
function* joinAcademy(g, offer, track) {
  const { state, rng } = g;
  state.stage = 'AM2';
  state.stageYear = 0;
  state.am2Track = track;
  signContract(state, rng, offer);
  yield card('info', '青訓報到',
    `<b class="hl">${offer.team}</b> 把你收進二隊。薪水很低，但你終於有教練、有訓練賽、有隊友。`);
}

/**
 * 業餘階段的出路判定：只要數值達標，就會有隊伍上門，不必熬滿三年。
 *
 * 「職業隊」不是只有一隊。舊流程只給「投入主場賽區試訓」這一個選項，門檻 45，
 * 但三年期滿時 OVR 中位數只有 37——那個選項的成功率實測是 0%，每個人都是走完
 * 假的路口再被丟進青訓。現在分成三層各自判定：
 *
 *   青訓二隊（門檻 36）：網咖打出名號後最常見的出路
 *   主場一隊（門檻 45）：少年天才，直接進一軍
 *   海外賽區（門檻 47）：極罕見
 *
 * 前三年可以婉拒、留下來把數值養高再談，婉拒沒有懲罰；第三年起必須做決定。
 */
function* amateurStage(g) {
  const { state, rng } = g;
  const mandatory = state.stageYear >= 3;
  const interest = scoutInterest(state);
  const offers = [];

  // 依門檻從高到低試：海外 → 主場一隊 → 青訓。前面試過了才輪得到後面，
  // 所以「海外達標」的人不會同時收到青訓跟海外的邀約混淆選擇
  if (interest.overseas) {
    const abroad = tryout(state, rng, 'OVERSEAS');
    if (abroad.ok) offers.push({ offer: abroad, track: 'OVERSEAS', pro: true });
  }
  if (interest.home) {
    const home = tryout(state, rng, 'HOME');
    if (home.ok) offers.push({ offer: home, track: 'HOME', pro: true });
  }
  if (interest.am2) {
    const track = interest.overseas ? 'OVERSEAS' : 'HOME';
    offers.push({ offer: academyOffer(state, rng, track), track, pro: false });
  }

  if (!offers.length) {
    if (mandatory) yield* amateurDeadEnd(g);
    return;
  }

  yield card('gold', mandatory ? '職業隊的邀約' : '星探上門',
    `網咖店長把你上週那場的錄影傳了出去。<b class="hl">${offers.map((x) => x.offer.team).join('、')}</b> ` +
    `派人來看你打了一整晚。${mandatory ? '' : `${state.age} 歲，還沒打滿三年業餘，就有人來敲門了。`}`);

  const options = offers.map(({ offer, pro }, i) => ({
    id: `sign-${i}`,
    label: `${offer.team}（${pro ? leagueLabel(state, offer.league) : '青訓二隊'}）`,
    note: `${offer.years} 年｜年薪估 ${formatMoney(annualSalary(state, offer.league, offer.mult))}`
      + `｜隊伍平均 ${LEAGUES[offer.league].par}`,
    main: i === 0,
  }));

  if (mandatory) {
    options.push({ id: 'quit', label: '放棄職業之路', warn: true });
  } else {
    options.push({
      id: 'wait',
      label: '婉拒，留在業餘再練一年',
      note: `${scoutVerdict(state)}；現在進去就是墊底，養高一點再談條件`,
    });
  }

  const picked = yield {
    type: 'choice',
    title: mandatory
      ? `網咖盃第 ${state.stageYear} 年 · 該做決定了`
      : `有人要簽你 · ${state.year}`,
    options,
  };

  if (picked === 'quit') retire('最後一場網咖盃打完，你把自己的滑鼠收進背包，再也沒回過那條街。');
  if (picked === 'wait') {
    yield card('', '婉拒邀約', '你說再等等。回到網咖那個位子，繼續練。');
    return;
  }

  const chosen = offers[Number(picked.split('-')[1])];
  if (chosen.pro) yield* joinProTeam(g, chosen.offer, chosen.track, state.stageYear < 3 ? '提前轉職業' : '入選職業隊');
  else yield* joinAcademy(g, chosen.offer, chosen.track);
}

/** 三年期滿卻連青訓門檻都沒摸到 */
function* amateurDeadEnd(g) {
  const { state } = g;
  if (state.age >= 22) {
    retire(`打到 ${state.age} 歲，連二隊的門檻都沒摸到。你把網咖那張會員卡剪了。`);
  }
  const picked = yield {
    type: 'choice',
    title: `網咖盃第 ${state.stageYear} 年 · 還沒有人來`,
    options: [
      { id: 'stay', label: '再打一年網咖盃', main: true, note: `${scoutVerdict(state)}｜最多撐到 22 歲` },
      { id: 'quit', label: '放棄職業之路', warn: true },
    ],
  };
  if (picked === 'quit') retire('最後一場網咖盃打完，你把自己的滑鼠收進背包，再也沒回過那條街。');
  yield card('', '再練一年', '沒有人打電話來。你把位子續了下去。');
}

/* ================= 自由市場 ================= */

/** 約滿時的續約選項：同隊長約與短約，強制 FA 沒有這組 */
function renewalOptions(state) {
  const { long, short } = renewalTerms(state);
  return [
    {
      id: 'renew-long',
      label: `與 ${state.team} 續長約`,
      note: `${long.years} 年｜年薪估 ${formatMoney(annualSalary(state, state.league, long.mult))}`,
      main: true,
      payload: { team: state.team, league: state.league, ...long },
    },
    {
      id: 'renew-short',
      label: `與 ${state.team} 簽短約`,
      note: `${short.years} 年｜年薪估 ${formatMoney(annualSalary(state, state.league, short.mult))}｜賭下次身價`,
      payload: { team: state.team, league: state.league, ...short },
    },
  ];
}

/** 市場報價轉成選項。主場賽區的隊名用當年稱呼，海外賽區用賽區名 */
function offerOptions(state, offers) {
  return offers.map((offer, i) => {
    const league = LEAGUES[offer.league];
    const label = league.region === 'HOME' ? homeLeagueName(state) : league.name;
    return {
      id: `offer-${i}`,
      label: `${offer.team}（${label}）`,
      note: `${offer.years} 年｜年薪估 ${formatMoney(offer.salary)}｜係數 ×${offer.mult.toFixed(2)}`,
      payload: offer,
    };
  });
}

function* freeAgency(g, { forced }) {
  const { state, rng } = g;
  const offers = generateOffers(state, rng, { excludeCurrentTeam: forced });
  const options = [];

  // 外援名額：不是數值不夠，是位子沒了。這是主場賽區出身的選手出海時的真實門檻
  if (offers.blockedByImports?.length) {
    const names = offers.blockedByImports.map((k) => LEAGUES[k].name).join('、');
    yield card('', '外援名額已滿',
      `<b class="hl">${names}</b> 那邊有隊伍問過，但每隊只能上 2 名外援，名額都佔著。` +
      `<br><span class="muted">要擠進去，你得強到讓對方願意把現有的外援換掉。</span>`);
  }

  if (!forced && state.contract) options.push(...renewalOptions(state));
  options.push(...offerOptions(state, offers));

  // 一張報價都沒有：被釋出的直接退休，約滿的只能減薪留下或退役
  if (!options.length) {
    if (forced) {
      state.forcedRetire = true;
      yield card('bad', '自由市場無人問津', '解散後，各隊名單已滿，電話再也沒有響過。');
      retire(`隊伍解散後無人接手，${state.year} 年黯然退役。`);
    }
    yield card('bad', '自由市場', '電話沒有響。市場對你的評價相當冷。');
    const picked = yield {
      type: 'choice',
      title: '沒有球隊開價',
      options: [
        { id: 'cut', label: `回 ${state.team} 減薪簽約`, note: '1 年｜年薪係數 ×0.70', main: true },
        { id: 'quit', label: '就此退役', warn: true },
      ],
    };
    if (picked === 'quit') retire(`FA 市場乏人問津，${state.year} 年黯然退役。`);
    signContract(state, rng, { team: state.team, league: state.league, years: 1, mult: 0.7 });
    yield card('info', '減薪續約', `你接受了減薪，留在 <b class="hl">${state.team}</b>。`);
    return;
  }

  if (!forced) options.push({ id: 'quit', label: '功成身退，宣布退役', warn: true });

  const pickedId = yield {
    type: 'choice',
    title: forced ? '自由市場報價一覽（強制轉隊）' : '合約到期 · 取得自由球員資格',
    options,
  };
  if (pickedId === 'quit') retire(`${state.year} 年，你在生涯高點選擇了離開。`);

  const chosen = options.find((o) => o.id === pickedId);
  const before = state.team;
  signContract(state, rng, chosen.payload);
  if (chosen.payload.team === before && chosen.id.startsWith('renew')) {
    yield card('info', '續約', `與 <b class="hl">${state.team}</b> 完成 ${chosen.payload.years} 年續約。`);
  } else {
    yield card('info', '簽約',
      `與 <b class="hl">${state.team}</b> 簽下 <b class="hl">${chosen.payload.years} 年</b>合約（年薪係數 ×${chosen.payload.mult.toFixed(2)}）。教練體系：${state.coach}。`);
  }
}
