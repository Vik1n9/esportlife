/** 時代演進表。純資料。 */

export const START_YEAR = 2012;
export const START_AGE = 16;

/**
 * 中度史實演進。回傳該年度的世界設定。
 *
 * `msi` 與 `worlds` 兩個欄位在賽制重寫後會搬進 `data/formats/`——那裡才是
 * 「哪一年有哪些賽事、用什麼賽制」該住的地方。這裡留下的是真正跨賽事的時代
 * 參數：主場賽區當年叫什麼、薪資水準到哪。
 *
 * @param {number} year
 */
export function eraOf(year) {
  if (year <= 2014) return { key: 'DAWN', label: '草創', home: 'GPL', salary: 0.35, msi: false, worlds: 'GROUP' };
  if (year <= 2019) return { key: 'GROWTH', label: '成熟', home: 'LMS', salary: 0.7, msi: true, worlds: 'GROUP' };
  if (year <= 2024) return { key: 'GLOBAL', label: '全球化', home: 'PCS', salary: 1.0, msi: true, worlds: year >= 2023 ? 'SWISS' : 'GROUP' };
  return { key: 'MODERN', label: '現代', home: 'LCP', salary: 1.2, msi: true, worlds: 'SWISS' };
}
