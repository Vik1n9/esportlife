/** 底部行動列：選項按鈕與訓練點分配介面。 */
import { ATTR_ABBR, ATTR_CAP, ATTR_NAMES, POTENTIAL_BANDS } from '../data/attributes.js';
import { attrCap, attrKeys, growthThreshold, investAttr, needForNextGain } from '../engine/attributes.js';
import { byId, clear, el, scrollToBottom } from './dom.js';

/** `state.potential` 缺鍵時的保底，與 `engine/attributes.js` 同一個值 */
const DEFAULT_POTENTIAL = Math.round((POTENTIAL_BANDS[3][0] + POTENTIAL_BANDS[3][1]) / 2);

/** 帶小數的成本只在有小數時才顯示小數點，避免整數位價位變成「↑1.0」 */
const num = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function actRoot() { return byId('act'); }

export function clearActions() { clear(actRoot()); }

/**
 * 顯示一組選項，回傳玩家選中的 id。
 * @returns {Promise<string>}
 */
export function askChoice({ title, options }) {
  return new Promise((resolve) => {
    const act = actRoot();
    act.classList.remove('collapsed');
    clear(act);
    if (title) act.appendChild(el('div', { class: 'act-title', text: title }));

    for (const opt of options) {
      const btn = el('button', {
        class: 'btn',
        onclick: () => { clear(act); resolve(opt.id); },
      });
      btn.appendChild(el('span', { text: opt.label }));
      if (opt.note) btn.appendChild(el('small', { text: opt.note }));
      act.appendChild(btn);
    }
    byId('act-toggle').style.display = '';
    scrollToBottom();
  });
}

/**
 * 訓練點分配。
 *
 * 兩種模式：骰子（每顆骰依序投入）與屬性點（每次 1 點）。
 * 投的是六大屬性——技能是導出值，玩家碰不到，所以這排永遠只有六列。
 * 修好舊版兩個問題：每次點擊後整排重繪會把「+N」提示洗掉，
 * 以及沒有任何地方告訴玩家「下一點要花幾點」。
 *
 * @param {object} state
 * @param {{mode:'dice'|'points', dice?:number[], points?:number, title:string}} spec
 * @param {() => void} onChange 每次加點後通知外層更新 board / 面板
 */
export function askAllocation(state, spec, onChange) {
  return new Promise((resolve) => {
    const act = actRoot();
    act.classList.remove('collapsed');
    clear(act);

    const isDice = spec.mode === 'dice';
    const dice = spec.dice || [];
    let pool = spec.points || 0;
    const used = new Set();
    const history = [];

    act.appendChild(el('div', { class: 'act-title', text: spec.title }));
    const top = el('div', { class: 'alloc-top' });
    const rows = el('div', { class: 'alloc-rows' });
    const bottom = el('div', { class: 'alloc-bottom' });
    act.append(top, rows, bottom);

    const remaining = () => (isDice ? dice.length - used.size : pool);
    const cap = attrCap(state);
    const keys = attrKeys(state);

    const nextDie = () => {
      for (let i = 0; i < dice.length; i += 1) if (!used.has(i)) return i;
      return dice.length;
    };

    function lastIdxFor(key) {
      for (let i = history.length - 1; i >= 0; i -= 1) if (history[i].key === key) return i;
      return -1;
    }

    function undoEntry(idx) {
      const [entry] = history.splice(idx, 1);
      state.attr[entry.key] -= entry.gain;
      state.carry[entry.key] = entry.carryBefore;
      if (isDice) used.delete(entry.dieIndex); else pool += 1;
      renderTop(); renderRows(); renderBottom(); onChange();
    }

    function addPoint(key) {
      const dieIndex = isDice ? nextDie() : -1;
      const amount = isDice ? dice[dieIndex] : 1;
      const carryBefore = state.carry[key] || 0;
      const gain = investAttr(state, key, amount);
      history.push({ key, gain, carryBefore, dieIndex });
      if (isDice) used.add(dieIndex); else pool -= 1;
      renderTop();
      renderRows({ key, gain });
      renderBottom();
      onChange();
    }

    function renderTop() {
      clear(top);
      if (isDice) {
        const tray = el('div', { class: 'dice' });
        dice.forEach((v, i) => tray.appendChild(el('div', {
          class: `die${used.has(i) ? ' used' : ''}${i === nextDie() ? ' active' : ''}${v === 6 ? ' six' : ''}`,
          text: String(v),
        })));
        top.appendChild(tray);
      } else {
        top.appendChild(el('div', { class: 'pool', html: `剩餘屬性點：<b>${pool}</b>` }));
      }
    }

    function renderRows(flash) {
      clear(rows);
      for (const key of keys) {
        const value = state.attr[key];
        const potential = state.potential[key] ?? DEFAULT_POTENTIAL;
        const maxed = value >= cap;
        const carry = state.carry[key] || 0;
        const thr = growthThreshold(state, key);
        const need = needForNextGain(state, key);

        // 潛力衰減是連續的，成本不再是整數，所以顯示一律留一位小數
        const costLine = maxed ? '滿'
          : `↑${num(thr.cost)}${thr.over ? '（已過天花板）' : ''}${carry ? ` ·蓄${num(carry)}` : ''}`;
        const needLine = maxed ? ''
          : (need > 0 ? `再 ${num(need)} 點可升` : '蓄力已足，可直接升');

        const row = el('div', { class: `abrow${maxed ? ' capped' : ''}` });
        row.innerHTML = `
          <div class="nm" title="${ATTR_ABBR[key]}">${ATTR_NAMES[key]}</div>
          <div class="bar" style="--fill:${Math.min(100, (value / ATTR_CAP) * 100)}%;--pot:${Math.min(100, (potential / ATTR_CAP) * 100)}%">
            <i></i><em></em>
          </div>
          <div class="val">
            <b>${value}</b>
            <span class="cost">${costLine}</span>
            <span class="need">${needLine}</span>
          </div>`;
        if (flash && flash.key === key) {
          row.classList.add('flash');
          row.querySelector('.cost').innerHTML = flash.gain > 0
            ? `<span class="up">+${flash.gain}</span>`
            : '<span class="muted">蓄力中</span>';
        }

        const minus = el('button', {
          class: 'step minus', type: 'button', text: '−',
          'aria-label': `${ATTR_NAMES[key]} 減點`,
        });
        const plus = el('button', {
          class: 'step plus', type: 'button', text: '+',
          'aria-label': `${ATTR_NAMES[key]} 加點`,
        });

        minus.disabled = !history.some((h) => h.key === key);
        minus.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = lastIdxFor(key);
          if (idx >= 0) undoEntry(idx);
        });

        const canAdd = !maxed && remaining() > 0;
        plus.disabled = !canAdd;
        plus.addEventListener('click', (e) => {
          e.stopPropagation();
          addPoint(key);
        });

        row.addEventListener('click', () => { if (canAdd) addPoint(key); });
        row.append(minus, plus);
        rows.appendChild(row);
      }
    }

    function renderBottom() {
      clear(bottom);
      const undo = el('button', {
        class: 'btn ghost',
        text: '↩ 復原上一點',
        onclick: () => { if (history.length) undoEntry(history.length - 1); },
      });
      undo.disabled = !history.length;
      bottom.appendChild(undo);

      const allCapped = keys.every((k) => state.attr[k] >= cap);
      if (remaining() === 0 || allCapped) {
        bottom.appendChild(el('button', {
          class: 'btn main',
          text: remaining() > 0 && allCapped ? '屬性已達上限，捨棄剩餘 ▸' : '確認 ▸',
          onclick: () => { clear(act); resolve(); },
        }));
      }
    }

    renderTop(); renderRows(); renderBottom();
    onChange();
    scrollToBottom();
  });
}
