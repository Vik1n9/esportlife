/**
 * 世界賽。
 *
 * MSI 已經搬進 `phases/msi.js` 並整個改寫（俱樂部身分、逐輪比分、年中時序）。
 * 這裡剩下的世界賽仍是舊版——門票一次擲骰、賽程一次擲骰，下一步改寫。
 */
import { LEAGUES } from '../data/leagues.js';
import { eraOf } from '../data/eras.js';
import { effectiveOvr } from './abilities.js';
import { nerveBonus, underdogBonus } from './mental.js';
import { bonus } from '../kernel/modifiers.js';

/**
 * 世界賽出線機率。
 *
 * 改由全年冠軍點數換算出的種子序決定——這是 2013 年起真實存在的制度，
 * 也是「第四種子」這個身分能存在的前提。沒有種子序（點數不足）就沒有門票。
 */
export function worldsQualifyChance(state) {
  const league = LEAGUES[state.league];
  if (!league) return 0;
  if (!state.seedRank) return 0;
  // 主場賽區的席位比頂級賽區少，同樣的種子序含金量不同
  const slots = league.region === 'HOME' ? 2 : 4;
  if (state.seedRank > slots) return league.region === 'HOME' ? 12 : 30;  // 最後一張門票要打資格賽
  return state.seedRank === 1 ? 96 : state.seedRank === 2 ? 88 : 74;
}

export function worldsEligible(state) {
  return state.stage === 'PRO'
    && LEAGUES[state.league]?.tier >= 2
    && state.seasonFactor >= 0.5
    && !state.skipSeason;
}

/**
 * 世界賽賽制依時代切換：2023 起 Swiss。
 * @returns {{stage:string, champion:boolean, runnerUp:boolean, points:number}}
 */
export function runWorlds(state, rng) {
  const era = eraOf(state.year);
  const delta = effectiveOvr(state) - 59;
  const stageBonus = bonus(state, 'intlRoll') + bonus(state, 'worldsRoll')
    + underdogBonus(state, state.seedRank) + nerveBonus(state) * 0.5;
  const roll = rng.next() * 100 + delta * 6 + stageBonus;

  let stage; let advanced = false;
  if (era.worlds === 'SWISS') {
    if (roll < 25) stage = '入圍賽出局';
    else if (roll < 55) stage = 'Swiss 賽段止步';
    else if (roll < 75) stage = '八強止步';
    else if (roll < 90) stage = '四強止步';
    else { stage = '闖進決賽'; advanced = true; }
  } else {
    if (roll < 30) stage = '小組止步';
    else if (roll < 60) stage = '八強止步';
    else if (roll < 82) stage = '四強止步';
    else { stage = '闖進決賽'; advanced = true; }
  }

  if (!advanced) {
    const points = stage.includes('四強') ? 3 : stage.includes('八強') ? 2 : 1;
    state.pendingPoints += points;
    return { stage, champion: false, runnerUp: false, points };
  }

  // 決賽是決勝局的極致，大心臟在這裡全額計入
  const finalRoll = rng.next() * 100 + delta * 4 + stageBonus + nerveBonus(state);
  if (finalRoll >= 55) {
    state.worldsWins += 1;
    state.wonWorldsThisYear = true;
    state.pendingPoints += 10;
    state.honors.push(`${state.year} 世界賽冠軍`, `${state.year} 世界賽 FMVP`);
    if (state.seedRank >= 3) state.honors.push(`${state.year} 下剋上奪冠`);
    return { stage: '世界賽冠軍', champion: true, runnerUp: false, points: 10, underdog: state.seedRank >= 3 };
  }
  state.worldsFinals += 1;
  state.pendingPoints += 6;
  state.honors.push(`${state.year} 世界賽亞軍`);
  return { stage: '世界賽亞軍', champion: false, runnerUp: true, points: 6 };
}
