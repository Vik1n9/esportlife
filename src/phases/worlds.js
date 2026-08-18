/**
 * 世界賽。
 *
 * 舊版有兩個問題，都是承襲自棒球模型：
 *
 * 1. **門票是擲骰**。`rng.chance(96/88/74/30)`——種子序明明已經算好了，卻還要再擲
 *    一次，於是第一種子有 4% 機率拿不到門票，而「最後一張門票」變成一個 30% 的
 *    數字而不是一場比賽。
 * 2. **整個賽事只有一次擲骰**。`roll < 25 → 入圍賽出局` 一句話帶過。一整年最大的
 *    舞台，玩家看不到任何過程；同一時間聯賽季後賽反而是逐局模擬的。
 *
 * 現在門票是確定性的（種子序在席位內就直接進，最後一張打地區資格賽），賽事逐輪
 * 出比分：入圍賽 → 小組賽／Swiss → 八強／四強／決賽 BO5。
 */
import { LEAGUES } from '../data/leagues.js';
import { FINISH_TO_SEED, WORLDS_RESULTS, worldsRuleOf } from '../data/formats/worlds.js';
import { worldsSlotsOf } from '../data/regions/index.js';
import { runGroup, runSwiss } from '../kernel/groups.js';
import { worldsSeed } from '../kernel/series.js';
import { intlOpponent, oppLineupText, swissOpponent } from '../engine/opponents.js';
import { PRESSURE } from '../engine/psych.js';
import { applyMental } from '../engine/mental.js';
import { grantUnique, unlockTrait } from '../engine/progression.js';
import { BASE_TRAITS } from '../data/traits.js';
import { UNIQUE_TRAITS } from '../data/epics.js';
import { CHAMPION_BONUS, CHAMPION_ENCOUNTER, challengableChampion, drawChampion } from '../engine/champion.js';
import { reigningChampion } from '../engine/ledger.js';
import { recordIntlOpponentMicro, recordPlayerIntlMicroStats } from '../engine/leagueSim.js';
import { seriesMicroStats } from '../engine/season.js';
import { bonus } from '../kernel/modifiers.js';
import { drawRoleplay, fusionBeats, intlBandNote, kinded, recordIntlFinish, recordIntlGroup, recordIntlSeries } from './shared.js';
const card = kinded('match');
import { runSeriesEvent } from './seriesEvent.js';

export const kind = 'WORLDS';

/**
 * 世界賽的對手是各賽區的一號種子。基準比 MSI 再高一階。
 *
 * S29：階梯不變，對手改由 NPC 池實體化（§23.4）。地區資格賽走 `scope: 'playoff'`
 * ——它是聯賽內賽事，選隊池是玩家賽區、排除自己的隊。
 */
function drawWorldsOpp(g, step, opts = {}) {
  const { state, rng } = g;
  return intlOpponent(state, rng, step, {
    floor: 74, mod: bonus(state, 'worldsRoll') * -0.15, intlBoost: 0, ...opts,
  });
}

/** 依當年制度算出賽區內的種子序。0 = 沒有名次。 */
function seedOf(state, rule) {
  if (rule.seedFrom === 'CHAMP_POINTS') return worldsSeed(state.champPoints);
  if (rule.seedFrom === 'FINAL_SPLIT_PLAYOFF') {
    const last = state.splitLog[state.splitLog.length - 1];
    return FINISH_TO_SEED[last?.finish] ?? 0;
  }
  // 2012：沒有點數制，只有賽段冠軍拿得到那張外卡門票
  return state.splitLog.some((s) => s.finish === 'champion') ? 1 : 0;
}

/**
 * 把今年的世界賽冠軍寫進 `titleHistory`（S20g，§16.2）。
 *
 * 玩家奪冠與 NPC 奪冠走同一張表——這是「NPC 與玩家共用」的定義。玩家奪冠時
 * `isPlayer` 帶真，其餘年份抽一個合成冠軍（賽區依席位加權、隊名走 `teamNamesOf`）。
 * 不管玩家參不參賽，只要世界賽這一站跑了，今年就必定有人奪冠（第一年除外：那時
 * `titleHistory` 還沒任何一筆，`reigningChampion` 自然回 null）。
 */
function registerChampion(g, { isPlayer, team, region }) {
  const { state, rng } = g;
  state.titleHistory.push(drawChampion(state, rng, { isPlayer, team, region }));
}

export function* run(g) {
  const { state, rng } = g;
  if (state.stage !== 'PRO') return;
  const league = LEAGUES[state.league];
  if (!league?.region || league.tier < 2) return;

  // 復健年：玩家整季報銷、不跑賽事，但世界賽照常舉行——仍要登記今年的冠軍，
  // 否則 `titleHistory` 會留空窗，隔年 `reigningChampion` 查到的是更早的舊冠軍
  if (state.skipSeason) {
    registerChampion(g, { isPlayer: false });
    return;
  }

  const rule = worldsRuleOf(state.year);
  // DEMO 測試開關（S21，§19.2「可強制出線供測試」）：直接發第一種子，讓世界賽
  // 序列在 DEMO 一年內驗得到。與 msi.js 同一個 `g.opts.forceIntl`，同樣不進 state
  const seed = g.opts?.forceIntl ? 1 : seedOf(state, rule);
  state.seedRank = seed;
  // MSI 冠軍為賽區多掙的那張門票（2023 起的真實制度）；force 時席位至少一張，
  // 否則第一種子也會被 `seed > slots` 擋在門外，開關就白做了
  const baseSlots = worldsSlotsOf(state.year, league.region) + (state.worldsSlotBonus || 0);
  const slots = g.opts?.forceIntl ? Math.max(1, baseSlots) : baseSlots;

  if (!seed || seed > slots) {
    if (seed) {
      yield card('', '世界賽',
        `賽區只有 <b class="hl">${slots}</b> 張門票，你們排在第 ${seed} 順位——<b class="dn">今年到此為止</b>。`);
    }
    registerChampion(g, { isPlayer: false });
    return;
  }

  // 最後一張門票不是白給的：要打地區資格賽（LCK Regional Finals／LCS Gauntlet）
  if (rule.gauntlet && seed === slots && slots > 1) {
    yield card('info', '地區資格賽',
      `賽區最後一張世界賽門票，由第 ${seed} 種子打<b class="hl">地區資格賽</b>決定。BO5，輸了整年就結束。`);
    yield* drawRoleplay(g, 'presser', { amp: 1.4, event: 'worlds' });
    // 生死戰是全遊戲壓力係數最高的場合（V4 §9.3／§11.1 都把它單獨列一行），
    // 五拍的 stakes 也給最高級——賽前與賽後的語氣跟著變重（V4 §15.4）
    const gate = drawWorldsOpp(g, -2.5, { scope: 'playoff' });
    const res = yield* runSeriesEvent(g, {
      title: '地區資格賽 · BO5',
      bo: 5, oppRating: gate.strength, seed, opp: gate,
      stakes: 'elimination', pressure: PRESSURE.elimination,
      oppNote: oppLineupText(gate) || '對手是賽區裡跟你爭最後一張門票的隊伍。',
    });
    recordIntlSeries(state, rng, res, gate);
    yield card(res.win ? 'good' : 'bad', '地區資格賽',
      res.win ? '<b class="hl">最後一張門票是你們的。</b>' : '差一場。');
    if (!res.win) {
      registerChampion(g, { isPlayer: false });
      return;
    }
  }

  const defending = reigningChampion(state, 'worlds');
  yield card('gold', `世界賽 ${state.year}`,
    `你隨 <b class="hl">${state.team}</b> 以<b class="hl">第 ${seed} 種子</b>晉級 ${state.year} 世界大賽！` +
    (state.worldsSlotBonus ? '<br><span class="muted">這張門票是靠 MSI 冠軍替賽區多掙來的。</span>' : '') +
    (seed >= 3 ? '<br><span class="muted">賽前預測沒有一份把你們排進四強。</span>' : '') +
    (defending?.isPlayer ? '<br><span class="muted">你是上一屆的冠軍——每一支隊伍都以你為目標。</span>' : ''));
  yield* drawRoleplay(g, 'intl', { amp: 1.8, event: 'worlds' });

  const outcome = yield* runTournament(g, rule, seed);
  yield* settle(g, outcome, seed);
}

/* ---------------- 賽程 ---------------- */

function* runTournament(g, rule, seed) {
  const { state, rng } = g;
  const league = LEAGUES[state.league];

  // 入圍賽：非頂級賽區一律要打，頂級賽區的最後一個種子在 2017–2022 也要打
  const minor = league.tier < 3;
  const needPlayIn = rule.playIn
    && ((rule.playIn.minorAlways && minor) || (rule.playIn.majorLastSeed && seed >= 3));
  if (needPlayIn) {
    yield card('info', '入圍賽',
      minor
        ? '賽區席位排在後段，主賽事之前要先打入圍賽。'
        : `第 ${seed} 種子從入圍賽打起。`);
    const playIn = drawWorldsOpp(g, -3.75);
    const res = yield* runSeriesEvent(g, {
      title: '入圍賽 · BO5',
      bo: 5, oppRating: playIn.strength, seed, opp: playIn, intl: true,
      stakes: 'intl', pressure: PRESSURE.intl,
      oppNote: oppLineupText(playIn) || '對手是同樣從入圍賽打起的隊伍。',
    });
    recordIntlSeries(state, rng, res, playIn);
    yield card(res.win ? 'good' : 'bad', '入圍賽',
      res.win ? '晉級主賽事。' : '<b class="dn">入圍賽出局</b>。');
    if (!res.win) return 'playin';
  }

  const advanced = rule.stage === 'SWISS'
    ? yield* swissStage(g, seed)
    : yield* groupStage(g, seed);
  if (!advanced) return 'stage';

  return yield* knockout(g, seed);
}

/** 2012–2022：四隊小組雙循環，前二晉級 */
function* groupStage(g, seed) {
  const { state, rng } = g;
  const opps = [0, 2.5, 5].map((s) => drawWorldsOpp(g, s));
  const res = runGroup(state, rng, { oppRatings: opps.map((o) => o.strength), seed });
  recordIntlGroup(state, res);
  // S35（§24.4.3 母體 NPC 側）：小組 BO1 逐場把對手五人微觀併進 intl 池——
  // 玩家側 BO1 沒有陣亡數據未併（S34 已知缺口），NPC 側不吃這個限制
  for (const gm of res.games) recordIntlOpponentMicro(state, rng, opps[gm.oppIndex], [gm.win]);
  // 實體化對手帶隊名（§23.4 身分實體化）；匿名落回的那幾隊不列名
  const named = opps.filter((o) => o.materialized).map((o) => o.teamName);
  const band = intlBandNote(state);
  yield card(res.advanced ? 'good' : 'bad', '世界賽小組賽',
    (named.length ? `<span class="muted">對手：${named.join('、')}</span><br>` : '') +
    `六場循環戰 <b class="${res.advanced ? 'up' : 'dn'}">${res.wins}勝 ${res.losses}敗</b>。` +
    (res.note ? `${res.note}。` : '') +
    (res.advanced ? '晉級八強。' : '<b class="dn">小組止步</b>。') +
    (band ? `<br>${band}` : ''));
  return res.advanced;
}

/**
 * 2023 起：Swiss。三勝晉級、三敗淘汰，勝場對勝場。
 * 每一輪都出比分——這是「過程」跟舊版差最多的一段。
 */
function* swissStage(g, seed) {
  const { state, rng } = g;
  const par = Math.max(LEAGUES[state.league]?.par ?? 66, 74);
  // S29：Swiss 每輪的對手也走實體化（§23.4）——強度隨戰績的階梯不變，只是對手
  // 換成該年 carry 最接近目標的 NPC 隊
  const res = runSwiss(state, rng, {
    par, seed,
    oppOf: (wins, losses) => swissOpponent(state, rng, wins, losses),
  });
  recordIntlGroup(state, res);
  // S35（§24.4.3 母體補齊）：Swiss 每輪走 runSeries 但 W/L 只經 recordIntlGroup，
  // S34 落地筆記說「經 runSeries 的都併了」——玩家五人微觀實際漏了這一層，逐輪補進
  // intl 池；對手五人微觀同站接上（NPC 側新口）
  for (const r of res.rounds) {
    recordPlayerIntlMicroStats(state, seriesMicroStats(state, rng, r.games.length, r.deaths));
    recordIntlOpponentMicro(state, rng, r.opp, r.games.map((g) => g.startsWith('W')));
  }

  const lines = res.rounds.map((r) =>
    `第 ${r.label}（${r.record}）　BO${r.bo}　<b class="${r.win ? 'up' : 'dn'}">${r.score}</b>` +
    (r.decisive ? `<span class="muted">　${r.win ? '晉級局' : '淘汰局'}</span>` : '')).join('<br>');
  const band = intlBandNote(state);

  yield card(res.advanced ? 'good' : 'bad', 'Swiss 賽段',
    `${lines}<br><b class="${res.advanced ? 'up' : 'dn'}">${res.wins}-${res.losses}</b>　` +
    (res.advanced ? '晉級八強。' : '<b class="dn">Swiss 賽段止步</b>。') +
    (band ? `<br>${band}` : ''));
  return res.advanced;
}

/** 八強 → 四強 → 決賽，全部 BO5。決賽前留一個扮演路口。 */
function* knockout(g, seed) {
  const { state, rng } = g;

  // 衛冕者賽路（S20g，§16.2）：上屆世界賽冠軍佔一個淘汰賽席位。玩家走得越深越可能
  // 碰上他（八強 < 四強 < 決賽）；碰上了就算淘汰掉他，之後的輪次不再重複標記。
  // 玩家自己就是衛冕者／第一年沒冠軍／衛冕者的賽區今年沒席位 → 不標記
  const champ = challengableChampion(state);
  let champMet = false;

  const rounds = [
    { key: 'quarter', name: '八強', step: 6.25 },
    { key: 'semi', name: '四強', step: 9.5 },
    { key: 'final', name: '決賽', step: 12.5 },
  ];

  for (const round of rounds) {
    if (round.key === 'final') yield* drawRoleplay(g, 'intl', { amp: 1.8, event: 'worlds' });

    const isChamp = champ && !champMet && rng.chance(CHAMPION_ENCOUNTER[round.key]);
    if (isChamp) champMet = true;

    // 衛冕者對決時對手身分歸 titleHistory 的冠軍（S20g），不吃實體化敘事——
    // 兩個身分來源不能並存，冠軍優先
    const opp = drawWorldsOpp(g, round.step + (isChamp ? CHAMPION_BONUS : 0));
    const res = yield* runSeriesEvent(g, {
      title: `世界賽${round.name} · BO5`,
      bo: 5,
      oppRating: opp.strength,
      seed,
      opp,
      intl: true,
      stakes: round.key === 'final' ? 'final' : 'intl', pressure: PRESSURE.intl,
      oppNote: isChamp
        ? `對手是上屆世界冠軍 <b class="hl">${champ.team}</b>——擊敗他，你就是下一個世代的火炬手。`
        : (oppLineupText(opp) || '對手是各賽區的一號種子。'),
      oppTag: isChamp ? 'reigningChampion' : null,
      oppTitle: isChamp ? '衛冕者對決' : '',
    });
    recordIntlSeries(state, rng, res, opp);

    // 世代交替：在淘汰賽贏下衛冕冠軍 → 發 `torch_bearer`（unique 階，直接授予）
    if (isChamp && res.win && grantUnique(state, 'torch_bearer')) {
      yield card('gold', `獨有素質覺醒：${UNIQUE_TRAITS.torch_bearer.name}`, UNIQUE_TRAITS.torch_bearer.desc);
      yield* fusionBeats(g);
    }
    if (!res.win) return round.key === 'final' ? 'final' : round.key;
  }
  return 'champion';
}

/* ---------------- 結算 ---------------- */

function* settle(g, outcome, seed) {
  const { state } = g;
  const result = WORLDS_RESULTS[outcome];
  const underdog = outcome === 'champion' && seed >= 3;

  state.pendingPoints += result.points;
  state.intlAppearances += 1;
  state.lastIntlYear = state.year;
  // 生涯軌跡帳本（S17a）：世界賽名次進事實流。S20c 起以**名次鍵**入帳
  // （`event` ＋ `finish`），顯示字串由鍵導出——查詢層不再解析文字
  recordIntlFinish(state, 'worlds', outcome);

  // 冠軍登記表（S20g，§16.2）：今年世界賽的冠軍進 titleHistory。玩家奪冠寫自己，
  // 其餘抽合成 NPC 冠軍——不管哪種，今年必定有人（第一年除外，那時表是空的）
  if (outcome === 'champion') {
    registerChampion(g, { isPlayer: true, team: state.team, region: LEAGUES[state.league].region });
    state.worldsWins += 1;
    state.wonWorldsThisYear = true;
    state.honors.push(`${state.year} 世界賽冠軍`, `${state.year} 世界賽 FMVP`);
    if (underdog) state.honors.push(`${state.year} 下剋上奪冠`);
  } else {
    registerChampion(g, { isPlayer: false });
    if (outcome === 'final') {
      state.worldsFinals += 1;
      state.honors.push(`${state.year} 世界賽亞軍`);
    } else {
      state.honors.push(`${state.year} 世界賽${result.rank}`);
    }
  }

  // 站上這個舞台就會留下東西，走得越遠留得越多。舊版只有奪冠才給
  applyMental(state, { comp: result.comp, fame: result.fame, trust: result.trust });

  yield card(outcome === 'champion' ? 'gold' : 'info', '世界賽結算',
    `<b class="hl">${result.rank}</b>。獲得能力點 <b class="hl">${result.points}</b> 點。` +
    (outcome === 'champion' ? '你捧起召喚師獎盃，成為全世界的英雄！' : '') +
    (underdog ? '<br><b class="hl">最後一張門票進來的隊伍，把冠軍帶走了。</b>' : ''));

  if (outcome === 'champion') {
    if (underdog && unlockTrait(state, 'bigheart')) {
      yield card('gold', '性格成形：大心臟', BASE_TRAITS.bigheart.desc);
      yield* fusionBeats(g);
    }
    if (!state.traits.franchise && unlockTrait(state, 'franchise')) {
      yield card('gold', '隱藏素質解鎖：神主牌', '你就是這支隊伍的門面，續約時沒有人敢先開口砍價。');
      yield* fusionBeats(g);
    }
  }
  if ((outcome === 'champion' || outcome === 'final')
    && state.intlAppearances >= 2 && unlockTrait(state, 'intlghost')) {
    yield card('gold', '隱藏素質解鎖：國際賽之鬼', '國際舞台上，你是另一個人。');
    yield* fusionBeats(g);
  }
}
