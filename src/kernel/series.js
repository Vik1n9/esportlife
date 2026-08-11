/**
 * BO 系列賽與種子序換算。
 *
 * 舊版的季後賽是一次 `rng.chance()` 直接吐冠軍——一整年最重要的環節連一局比分都
 * 沒有。現在拆成逐局模擬，決勝局另外吃「大心臟」的加成。節奏放慢的用意是：每一輪
 * 之前都留得下一個扮演的路口。
 *
 * 放在 kernel 是因為它有三個消費者：賽段季後賽、MSI、世界賽。國際賽舞台原本各自
 * 只擲一次骰，最大的兩個舞台反而比聯賽季後賽粗糙——那是承襲自棒球模型的痕跡。
 *
 * 種子序換算（`splitSeed`／`worldsSeed`／`pointsFor`）刻意跟系列賽放同一個檔：那些
 * 門檻是平衡數值，改它的時候一定同時在看系列賽邏輯，拆開只會多開一個檔。
 *
 * 這裡不 yield beat，只回傳結果，敘事與選擇留給 phases 組裝。
 */
import { clamp } from '../core/rng.js';
import { LEAGUES } from '../data/leagues.js';
import { CHAMPIONSHIP_POINTS, PLAYOFF_ROUNDS } from '../data/formats/playoffs.js';
import { effectiveOvr } from '../engine/attributes.js';
import { nerveBonus, underdogBonus } from '../engine/mental.js';
import { teamStrength } from './strength.js';
import { bonus } from './modifiers.js';

/**
 * 進不進得了季後賽。例行賽打得越好、隊伍越強，機會越大。
 * @param {object} stat 該賽段的例行賽數據
 */
export function playoffBerth(state, stat) {
  const winRate = stat.G ? stat.W / stat.G : 0;
  return clamp(18 + (winRate - 0.5) * 240 + (stat.delta || 0) * 3, 5, 95);
}

/** 單局勝率（百分比）。`decider` 為決勝局，額外吃大心臟。 */
export function gameChance(state, oppOvr, { decider = false, seed = 0 } = {}) {
  let p = 50 + (teamStrength(state) - oppOvr) * 2.2;
  p += underdogBonus(state, seed) + bonus(state, 'seriesGame');
  if (decider) p += nerveBonus(state) + bonus(state, 'seriesDecider');
  return clamp(p, 8, 92);
}

/**
 * 打一輪系列賽。
 * @param {number} bo 1、3 或 5
 * @returns {{win:boolean, mine:number, theirs:number, games:string[], decider:boolean}}
 */
export function runSeries(state, rng, { bo, oppOvr, seed }) {
  const need = Math.ceil(bo / 2);
  let mine = 0; let theirs = 0;
  const games = [];
  while (mine < need && theirs < need) {
    const decider = bo > 1 && mine === need - 1 && theirs === need - 1;
    const won = rng.chance(gameChance(state, oppOvr, { decider, seed }));
    if (won) mine += 1; else theirs += 1;
    games.push(`${won ? 'W' : 'L'}${decider ? '*' : ''}`);
  }
  return { win: mine > theirs, mine, theirs, games, decider: games.some((g) => g.endsWith('*')) };
}

/** 對手強度：越後面的輪次對手越強，種子序越差遇到的越硬。 */
export function opponentOvr(state, roundKey, seed, rng) {
  const par = LEAGUES[state.league]?.par ?? 53;
  const step = roundKey === 'final' ? 6 : roundKey === 'semi' ? 3.5 : 1.5;
  const seedPenalty = (seed - 1) * 1.2;
  return par + step + seedPenalty + rng.gauss(1.2);
}

/**
 * 一個賽段的季後賽從哪一輪打起。
 * 例行賽越強，種子序越前，可以直接從四強開始——這也是「第四種子」要多打一輪才進得了
 * 決賽的原因。
 */
export function entryRound(seed) {
  return seed <= 2 ? 'semi' : 'quarter';
}

export function roundsFrom(key) {
  const start = PLAYOFF_ROUNDS.findIndex((r) => r.key === key);
  return PLAYOFF_ROUNDS.slice(start < 0 ? 0 : start);
}

/** 賽段內的種子序：由例行賽戰績推出，1 為第一種子 */
export function splitSeed(state, stat) {
  const winRate = stat.G ? stat.W / stat.G : 0;
  if (winRate >= 0.72) return 1;
  if (winRate >= 0.60) return 2;
  if (winRate >= 0.50) return 3;
  return 4;
}

/** 名次 → 冠軍點數 */
export function pointsFor(finish) {
  return CHAMPIONSHIP_POINTS[finish] ?? CHAMPIONSHIP_POINTS.none;
}

/**
 * 全年冠軍點數 → 世界賽種子序。
 * 回傳 0 代表沒拿到門票。第 4 種子存在的意義就是讓下剋上有起點。
 *
 * 這套制度只在 2013–2022 有效，2023 起改看最後一個賽段的季後賽名次——
 * 年代切換由 `data/formats/worlds.js` 決定，這裡只負責換算。
 */
export function worldsSeed(points) {
  if (points >= 155) return 1;
  if (points >= 110) return 2;
  if (points >= 70) return 3;
  if (points >= 40) return 4;
  return 0;
}
