/**
 * 敘事卡片流。可依年度折疊、分類篩選、年度跳轉（S41，§22.1）。
 *
 * 篩選是純檢視操作——不改引擎狀態、不重繪、不重跑 generator。卡片帶 `data-kind`
 * 屬性，篩選靠 CSS 屬性選擇器，切 class 就好。沒有 `kind` 的卡（`engine/game.js`
 * 的出生／退役／結局等生命週期卡）在任何篩選下都保持可見。
 *
 * 五拍分組：同一場系列賽的五張卡（帶相同 `series` 值）收進同一個 `.series-block`，
 * 標頭顯示賽事標題。分組判斷跨過中間的 `choice`（第 2 拍備賽戰術走 `'act'` 槽，
 * 渲染在 `#act` 而非文本區，不影響分組連續性）。
 */
import { byId, el, scrollToBottom } from './dom.js';

const KIND_LABEL = { all: '全部', match: '賽事', train: '訓練', event: '事件', market: '市場', season: '結算' };

let logRoot = null;
let currentYearBody = null;
// 卡牌覆寫（§22.2，S39）：inline 選項要接在「剛才那張卡」下緣，得記住最後一張卡
// 的節點。engine 掛保證 inline choice 的前一個 beat 必是 card（tests/phases/choiceSlot.mjs），
// 所以讀到的一定是錨點卡本身
let lastCardNode = null;
// 五拍分組：記住最後一個 series block，同系列的下一張卡直接追加
let lastSeriesBlock = null;
// 年度目錄：S42 寬螢幕左欄直接取用這個結構
let yearEntries = [];

export function initLog() {
  logRoot = byId('log');
  logRoot.innerHTML = '';
  logRoot.setAttribute('data-filter', 'all');
  logRoot.classList.add('log-filters');
  currentYearBody = null;
  lastCardNode = null;
  lastSeriesBlock = null;
  yearEntries = [];
  initFilterChips();
}

function target() { return currentYearBody || logRoot; }

/** 最後一張卡（inline 選項的錨點）；分隔線與 loose 節點會切斷它 */
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
  updateYearDropdown();
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

/* ---------------- 分類篩選（純 CSS，S41 §22.1） ---------------- */

function initFilterChips() {
  const bar = byId('log-chips');
  if (!bar) return;
  bar.innerHTML = '';
  for (const [key, label] of Object.entries(KIND_LABEL)) {
    const btn = el('button', {
      class: `chip${key === 'all' ? ' on' : ''}`,
      text: label,
      'data-kind': key,
    });
    btn.addEventListener('click', () => setFilter(key));
    bar.appendChild(btn);
  }
}

function setFilter(kind) {
  logRoot.setAttribute('data-filter', kind);
  const bar = byId('log-chips');
  if (bar) bar.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.getAttribute('data-kind') === kind));
}

/* ---------------- 年度目錄（S42 取用） ---------------- */

function updateYearDropdown() {
  const select = byId('log-year-select');
  if (!select) return;
  select.innerHTML = '<option value="">年度</option>';
  for (const entry of yearEntries) {
    select.appendChild(el('option', { text: entry.text, value: entry.text }));
  }
  select.onchange = () => {
    const entry = yearEntries.find((e) => e.text === select.value);
    if (entry?.node) entry.node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}
