/**
 * 年度目錄左欄（S42，§22.6）。≥1024px 時在左欄常駐顯示，點擊可跳轉。
 *
 * 資料直接取用 `ui/log.js` 的 `yearEntries`，不重建一份。`log.js` 每新增一個年度
 * 分隔線就回呼本模組更新。
 */
import { byId, el } from './dom.js';
import { getYearEntries, onYearsUpdated } from './log.js';

let root = null;

export function initYearDir() {
  root = byId('year-dir');
  if (!root) return;
  root.hidden = false;
  render();
  onYearsUpdated(render);
}

function render() {
  if (!root) return;
  const entries = getYearEntries();
  root.innerHTML = '';
  if (!entries.length) return;

  root.appendChild(el('h5', { text: '年度目錄' }));

  for (const entry of entries) {
    const btn = el('button', { class: 'yd-entry', text: entry.text });
    btn.addEventListener('click', () => {
      root.querySelectorAll('.yd-entry').forEach((b) => b.classList.remove('on'));
      btn.classList.add('on');
      entry.node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    root.appendChild(btn);
  }
}
