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
import { opponentStrength } from '../kernel/strength.js';
import { runSeries, worldsSeed } from '../kernel/series.js';
import { applyMental } from '../engine/mental.js';
import { unlockTrait } from '../engine/progression.js';
import { BASE_TRAITS } from '../data/traits.js';
import { bonus } from '../kernel/modifiers.js';
import { card, drawRoleplay, fusionBeats } from './shared.js';

export const kind = 'WORLDS';

/** 世界賽的對手是各賽區的一號種子。基準比 MSI 再高一階。 */
function intlOpponent(state, step, rng) {
  const base = Math.max(LEAGUES[state.league]?.par ?? 66, 74);
  return opponentStrength(base + step + bonus(state, 'worldsRoll') * -0.15 + rng.gauss(1.6));
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

export function* run(g) {
  const { state, rng } = g;
  if (state.stage !== 'PRO' || state.skipSeason) return;
  const league = LEAGUES[state.league];
  if (!league?.region || league.tier < 2) return;

  const rule = worldsRuleOf(state.year);
  const seed = seedOf(state, rule);
  state.seedRank = seed;
  // MSI 冠軍為賽區多掙的那張門票（2023 起的真實制度）
  const slots = worldsSlotsOf(state.year, league.region) + (state.worldsSlotBonus || 0);

  if (!seed || seed > slots) {
    if (seed) {
      yield card('', '世界賽',
        `賽區只有 <b class="hl">${slots}</b> 張門票，你們排在第 ${seed} 順位——<b class="dn">今年到此為止</b>。`);
    }
    return;
  }

  // 最後一張門票不是白給的：要打地區資格賽（LCK Regional Finals／LCS Gauntlet）
  if (rule.gauntlet && seed === slots && slots > 1) {
    yield card('info', '地區資格賽',
      `賽區最後一張世界賽門票，由第 ${seed} 種子打<b class="hl">地區資格賽</b>決定。BO5，輸了整年就結束。`);
    yield* drawRoleplay(g, 'presser', { amp: 1.4 });
    const res = runSeries(state, rng, { bo: 5, oppRating: intlOpponent(state, -2.5, rng), seed });
    yield card(res.win ? 'good' : 'bad', `地區資格賽 · BO5`,
      `系列賽 <b class="${res.win ? 'up' : 'dn'}">${res.mine}-${res.theirs}</b>。` +
      (res.win ? '<b class="hl">最後一張門票是你們的。</b>' : '差一場。'));
    if (!res.win) return;
  }

  yield card('gold', `世界賽 ${state.year}`,
    `你隨 <b class="hl">${state.team}</b> 以<b class="hl">第 ${seed} 種子</b>晉級 ${state.year} 世界大賽！` +
    (state.worldsSlotBonus ? '<br><span class="muted">這張門票是靠 MSI 冠軍替賽區多掙來的。</span>' : '') +
    (seed >= 3 ? '<br><span class="muted">賽前預測沒有一份把你們排進四強。</span>' : ''));
  yield* drawRoleplay(g, 'intl', { amp: 1.8 });

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
    const res = runSeries(state, rng, { bo: 5, oppRating: intlOpponent(state, -3.75, rng), seed });
    yield card(res.win ? 'good' : 'bad', '入圍賽 · BO5',
      `系列賽 <b class="${res.win ? 'up' : 'dn'}">${res.mine}-${res.theirs}</b>。` +
      (res.win ? '晉級主賽事。' : '<b class="dn">入圍賽出局</b>。'));
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
  const oppRatings = [0, 2.5, 5].map((s) => intlOpponent(state, s, rng));
  const res = runGroup(state, rng, { oppRatings, seed });
  yield card(res.advanced ? 'good' : 'bad', '世界賽小組賽',
    `六場循環戰 <b class="${res.advanced ? 'up' : 'dn'}">${res.wins}勝 ${res.losses}敗</b>。` +
    (res.note ? `${res.note}。` : '') +
    (res.advanced ? '晉級八強。' : '<b class="dn">小組止步</b>。'));
  return res.advanced;
}

/**
 * 2023 起：Swiss。三勝晉級、三敗淘汰，勝場對勝場。
 * 每一輪都出比分——這是「過程」跟舊版差最多的一段。
 */
function* swissStage(g, seed) {
  const { state, rng } = g;
  const par = Math.max(LEAGUES[state.league]?.par ?? 66, 74);
  const res = runSwiss(state, rng, { par, seed });

  const lines = res.rounds.map((r) =>
    `第 ${r.label}（${r.record}）　BO${r.bo}　<b class="${r.win ? 'up' : 'dn'}">${r.score}</b>` +
    (r.decisive ? `<span class="muted">　${r.win ? '晉級局' : '淘汰局'}</span>` : '')).join('<br>');

  yield card(res.advanced ? 'good' : 'bad', 'Swiss 賽段',
    `${lines}<br><b class="${res.advanced ? 'up' : 'dn'}">${res.wins}-${res.losses}</b>　` +
    (res.advanced ? '晉級八強。' : '<b class="dn">Swiss 賽段止步</b>。'));
  return res.advanced;
}

/** 八強 → 四強 → 決賽，全部 BO5。決賽前留一個扮演路口。 */
function* knockout(g, seed) {
  const { state, rng } = g;
  const rounds = [
    { key: 'quarter', name: '八強', step: 6.25 },
    { key: 'semi', name: '四強', step: 9.5 },
    { key: 'final', name: '決賽', step: 12.5 },
  ];

  for (const round of rounds) {
    if (round.key === 'final') yield* drawRoleplay(g, 'intl', { amp: 1.8 });

    const res = runSeries(state, rng, { bo: 5, oppRating: intlOpponent(state, round.step, rng), seed });
    const decider = res.decider
      ? `<br><span class="muted">被拖進第五局，${res.win ? '你們把它拿下來了' : '最後一局沒守住'}。</span>` : '';
    yield card(res.win ? 'good' : 'bad', `世界賽${round.name} · BO5`,
      `系列賽 <b class="${res.win ? 'up' : 'dn'}">${res.mine}-${res.theirs}</b>${decider}`);
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

  if (outcome === 'champion') {
    state.worldsWins += 1;
    state.wonWorldsThisYear = true;
    state.honors.push(`${state.year} 世界賽冠軍`, `${state.year} 世界賽 FMVP`);
    if (underdog) state.honors.push(`${state.year} 下剋上奪冠`);
  } else if (outcome === 'final') {
    state.worldsFinals += 1;
    state.honors.push(`${state.year} 世界賽亞軍`);
  } else {
    state.honors.push(`${state.year} 世界賽${result.rank}`);
  }

  // 站上這個舞台就會留下東西，走得越遠留得越多。舊版只有奪冠才給
  applyMental(state, {
    nerve: result.nerve, fame: result.fame, rep: result.rep, chem: result.chem,
  });

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
