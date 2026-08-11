/** 底部行動列：選項按鈕與訓練點分配介面。 */
import { ABILITY_NAMES, ABILITY_CAP } from '../data/abilities.js';
import { abilityCap, abilityKeys, investAbility, nextStepCost } from '../engine/abilities.js';
import { byId, clear, el, scrollToBottom } from './dom.js';

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
        class: `btn${opt.main ? ' main' : ''}${opt.warn ? ' warn' : ''}`,
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
 * 兩種模式：骰子（每顆骰依序投入）與能力點（每次 1 點）。
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
    let index = 0;
    let pool = spec.points || 0;
    const history = [];

    act.appendChild(el('div', { class: 'act-title', text: spec.title }));
    const top = el('div', { class: 'alloc-top' });
    const rows = el('div', { class: 'alloc-rows' });
    const bottom = el('div', { class: 'alloc-bottom' });
    act.append(top, rows, bottom);

    const remaining = () => (isDice ? dice.length - index : pool);
    const cap = abilityCap(state);
    const keys = abilityKeys(state);

    function renderTop() {
      clear(top);
      if (isDice) {
        const tray = el('div', { class: 'dice' });
        dice.forEach((v, i) => tray.appendChild(el('div', {
          class: `die${i < index ? ' used' : ''}${i === index ? ' active' : ''}${v === 6 ? ' six' : ''}`,
          text: String(v),
        })));
        top.appendChild(tray);
      } else {
        top.appendChild(el('div', { class: 'pool', html: `剩餘能力點：<b>${pool}</b>` }));
      }
    }

    function renderRows(flash) {
      clear(rows);
      for (const key of keys) {
        const value = state.ability[key];
        const potential = state.potential[key] ?? 62;
        const maxed = value >= cap;
        const carry = state.carry[key] || 0;
        const cost = nextStepCost(state, key);

        const row = el('div', { class: `abrow${maxed ? ' capped' : ''}` });
        row.innerHTML = `
          <div class="nm">${ABILITY_NAMES[key]}</div>
          <div class="bar" style="--fill:${Math.min(100, (value / ABILITY_CAP) * 100)}%;--pot:${Math.min(100, (potential / ABILITY_CAP) * 100)}%">
            <i></i><em></em>
          </div>
          <div class="val">
            <b>${value}</b>
            <span class="cost">${maxed ? '滿' : `↑${cost}${carry ? ` ·蓄${carry}` : ''}`}</span>
          </div>`;
        if (flash && flash.key === key) {
          row.classList.add('flash');
          row.querySelector('.cost').innerHTML = flash.gain > 0
            ? `<span class="up">+${flash.gain}</span>`
            : '<span class="muted">蓄力中</span>';
        }

        if (!maxed && remaining() > 0) {
          row.addEventListener('click', () => {
            const amount = isDice ? dice[index] : 1;
            const carryBefore = state.carry[key] || 0;
            const gain = investAbility(state, key, amount);
            history.push({ key, gain, carryBefore });
            if (isDice) index += 1; else pool -= 1;
            renderTop();
            renderRows({ key, gain });
            renderBottom();
            onChange();
          });
        }
        rows.appendChild(row);
      }
    }

    function renderBottom() {
      clear(bottom);
      const undo = el('button', {
        class: 'btn ghost',
        text: '↩ 復原',
        onclick: () => {
          const last = history.pop();
          if (!last) return;
          state.ability[last.key] -= last.gain;
          state.carry[last.key] = last.carryBefore;
          if (isDice) index -= 1; else pool += 1;
          renderTop(); renderRows(); renderBottom(); onChange();
        },
      });
      undo.disabled = !history.length;
      bottom.appendChild(undo);

      const allCapped = keys.every((k) => state.ability[k] >= cap);
      if (remaining() === 0 || allCapped) {
        bottom.appendChild(el('button', {
          class: 'btn main',
          text: remaining() > 0 && allCapped ? '能力已達上限，捨棄剩餘 ▸' : '確認 ▸',
          onclick: () => { clear(act); resolve(); },
        }));
      }
    }

    renderTop(); renderRows(); renderBottom();
    onChange();
    scrollToBottom();
  });
}
