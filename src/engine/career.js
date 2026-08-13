/**
 * 生涯評分與分級。
 *
 * 評分只回答一個問題：這段生涯在歷史上的份量。份量來自三處——年度戰績（量）、
 * 生涯厚度（巔峰與長度）、榮譽（質）。舊版把「量」的權重放得太大，任何撐滿
 * 15 季的選手都輕鬆破 2200，人人都是「傳奇」，分級因此分不出人。
 *
 * 分級的門檻是線性的，但「傳奇」必須是少數——所以評分刻意讓榮譽與巔峰佔大頭，
 * 撐得久只是門票，不是故事。
 */
import { TIER_NAMES } from '../data/events.js';
import { bonus } from '../kernel/modifiers.js';

/** 單季表現的計分權重。勝差有下界，避免一整季爛到底反而因為場次多而加分 */
const SEASON_WEIGHTS = {
  winMargin: 1.2,
  kills: 0.3,
  solos: 0.25,
  mvp: 3,
  allStar: 25,
};

/** 單季能扣到哪（勝差的下界） */
const SEASON_FLOOR = -200;

/**
 * 生涯厚度：巔峰教練評價與年資的價碼。
 *
 * 0–100 重校時這兩個數字要一起動，而且方向相反（V4 §17.2 的同一條規則）：
 * 門檻是**水準量**，×1.25（45 → 56）；每點的價碼是 **per-point 係數**，÷1.25
 * （20 → 16）。兩邊配著改，同一段生涯的厚度分數才不會因為換單位就翻倍——
 * 只改門檻或只改係數都會讓等第分布整個垮掉。
 */
const PEAK_PER_POINT = 16;
const PEAK_FLOOR = 56;          // 巔峰低於這個數值，代表沒真正站上過一軍
const PRO_YEAR_VALUE = 10;

/** 國際賽榮譽的價碼——世界冠軍是整個評分的天花板 */
const INTl_POINTS = {
  worldsWin: 500,
  worldsFinal: 200,
  msiWin: 200,
  msiPodium: 60,
};

/** 聯賽榮譽：關鍵字 → 分數。用 `includes` 比對，因為年份會掛在前面 */
const HONOR_POINTS = [
  ['例行賽 MVP', 100],
  ['最佳新人', 50],
  ['單殺王', 60],
  ['季後賽冠軍', 80],
];

/** 單季成績換成分數（量）。逐季累加，clamp 在每一季而不是總和，見 SEASON_WEIGHTS */
function seasonScore(stat) {
  let pts = Math.max(SEASON_FLOOR, (stat.W - stat.L) * SEASON_WEIGHTS.winMargin);
  pts += stat.K * SEASON_WEIGHTS.kills;
  pts += stat.SOLO * SEASON_WEIGHTS.solos;
  pts += stat.MVP * SEASON_WEIGHTS.mvp;
  pts += stat.AS * SEASON_WEIGHTS.allStar;
  return pts;
}

/** 生涯裡每一種榮譽出現過幾次（例：『2024 例行賽 MVP』） */
function countHonors(state, keyword) {
  return state.honors.filter((h) => h.includes(keyword)).length;
}

/**
 * 生涯分數。
 *
 * 結構刻意分三段加總：年度、厚度、榮譽。每段內部都是同類的比較，
 * 之後要調整權重時不必在一個大算式裡撈。
 */
export function careerScore(state) {
  let score = 0;

  // 第一段：每一年的例行表現。場次多的年份自然分數高，這就是「量」的意義
  for (const season of Object.values(state.stats)) score += seasonScore(season);

  // 第二段：厚度。巔峰教練評價每超過門檻 1 點 16 分，職業年資每年 10 分。
  // §10.3 明文允許生涯評分讀教練評價——那是結算，不是養成期的儀表板
  score += Math.max(0, state.peakRating - PEAK_FLOOR) * PEAK_PER_POINT;
  score += state.proYears * PRO_YEAR_VALUE;

  // 第三段：榮譽。世界冠軍 > 世界亞軍＝MSI 冠軍 > 其餘
  score += state.worldsWins * INTl_POINTS.worldsWin;
  score += state.worldsFinals * INTl_POINTS.worldsFinal;
  score += state.msiWins * INTl_POINTS.msiWin;
  score += Math.max(0, state.msiPodiums - state.msiWins) * INTl_POINTS.msiPodium;

  for (const [keyword, pts] of HONOR_POINTS) {
    score += countHonors(state, keyword) * pts;
  }

  score += bonus(state, 'careerScore');
  return Math.round(score);
}

/** 由高到低的等第門檻。超過任一門檻即為該等第，全沒過就是墊底一級 */
const TIER_CUTOFFS = [3000, 1800, 900, 350];

export function careerTier(state) {
  const score = careerScore(state);
  for (let i = 0; i < TIER_CUTOFFS.length; i++) if (score >= TIER_CUTOFFS[i]) return i;
  return TIER_CUTOFFS.length;
}

export function tierName(tier) { return TIER_NAMES[tier]; }
