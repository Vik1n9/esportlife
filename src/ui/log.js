/**
 * 敘事卡片流。可依年度折疊、年度跳轉（S41，§22.1）。
 *
 * 分類篩選 chips 與年度下拉（原 `#log-bar`）已整列退場：固定框架（S43）下那一列
 * 白吃一整列高度，跟事件文本區搶的正是最缺的東西。年度跳轉改由年度分隔線折疊
 * （`.yr-block`）與寬螢幕左欄目錄（`ui/yearDir.js`）承接。
 *
 * 卡片仍帶 `data-kind`（`phases/shared.js` 的 `kinded()` 照舊發）——那是敘事流的
 * 機器可讀分類，與是否有篩選 UI 無關。
 *
 * 五拍分組：同一場系列賽的五張卡（帶相同 `series` 值）收進同一個 `.series-block`，
 * 標頭顯示賽事標題。分組判斷跨過中間的 `choice`（第 2 拍備賽戰術走 `'act'` 槽，
 * 渲染在 `#act` 而非文本區，不影響分組連續性）。
 */
import { byId, el, scrollToBottom } from './dom.js';

let logRoot = null;
let currentYearBody = null;
// 卡牌問答（§22.2，S43）：`slot:'inline'` 的選項出在底部決策槽，但「是哪張卡在問」
// 要標得出來——等待時掛提示條、選定後留下定格文字，所以得記住最後一張卡的節點。
// engine 掛保證 inline choice 的前一個 beat 必是 card（tests/phases/choiceSlot.mjs）
let lastCardNode = null;
// 五拍分組：記住最後一個 series block，同系列的下一張卡直接追加
let lastSeriesBlock = null;
// 年度目錄：S42 寬螢幕左欄直接取用這個結構
let yearEntries = [];
let onYearChange = null;

export function initLog() {
  logRoot = byId('log');
  logRoot.innerHTML = '';
  currentYearBody = null;
  lastCardNode = null;
  lastSeriesBlock = null;
  yearEntries = [];
  if (onYearChange) onYearChange(yearEntries);
}

export function getYearEntries() { return yearEntries; }
export function onYearsUpdated(cb) { onYearChange = cb; }

function target() { return currentYearBody || logRoot; }

/** 最後一張卡（卡牌問答的錨點）；分隔線與 loose 節點會切斷它 */
export const lastCard = () => lastCardNode;

export function renderCard({ tone, title, body, kind, series }) {
  const cardClass = `card${tone ? ` ${tone}` : ''}`;

  // 五拍分組：同 series 的卡追加進同一個 block，跨過中間的 choice 不影響連續性
  if (series && lastSeriesBlock && lastSeriesBlock._series === series) {
    const node = el('div', { class: cardClass });
    if (title) node.appendChild(el('h4', { text: title }));
    node.appendChild(el('div', { class: 'card-body', html: body }));
    lastSeriesBlock.appendChild(node);
    lastCardNode = node;
    scrollToBottom();
    return;
  }

  if (series) {
    const blockAttrs = { class: 'series-block' };
    if (kind) blockAttrs['data-kind'] = kind;
    const block = el('div', blockAttrs);
    block._series = series;
    block.appendChild(el('div', { class: 'series-head', text: series }));
    const node = el('div', { class: cardClass });
    if (title) node.appendChild(el('h4', { text: title }));
    node.appendChild(el('div', { class: 'card-body', html: body }));
    block.appendChild(node);
    target().appendChild(block);
    lastSeriesBlock = block;
    lastCardNode = node;
    scrollToBottom();
    return;
  }

  lastSeriesBlock = null;
  const attrs = { class: cardClass };
  if (kind) attrs['data-kind'] = kind;
  const node = el('div', attrs);
  if (title) node.appendChild(el('h4', { text: title }));
  node.appendChild(el('div', { class: 'card-body', html: body }));
  target().appendChild(node);
  lastCardNode = node;
  scrollToBottom();
}

/** 年度分隔線：同時開一個可折疊的區塊，讓長生涯不會變成無盡卷軸 */
export function renderDivider(text) {
  const block = el('div', { class: 'yr-block' });
  const head = el('div', { class: 'yr-head', text });
  const body = el('div', { class: 'yr-body' });
  head.addEventListener('click', () => block.classList.toggle('collapsed'));
  block.appendChild(head);
  block.appendChild(body);
  logRoot.appendChild(block);
  currentYearBody = body;
  lastCardNode = null;
  lastSeriesBlock = null;
  yearEntries.push({ text, node: block });
  if (onYearChange) onYearChange(yearEntries);
  scrollToBottom();
}

/** 結算等內容不屬於任何年度，掛回頂層 */
export function renderLoose(node) {
  currentYearBody = null;
  lastCardNode = null;
  lastSeriesBlock = null;
  logRoot.appendChild(node);
  scrollToBottom();
}
