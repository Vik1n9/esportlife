/**
 * 賽區註冊表。
 *
 * 一個賽區一個檔，它的所有屬性同居：par／薪資／賽段史／隊名／世界賽席位／外援名額。
 *
 * 這個切法是被倒推測試選出來的：先前按屬性切（leagues.js 放 par、splits.js 放賽段、
 * teams.js 放隊名、imports.js 放名額），結果「新增一個賽區」要開 4 個檔，比原本擠在
 * 單一 world.js 的 1 個檔更差。賽區是一個實體，拆散它等於每次新增都要在四個地方
 * 各補一列還不能漏。現在新增一個賽區＝1 個新檔 ＋ 這裡加一行。
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

/** 依年份在一張 `{until, ...}` 表裡找出適用的那一列 */
function rowFor(table, year) {
  return table.find((r) => year <= r.until) || table[table.length - 1];
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
  const names = rowFor(r.splits, year).names;
  return names.map((name, i) => ({ key: `S${i + 1}`, name, weight: 1 / names.length }));
}

/** 該年度某賽區的世界賽席位數 */
export function worldsSlotsOf(year, region) {
  const r = REGIONS[region];
  return r ? rowFor(r.worldsSlots, year).n : 0;
}

/** 某賽區每隊的外援名額上限。母區回傳 Infinity（本地選手不佔名額）。 */
export function importSlotsOf(region) {
  return REGIONS[region]?.importSlots ?? 0;
}

/**
 * 該年度某賽區的隊名清單（未過濾解散）。
 * 主場賽區隨時代改名換隊，所以吃 `eraKey`；其餘賽區只有一份名單。
 */
export function teamNamesOf(region, eraKey) {
  const r = REGIONS[region];
  if (!r) return [];
  return r.teamsByEra ? (r.teamsByEra[eraKey] || []) : (r.teams || []);
}
