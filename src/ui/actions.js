/** 底部行動列：選項按鈕與屬性點分配介面。 */
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
 * 是否有正在等待玩家輸入的 beat（選項／加點）。
 *
 * S38 的屬性條〔+N〕入口要在空窗期直接開加點流程——`askChoice` 掛著時覆寫 #act
 * 會讓那個 promise 永遠不 resolve、引擎卡死，所以點擊前先問這裡。
 */
let awaitingInput = false;
export const isAwaitingInput = () => awaitingInput;

/**
 * 顯示一組選項，回傳玩家選中的 id。
 *
 * 設施制訓練（S16）之後，養成回合的「活動選單」也走這裡——每個選項的 `note` 已由
 * `engine/training.js` 的 `trainingMenu` 組好（活動名、影響屬性、體力消耗、吃當下體力
 * 算出的預期成功率），這裡只負責畫按鈕。
 * @returns {Promise<string>}
 */
export function askChoice({ title, options }) {
  awaitingInput = true;
  return new Promise((resolve) => {
    const act = actRoot();
    act.classList.remove('collapsed');
    clear(act);
    if (title) act.appendChild(el('div', { class: 'act-title', text: title }));

    for (const opt of options) {
      const btn = el('button', {
        class: 'btn',
        onclick: () => { clear(act); awaitingInput = false; resolve(opt.id); },
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
 * 屬性點分配（國際賽／事件卡發下來的 `pendingPoints`）。
 *
 * 設施制訓練（S16）之後，訓練不再擲骰加點——訓練活動的屬性成長由權重自動決定，
 * 骰子介面整段退場。這裡只剩「能力點」一種模式：每次 1 點，投六大屬性。
 * 投的是六大屬性——技能是導出值，玩家碰不到，所以這排永遠只有六列。
 *
 * @param {object} state
 * @param {{points:number, title:string}} spec
 * @param {() => void} onChange 每次加點後通知外層更新 board / 面板
 */
export function askAllocation(state, spec, onChange) {
  awaitingInput = true;
  return new Promise((resolve) => {
    const act = actRoot();
    act.classList.remove('collapsed');
    clear(act);

    let pool = spec.points || 0;
    const history = [];

    act.appendChild(el('div', { class: 'act-title', text: spec.title }));
    const top = el('div', { class: 'alloc-top' });
    const rows = el('div', { class: 'alloc-rows' });
    const bottom = el('div', { class: 'alloc-bottom' });
    act.append(top, rows, bottom);

    const cap = attrCap(state);
    const keys = attrKeys(state);

    function lastIdxFor(key) {
      for (let i = history.length - 1; i >= 0; i -= 1) if (history[i].key === key) return i;
      return -1;
    }

    function undoEntry(idx) {
      const [entry] = history.splice(idx, 1);
      state.attr[entry.key] -= entry.gain;
      state.carry[entry.key] = entry.carryBefore;
      pool += 1;
      renderTop(); renderRows(); renderBottom(); onChange();
    }

    function addPoint(key) {
      const carryBefore = state.carry[key] || 0;
      const gain = investAttr(state, key, 1);
      history.push({ key, gain, carryBefore });
      pool -= 1;
      renderTop();
      renderRows({ key, gain });
      renderBottom();
      onChange();
    }

    function renderTop() {
      clear(top);
      top.appendChild(el('div', { class: 'pool', html: `剩餘屬性點：<b>${pool}</b>` }));
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

        const canAdd = !maxed && pool > 0;
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
      if (pool === 0 || allCapped) {
        bottom.appendChild(el('button', {
          class: 'btn main',
          text: pool > 0 && allCapped ? '屬性已達上限，捨棄剩餘 ▸' : '確認 ▸',
          onclick: () => { clear(act); awaitingInput = false; resolve(); },
        }));
      }
    }

    renderTop(); renderRows(); renderBottom();
    onChange();
    scrollToBottom();
  });
}
