/**
 * DEMO 期程（V4 §19，S21b）。
 *
 * DEMO 不是「另一個遊戲」，是**同一條生涯被截斷在第 36 個月**：規則、系統、結算
 * 全部與正式版共用，只多一條「期滿就收束」的上限。所以這個檔只有三個純函式，
 * 沒有任何 DEMO 專用的規則分支——引擎、UI、結算都讀同一套判斷，不各自算一次。
 *
 * 期程掛在 state（`demoEndYear`）而不是執行脈絡（`g.opts`）：它決定這段生涯什麼
 * 時候結束，是生涯本身的性質，讀檔回來必須還原。這與 `forceIntl` 那類**測試旗標**
 * 相反——旗標不進 state（會漏進玩家存檔），期程不進 opts（會被存檔遺忘）。
 *
 * 業餘起點（AMATEUR）沒有 `demoEndYear`：那是完整生涯基線，13 站的校準量在它
 * 身上，不能被 DEMO 上限截斷（§19.4 的擴展路徑也要靠它）。
 */
import { MONTHS_PER_YEAR } from './calendar.js';
import { DEMO_YEARS } from '../data/eras.js';

/** DEMO 總月數（36）。年數是資料、月數是年曆導出——不手抄第二個 12 */
export const DEMO_MONTHS = DEMO_YEARS * MONTHS_PER_YEAR;

/** 這段生涯吃不吃 DEMO 上限。業餘起點（完整生涯）回 false */
export const isDemo = (state) => Number.isFinite(state.demoEndYear);

/** DEMO 的起始年（＝ 生涯起點年）。非 DEMO 回 null */
export const demoStartYear = (state) => (isDemo(state) ? state.demoEndYear - DEMO_YEARS + 1 : null);

/**
 * 現在走到 DEMO 的第幾個月（1–36）。非 DEMO 回 0。
 *
 * `month` 給 UI 用：狀態列拿的是 beat 帶來的月份，比 `state.month` 早一步。
 */
export function demoMonth(state, month = state.month || 1) {
  if (!isDemo(state)) return 0;
  return (state.year - demoStartYear(state)) * MONTHS_PER_YEAR + month;
}

/**
 * 這一年是不是 DEMO 的最後一年——年底跑完就收束，不跨年。
 *
 * 「不跨年」是刻意的：結算畫面要停在玩家真的打過的第三季（2017 年 · 21 歲），
 * 而不是一天都還沒打的 2018。
 */
export const demoExpiring = (state) => isDemo(state) && state.year >= state.demoEndYear;
