/** 時代演進表。純資料。 */

export const START_YEAR = 2012;
export const START_AGE = 16;

/**
 * 時代時間軸。`[from, to]` 閉區間，`eraOf` 依年份查表，不再用一串 if。
 *
 * 這裡留下的是真正跨賽事的時代參數：主場賽區當年叫什麼、薪資水準到哪。
 * 「哪一年有哪些賽事、用什麼賽制」住在 `data/formats/*`——MSI 的創辦／停辦年
 * 在 `msi.js`、世界賽的小組→Swiss 轉換在 `worlds.js`，不重複維護。
 */
const ERAS = [
  { from: 2012, to: 2014, key: 'DAWN', label: '草創', home: 'GPL', salary: 0.35 },
  { from: 2015, to: 2019, key: 'GROWTH', label: '成熟', home: 'LMS', salary: 0.7 },
  { from: 2020, to: 2024, key: 'GLOBAL', label: '全球化', home: 'PCS', salary: 1.0 },
  { from: 2025, to: 9999, key: 'MODERN', label: '現代', home: 'LCP', salary: 1.2 },
];

/** 回傳該年度的世界設定 */
export function eraOf(year) {
  return ERAS.find((e) => year <= e.to) || ERAS[ERAS.length - 1];
}
