/**
 * 年度個人獎項的名目。
 *
 * 寫入端是 `phases/seasonEnd.js` 的 `award()`（同時進 `honors`／`awards` 計數／
 * `milestones`），讀取端是結算圖的榮譽計數列（`ui/summary.js`）——兩邊比對的是
 * 同一份字串，所以照 AGENTS.md 的單一來源規則收在這裡，不各自手抄一份。
 *
 * ⚠ `honors` 的字串帶年份（`2032 例行賽 MVP`），`milestones` 的 `text` 是脫掉年份的
 *   名目（見 `award()`）。要**依獎項名目計數**請走 `milestones`（`kind === 'award'`
 *   ＋ `text` 全等），不要去 `honors` 裡做子字串比對。
 */
export const AWARDS = {
  REGULAR_MVP: '例行賽 MVP',
  ROOKIE: '最佳新人',
  SOLO_KING: '單殺王',
  ALL_STAR: '全明星',
};

/** 生涯拿過幾座某個名目的獎（走 milestones 帳本，不解析 honors 顯示字串） */
export function awardCount(state, name) {
  return (state.milestones || []).filter((m) => m.kind === 'award' && m.text === name).length;
}
