/**
 * 聯賽百分位查詢層（§24.3.2／§24.4.3，S34）。
 *
 * `leaguePct` 條件節點與（未來消費端要用的）國際賽獨立基準都讀這裡——單一來源：
 * 指標白名單、當季母體百分位的求法只寫一份，`engine/conditions.js` 與
 * `tools/schema.js` 都只 import，不各抄一份門檻或指標清單。
 *
 * 與 `data/npc/percentiles.js` 的 `percentile` 節點物理隔離（AGENTS.md 條件語言
 * 規則、§24.1 第 2 條）：那邊讀歷史史實母體的靜態表，這裡 runtime 從
 * `state.leaguePool` 現算——兩套母體各自一個節點，混用寫不出來。
 */
import { calendarFor } from '../engine/calendar.js';
import { currentLeagueKey } from '../engine/roster.js';
import { PLAYER_STAT_ID, statsFor } from '../engine/leagueSim.js';
import { metricAverage } from '../engine/microStats.js';

/** 指標白名單（§24.3.2）：`conditions.js`／`tools/schema.js` 都 import 這裡，不各抄一份 */
export const LEAGUE_PCT_METRICS = ['kda', 'dpm', 'csm', 'vspm'];

/** `leaguePct` 指標名 → 池 schema 的欄位／`metricAverage` 認得的鍵 */
const METRIC_KEY = { kda: 'KDA', dpm: 'DPM', csm: 'CSM', vspm: 'VSPM' };

/** 母體 < 20 判 false（§23.5 最小樣本規則同一精神）：樣本不足不勉強切分 */
const MIN_POOL = 20;

/** 玩家當下所屬賽段的 key（沒有正在打的賽段回 null，§24.3.1「賽段窗口」定案） */
function currentSplitKey(state) {
  const now = state.month || 1;
  const phase = calendarFor(state, currentLeagueKey(state)).find((p) => p.month === now && p.split);
  return phase ? phase.split.key : null;
}

/**
 * 給定一批同位置母體（含玩家本人）與指標，算玩家的百分位（0–100）。
 * p ＝（母體內該指標 ≤ 玩家者的人數）÷ 母體 × 100（§24.3.2 語意，玩家本人計入母體）。
 * 母體 < 20 或玩家本人沒有資料時回 null（樣本不足，不勉強切分）。
 */
function percentileIn(stats, role, metric) {
  if (!stats) return null;
  const key = METRIC_KEY[metric];
  const mine = stats[PLAYER_STAT_ID];
  if (!mine || !mine.G || mine.role !== role) return null;
  const pool = Object.values(stats).filter((row) => row.role === role && row.G > 0);
  if (pool.length < MIN_POOL) return null;
  const mineValue = metricAverage(mine, key);
  const le = pool.filter((row) => metricAverage(row, key) <= mineValue).length;
  return (le / pool.length) * 100;
}

/**
 * 玩家在**指定賽段**當季模擬母體中的同位置百分位（§24.3.2）：讀
 * `state.leaguePool[年].splits[splitKey].stats`。呼叫端已經知道賽段 key
 * （例如 `phases/playoff.js` 賽段結算時手上就有 `phase.split.key`）時走這條，
 * 不必再讓 `calendarFor` 反推一次。
 */
export function splitPercentile(state, metric, splitKey) {
  if (!splitKey) return null;
  return percentileIn(statsFor(state, state.year, splitKey), state.role, metric);
}

/**
 * `leaguePct` 節點讀的百分位（§24.3.2）：玩家當季在本賽區當季模擬母體中的
 * 同位置百分位——從 `state.month` 反推「現在是哪個賽段」（條件式求值時手上只有
 * `state`，沒有呼叫端的 `phase` 物件）。
 */
export function leaguePercentile(state, metric) {
  return splitPercentile(state, metric, currentSplitKey(state));
}

/**
 * 國際賽獨立基準（§24.4.3，S34 吃）：百分位母體＝當季 `leaguePool[年].intl` 的
 * 全部參賽選手，基準從這群現算，不與賽區基準共用門檻——顯示層（選手面板國際
 * 排行榜、§15.2 戰報級距描述的國際版）消費，不進 `leaguePct` 條件節點
 * （條件節點的母體切分規則只有賽區／史實兩種，§24.1 第 2 條）。
 */
export function intlPercentile(state, metric) {
  return percentileIn(state.leaguePool?.[state.year]?.intl?.stats, state.role, metric);
}

/** 百分位級距描述（§24.3.1 掛載層 1）：五檔詞條，資料驅動——不寫死在結算邏輯裡 */
const PCT_BANDS = [
  [80, '宰制'], [60, '優異'], [40, '中規'], [20, '平庸'], [-Infinity, '劣位'],
];

/** 百分位 → 級距詞條。百分位不可求值（樣本不足）時回 null，呼叫端自行決定要不要顯示 */
export function percentileBand(p) {
  if (p === null || p === undefined) return null;
  const row = PCT_BANDS.find(([at]) => p >= at);
  return row[1];
}
