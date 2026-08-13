/**
 * 頂端狀態列。
 *
 * 只負責把 state 的當下值填進 #board 那幾個格子——標籤與骨架住在 index.html，
 * 這裡不產生任何節點結構。
 *
 * 第三格原本是「綜合 OVR」。V4 §10.1 把單一總評收成內部值（教練評價）之後，那個
 * 位置改放**本位置第一核心技能**——玩家看得到的一直都該是技能，而不是一個可以拿來
 * 最佳化的總分。版本落差還是要有出口，掛在同一格的標籤上（標紅＋title 說明原因），
 * 因為它扣的是比賽戰力與市場估價，不是技能本身。
 *
 * 底下那排燈原本是「訓練／賽季／休賽」三段。V4 §3.2 把回合單位換成月之後，那三段不
 * 再是玩家感覺得到的單位——他感覺得到的是「現在幾月、離下一個賽事還有幾個月」。
 * 所以改成 12 個月的進度條，燈亮的是當下的月份。
 */
import { ROLE_NAMES, SKILL_NAMES } from '../data/skills.js';
import { patchPenalty, roleSkills, skillValue } from '../engine/attributes.js';
import { stageLabel } from '../engine/game.js';
import { formatMoney } from '../engine/market.js';
import { byId, escapeHtml, qsa } from './dom.js';

export function renderBoard(state, month) {
  // 名字與位置：位置是契約的一部分，用 ROLE_NAMES 查，不寫死在這裡
  byId('bd-name').innerHTML = `${escapeHtml(state.name)} <small>${ROLE_NAMES[state.role]}</small>`;

  // 隊伍列：還在俱樂部就顯示隊名，業餘／青訓沒有隊名，回退到階段名
  byId('bd-team').textContent = state.team || stageLabel(state);

  byId('bd-age').textContent = state.age;
  byId('bd-year').textContent = state.year;

  fillCoreSkillCell(state);

  // 生涯薪資直接顯示格式化金額；舊寫法會把「1.0千萬」硬砍成「1.0千」
  byId('bd-sal').textContent = formatMoney(state.salary);

  const now = typeof month === 'number' ? month : (state.month || 1);
  qsa('#lamps .lamp').forEach((lamp, i) => {
    lamp.classList.toggle('on', i + 1 === now);
    // 已經走過的月份留一個淡標記：一年剩幾個回合是玩家排訓練時真的會算的東西
    lamp.classList.toggle('done', i + 1 < now);
  });
}

function fillCoreSkillCell(state) {
  const key = roleSkills(state)[0];
  const penalty = patchPenalty(state);
  byId('bd-core').textContent = key ? skillValue(state, key) : 0;

  const label = byId('bd-core-name');
  label.textContent = key ? SKILL_NAMES[key] : '核心技能';
  const cell = label.parentElement;
  cell.classList.toggle('penalised', penalty < 0);
  cell.title = penalty < 0 ? `版本落差 ${penalty}：比賽戰力與市場估價都會被扣，技能值本身不受影響` : '';
}
