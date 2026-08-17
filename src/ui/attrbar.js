/**
 * 常駐屬性條（§22.1／§22.5，S38）。
 *
 * 六格「現值／潛力／蓄力」，三欄 × 兩列（順序照 `data/attributes.js` 的 ATTRS
 * 權威順序），緊貼行動列上方——兩者同屬拇指操作區，中間不得插入其他區塊。
 *
 * 為什麼常駐：屬性只在加點那幾秒出現的話，決策時讀不到成長餘裕（§7.1 天花板係數）。
 * 蓄力是成長的「貨幣」（§7.1 未滿一點的累積），看不到就算不出「再幾點可升」——
 * 違反 §0.5 防農檢驗。所以每格三個讀數：現值、潛力（刻度線）、蓄力（第二刻度）。
 *
 * `.abrow.mini` 一律掛 `.static`：這是唯讀回饋，不是可按的控制項
 * （DESIGN.md 原則 6：玩家碰得到的與碰不到的要看得出差別）。
 *
 * ⚠ 潛力與蓄力**分兩個 span 各佔一行**（v4.6.9）：擠成一行「潛100 ·蓄1.4」在 390px
 * 的三欄格裡要吃掉 65px，進度條軌道會被壓成 0——最需要看的那根條子直接消失。
 * 蓄力那行永遠留位（沒蓄力時是空字串），格高才不會隨蓄力有無跳動。
 *
 * 〔+N〕是有可分配點（`state.pendingPoints`，國際賽／事件卡發下來的）時的入口。
 * ⚠ 點擊必須避開 beat 協定的等待期：`askChoice` 掛著時覆寫 #act 會讓那個 promise
 * 永遠不 resolve、引擎卡死。所以等待輸入時點按無效；引擎自己會在下一個養成回合
 * 自動把點數花掉（`phases/month.js` 的 alloc beat），入口是空窗期的快捷，不是唯一出口。
 */
import { ATTR_ABBR, ATTR_CAP, ATTR_NAMES, ATTRS, POTENTIAL_BANDS } from '../data/attributes.js';
import { growthThreshold } from '../engine/attributes.js';
import { isAwaitingInput, askAllocation } from './actions.js';
import { byId, el } from './dom.js';

/** `state.potential` 缺鍵時的保底，與 `engine/attributes.js` 同一個值 */
const DEFAULT_POTENTIAL = Math.round((POTENTIAL_BANDS[3][0] + POTENTIAL_BANDS[3][1]) / 2);

let highlighted = new Set();
let lastState = null;

/**
 * 高亮指定屬性格（S39 訓練選項連動用）。傳空陣列／null 清除。
 * 簽章：`highlightAttrs(keys: string[])`，keys 為屬性鍵（'vit'／'agi'／…）。
 */
export function highlightAttrs(keys) {
  highlighted = new Set(keys || []);
  for (const cell of byId('attrbar').querySelectorAll('.abrow')) {
    cell.classList.toggle('hl', highlighted.has(cell.dataset.attr));
  }
}

export function renderAttrBar(state) {
  lastState = state;
  const bar = byId('attrbar');
  bar.hidden = false;

  // 〔+N〕入口：只在有可分配點時出現；置於格子上方獨立一列，不遮任何格子
  let head = bar.querySelector('.attr-head');
  if (state.pendingPoints > 0) {
    if (!head) {
      head = el('div', { class: 'attr-head' });
      const btn = el('button', { class: 'attr-plus', type: 'button' });
      // 讀 lastState 不讀建立當下的 state，確保整段生涯都拿到活的狀態物件
      btn.addEventListener('click', () => spendPending(lastState));
      head.appendChild(btn);
      bar.prepend(head);
    }
    head.querySelector('.attr-plus').textContent = `〔+${state.pendingPoints}〕`;
    head.hidden = false;
  } else if (head) {
    head.hidden = true;
  }

  const grid = bar.querySelector('.attr-grid') || bar.appendChild(el('div', { class: 'attr-grid' }));
  grid.innerHTML = ATTRS.map((key) => {
    const value = state.attr[key];
    const potential = state.potential?.[key] ?? DEFAULT_POTENTIAL;
    const carry = state.carry?.[key] || 0;
    // 蓄力刻度：往「下一點成本」走了多少。滿一點就兌現，所以分母是當下一點價格
    const cost = growthThreshold(state, key).cost;
    const carryPct = carry > 0 && cost > 0 ? Math.min(100, (carry / cost) * 100) : 0;
    const cls = `abrow mini static${highlighted.has(key) ? ' hl' : ''}`;
    return `<div class="${cls}" data-attr="${key}" title="${ATTR_NAMES[key]}（${ATTR_ABBR[key]}）">
      <div class="nm">${ATTR_NAMES[key]}</div>
      <div class="bar" style="--fill:${Math.min(100, (value / ATTR_CAP) * 100)}%;--pot:${Math.min(100, (potential / ATTR_CAP) * 100)}%;--carry:${carryPct}%">
        <i></i><em></em>${carry > 0 ? '<u></u>' : ''}
      </div>
      <div class="val"><b>${value}</b><span class="cost">潛${potential}</span><span class="carry">${carry ? `蓄${num(carry)}` : ''}</span></div>
    </div>`;
  }).join('');
}

/** 帶小數的成本只在有小數時才顯示小數點（與 ui/actions.js 同一個理由） */
const num = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** 空窗期快捷花點：走完現行分配流程後把 pendingPoints 歸零，避免 month 結算時重複發 */
function spendPending(state) {
  if (isAwaitingInput() || state.pendingPoints <= 0) return;
  const points = state.pendingPoints;
  state.pendingPoints = 0;
  askAllocation(state, { points, title: `能力點分配（${points} 點）` }, () => {
    renderAttrBar(lastState);
  });
}
