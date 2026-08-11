/** 極簡 DOM 工具。UI 層唯一允許直接碰 document 的地方之一。 */

/** 舊版把 `$` 定義成 querySelector 卻到處寫 `$('log')`（少了 `#`），整個遊戲在載入時就炸掉。這裡改成明確的 byId。 */
export const byId = (id) => document.getElementById(id);
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.appendChild(c);
  return node;
}

export function clear(node) { if (node) node.innerHTML = ''; }

export function scrollToBottom() {
  requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
}

/** 使用者輸入一律經過這裡，避免 ID 內含 HTML 造成注入 */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
