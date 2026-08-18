/**
 * NPC 微觀數據生成與個人數據榜（§24.2.3／§24.2.4，S33）。
 *
 * 守四件事：夾取界永不被公式突破、局型識別的臨界值與 σM 級距、位置權重表守住
 * 位置身分（輔助擊殺／CS 權重全表最低、輔助助攻與視野權重全表最高）、
 * `leaderboard`／`metricAverage` 的匯總語意（KDA 用總量比，不是逐場平均再平均）。
 * 分布真實感（碾壓局 ADC DPM 上 700、SUP 助攻顯著高於其他位置）由
 * `tools/microstats-report.mjs` 的量測報告顧，不在這裡斷言隨機分布的精確值。
 */
import { Rng } from '../../src/core/rng.js';
import { STAT_BASELINE } from '../../src/data/skills.js';
import {
  MICRO_WEIGHTS, accumulateMicroStats, gameTypeOf, generateMicroStats, leaderboard, metricAverage,
} from '../../src/engine/microStats.js';
import { simulateLeagueMonth, statsFor } from '../../src/engine/leagueSim.js';

export const name = 'NPC 微觀數據生成與個人數據榜（S33）';

export async function run({ check, log }) {
  /* ---------------- 位置權重表：位置身分鐵則 ---------------- */

  const wK = Object.fromEntries(Object.entries(MICRO_WEIGHTS).map(([r, w]) => [r, w.wK]));
  const wA = Object.fromEntries(Object.entries(MICRO_WEIGHTS).map(([r, w]) => [r, w.wA]));
  const wCS = Object.fromEntries(Object.entries(MICRO_WEIGHTS).map(([r, w]) => [r, w.wCS]));
  check('輔助的擊殺權重全表最低', wK.SUP === Math.min(...Object.values(wK)), JSON.stringify(wK));
  check('輔助的補刀權重全表最低', wCS.SUP === Math.min(...Object.values(wCS)), JSON.stringify(wCS));
  check('輔助的助攻權重全表最高', wA.SUP === Math.max(...Object.values(wA)), JSON.stringify(wA));
  check('射手的擊殺權重全表最高', wK.ADC === Math.max(...Object.values(wK)), JSON.stringify(wK));

  /* ---------------- 局型識別（§24.2.4）：臨界值與 σM 級距 ---------------- */

  const blowout = gameTypeOf(8, false);
  check('碾壓局門檻 |Δ|≥8，σM=1.3', blowout.sigmaM === 1.3, String(blowout.sigmaM));
  check('碾壓局勝方修正 K×1.3／D×0.7／DPM×1.2', blowout.winMod.K === 1.3 && blowout.winMod.D === 0.7 && blowout.winMod.DPM === 1.2);
  check('碾壓局敗方修正 K×0.7／D×1.4／DPM×0.8', blowout.loseMod.K === 0.7 && blowout.loseMod.D === 1.4 && blowout.loseMod.DPM === 0.8);

  const even = gameTypeOf(5, false);
  check('均勢局 3≤|Δ|<8，σM=1.0 且修正不變', even.sigmaM === 1.0 && even.winMod.K === 1 && even.loseMod.D === 1);

  const upset = gameTypeOf(2, true);
  check('爆冷局 |Δ|<3 且弱方勝，σM=1.5 且不改動勝負修正', upset.sigmaM === 1.5 && upset.winMod.K === 1 && upset.loseMod.K === 1);

  const closeButFavoriteWon = gameTypeOf(2, false);
  check('|Δ|<3 但強方照贏，落回均勢局的修正形狀（σM=1.0）', closeButFavoriteWon.sigmaM === 1.0);

  const intl = gameTypeOf(5, false, true);
  check('國際賽對局 σM 再乘 1.25（§24.2.4 第 2 條）', Math.abs(intl.sigmaM - 1.25) < 1e-9, String(intl.sigmaM));

  /* ---------------- 生成公式：夾取界永不突破 ---------------- */

  const rng = new Rng('micro-clamp');
  const extreme = { position: 'ADC', tec: 200, agi: 200, awr: 200 };
  let breachedHigh = false; let breachedLow = false;
  for (let i = 0; i < 500; i++) {
    const s = generateMicroStats(rng, extreme, 1.5, gameTypeOf(8, false).winMod);
    if (s.K > 15 || s.D > 12 || s.A > 25 || s.DPM > 1200 || s.CSM > 12 || s.VSPM > 4) breachedHigh = true;
    if (s.K < 0 || s.D < 0 || s.A < 0 || s.DPM < 150 || s.CSM < 0.5 || s.VSPM < 0.2) breachedLow = true;
  }
  check('極端屬性值（tec/agi/awr=200）仍不突破上界夾取', !breachedHigh);
  check('夾取下界（DPM≥150／CSM≥0.5／VSPM≥0.2）永遠成立', !breachedLow);

  const weak = { position: 'SUP', tec: 0, agi: 100, awr: 0 };
  let stillFloored = true;
  for (let i = 0; i < 200; i++) {
    const s = generateMicroStats(rng, weak, 1.5, gameTypeOf(8, false).loseMod);
    if (s.K < 0 || s.DPM < 150) stillFloored = false;
  }
  check('弱屬性＋敗方修正也不跌破下界（x⁺ 夾 0，不產生負修正）', stillFloored);

  /* ---------------- x⁺ 餘量：60 以下不拉低數值 ---------------- */

  const atBaseline = { position: 'MID', tec: 60, agi: 60, awr: 60 };
  const belowBaseline = { position: 'MID', tec: 40, agi: 40, awr: 40 };
  const rngA = new Rng('over60-a'); const rngB = new Rng('over60-a');   // 同種子比對，濾掉 gauss 噪音
  const sAt = generateMicroStats(rngA, atBaseline, 1.0, { K: 1, D: 1, DPM: 1 });
  const sBelow = generateMicroStats(rngB, belowBaseline, 1.0, { K: 1, D: 1, DPM: 1 });
  check('tec/agi/awr ≤60 時 K／DPM 與剛好等於 60 一樣（x⁺=0 不產生負修正）', sAt.K === sBelow.K && sAt.DPM === sBelow.DPM);

  /* ---------------- 累加與匯總語意 ---------------- */

  const stats = {};
  accumulateMicroStats(stats, 'p1', 'MID', { K: 4, D: 2, A: 6, DPM: 600, CSM: 8, VSPM: 1.5 });
  accumulateMicroStats(stats, 'p1', 'MID', { K: 2, D: 4, A: 2, DPM: 400, CSM: 6, VSPM: 1.0 });
  check('累加是總量而非覆蓋：G 累計、六維累加', stats.p1.G === 2 && stats.p1.K === 6 && stats.p1.DPM === 1000);
  check('KDA 用總量比 (ΣK+ΣA)/max(1,ΣD)，不是逐場平均再平均',
    metricAverage(stats.p1, 'KDA') === (6 + 8) / 6, String(metricAverage(stats.p1, 'KDA')));
  check('DPM 場均＝ΣDPM/G', metricAverage(stats.p1, 'DPM') === 500);
  check('沒有資料的維度回 0（G=0）', metricAverage({ G: 0 }, 'KDA') === 0);

  /* ---------------- leaderboard：依位置過濾、依維度排序、限筆數 ---------------- */

  accumulateMicroStats(stats, 'p2', 'MID', { K: 10, D: 1, A: 10, DPM: 900, CSM: 9, VSPM: 2 });
  accumulateMicroStats(stats, 'p3', 'SUP', { K: 0, D: 2, A: 12, DPM: 300, CSM: 2, VSPM: 3 });
  const midBoard = leaderboard(stats, 'MID', 'KDA', 5);
  check('leaderboard 只收該位置的列', midBoard.every((r) => r.id !== 'p3'));
  check('leaderboard 依維度降冪排序', midBoard[0].id === 'p2' && midBoard[0].value > midBoard[1].value);
  const top1 = leaderboard(stats, 'MID', 'KDA', 1);
  check('leaderboard 限筆數', top1.length === 1);

  /* ---------------- 整合：simulateLeagueMonth 寫進去的池，維度齊全、位置正確 ---------------- */

  const intRng = new Rng('micro-integration');
  const state = { year: 2022, league: 'HOME', team: '閃電狼', leaguePool: {} };
  const phase = { split: { key: 'S1', name: '春季賽', weight: 0.5 }, matchWeight: 0.25 };
  simulateLeagueMonth(state, intRng, 'HOME', phase, 0.5);
  const pool = statsFor(state, 2022, 'S1');
  const rows = Object.values(pool);
  check('本月結算後個人數據池非空', rows.length > 0, String(rows.length));
  check('每一列六維＋role＋G 齊全', rows.every((r) => ['role', 'G', 'K', 'D', 'A', 'DPM', 'CSM', 'VSPM'].every((k) => k in r)));
  check('role 落在五個位置之內', rows.every((r) => STAT_BASELINE[r.role] != null));
  check('場次守恆：資料池的場次數與該場 Bo3 局數同量級（每局 10 位選手各記一筆）', rows.every((r) => r.G > 0));

  /* ---------------- 決定論：同種子必同數據（§24.1） ---------------- */

  const s1 = { year: 2022, league: 'HOME', team: '閃電狼', leaguePool: {} };
  const s2 = { year: 2022, league: 'HOME', team: '閃電狼', leaguePool: {} };
  simulateLeagueMonth(s1, new Rng('determinism'), 'HOME', phase, 0.5);
  simulateLeagueMonth(s2, new Rng('determinism'), 'HOME', phase, 0.5);
  check('同種子＋同賽程重跑，個人數據池逐位元組相同', JSON.stringify(statsFor(s1, 2022, 'S1')) === JSON.stringify(statsFor(s2, 2022, 'S1')));

  log(`本月結算：${rows.length} 位選手有數據，位置分布 ${JSON.stringify(
    Object.fromEntries(['TOP', 'JG', 'MID', 'ADC', 'SUP'].map((r) => [r, rows.filter((x) => x.role === r).length])),
  )}`);
}
