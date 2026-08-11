/** 頂端狀態列。 */
import { ROLE_NAMES } from '../data/skills.js';
import { ovr, patchPenalty } from '../engine/attributes.js';
import { stageLabel } from '../engine/game.js';
import { formatMoney } from '../engine/market.js';
import { byId, escapeHtml, qsa } from './dom.js';

export function renderBoard(state, phaseIndex) {
  byId('bd-name').innerHTML = `${escapeHtml(state.name)} <small>${ROLE_NAMES[state.role]}</small>`;
  byId('bd-team').textContent = state.team || stageLabel(state);
  byId('bd-age').textContent = state.age;
  byId('bd-year').textContent = state.year;

  const penalty = patchPenalty(state);
  const ovrCell = byId('bd-ovr');
  ovrCell.textContent = ovr(state);
  ovrCell.classList.toggle('penalised', penalty < 0);
  ovrCell.title = penalty < 0 ? `版本落差 ${penalty}` : '';

  // 直接顯示格式化後的金額；舊寫法會把「1.0千萬」硬砍成「1.0千」
  byId('bd-sal').textContent = formatMoney(state.salary);

  if (typeof phaseIndex === 'number') {
    qsa('#lamps .lamp').forEach((lamp, i) => lamp.classList.toggle('on', i === phaseIndex));
  }
}
