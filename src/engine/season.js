/** 賽季模擬：場次、勝負、個人數據。純函式，不碰 state 以外的東西。 */
import { clamp } from '../core/rng.js';
import { STAT_BASELINE } from '../data/abilities.js';
import { LEAGUES } from '../data/leagues.js';
import { blankSeasonStat } from './state.js';
import { effectiveOvr } from './abilities.js';
import { teamStrength } from '../kernel/strength.js';
import { factor } from '../kernel/modifiers.js';
import { formFactor } from './lineup.js';

/**
 * 模擬一個賽段。
 *
 * `weight` 是該賽段佔全年場次的比例——一年拆成三賽段不代表要打三倍的比賽，
 * 場次是切開來分的，變多的是決策點與事件，不是場次。
 *
 * @param {object} state
 * @param {import('../core/rng.js').Rng} rng
 * @param {string} leagueKey
 * 體力不再決定出賽場次——LoL 是五個固定先發，隊伍打幾場你就打幾場。體力低表現成
 * 手感下滑（`formFactor`），少打是另一回事：被下放板凳或傷勢缺席，由 `share` 帶進來。
 *
 * @param {number} [weight] 佔全年場次比例，預設 1（整年一段）
 * @param {number} [share] 實際出賽比例（板凳 0、輪替約 0.55、先發 1）
 */
export function simulateSeason(state, rng, leagueKey, weight = 1, share = 1) {
  const league = LEAGUES[leagueKey];
  const a = state.ability;
  const stat = blankSeasonStat();
  stat.years = 1;

  const par = league.par;
  const o = effectiveOvr(state);
  const delta = o - par;
  stat.delta = delta;

  if (state.seasonFactor <= 0 || share <= 0) { stat.G = 0; return stat; }

  // 體力進表現，不進場次
  const form = formFactor(a.sta);
  stat.G = Math.max(1, Math.round(league.games * weight * share * state.seasonFactor * (0.95 + rng.next() * 0.06)));

  const winRate = clamp(
    0.5 + (teamStrength(state) - par) * 0.012 + delta * 0.006 + (form - 1) * 1.6 + rng.gauss(0.03),
    0.15, 0.92,
  );
  stat.W = Math.round(stat.G * winRate);
  stat.L = stat.G - stat.W;

  const base = STAT_BASELINE[state.role];
  const k = clamp(base.K + (a.op - par) * 0.01 + (a.lane - par) * 0.008 + rng.gauss(0.2), 0.3, 3.2);
  stat.K = Math.round(stat.G * k * form);
  // 體力透支最先反映在後期的失誤上，所以陣亡數反向吃 form
  stat.D = Math.round(stat.G * clamp(base.D - (a.ref - par) * 0.008 - (a.vis - par) * 0.004 + rng.gauss(0.15), 0.5, 3.0) / form);
  stat.A = Math.round(stat.G * base.A * (1 + (a.roam - par) * 0.004 + (a.vis - par) * 0.004));
  stat.CS = Math.round(stat.G * base.CS * (1 + (a.lane - par) * 0.006));
  stat.VIS = Math.round(stat.G * base.VIS * (1 + (a.vis - par) * 0.008));
  stat.DMG = Math.round(clamp((base.DMG + delta * 0.4) * form + rng.gauss(1.5), 6, 45) * 10) / 10;

  const soloLaneBonus = (state.role === 'TOP' || state.role === 'MID') ? (a.lane - par) * 0.01 : 0;
  stat.SOLO = Math.round(stat.G * base.SOLO * clamp(1 + soloLaneBonus, 0.2, 2.2) * factor(state, 'soloRate'));
  stat.K = Math.round(stat.K * factor(state, 'killRate'));

  const mvpRate = clamp(0.03 + delta * 0.004 + (stat.SOLO / Math.max(1, stat.G)) * 0.02, 0.005, 0.22);
  stat.MVP = Math.round(stat.G * mvpRate);

  return stat;
}

/**
 * 把同一年的多個賽段併成一份年度數據。
 * DMG% 是比例，取場次加權；delta 取全年平均。
 */
export function mergeSplits(splits) {
  const out = blankSeasonStat();
  out.years = 1;
  if (!splits.length) { out.delta = 0; return out; }
  for (const s of splits) {
    for (const k of ['G', 'W', 'L', 'K', 'D', 'A', 'CS', 'VIS', 'SOLO', 'MVP']) out[k] += s[k];
  }
  const totalG = out.G || 1;
  out.DMG = Math.round(splits.reduce((t, s) => t + s.DMG * s.G, 0) / totalG * 10) / 10;
  out.delta = Math.round(splits.reduce((t, s) => t + (s.delta || 0), 0) / splits.length * 10) / 10;
  return out;
}

/** 把單季數據累加進生涯分區統計 */
export function accumulate(state, bucket, stat) {
  const acc = state.stats[bucket] || blankSeasonStat();
  acc.years += 1;
  for (const k of ['G', 'W', 'L', 'K', 'D', 'A', 'CS', 'VIS', 'SOLO', 'MVP']) acc[k] += stat[k];
  // DMG% 是比例，取加權平均而非累加
  acc.DMG = Math.round(((acc.DMG * (acc.years - 1) + stat.DMG) / acc.years) * 10) / 10;
  state.stats[bucket] = acc;
  return acc;
}

export function formatStatLine(stat) {
  const parts = [
    `${stat.G} 場 ${stat.W}W-${stat.L}L`,
    `KDA ${stat.K}/${stat.D}/${stat.A}`,
    `CS ${stat.CS}`,
    `視野 ${stat.VIS}`,
    `SOLO ${stat.SOLO}`,
    `DMG ${stat.DMG}%`,
  ];
  if (stat.MVP) parts.push(`MVP x${stat.MVP}`);
  return parts.join('｜');
}
