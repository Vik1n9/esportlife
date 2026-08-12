/**
 * 頂端狀態列。
 *
 * 只負責把 state 的當下值填進 #board 那幾個格子——標籤與骨架住在 index.html，
 * 這裡不產生任何節點結構。OVR 格子要額外反映「版本落差」：負落差是該年改版
 * 懲罰，格子標紅並把數字放進 title 讓滑鼠看得到原因。
 */
import { ROLE_NAMES } from '../data/skills.js';
import { ovr, patchPenalty } from '../engine/attributes.js';
import { stageLabel } from '../engine/game.js';
import { formatMoney } from '../engine/market.js';
import { byId, escapeHtml, qsa } from './dom.js';

export function renderBoard(state, phaseIndex) {
  // 名字與位置：位置是契約的一部分，用 ROLE_NAMES 查，不寫死在這裡
  byId('bd-name').innerHTML = `${escapeHtml(state.name)} <small>${ROLE_NAMES[state.role]}</small>`;

  // 隊伍列：還在俱樂部就顯示隊名，業餘／青訓沒有隊名，回退到階段名
  byId('bd-team').textContent = state.team || stageLabel(state);

  byId('bd-age').textContent = state.age;
  byId('bd-year').textContent = state.year;

  fillOvrCell(state);

  // 生涯薪資直接顯示格式化金額；舊寫法會把「1.0千萬」硬砍成「1.0千」
  byId('bd-sal').textContent = formatMoney(state.salary);

  if (typeof phaseIndex === 'number') {
    qsa('#lamps .lamp').forEach((lamp, i) => lamp.classList.toggle('on', i === phaseIndex));
  }
}

function fillOvrCell(state) {
  const penalty = patchPenalty(state);
  const cell = byId('bd-ovr');
  cell.textContent = ovr(state);
  cell.classList.toggle('penalised', penalty < 0);
  cell.title = penalty < 0 ? `版本落差 ${penalty}` : '';
}
