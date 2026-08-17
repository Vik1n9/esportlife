/** 底部行動列：選項按鈕與屬性點分配介面。 */
import { ATTR_ABBR, ATTR_CAP, ATTR_NAMES, POTENTIAL_BANDS } from '../data/attributes.js';
import { attrCap, attrKeys, growthThreshold, investAttr, needForNextGain } from '../engine/attributes.js';
import { byId, clear, el, scrollToBottom } from './dom.js';
import { highlightAttrs } from './attrbar.js';
import { lastCard } from './log.js';

/** `state.potential` 缺鍵時的保底，與 `engine/attributes.js` 同一個值 */
const DEFAULT_POTENTIAL = Math.round((POTENTIAL_BANDS[3][0] + POTENTIAL_BANDS[3][1]) / 2);

/** 帶小數的成本只在有小數時才顯示小數點，避免整數位價位變成「↑1.0」 */
const num = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function actRoot() { return byId('act'); }

export function clearActions() {
  clear(actRoot());
  setEventFocus(false);
}

/**
 * 事件聚焦（手機）：卡牌問答期間把狀態帶下半（賽區隊伍列／生涯任務列／月度燈）收掉，
 * 把最大幅度的高度讓給事件文本區。體力條與第一列（年月／☰／↺）不收——體力必須
 * 常駐可見（§6／§22.5），第一列是選手資料與重開的唯一入口。
 *
 * 收哪幾列由 CSS 決定（只在 <720px 生效），這裡只負責掛旗標。
 */
function setEventFocus(on) {
  document.body.classList.toggle('event-focus', on);
}

/**
 * 收合／展開拇指區。屬性條與決策槽**同進退**：兩者同屬拇指操作區（§22.1），
 * 只收決策槽的話讓出來的高度不到一半，收了等於白收。
 *
 * ⚠ 屬性條走 class 不走 `hidden` 屬性——`ui/attrbar.js` 的 `renderAttrBar()` 每次
 * sync 都寫 `bar.hidden=false`，用 `hidden` 表示收合會被下一個 beat 衝掉。
 *
 * 這是唯一入口：`main.js` 的切換按鈕與下方 `expandAct()` 都呼叫它，按鈕字樣才不會
 * 與實際狀態脫節（按鈕寫著「展開選項」但槽已經是開的）。
 */
export function setSlotCollapsed(collapsed) {
  actRoot().classList.toggle('collapsed', collapsed);
  byId('attrbar')?.classList.toggle('collapsed', collapsed);
  const toggle = byId('act-toggle');
  if (toggle) toggle.textContent = collapsed ? '⌃ 展開選項' : '⌄ 收合選項';
}

/**
 * 新一輪選項一律把槽展開。固定框架（S43）之後玩家會常用「收合選項」把文本區讓大
 * 來讀長文，收著的槽等於答不了題。
 */
function expandAct() { setSlotCollapsed(false); }

/**
 * 是否有正在等待玩家輸入的 beat（選項／加點）。
 *
 * S38 的屬性條〔+N〕入口要在空窗期直接開加點流程——`askChoice` 掛著時覆寫 #act
 * 會讓那個 promise 永遠不 resolve、引擎卡死，所以點擊前先問這裡。
 */
let awaitingInput = false;
export const isAwaitingInput = () => awaitingInput;

/**
 * 顯示一組選項，回傳玩家選中的 id。所有 choice 都走這裡——決策槽是唯一的操作面
 * （§22.2，S43）。
 *
 * 設施制訓練（S16）之後，養成回合的「活動選單」也走這裡；S39 起 `trainingMenu`
 * 除 `note` 外另帶結構化欄位（體力增減／影響屬性鍵／預期成功率，§22.2.1 三段並列），
 * 選項帶齊三個欄位就畫成三欄可掃讀的雙欄格，hover／focus 連動上方屬性條高亮。
 * @returns {Promise<string>}
 */
export function askChoice(beat) { return promptOptions(beat, null); }

/**
 * 卡牌問答（§22.2，S43 改單一決策槽）：`slot:'inline'` 的選項也出在決策槽，差別
 * 只在**這張卡是提問者**——等待時卡片掛 `.awaiting` 提示條指向下方，選定後就地
 * 留下定格文字「你選了 X」成為敘事的一部分。
 *
 * S39–S42 是把按鈕畫在卡片下緣。改掉的理由：那時決策槽只是 sticky（實際沒固定），
 * 兩處都會被文本推走，所以「選項貼著文本」還算有意義；S43 把決策槽真的釘死在框底
 * 之後，操作點只該有一個——選項散在兩處反而讓玩家每張卡都要重找按鈕在哪
 * （§0.5 防農檢驗、§22.2.1 位置固定同一條理由）。
 * @returns {Promise<string>}
 */
export function askInline(beat) { return promptOptions(beat, lastCard()); }

/**
 * 決策槽本體。`anchor` 是發問的那張卡（沒有就是規劃型決策，如訓練菜單）。
 */
function promptOptions({ title, options }, anchor) {
  awaitingInput = true;
  return new Promise((resolve) => {
    const act = actRoot();
    expandAct();
    clear(act);
    if (title) act.appendChild(el('div', { class: 'act-title', text: title }));

    // 提問的卡片與決策槽建立視覺連線：卡片標記等待中，並在卡尾指向下方。
    // 有 anchor＝卡牌問答（事件卡／扮演卡），這時進入事件聚焦；規劃型決策（訓練菜單、
    // 備賽戰術）不聚焦——那些回合的月度燈與賽區資訊正是決策要讀的東西
    if (anchor) {
      anchor.classList.add('awaiting');
      anchor.appendChild(el('div', { class: 'card-ask', text: title || '你的選擇' }));
    }
    setEventFocus(!!anchor);

    const pick = (opt) => {
      highlightAttrs(null);
      clear(act);
      setEventFocus(false);
      awaitingInput = false;
      if (anchor) {
        anchor.classList.remove('awaiting');
        anchor.querySelector('.card-ask')?.remove();
        anchor.appendChild(el('div', { class: 'inline-picked', text: `你選了 ${opt.label}` }));
      }
      resolve(opt.id);
      scrollToBottom();
    };

    const structured = options.every((o) => 'staminaDelta' in o && 'successRate' in o);
    const list = structured ? el('div', { class: 'act-grid' }) : act;
    if (structured) act.appendChild(list);

    for (const opt of options) {
      const btn = structured ? trainBtn(opt) : plainBtn(opt);
      btn.addEventListener('click', () => pick(opt));
      list.appendChild(btn);
    }
    byId('act-toggle').style.display = '';
    scrollToBottom();
  });
}

/** 一般選項：標籤＋單行註記 */
function plainBtn(opt) {
  const btn = el('button', { class: 'btn' });
  btn.appendChild(el('span', { text: opt.label }));
  if (opt.note) btn.appendChild(el('small', { text: opt.note }));
  return btn;
}

/**
 * 訓練選項：三段資訊並列（§22.2.1）＋屬性條高亮連動。
 *
 * ⚠ 畫面上**只有預期成功率**——失敗率與大成功／大失敗細分機率不得出現（§5.4）。
 * 高亮讀的是結構化欄位 `attrs`（屬性鍵），不是去解析顯示字串。
 */
function trainBtn(opt) {
  const btn = el('button', { class: 'btn train' });
  btn.appendChild(el('span', { class: 't-name', text: opt.label }));

  const meta = el('span', { class: 't-meta' });
  const sign = opt.staminaDelta >= 0 ? '+' : '−';
  meta.appendChild(el('i', { class: opt.staminaDelta >= 0 ? 'up' : '', text: `體力 ${sign}${Math.abs(opt.staminaDelta)}` }));
  if (opt.effectText) meta.appendChild(el('i', { class: 't-eff', text: opt.effectText }));
  if (opt.successRate != null) meta.appendChild(el('i', { class: 't-rate', text: `成功率 ${opt.successRate}%` }));
  btn.appendChild(meta);

  if (opt.attrs?.length) {
    const light = () => highlightAttrs(opt.attrs);
    const dim = () => highlightAttrs(null);
    btn.addEventListener('mouseenter', light);
    btn.addEventListener('mouseleave', dim);
    btn.addEventListener('focus', light);
    btn.addEventListener('blur', dim);
  }
  return btn;
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
    expandAct();
    setEventFocus(false);
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
