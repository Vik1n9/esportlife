/** 進入點：開場畫面、種子、續玩存檔，然後把控制權交給 runner。 */
import { Rng, randomSeed } from './core/rng.js';
import { ROLES, ROLE_NAMES } from './data/abilities.js';
import { createState } from './engine/state.js';
import { renderBoard } from './ui/board.js';
import { byId, qsa } from './ui/dom.js';
import { initLog } from './ui/log.js';
import { initPanel, setPanelState } from './ui/panel.js';
import { runCareer } from './ui/runner.js';
import { clearSave, loadGame } from './ui/storage.js';

export const APP_VERSION = 'v3.3.0';

let selectedRole = 'TOP';
let seed = new URLSearchParams(location.search).get('seed') || randomSeed();

function setSeed(next) {
  seed = next;
  byId('seed-input').value = seed;
}

function bindStartScreen() {
  setSeed(seed);
  byId('ver-badge').textContent = APP_VERSION;

  byId('seed-reroll').addEventListener('click', (e) => { e.preventDefault(); setSeed(randomSeed()); });

  qsa('#seg-pos button').forEach((btn) => {
    btn.addEventListener('click', () => {
      qsa('#seg-pos button').forEach((b) => b.classList.toggle('on', b === btn));
      selectedRole = btn.dataset.role;
    });
  });

  byId('btn-start').addEventListener('click', startNewCareer);

  const save = loadGame();
  const resume = byId('btn-resume');
  if (save) {
    resume.hidden = false;
    resume.querySelector('small').textContent =
      `${save.state.name}｜${ROLE_NAMES[save.state.role]}｜${save.state.year} 年 · ${save.state.age} 歲`;
    resume.addEventListener('click', () => resumeCareer(save));
  }
}

function enterGame(state, rng) {
  byId('start').hidden = true;
  byId('board').hidden = false;
  byId('act').hidden = false;
  initLog();
  initPanel(state);
  setPanelState(state);
  renderBoard(state, 0);

  byId('btn-restart').addEventListener('click', () => {
    if (!window.confirm('確定放棄這段生涯，重新開始？')) return;
    clearSave();
    location.href = location.pathname;
  });

  const toggle = byId('act-toggle');
  toggle.addEventListener('click', () => {
    const act = byId('act');
    act.classList.toggle('collapsed');
    toggle.textContent = act.classList.contains('collapsed') ? '⌃ 展開選項' : '⌄ 收合選項';
  });

  runCareer({ state, rng, seed, appVersion: APP_VERSION });
}

function startNewCareer() {
  const typedSeed = byId('seed-input').value.trim();
  if (typedSeed) seed = typedSeed;
  const name = byId('name-input').value.trim().slice(0, 12) || 'Faker';

  history.replaceState(null, '', `?seed=${encodeURIComponent(seed)}`);
  clearSave();

  const rng = new Rng(seed);
  const state = createState({ name, role: selectedRole, rng, seed });
  enterGame(state, rng);
}

function resumeCareer(save) {
  seed = save.seed;
  history.replaceState(null, '', `?seed=${encodeURIComponent(seed)}`);
  const rng = new Rng(seed);
  rng.state = save.rngState;
  enterGame(save.state, rng);
}

// 開場畫面的位置按鈕由 ROLES 產生，避免 HTML 與資料兩邊各寫一份
function buildRoleButtons() {
  const seg = byId('seg-pos');
  seg.innerHTML = ROLES
    .map((r, i) => `<button data-role="${r}"${i === 0 ? ' class="on"' : ''}>${ROLE_NAMES[r]}</button>`)
    .join('');
}

buildRoleButtons();
bindStartScreen();
