/** 生涯評分與分級。 */
import { TIER_NAMES } from '../data/events.js';
import { bonus } from '../kernel/modifiers.js';

/**
 * 生涯分數。
 *
 * 舊版把累積 K／SOLO 直接乘上大係數，任何撐滿 15 季的選手都輕鬆破 2200，
 * 人人都是「傳奇」。這裡把「量」的權重壓低、把「榮譽」與「巔峰」拉高，
 * 讓分級真的能分出人。
 */
export function careerScore(state) {
  let score = 0;

  for (const stat of Object.values(state.stats)) {
    score += Math.max(-200, (stat.W - stat.L) * 1.2);
    score += stat.K * 0.3;
    score += stat.SOLO * 0.25;
    score += stat.MVP * 3;
    score += stat.AS * 25;
  }

  score += Math.max(0, state.peakOvr - 45) * 20;
  score += state.proYears * 10;

  score += state.worldsWins * 500;
  score += state.worldsFinals * 200;
  score += state.msiWins * 200;
  score += Math.max(0, state.msiPodiums - state.msiWins) * 60;

  const count = (needle) => state.honors.filter((h) => h.includes(needle)).length;
  score += count('例行賽 MVP') * 100;
  score += count('最佳新人') * 50;
  score += count('單殺王') * 60;
  score += count('季後賽冠軍') * 80;

  score += bonus(state, 'careerScore');
  return Math.round(score);
}

const TIER_CUTOFFS = [3000, 1800, 900, 350];

export function careerTier(state) {
  const score = careerScore(state);
  for (let i = 0; i < TIER_CUTOFFS.length; i++) if (score >= TIER_CUTOFFS[i]) return i;
  return TIER_CUTOFFS.length;
}

export function tierName(tier) { return TIER_NAMES[tier]; }
