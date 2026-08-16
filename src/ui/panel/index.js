/**
 * 選手資訊面板：四 tab 分頁（§22.3，S40）。
 *
 * 舊版只有一個 11 section 的長捲抽屜，賽程與生涯兩個 tab 的內容完全沒有出口。
 * 現在拆成四個並列的檢視入口：賽程／生涯／隊伍／選手。
 *
 * 分頁狀態存在模組變數 `activeTab`；切 tab 後 `refreshPanel` 只重繪當前 tab。
 * 分頁列沿用 `.seg` 語彙（styles.css），不另造第二套分頁樣式。
 *
 * 對外的 API 簽章（S42 要改 `refreshPanel`／`togglePanel` 的可見性守衛）：
 * - `initPanel(state)` — 綁定事件、設初始狀態
 * - `setPanelState(state)` — 更新狀態引用
 * - `togglePanel(force?)` — 開關面板
 * - `refreshPanel()` — 若面板開啟則重繪當前 tab
 * - `questRows(state)` — 匯出給 board.js 第四列共用（任務呈現只准這一份）
 */
import { QUEST_CARDS } from '../../data/quests.js';
import { byId, escapeHtml } from '../dom.js';
import { renderSchedule } from './schedule.js';
import { renderCareer } from './career.js';
import { renderTeam } from './team.js';
import { renderPlayer } from './player.js';

let root = null;
let currentState = null;
let activeTab = 'player';

/**
 * 進行中的生涯任務（S17b，§12.3「進度與期限可見」的最小呈現）。
 * S38 起匯出給狀態帶第四列共用——任務呈現只准這一份，抄第二份就會出現兩邊不同步。
 */
export function questRows(state) {
  const active = state.quests?.active ?? [];
  if (!active.length) return '<span class="muted">尚無進行中的任務</span>';
  const cards = new Map(QUEST_CARDS.map((c) => [c.id, c]));
  return active.map((q) => {
    const card = cards.get(q.id);
    if (!card) return '';
    const left = q.deadlineYear == null
      ? '生涯結束前'
      : `剩 ${Math.max(0, q.deadlineYear - state.year + 1)} 賽季`;
    return `<div class="abrow static">
      <div class="nm">${escapeHtml(card.name)}</div>
      <div class="val"><span class="cost">${escapeHtml(card.goalText)} · ${left}</span></div>
    </div>`;
  }).join('');
}

export function initPanel(state) {
  currentState = state;
  root = byId('panel');
  byId('btn-panel').addEventListener('click', () => togglePanel());
  byId('panel-close').addEventListener('click', () => togglePanel(false));
  root.addEventListener('click', (e) => { if (e.target === root) togglePanel(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') togglePanel(false); });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    root.querySelectorAll('.panel-tabs button').forEach((b) =>
      b.classList.toggle('on', b.dataset.tab === activeTab));
    renderCurrentTab();
  });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'restart') {
      if (!window.confirm('確定放棄這段生涯，重新開始？')) return;
      import('../storage.js').then(({ clearSave }) => {
        clearSave();
        location.href = location.pathname;
      });
    }
  });

  updateTabActive();
}

export function setPanelState(state) { currentState = state; }

export function togglePanel(force) {
  const open = force ?? !root.classList.contains('open');
  root.classList.toggle('open', open);
  if (open) renderCurrentTab();
}

export function refreshPanel() {
  if (root && root.classList.contains('open')) renderCurrentTab();
}

function updateTabActive() {
  root.querySelectorAll('.panel-tabs button').forEach((b) =>
    b.classList.toggle('on', b.dataset.tab === activeTab));
}

function renderCurrentTab() {
  const body = byId('panel-body');
  if (!currentState) return;
  switch (activeTab) {
    case 'schedule': body.innerHTML = renderSchedule(currentState); break;
    case 'career': body.innerHTML = renderCareer(currentState); break;
    case 'team': body.innerHTML = renderTeam(currentState); break;
    case 'player': body.innerHTML = renderPlayer(currentState); break;
  }
}
