/** 敘事卡片流。可依年度折疊。 */
import { byId, el, scrollToBottom } from './dom.js';

let logRoot = null;
let currentYearBody = null;

export function initLog() {
  logRoot = byId('log');
  logRoot.innerHTML = '';
  currentYearBody = null;
}

function target() { return currentYearBody || logRoot; }

export function renderCard({ tone, title, body }) {
  const node = el('div', { class: `card${tone ? ` ${tone}` : ''}` });
  if (title) node.appendChild(el('h4', { text: title }));
  node.appendChild(el('div', { class: 'card-body', html: body }));
  target().appendChild(node);
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
  scrollToBottom();
}

/** 結算等內容不屬於任何年度，掛回頂層 */
export function renderLoose(node) {
  currentYearBody = null;
  logRoot.appendChild(node);
  scrollToBottom();
}
