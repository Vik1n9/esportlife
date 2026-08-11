/**
 * 休賽期異動：升降級、業餘出路、戰隊解散、休息室清算、續約與自由市場。
 *
 * 目前仍是棒球的 FA 模型——合約到期才進市場。LoL 的年底是全賽區同時洗牌，合約中途
 * 被買斷、被掛交易名單都是常態，而且還有外援名額這道硬門檻。那些留待後續改寫。
 */
import { LEAGUES } from '../data/leagues.js';
import { effectiveOvr } from '../engine/abilities.js';
import {
  SCOUT_BAR, academyOffer, annualSalary, clubVerdict, disbandNoteFor, formatMoney,
  generateOffers, renewalTerms, scoutInterest, signContract, tryout,
} from '../engine/market.js';
import { homeLeagueName, leagueLabel } from '../engine/roster.js';
import { unlockTrait } from '../engine/progression.js';
import { retire } from '../engine/retire.js';
import { card, drawRoleplay, fusionBeats } from './shared.js';

export const kind = 'TRANSFER';

export function* run(g) {
  const { state, rng } = g;

  if (state.stage === 'AMATEUR') {
    // 數值達標就會有隊伍上門，不必熬滿三年
    yield* amateurStage(g);
    return;
  }

  if (state.stage === 'AM2') {
    yield* academyStage(g);
    return;
  }

  /* ---- PRO ---- */
  if (state.age >= 28 && (state.lastDelta || 0) >= 0 && !state.skipSeason && unlockTrait(state, 'veteran')) {
    yield card('gold', '隱藏素質解鎖：老將', '28 歲仍屹立一軍，你學會用頭腦打比賽。<b class="hl">衰退減緩、可延長生涯</b>。');
    yield* fusionBeats(g);
  }

  if (effectiveOvr(state) < 30) retire('能力已跌破青訓最低水準，遭釋出，被迫退役。');

  const note = disbandNoteFor(state);
  if (note) {
    if (state.wonWorldsThisYear) {
      yield card('gold', '改寫歷史',
        `你們用一座世界冠軍<b class="hl">改寫了史實</b>——<b class="hl">${state.team}</b> 沒有解散，母公司宣布續營！`);
      state.honors.push(`${state.year} 改寫歷史`);
      // 續營＝合約照走
      tickContract(state);
      return;
    }
    yield card('bad', '隊伍解散', `<b class="hl">${state.team}</b> ${note}。合約作廢，你被<b class="hl">強制送入自由市場</b>。`);
    state.contract = null;
    state.forcedFA = true;
    yield* freeAgency(g, { forced: true });
    return;
  }

  // 休息室與輿論的後果。合約還沒到期也擋不住——這是「被開除」跟「約滿不續」的差別
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

  // 復健年也要走合約時鐘（舊版直接跳過，等於免費續一年）
  if (state.contract && state.contract.years > 1) {
    tickContract(state);
    return;
  }
  yield* freeAgency(g, { forced: false });
}

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
      { id: 'try', label: `再次參加${state.am2Track === 'OVERSEAS' ? '海外' : '主場'}賽區試訓`, main: true, note: `綜合 ${effectiveOvr(state)}` },
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

function* joinProTeam(g, offer, track, title) {
  const { state, rng } = g;
  state.stage = 'PRO';
  state.stageYear = 0;
  state.am2Track = track;
  signContract(state, rng, offer);
  yield card('gold', title,
    `你被 <b class="hl">${offer.team}</b> 簽下，正式踏入 <b class="hl">${leagueLabel(state, offer.league)}</b>！教練體系：${state.coach}。`);
}

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
      note: `目前綜合 ${interest.ovr}；現在進去就是墊底，養高一點再談條件`,
    });
  }

  const picked = yield {
    type: 'choice',
    title: mandatory
      ? `網咖盃第 ${state.stageYear} 年 · 綜合 ${interest.ovr} · 該做決定了`
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
  const o = effectiveOvr(state);
  if (state.age >= 22) {
    retire(`打到 ${state.age} 歲，連二隊的門檻都沒摸到。你把網咖那張會員卡剪了。`);
  }
  const picked = yield {
    type: 'choice',
    title: `網咖盃第 ${state.stageYear} 年 · 綜合 ${o} · 還沒有人來`,
    options: [
      { id: 'stay', label: '再打一年網咖盃', main: true, note: `門檻：青訓 ${SCOUT_BAR.AM2}｜主場一隊 ${SCOUT_BAR.HOME}｜最多撐到 22 歲` },
      { id: 'quit', label: '放棄職業之路', warn: true },
    ],
  };
  if (picked === 'quit') retire('最後一場網咖盃打完，你把自己的滑鼠收進背包，再也沒回過那條街。');
  yield card('', '再練一年', '沒有人打電話來。你把位子續了下去。');
}

/* ================= 自由市場 ================= */

function* freeAgency(g, { forced }) {
  const { state, rng } = g;
  const offers = generateOffers(state, rng, { excludeCurrentTeam: forced });
  const options = [];

  if (!forced && state.contract) {
    const { long, short } = renewalTerms(state);
    options.push({
      id: 'renew-long',
      label: `與 ${state.team} 續長約`,
      note: `${long.years} 年｜年薪估 ${formatMoney(annualSalary(state, state.league, long.mult))}`,
      main: true,
      payload: { team: state.team, league: state.league, ...long },
    });
    options.push({
      id: 'renew-short',
      label: `與 ${state.team} 簽短約`,
      note: `${short.years} 年｜年薪估 ${formatMoney(annualSalary(state, state.league, short.mult))}｜賭下次身價`,
      payload: { team: state.team, league: state.league, ...short },
    });
  }

  offers.forEach((offer, i) => {
    const league = LEAGUES[offer.league];
    const label = league.region === 'HOME' ? homeLeagueName(state) : league.name;
    options.push({
      id: `offer-${i}`,
      label: `${offer.team}（${label}）`,
      note: `${offer.years} 年｜年薪估 ${formatMoney(offer.salary)}｜係數 ×${offer.mult.toFixed(2)}`,
      payload: offer,
    });
  });

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
