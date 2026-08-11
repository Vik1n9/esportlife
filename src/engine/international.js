/** MSI 與世界賽。 */
import { LEAGUES } from '../data/leagues.js';
import { eraOf } from '../data/eras.js';
import { clamp } from '../core/rng.js';
import { effectiveOvr } from './abilities.js';
import { nerveBonus, underdogBonus } from './mental.js';
import { bonus, floorOf } from '../kernel/modifiers.js';

const MSI_CALLUP_OVR = 52;

/** 是否符合本季被徵召 MSI 的條件 */
export function msiEligible(state) {
  const era = eraOf(state.year);
  return state.stage === 'PRO'
    && era.msi
    && state.seasonFactor >= 0.5
    && !state.skipSeason
    && effectiveOvr(state) >= MSI_CALLUP_OVR;
}

/**
 * 列管徵召：三年內打過 MSI 就不能再婉拒。
 * 舊版把 `intlLock` 設成「第一次被叫的年份」且永不更新，導致第 4 年之後永遠可以拒絕。
 */
export function msiForced(state) {
  return state.lastIntlYear != null && state.year - state.lastIntlYear <= 3;
}

const MSI_RESULTS = [
  { rank: 'MSI 冠軍', points: 6 },
  { rank: 'MSI 亞軍', points: 4 },
  { rank: 'MSI 四強', points: 3 },
  { rank: 'MSI 小組止步', points: 1 },
];

export function runMsi(state, rng) {
  const delta = effectiveOvr(state) - MSI_CALLUP_OVR;
  const roll = rng.next() * 100
    + (delta >= 8 ? 12 : delta >= 3 ? 6 : 0)
    + bonus(state, 'intlRoll');

  const index = roll >= 90 ? 0 : roll >= 78 ? 1 : roll >= 60 ? 2 : 3;
  const result = MSI_RESULTS[index];

  const points = floorOf(state, 'intlFloor', result.points);

  state.pendingPoints += points;
  state.intlAppearances += 1;
  state.lastIntlYear = state.year;
  state.carryInjuryRisk = state.epic.soloking ? 0 : 10;

  if (index === 0) { state.msiWins += 1; state.msiPodiums += 1; }
  else if (index <= 2) state.msiPodiums += 1;

  state.honors.push(`${state.year} ${result.rank}`);
  return { ...result, points, index };
}

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
