/**
 * 賽區背景模擬與資料池（§24.2.1／§24.2.2，S32）。
 *
 * 守四件事：積分榜場次守恆（每場恰一勝一敗）、已排序、玩家隊去重（W/L 只從
 * `recordPlayerLeagueResult` 進帳，不被 `simulateLeagueMonth` 動到）、保留策略
 * （只存當年＋前一年）。強度公式與選隊池本身的不變式由 `tests/kernel/opponents.mjs`
 * 顧（`aggregateTeamStrength` 是同一份，S32 只是多一個消費者）。
 */
import { Rng } from '../../src/core/rng.js';
import { blankSeasonStat } from '../../src/engine/state.js';
import {
  playerRank, recordPlayerLeagueResult, simulateLeagueMonth, standingsFor,
} from '../../src/engine/leagueSim.js';

export const name = '賽區背景模擬與資料池（S32）';

const phase = (weight = 0.25, splitWeight = 0.5) => ({
  split: { key: 'S1', name: '春季賽', weight: splitWeight }, matchWeight: weight,
});

export async function run({ check, log }) {
  /* ---------------- 基本結構：積分榜守恆與排序 ---------------- */

  const rng = new Rng('league-sim');
  const state = { year: 2022, league: 'HOME', team: '閃電狼', leaguePool: {} };

  simulateLeagueMonth(state, rng, 'HOME', phase(), 0.5);
  const s1 = standingsFor(state, 2022, 'S1');

  check('賽段開幕即建榜', Array.isArray(s1));
  check('榜至少湊到 6 支隊（§24.2.1 缺口下限）', s1.length >= 6, String(s1.length));
  check('恰有一筆玩家列', s1.filter((r) => r.isPlayer).length === 1);
  check('玩家列這時還沒有戰績（NPC 模擬不動玩家列）', s1.find((r) => r.isPlayer).W === 0 && s1.find((r) => r.isPlayer).L === 0);

  const totalW = s1.reduce((t, r) => t + r.W, 0);
  const totalL = s1.reduce((t, r) => t + r.L, 0);
  check('每場恰一勝一敗，總勝場＝總敗場', totalW === totalL && totalW > 0, `W=${totalW} L=${totalL}`);

  const sorted = s1.every((r, i) => i === 0
    || (r.W / Math.max(1, r.W + r.L)) <= (s1[i - 1].W / Math.max(1, s1[i - 1].W + s1[i - 1].L)) + 1e-9);
  check('積分榜依勝率降冪排序', sorted);

  log(`2022 S1 一個月結算：${s1.length} 支隊、${totalW} 場、玩家列 0 場（未出賽月）`);

  /* ---------------- 玩家戰績去重：只從 recordPlayerLeagueResult 進帳 ---------------- */

  const npcTotalBefore = s1.reduce((t, r) => t + (r.isPlayer ? 0 : r.W + r.L), 0);
  const stat = { ...blankSeasonStat(), G: 10, W: 6, L: 4 };
  recordPlayerLeagueResult(state, 'HOME', phase(), stat);
  const s1b = standingsFor(state, 2022, 'S1');
  const playerRow = s1b.find((r) => r.isPlayer);
  check('玩家戰績＝simulateSeason 的 W/L，不另外模擬', playerRow.W === 6 && playerRow.L === 4, `W=${playerRow.W} L=${playerRow.L}`);
  const npcTotalAfter = s1b.reduce((t, r) => t + (r.isPlayer ? 0 : r.W + r.L), 0);
  check('併入玩家戰績不動 NPC 列的場次', npcTotalAfter === npcTotalBefore, `${npcTotalBefore} → ${npcTotalAfter}`);

  check('玩家名次在榜上算得出來（1 起算）', playerRank(s1b) >= 1 && playerRank(s1b) <= s1b.length);

  /* ---------------- G=0（板凳／整段養傷）不進帳 ---------------- */

  const beforeRows = JSON.stringify(standingsFor(state, 2022, 'S1'));
  recordPlayerLeagueResult(state, 'HOME', phase(), { ...blankSeasonStat(), G: 0, W: 0, L: 0 });
  check('G=0 的月份不改動積分榜', JSON.stringify(standingsFor(state, 2022, 'S1')) === beforeRows);

  /* ---------------- 賽段內隊伍組成整段固定 ---------------- */

  simulateLeagueMonth(state, rng, 'HOME', phase(), 0.5);
  const s1c = standingsFor(state, 2022, 'S1');
  check('賽段內隊伍組成不因月結算而改變', s1c.length === s1.length
    && s1c.every((r) => s1.some((r0) => r0.teamId === r.teamId)));
  const totalW2 = s1c.reduce((t, r) => t + r.W, 0);
  check('累加而非重建：第二個月結算後場次只增不減', totalW2 > totalW);

  /* ---------------- 業餘／青訓沒有真賽區，不背景模擬 ---------------- */

  const amState = { year: 2013, league: 'AMATEUR', team: '不知道怎輸', leaguePool: {} };
  simulateLeagueMonth(amState, rng, 'AMATEUR', phase(), 0.5);
  recordPlayerLeagueResult(amState, 'AMATEUR', phase(), { ...blankSeasonStat(), G: 10, W: 5, L: 5 });
  check('業餘期不建 leaguePool（沒有真賽區）', Object.keys(amState.leaguePool).length === 0);

  /* ---------------- 保留策略：只存當年＋前一年 ---------------- */

  const pruneState = {
    year: 2012, league: 'HOME', team: '台北暗殺星',
    leaguePool: { 2010: { splits: {}, intl: { stats: {} } }, 2011: { splits: {}, intl: { stats: {} } } },
  };
  simulateLeagueMonth(pruneState, rng, 'HOME', phase(), 0.5);
  const years = Object.keys(pruneState.leaguePool).map(Number).sort();
  check('只保留當年與前一年，更早的丟棄', years.join(',') === '2011,2012', years.join(','));

  /* ---------------- 海外賽區（LCK）走同一條路 ---------------- */

  const krState = { year: 2022, league: 'LCK', team: 'T1', leaguePool: {} };
  simulateLeagueMonth(krState, rng, 'LCK', { split: { key: 'S1', name: '春季賽', weight: 0.5 }, matchWeight: 0.25 }, 0.5);
  const krStandings = standingsFor(krState, 2022, 'S1');
  check('海外賽區（LCK）同樣建得出積分榜', Array.isArray(krStandings) && krStandings.length >= 6, String(krStandings?.length));
}
