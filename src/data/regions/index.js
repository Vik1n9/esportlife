/**
 * 賽區註冊表與查詢層。
 *
 * 一個賽區一個檔，它的所有屬性同居：`ladder`（聯賽靜態屬性）／`timeline`（史實
 * 時間軸：賽段、世界賽席位、隊名）／`importSlots`。
 *
 * 這個切法是被倒推測試選出來的：先前按屬性切（leagues.js 放 par、splits.js 放賽段、
 * teams.js 放隊名、imports.js 放名額），結果「新增一個賽區」要開 4 個檔，比原本擠在
 * 單一 world.js 的 1 個檔更差。賽區是一個實體，拆散它等於每次新增都要在四個地方
 * 各補一列還不能漏。現在新增一個賽區＝1 個新檔 ＋ 這裡加一行。
 *
 * 時間軸一律用 `[from, to]` 閉區間表達，查詢層依年份找適用的那一列——比「最後
 * 適用年（until）」直白，也讓 S14 月回合制把賽段展開成月份區間時不必再猜邊界。
 */
import HOME from './home.js';
import KR from './kr.js';
import CN from './cn.js';
import EU from './eu.js';
import NA from './na.js';

export const REGIONS = { HOME, KR, CN, EU, NA };

/** 賽區鍵 → 聯賽鍵（HOME 兩者同名，其餘如 KR → LCK） */
export const LEAGUE_OF_REGION = Object.fromEntries(
  Object.values(REGIONS).map((r) => [r.key, r.league]),
);

/**
 * 依年份在一張 `[from, to]` 閉區間表裡找出適用的那一列。
 * 年份早於表起點（理論上不會發生，遊戲從 START_YEAR 開始）取第一列，晚於終點取最後。
 */
function rowFor(table, year) {
  return table.find((r) => r.from <= year && year <= r.to)
    ?? table.find((r) => year < r.from)
    ?? table[table.length - 1];
}

/**
 * 該年度某賽區的賽段清單。
 *
 * `weight` 是該賽段佔全年場次的比例——賽段變多不代表一年要打三倍的比賽，場次是切開來
 * 分配的，變密的是決策點與事件。
 *
 * @param {number} year
 * @param {string} [region] 賽區鍵；業餘／青訓不傳
 * @returns {{key:string, name:string, weight:number}[]}
 */
export function splitsOf(year, region) {
  const r = REGIONS[region];
  if (!r) return [{ key: 'S1', name: '賽季', weight: 1 }];
  const names = rowFor(r.timeline.splits, year).names;
  return names.map((name, i) => ({ key: `S${i + 1}`, name, weight: 1 / names.length }));
}

/**
 * MSI 接在該賽區當年的第幾個賽段之後（1 起算）。
 *
 * 這是賽區的年曆屬性，不是全球規則：2023 年 LEC 帶頭改三賽段，MSI 仍然接在春季賽
 * 之後，也就是它的**第二**個賽段；同年其他賽區只有兩段，MSI 接在第一段之後。
 * 把它寫成全球的「第 n 賽段」會讓 LEC 2023 抓到冬季賽冠軍去打 MSI。
 *
 * @returns {number|null} null 代表該年該賽區沒有對應賽段（例如 MSI 創辦前）
 */
export function msiSplitOf(year, region) {
  const r = REGIONS[region];
  if (!r) return null;
  return rowFor(r.timeline.splits, year).msiAfter ?? null;
}

/** 該年度某賽區的世界賽席位數 */
export function worldsSlotsOf(year, region) {
  const r = REGIONS[region];
  return r ? rowFor(r.timeline.worldsSlots, year).n : 0;
}

/** 某賽區每隊的外援名額上限。母區回傳 Infinity（本地選手不佔名額）。 */
export function importSlotsOf(region) {
  return REGIONS[region]?.importSlots ?? 0;
}

/**
 * 該年度某賽區的隊名清單（未過濾解散）。
 * 主場賽區隨時代改名換隊，所以吃 `eraKey`（即 eraOf(year).home）；其餘賽區只有
 * 一份名單，沒有 era 標記，直接取無標記的那一列。
 */
export function teamNamesOf(region, eraKey) {
  const r = REGIONS[region];
  if (!r) return [];
  const eraRow = r.timeline.teams.find((t) => t.era === eraKey);
  return eraRow ? eraRow.names : (r.timeline.teams.find((t) => !t.era)?.names || []);
}
