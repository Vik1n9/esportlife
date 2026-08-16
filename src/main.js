/**
 * 進入點：開場畫面、種子、續玩存檔，然後把控制權交給 runner。
 *
 * 這一層只管「人生從哪裡開始」：開場 UI 的事件、種子的來回、新開局或續玩的分流。
 * 遊戲進行中的一切由 ui/runner.js 接手，這裡不再碰。
 *
 * 種子有兩條流（見 engine/state.js）：`seed` 決定天賦（存在 URL 與存檔裡），
 * 人生流種子只在記憶體與存檔裡——續玩時兩條都要還原，人生才接得回去。
 */
import { Rng, randomSeed } from './core/rng.js';
import { ROLES, ROLE_NAMES } from './data/skills.js';
import { createState } from './engine/state.js';
import { renderBoard } from './ui/board.js';
import { byId, qsa } from './ui/dom.js';
import { initLog } from './ui/log.js';
import { initPanel, setPanelState } from './ui/panel/index.js';
import { runCareer } from './ui/runner.js';
import { clearSave, loadGame, setSaveNamespace } from './ui/storage.js';
import { initYearDir } from './ui/yearDir.js';
import { APP_VERSION } from './version.js';

export { APP_VERSION };

// 起點模式（S45，alpha 內測）：根目錄 index.html 沒標 → 'demo'（PRO 三年期程）；
// alpha/index.html 檔頭標 `__ESPORTLIFE_MODE__ = 'alpha'` → AMATEUR 完整生涯。
// 存檔 namespace 跟著模式走，兩邊的存檔互不污染。
const MODE = window.__ESPORTLIFE_MODE__ || 'demo';
setSaveNamespace(MODE);

let selectedRole = 'TOP';
let seed = new URLSearchParams(location.search).get('seed') || randomSeed();

/* ---------------- 開場畫面 ---------------- */

function bindStartScreen() {
  byId('seed-input').value = seed;
  byId('ver-badge').textContent = `${MODE === 'alpha' ? 'ALPHA ' : 'DEMO '}${APP_VERSION}`;

  byId('seed-reroll').addEventListener('click', (e) => {
    e.preventDefault();
    seed = randomSeed();
    byId('seed-input').value = seed;
  });

  // 位置按鈕由 ROLES 產生（buildRoleButtons），這裡只處理選中態
  qsa('#seg-pos button').forEach((btn) => {
    btn.addEventListener('click', () => {
      qsa('#seg-pos button').forEach((b) => b.classList.toggle('on', b === btn));
      selectedRole = btn.dataset.role;
    });
  });

  byId('btn-start').addEventListener('click', startNewCareer);

  const save = loadGame();
  const resume = byId('btn-resume');
  if (!save) return;
  resume.hidden = false;
  resume.querySelector('small').textContent =
    `${save.state.name}｜${ROLE_NAMES[save.state.role]}｜${save.state.year} 年 · ${save.state.age} 歲`;
  resume.addEventListener('click', () => resumeCareer(save));
}

function startNewCareer() {
  const typed = byId('seed-input').value.trim();
  if (typed) seed = typed;

  const name = byId('name-input').value.trim().slice(0, 12) || 'Faker';

  // 種子寫回網址，分享出去的連結帶同一份天賦
  history.replaceState(null, '', `?seed=${encodeURIComponent(seed)}`);
  clearSave();

  // 種子只決定天賦；人生走另一條每次都重開的亂數流。
  // 同一個種子可以反覆玩，養出來的是同一個天分的人，過的卻是不同的人生。
  const state = createState({ name, role: selectedRole, seed, stage: MODE === 'alpha' ? 'AMATEUR' : 'PRO' });
  enterGame(state, new Rng(randomSeed()));
}

function resumeCareer(save) {
  seed = save.state.seed;
  history.replaceState(null, '', `?seed=${encodeURIComponent(seed)}`);
  // 續玩要接回同一段人生：人生流的種子與亂數進度都得還原
  const rng = new Rng(save.lifeSeed);
  rng.state = save.rngState;
  enterGame(save.state, rng);
}

/* ---------------- 遊戲畫面 ---------------- */

function enterGame(state, rng) {
  byId('start').hidden = true;
  byId('board').hidden = false;
  byId('act').hidden = false;

  initLog();
  initYearDir();
  initPanel(state);
  setPanelState(state);
  renderBoard(state, 0);

  // 重開：放棄當下生涯，清存檔後回到開場（換 URL 讓狀態乾淨重來）
  byId('btn-restart').addEventListener('click', () => {
    if (!window.confirm('確定放棄這段生涯，重新開始？')) return;
    clearSave();
    location.href = location.pathname;
  });

  // 行動列折疊：長選項清單時捲動看得到，不需要時收起來
  byId('act-toggle').addEventListener('click', () => {
    const act = byId('act');
    act.classList.toggle('collapsed');
    byId('act-toggle').textContent = act.classList.contains('collapsed') ? '⌃ 展開選項' : '⌄ 收合選項';
  });

  runCareer({ state, rng, seed, appVersion: APP_VERSION });
}

/* ---------------- 啟動 ---------------- */

// 開場畫面的位置按鈕由 ROLES 產生，避免 HTML 與資料兩邊各寫一份
function buildRoleButtons() {
  byId('seg-pos').innerHTML = ROLES
    .map((r, i) => `<button data-role="${r}"${i === 0 ? ' class="on"' : ''}>${ROLE_NAMES[r]}</button>`)
    .join('');
}

buildRoleButtons();
bindStartScreen();
