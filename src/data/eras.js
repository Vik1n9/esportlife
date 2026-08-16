/** 時代演進表。純資料。 */

/*
 * 起點兩套，各自服務一條路線（S20d）：
 *
 * - `START_YEAR／START_AGE` 是遊戲預設起點——DEMO 直接從職業第一年開始
 *   （§19）。選 2015 是因為它是 MSI 開辦年，年曆從第一年就有兩賽段＋兩席
 *   世界賽門票，賽事成績線不必等三年才有東西可量。
 * - `AMATEUR_START_YEAR／AMATEUR_START_AGE` 是業餘路線起點——16 歲打網咖
 *   盃賽。2012 是主場賽區草創期（GPL），S15b 以來的全部校準線都量在這條
 *   路線上，改它等於把基線搬走，所以業餘線起點凍結不動。
 */
export const START_YEAR = 2015;
export const START_AGE = 19;
export const AMATEUR_START_YEAR = 2012;
export const AMATEUR_START_AGE = 16;

/*
 * DEMO 期程（§19，S21b）：從 START_YEAR 起算 **三個賽季 ＝ 36 個月**。
 *
 * 一年（12 個月）試不出多樣系統——生命週期衰退、合約遞減、轉會、生涯任務的期限、
 * 三層退役事件都要跨年才看得到第二個狀態。三年是「跨得過所有跨年機制、又短到
 * 一次坐得完」的長度：合約 2 年在第三年到期、任務卡 deadline 2 年內收束、
 * 衰退曲線在 19 → 21 歲之間量得出斜率。
 *
 * 期滿沒觸發任何結局就以「DEMO 結束」收束，比照退役跑第三層結算（§18.2 finale）。
 * 上限只掛在 DEMO 路線（PRO 起點）；業餘起點是完整生涯基線，永不到期。
 */
export const DEMO_YEARS = 3;
export const DEMO_END_YEAR = START_YEAR + DEMO_YEARS - 1;

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
