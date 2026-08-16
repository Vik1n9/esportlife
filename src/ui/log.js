/** 敘事卡片流。可依年度折疊。 */
import { byId, el, scrollToBottom } from './dom.js';

let logRoot = null;
let currentYearBody = null;
// 卡牌覆寫（§22.2，S39）：inline 選項要接在「剛才那張卡」下緣，得記住最後一張卡
// 的節點。engine 掛保證 inline choice 的前一個 beat 必是 card（tests/phases/choiceSlot.mjs），
// 所以讀到的一定是錨點卡本身
let lastCardNode = null;

export function initLog() {
  logRoot = byId('log');
  logRoot.innerHTML = '';
  currentYearBody = null;
  lastCardNode = null;
}

function target() { return currentYearBody || logRoot; }

/** 最後一張卡（inline 選項的錨點）；分隔線與 loose 節點會切斷它 */
export const lastCard = () => lastCardNode;

export function renderCard({ tone, title, body }) {
  const node = el('div', { class: `card${tone ? ` ${tone}` : ''}` });
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
  scrollToBottom();
}

/** 結算等內容不屬於任何年度，掛回頂層 */
export function renderLoose(node) {
  currentYearBody = null;
  lastCardNode = null;
  logRoot.appendChild(node);
  scrollToBottom();
}
