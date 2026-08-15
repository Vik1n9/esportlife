/**
 * 跨層共用的文字工具（S20h）。
 *
 * `{變數}` 填空原本是 `engine/biography.js` 的模組私有函式，卡片文本（事件卡／扮演卡）
 * 需要同一份時只好自己土製（`summary.js:66` 的 `{n}` 替換）或整張卡換掉。這裡是唯一
 * 的一份——傳記、卡片、粉絲留言共用，缺變數一律丟例外（測試跑 160 段生涯會抓出來）。
 *
 * ⚠ 轉義也收在這裡：`renderCard`（`ui/log.js:16`）走 `innerHTML` 且不轉義，卡片 body
 * 注入玩家自填的 `state.name` 一定要在填空點轉義（`cardVars` 做），不能靠輸出端。
 */

/**
 * 模板填空。缺變數直接丟例外——寧可大聲壞掉，也不要印出「作為 ，你有什麼話想說？」
 * 這種半成品（S20h 降級路徑的核心不變式：缺變數走備用模板，不是空字串）。
 */
export function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    if (vars[k] == null) throw new Error(`模板缺變數「${k}」：${template}`);
    return String(vars[k]);
  });
}

/** 掃出模板用到的變數鍵集合（降級選版要判斷「這版缺不缺變數」） */
export function templateVars(template) {
  const keys = new Set();
  template.replace(/\{(\w+)\}/g, (_, k) => keys.add(k));
  return keys;
}

/** 使用者輸入一律經過這裡，避免 ID 內含 HTML 造成注入（原在 ui/dom.js，卡片層也要用） */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
