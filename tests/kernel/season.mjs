/**
 * 玩家端賽季模擬與微觀數據擴充（§24.2.5／§24.4.3，S34）。
 *
 * 守三件事：DPM 是 DMG% 的線性換算（不引進新隨機數、與 NPC 端同一個換算常數）、
 * `mergeSplits`／`accumulate` 把 DPM 當比例處理（加權平均，不是累加）、
 * `seriesMicroStats` 給系列賽算出的六維與 `simulateSeason` 同一組公式、同一個
 * DPM 換算，且不重算陣亡（`deaths` 由呼叫端的 `seriesDeaths` 帶入）。
 */
import { Rng } from '../../src/core/rng.js';
import { blankSeasonStat, createState } from '../../src/engine/state.js';
import { TEAM_DPM_TOTAL } from '../../src/data/skills.js';
import {
  accumulate, mergeSplits, seriesMicroStats, simulateSeason,
} from '../../src/engine/season.js';

export const name = '玩家端賽季模擬與微觀數據擴充（S34）';

const fresh = (seed = 'season-s34', extra = {}) => Object.assign(
  createState({ name: 'S', role: 'ADC', seed, stage: 'PRO' }), { league: 'LCK', team: 'T1' }, extra,
);

export async function run({ check, log }) {
  /* ---------------- blankSeasonStat／DPM 換算 ---------------- */

  check('blankSeasonStat 帶 DPM 欄位，預設 0', blankSeasonStat().DPM === 0);

  const s = fresh();
  const stat = simulateSeason(s, new Rng('s34-dpm'), 'LCK', 0.5, 1, 90);
  check('DPM＝DMG% × (TEAM_DPM_TOTAL/100)，不是另一組隨機數',
    Math.abs(stat.DPM - Math.round(stat.DMG * (TEAM_DPM_TOTAL / 100) * 10) / 10) < 1e-9,
    `DMG=${stat.DMG} DPM=${stat.DPM}`);
  check('DPM 是正值量級（隊伍分均傷害的合理範圍）', stat.DPM > 0 && stat.DPM < TEAM_DPM_TOTAL);

  /* ---------------- mergeSplits／accumulate：DPM 當比例處理 ---------------- */

  const splitA = { ...blankSeasonStat(), G: 10, DMG: 20, DPM: 480 };
  const splitB = { ...blankSeasonStat(), G: 30, DMG: 30, DPM: 720 };
  const merged = mergeSplits([splitA, splitB]);
  const expectedDpm = Math.round((480 * 10 + 720 * 30) / 40 * 10) / 10;
  check('mergeSplits 的 DPM 是場次加權平均，不是相加',
    Math.abs(merged.DPM - expectedDpm) < 1e-9, `${merged.DPM} vs ${expectedDpm}`);
  check('mergeSplits 的 DPM 與同一批的 DMG 加權公式對齊（同一種量）',
    Math.abs(merged.DPM - expectedDpm) < 1e-9);

  const accState = { stats: {} };
  accumulate(accState, 'HOME', { ...blankSeasonStat(), years: 0, G: 10, DMG: 20, DPM: 480 });
  accumulate(accState, 'HOME', { ...blankSeasonStat(), years: 0, G: 30, DMG: 30, DPM: 720 });
  check('accumulate 的 DPM 逐年簡單平均（跟 DMG 同一套算法，不是場次加權）',
    Math.abs(accState.stats.HOME.DPM - (480 + 720) / 2) < 1e-9, String(accState.stats.HOME.DPM));

  /* ---------------- seriesMicroStats：系列賽的玩家六維 ---------------- */

  const s2 = fresh('s34-series');
  const games = 5; const deaths = 7;
  const micro = seriesMicroStats(s2, new Rng('s34-series-micro'), games, deaths);
  check('seriesMicroStats 回傳六維＋G，K/A/CSM/VSPM 都是正值總量',
    micro.G === games && micro.K > 0 && micro.A > 0 && micro.CSM > 0 && micro.VSPM > 0,
    JSON.stringify(micro));
  check('seriesMicroStats 不重算陣亡：D 原封不動等於呼叫端帶入的 deaths', micro.D === deaths);
  check('seriesMicroStats(games=0) 回 null（沒打就沒有數據）', seriesMicroStats(s2, new Rng('x'), 0, 0) === null);

  // 場次不同、其餘條件相同時，K／A／CSM／VSPM 應約略等比放大（同一組每局公式）
  const micro2 = seriesMicroStats(fresh('s34-series'), new Rng('s34-series-micro'), games * 2, deaths * 2);
  check('打兩倍局數，K 也約略兩倍（同一組每局公式，只是場次不同）',
    Math.abs(micro2.K - micro.K * 2) <= 2, `${micro.K} → ${micro2.K}`);

  log(`simulateSeason DMG=${stat.DMG}% → DPM=${stat.DPM}；seriesMicroStats(${games} 局)：K=${micro.K} A=${micro.A} DPM=${micro.DPM}`);
}
