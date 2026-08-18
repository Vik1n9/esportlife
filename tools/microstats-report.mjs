/**
 * S33 分佈驗證報告：NPC 微觀數據（§24.2.3／§24.2.4）量測工具——調參紀律用，
 * **不是遊戲機制**（與 `calibrate-160.mjs` 同款定位）。
 *
 * 直接呼叫 `simulateLeagueMonth`（引擎入口，不繞過任何一步）跑一批賽段，彙總
 * `leaguePool` 的個人數據池，印各位置場均 K/D/A/DPM/CSM/VSPM，並用引擎公開的
 * `teamsInYear`／`aggregateTeamStrength`／`baseGameChance` 同款強度差獨立抽樣，
 * 估局型（碾壓／均勢／爆冷）比例——量測不斷言，判準寫在 §24.2.4「調參紀律」。
 *
 * 用法：node tools/microstats-report.mjs [--seasons N]
 */
import { fileURLToPath } from 'node:url';
import { Rng, clamp } from '../src/core/rng.js';
import { ROLES } from '../src/data/skills.js';
import { LEAGUES } from '../src/data/leagues.js';
import { simulateLeagueMonth, statsFor } from '../src/engine/leagueSim.js';
import { metricAverage } from '../src/engine/microStats.js';
import { aggregateTeamStrength, regionKeyOf, teamsInYear } from '../src/engine/opponents.js';
import { teamRegionOf } from '../src/data/npc/teamHistory.js';
import { baseGameChance } from '../src/kernel/series.js';

const mean = (a) => (a.length ? a.reduce((t, v) => t + v, 0) / a.length : 0);
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };

const YEARS = [2016, 2019, 2022, 2025];
const LEAGUE_KEYS = ['HOME', 'LCK', 'LPL', 'LEC', 'LCS'];

/** 完整跑一個賽段（12 個月，matchWeight 平均攤分）的背景模擬，回傳個人數據池 */
function simulateFullSplit(rng, year, leagueKey) {
  const state = { year, league: leagueKey, team: '__report__', leaguePool: {} };
  const phase = { split: { key: 'S1', name: 'S1', weight: 1 }, matchWeight: 1 / 6 };
  for (let m = 0; m < 6; m++) simulateLeagueMonth(state, rng, leagueKey, phase, 1 / 6);
  return statsFor(state, year, 'S1');
}

/**
 * 各位置場均六維（G 加權平均，撐開局數判斷）＋逐選手 KDA／DPM 分佈（§24.3.1
 * 「基準維度：KDA 與 DPM 兩項」——量測分佈就量這兩項的選手間離散度）。
 */
function aggregateByRole(pools) {
  const byRole = Object.fromEntries(ROLES.map((r) => [
    r, { G: 0, K: 0, D: 0, A: 0, DPM: 0, CSM: 0, VSPM: 0, kdaSamples: [], dpmSamples: [] },
  ]));
  for (const pool of pools) {
    if (!pool) continue;
    for (const row of Object.values(pool)) {
      const acc = byRole[row.role];
      if (!acc) continue;
      acc.G += row.G; acc.K += row.K; acc.D += row.D; acc.A += row.A;
      acc.DPM += row.DPM; acc.CSM += row.CSM; acc.VSPM += row.VSPM;
      acc.kdaSamples.push(metricAverage(row, 'KDA'));
      acc.dpmSamples.push(metricAverage(row, 'DPM'));
    }
  }
  return byRole;
}

/**
 * 局型比例的獨立量測：不呼叫 `simulateLeagueMonth` 內部，改用引擎公開的選隊池與
 * 強度公式重現同一套配對邏輯（相同 §24.2.4 臨界值），抽樣 N 場估三級局型佔比。
 */
function estimateGameTypeShares(rng, n = 4000) {
  const counts = { blowout: 0, even: 0, upset: 0 };
  for (let i = 0; i < n; i++) {
    const year = YEARS[rng.int(0, YEARS.length - 1)];
    const leagueKey = LEAGUE_KEYS[rng.int(0, LEAGUE_KEYS.length - 1)];
    const region = regionKeyOf(year, leagueKey);
    const par = LEAGUES[leagueKey]?.par ?? 66;
    const teams = teamsInYear(year).filter((t) => teamRegionOf(t.teamId) === region);
    const strengths = teams.length >= 2
      ? teams.map((t) => aggregateTeamStrength(t.players, region))
      : [rng.int(par - 7, par + 7), rng.int(par - 7, par + 7)];
    if (strengths.length < 2) continue;
    const ia = rng.int(0, strengths.length - 1);
    let ib = rng.int(0, strengths.length - 2);
    if (ib >= ia) ib += 1;
    const sa = strengths[ia]; const sb = strengths[ib];
    const deltaAbs = Math.abs(sa - sb);
    const p = clamp(baseGameChance(sa - sb), 8, 92);
    const aWins = rng.chance(p);
    const aIsWeak = sa <= sb;
    const weakWon = aIsWeak ? aWins : !aWins;
    if (deltaAbs >= 8) counts.blowout++;
    else if (deltaAbs < 3 && weakWon) counts.upset++;
    else counts.even++;
  }
  return { n, ...counts };
}

function formatReport(byRole, gameTypes) {
  const L = [];
  L.push('S33 NPC 微觀數據分佈驗證（§24.2.3／§24.2.4）');
  L.push('');
  L.push('位置｜選手數｜場均K｜場均D｜場均A｜場均DPM｜場均CSM｜場均VSPM');
  for (const role of ROLES) {
    const a = byRole[role];
    const g = Math.max(1, a.G);
    L.push(`${role}｜${a.kdaSamples.length}｜${(a.K / g).toFixed(2)}｜${(a.D / g).toFixed(2)}｜${(a.A / g).toFixed(2)}｜`
      + `${(a.DPM / g).toFixed(1)}｜${(a.CSM / g).toFixed(2)}｜${(a.VSPM / g).toFixed(2)}`);
  }
  L.push('');
  L.push('§24.3.1 基準維度分佈（逐選手 KDA／DPM 均值，選手間離散度）：');
  for (const role of ROLES) {
    const a = byRole[role];
    L.push(`${role}｜KDA 均值 ${mean(a.kdaSamples).toFixed(2)} ± ${std(a.kdaSamples).toFixed(2)}｜`
      + `DPM 均值 ${mean(a.dpmSamples).toFixed(1)} ± ${std(a.dpmSamples).toFixed(1)}`);
  }
  L.push('');
  L.push(`局型比例（獨立抽樣 ${gameTypes.n} 場）：碾壓 ${(gameTypes.blowout / gameTypes.n * 100).toFixed(1)}%｜`
    + `均勢 ${(gameTypes.even / gameTypes.n * 100).toFixed(1)}%｜爆冷 ${(gameTypes.upset / gameTypes.n * 100).toFixed(1)}%`);
  return L;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const argv = process.argv.slice(2);
  const seasonsPerCombo = (() => {
    const i = argv.indexOf('--seasons');
    return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : 8;
  })();

  const t0 = Date.now();
  const pools = [];
  for (const year of YEARS) {
    for (const leagueKey of LEAGUE_KEYS) {
      for (let s = 0; s < seasonsPerCombo; s++) {
        pools.push(simulateFullSplit(new Rng(`report:${year}:${leagueKey}:${s}`), year, leagueKey));
      }
    }
  }
  const byRole = aggregateByRole(pools);
  const gameTypes = estimateGameTypeShares(new Rng('report-gametypes'));
  for (const line of formatReport(byRole, gameTypes)) console.log(line);
  console.log(`（${((Date.now() - t0) / 1000).toFixed(1)}s，${pools.length} 個賽段樣本）`);
}
