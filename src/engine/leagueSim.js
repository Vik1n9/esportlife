/**
 * 賽區背景模擬（§24.2.1／§24.2.2，S32 落地，Phase 1 宏觀）。
 *
 * 在此之前，賽區內只有玩家隊的團隊強度會被算出來——其他隊伍彼此的勝負從沒被
 * 模擬過，§21.3 的「隊伍交戰戰績排名」因此掛了三站。這裡把 §24.2 的宏觀層接上：
 * 純數學批量結算 NPC 隊伍間的循環賽，寫進 `state.leaguePool`（§24.2.2 schema），
 * 供 §22.1 的排名格與（S33 起）微觀數據池消費。
 *
 * 完全離線、零 LLM（§24.1 第 1 條）：只走 `rng.chance` 與既有的聚合強度公式，
 * 不呼叫任何網路或模型。
 */
import { Rng, clamp } from '../core/rng.js';
import { LEAGUES } from '../data/leagues.js';
import { NPC_BY_ID } from '../data/npc/roster.js';
import { REGION_TEAM_IDS } from '../data/npc/teamIds.js';
import { teamDisplayName, teamRegionOf } from '../data/npc/teamHistory.js';
import { ROLES } from '../data/skills.js';
import { baseGameChance } from '../kernel/series.js';
import { teamStrength } from '../kernel/strength.js';
import {
  accumulateMicroStats, accumulateMicroTotals, gameTypeOf, generateMicroStats,
} from './microStats.js';
import {
  aggregateTeamStrength, regionKeyOf, teamsInYear,
} from './opponents.js';

/**
 * 一個賽區湊不齊真實陣容時的下限（§24.2.1：「不足 6 支時，缺口以合成匿名隊補，
 * 不阻塞聯賽成形」）。LoL 職業聯賽的常態規模。
 */
const MIN_TEAMS = 6;

/** 該年該賽區的完整 NPC 陣容隊（未排除玩家自己的隊，未補合成）。純函式，逐年逐賽區快取一次 */
const REGION_TEAMS_CACHE = new Map();
function regionNpcTeams(year, region) {
  const key = `${year}:${region}`;
  let out = REGION_TEAMS_CACHE.get(key);
  if (!out) {
    out = teamsInYear(year).filter((t) => teamRegionOf(t.teamId) === region);
    REGION_TEAMS_CACHE.set(key, out);
  }
  return out;
}

/**
 * 合成匿名隊（§23.7／§24.2.1 同構）：強度按該賽區該年 par±7 分布生成，無身分敘事。
 * 用 `年/賽區/序號` 派生的獨立種子（不吃人生流），同一年賽區永遠補出同一批——
 * 不必額外持久化，也不會因為玩家換隊而讓補位隊伍在同一賽段中途變來變去。
 *
 * 五個位置各配一名合成選手（§24.2.3 微觀生成吃 tec/agi/awr，圍繞隊伍強度 gauss
 * 擺動）——無身分敘事僅指不掛隊名／人名，微觀數據池仍收（key＝`syn-N-位置`）。
 */
function syntheticTeam(year, region, index, par) {
  const rng = new Rng(`league-filler:${year}:${region}:${index}`);
  const strength = rng.int(par - 7, par + 7);
  const teamId = `syn-${index}`;
  const players = ROLES.map((position) => ({
    id: `${teamId}-${position}`,
    position,
    tec: clamp(strength + rng.gauss(6), 40, 95),
    agi: clamp(strength + rng.gauss(6), 40, 95),
    awr: clamp(strength + rng.gauss(6), 40, 95),
  }));
  return { id: teamId, name: `外卡戰隊${index + 1}`, strength, players };
}

/** NPC 微觀生成吃的三屬性（§24.2.3）。入池不變式保證 `peak` 存在必有 `attributes`（見 tests） */
function npcMicroAttrs(playerId) {
  const { tec, agi, awr } = NPC_BY_ID[playerId].attributes;
  return { tec, agi, awr };
}

/**
 * 這個賽區這一年「除了玩家自己那支隊」以外會互打的隊伍：真實 NPC 陣容（排除玩家
 * 自己的隊，§23.4 同款去重）＋合成匿名隊補到 `MIN_TEAMS - 1`。
 */
function nonPlayerPool(state, year, leagueKey, region) {
  const selfTeamId = REGION_TEAM_IDS[state.team] ?? null;
  const real = regionNpcTeams(year, region)
    .filter((t) => t.teamId !== selfTeamId)
    .map((t) => ({
      id: t.teamId,
      name: teamDisplayName(t.teamId),
      strength: aggregateTeamStrength(t.players, region),
      players: t.players.map((p) => ({ id: p.id, position: p.position, ...npcMicroAttrs(p.id) })),
    }));
  const par = LEAGUES[leagueKey]?.par ?? 66;
  const deficit = Math.max(0, MIN_TEAMS - 1 - real.length);
  const synthetic = Array.from({ length: deficit }, (_, i) => syntheticTeam(year, region, i, par));
  return [...real, ...synthetic];
}

const blankRow = (teamId, name, isPlayer) => ({ teamId, name, W: 0, L: 0, isPlayer });

/** 玩家在個人數據池（`stats`）裡的鍵（§24.2.5，S34）：玩家全場只有一個，鍵不必是 NPC 那種 player_id */
export const PLAYER_STAT_ID = 'player';

/** 已排序（§24.2.2 schema 明文）：勝率降冪，同勝率比勝場，再打平比隊名穩定排序 */
function sortStandings(standings) {
  standings.sort((a, b) => {
    const wa = a.W + a.L ? a.W / (a.W + a.L) : 0;
    const wb = b.W + b.L ? b.W / (b.W + b.L) : 0;
    if (wb !== wa) return wb - wa;
    if (b.W !== a.W) return b.W - a.W;
    return a.name.localeCompare(b.name);
  });
}

/**
 * 只存當年＋前一年（§24.2.2 保留策略）：當季供百分位謂詞，前一年供開季敘事與帳本
 * 對照，更早的年份丟棄——史實參照由 §23 的靜態名冊負責，池不兼任。
 */
function pruneLeaguePool(state, year) {
  for (const y of Object.keys(state.leaguePool)) {
    if (Number(y) < year - 1) delete state.leaguePool[y];
  }
}

function ensureYear(state, year) {
  if (!state.leaguePool) state.leaguePool = {};
  pruneLeaguePool(state, year);
  if (!state.leaguePool[year]) state.leaguePool[year] = { splits: {}, intl: { stats: {} } };
  return state.leaguePool[year];
}

/**
 * 確保這個賽段的積分榜存在，第一次呼叫時依當年賽區池建好整段的隊伍列（W/L 從 0
 * 起算）。之後每個月都呼叫同一個 key，讀到的是同一份、只會累加，不會被重建
 * ——賽段內的隊伍組成整段固定，跟 §23.4 的隊友池同一個道理。
 */
function ensureSplit(state, leagueKey, phase) {
  const region = regionKeyOf(state.year, leagueKey);
  const yearPool = ensureYear(state, state.year);
  const splitKey = phase.split.key;
  let entry = yearPool.splits[splitKey];
  if (!entry) {
    const pool = nonPlayerPool(state, state.year, leagueKey, region);
    entry = {
      standings: [...pool.map((t) => blankRow(t.id, t.name, false)), blankRow(null, state.team, true)],
      stats: {},
    };
    yearPool.splits[splitKey] = entry;
  }
  return entry;
}

/**
 * 本月的賽區背景模擬（§24.2.1）：NPC 隊伍（含合成匿名隊）之間純數學結算這個月
 * 份額的循環賽場次，寫回積分榜。**不含玩家隊**——玩家隊的戰績從 `simulateSeason`
 * 直接採用（見 `recordPlayerLeagueResult`），兩邊都模擬就是雙份戰績、榜會裂開
 * （§24.2.1「玩家隊去重規則」）。
 *
 * 場次預算：雙循環（主客各一）全季 `M×(M-1)` 場，依這個月佔賽段的比重 `batch`
 * 攤分（與玩家常規賽同一個節奏，`phases/month.js` 傳進來的 `batch`）。逐場隨機配對
 * 而非持久化排定賽程——池只存匯總（§24.2.2），沒有消費端要「誰對誰打過」，
 * 存檔重讀後從當月重新配對不影響任何不變式；期望值上仍收斂到雙循環的量級。
 */
export function simulateLeagueMonth(state, rng, leagueKey, phase, batch) {
  if (!phase.split || !phase.matchWeight) return;
  const league = LEAGUES[leagueKey];
  if (!league?.region) return;   // 業餘／青訓沒有真賽區，不背景模擬

  const region = regionKeyOf(state.year, leagueKey);
  const entry = ensureSplit(state, leagueKey, phase);
  const pool = nonPlayerPool(state, state.year, leagueKey, region);
  if (pool.length < 2) return;
  const rowById = new Map(entry.standings.map((r) => [r.teamId, r]));

  const totalSeasonMatches = pool.length * (pool.length - 1);
  const monthMatches = Math.max(0, Math.round(totalSeasonMatches * batch));

  for (let m = 0; m < monthMatches; m++) {
    const i = rng.int(0, pool.length - 1);
    let j = rng.int(0, pool.length - 2);
    if (j >= i) j += 1;
    const teamA = pool[i]; const teamB = pool[j];
    const rowA = rowById.get(teamA.id); const rowB = rowById.get(teamB.id);
    if (!rowA || !rowB) continue;

    // 局型識別（§24.2.4）：夾取前的宏觀強度差，逐局擺動不進局型
    const deltaAbs = Math.abs(teamA.strength - teamB.strength);
    const aIsWeak = teamA.strength <= teamB.strength;

    // Bo3 逐局獨立結算，不做氣勢項（§24.2.1）；每局順手生成雙方五人微觀數據（§24.2.3）
    let winsA = 0; let winsB = 0;
    while (winsA < 2 && winsB < 2) {
      const p = clamp(baseGameChance(teamA.strength - teamB.strength), 8, 92);
      const aWins = rng.chance(p);
      if (aWins) { winsA += 1; rowA.W += 1; rowB.L += 1; } else { winsB += 1; rowB.W += 1; rowA.L += 1; }

      const weakSideWon = aIsWeak ? aWins : !aWins;
      const { sigmaM, winMod, loseMod } = gameTypeOf(deltaAbs, weakSideWon);
      for (const pl of teamA.players) {
        accumulateMicroStats(entry.stats, pl.id, pl.position, generateMicroStats(rng, pl, sigmaM, aWins ? winMod : loseMod));
      }
      for (const pl of teamB.players) {
        accumulateMicroStats(entry.stats, pl.id, pl.position, generateMicroStats(rng, pl, sigmaM, aWins ? loseMod : winMod));
      }
    }
  }

  sortStandings(entry.standings);
}

/**
 * 玩家隊這個月的戰績併入積分榜（§24.2.1「玩家隊去重規則」）：直接採用
 * `simulateSeason` 的 W/L，不另外模擬。`stat.G === 0`（板凳／整段養傷）時這個月
 * 沒有分數可記，略過。
 *
 * 同時把玩家這個月的微觀數據併進個人數據池（§24.2.5／§24.3 第 1 條，S34）：
 * `stat` 的 K/D/A/CS/VIS 已經是總量（`simulateSeason` 的算法），DPM 是比例
 * （場均），要乘回 `stat.G` 才是與 NPC 端同格式的總量——`metricAverage` 讀取時
 * 統一除以 G，兩邊才可比。
 */
export function recordPlayerLeagueResult(state, leagueKey, phase, stat) {
  if (!phase.split || !LEAGUES[leagueKey]?.region || !stat.G) return;
  const entry = ensureSplit(state, leagueKey, phase);
  const row = entry.standings.find((r) => r.isPlayer);
  if (!row) return;
  row.W += stat.W;
  row.L += stat.L;
  sortStandings(entry.standings);

  accumulateMicroTotals(entry.stats, PLAYER_STAT_ID, state.role, stat.G, {
    K: stat.K, D: stat.D, A: stat.A, DPM: stat.DPM * stat.G, CSM: stat.CS, VSPM: stat.VIS,
  });
}

/**
 * 玩家這一輪國際賽系列賽（MSI／世界賽，§15.2）的微觀數據併進 `intl` 段（§24.4.3，
 * S34）：國際賽百分位母體需要玩家自己的數據，這裡是唯一寫入口——由
 * `phases/shared.js` 的 `recordIntlSeries` 呼叫（只有 MSI／世界賽的系列賽才叫它，
 * 國內季後賽不進 `intl` 段，§24.2.2 schema 明文）。
 *
 * ⚠ 舊制小組賽（2012–2022，`runGroup` 的 BO1）沒有陣亡數據（`seriesDeaths` 沒被
 * 呼叫過），本站未併入——留給後續站補（見交接筆記「未一起處理」）。
 */
export function recordPlayerIntlMicroStats(state, micro) {
  if (!micro) return;
  const yearPool = ensureYear(state, state.year);
  accumulateMicroTotals(yearPool.intl.stats, PLAYER_STAT_ID, state.role, micro.G, micro);
}

/**
 * 實體化對手的五人微觀數據併進 `intl` 段（§24.4.3 母體的 NPC 側，S35）：國際賽
 * 百分位母體＝「背景模擬的國際對局＋玩家國際賽數據」，玩家側 S34 已接，NPC 側
 * 是這一個口——同一個帳本寫入口（`phases/shared.js` 的 `recordIntlSeries`）順手
 * 呼叫，不在 `worlds.js`／`msi.js` 另開呼叫點。
 *
 * 局型走國際賽方差放大（§24.2.4）：`gameTypeOf` 的 intl 旗標，σM ×1.25。
 * 局型判定的強弱邊與玩家相同——對手的「弱方爆冷」與玩家的「爆冷贏」是同一局。
 *
 * @param {object} opp 實體化對手（`materialized: false` 直接略過——匿名沒有身分，
 *   微觀池的鍵是 player_id，匿名隊混進來會污染母體）
 * @param {boolean[]} playerWins 逐局玩家隊勝負（長度＝局數）
 */
export function recordIntlOpponentMicro(state, rng, opp, playerWins) {
  if (!opp?.materialized || !playerWins?.length) return;
  const yearPool = ensureYear(state, state.year);
  const mine = teamStrength(state);
  const deltaAbs = Math.abs(mine - opp.strength);
  const playerWeak = mine < opp.strength;
  const attrs = opp.players.map((p) => ({ ...p, ...npcMicroAttrs(p.id) }));
  for (const playerWon of playerWins) {
    const weakSideWon = playerWeak ? playerWon : !playerWon;
    const { sigmaM, winMod, loseMod } = gameTypeOf(deltaAbs, weakSideWon, true);
    for (const pl of attrs) {
      accumulateMicroStats(yearPool.intl.stats, pl.id, pl.position,
        generateMicroStats(rng, pl, sigmaM, playerWon ? loseMod : winMod));
    }
  }
}

/** 讀某一年某賽段的積分榜（沒有資料回 null）。UI／查詢層唯讀入口，不得直接戳 state.leaguePool */
export function standingsFor(state, year, splitKey) {
  return state.leaguePool?.[year]?.splits?.[splitKey]?.standings ?? null;
}

/** 讀某一年某賽段的個人數據池（沒有資料回 null），供 `microStats.leaderboard` 消費 */
export function statsFor(state, year, splitKey) {
  return state.leaguePool?.[year]?.splits?.[splitKey]?.stats ?? null;
}

/** 玩家在積分榜裡的名次（1 起算），榜不存在回 null */
export function playerRank(standings) {
  if (!standings) return null;
  const idx = standings.findIndex((r) => r.isPlayer);
  return idx === -1 ? null : idx + 1;
}
