/**
 * 選手資訊面板（設計文件寫了但舊版沒做的部分）。
 *
 * 舊版只有在「訓練期加點」那幾秒能看到能力值，英雄池、專精、版本落差、
 * 隊友與教練、合約狀態全程都藏在 state 裡沒有出口。這裡補上一個隨時可開的面板。
 */
import { ATTR_ABBR, ATTR_CAP, ATTR_DESC, ATTR_NAMES, ATTRS, POTENTIAL_BANDS } from '../data/attributes.js';
import { ROLE_NAMES, SKILL_NAMES } from '../data/skills.js';

/** `state.potential` 缺鍵時的保底，與 `engine/attributes.js` 同一個值 */
const DEFAULT_POTENTIAL = Math.round((POTENTIAL_BANDS[3][0] + POTENTIAL_BANDS[3][1]) / 2);
import { HEROES_BY_ROLE } from '../data/heroes.js';
import { LEAGUES } from '../data/leagues.js';
import { EPIC_TRAITS, LEGENDARY_TRAITS } from '../data/epics.js';
import { BASE_TRAITS, RARE_TRAITS } from '../data/traits.js';
import { effectiveOvr, ovr, patchPenalty, retirementAge, roleSkills, skillValue } from '../engine/attributes.js';
import { stageLabel } from '../engine/game.js';
import { formatMoney } from '../engine/market.js';
import { mentalSummary } from '../engine/mental.js';
import { coachBonus, matesAverage } from '../kernel/strength.js';
import { lookupTrait } from '../kernel/modifiers.js';
import { byId, escapeHtml } from './dom.js';

let root = null;
let currentState = null;

export function initPanel(state) {
  currentState = state;
  root = byId('panel');
  byId('btn-panel').addEventListener('click', () => togglePanel());
  byId('panel-close').addEventListener('click', () => togglePanel(false));
  root.addEventListener('click', (e) => { if (e.target === root) togglePanel(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') togglePanel(false); });
}

export function setPanelState(state) { currentState = state; }

export function togglePanel(force) {
  const open = force ?? !root.classList.contains('open');
  root.classList.toggle('open', open);
  if (open) renderPanel();
}

export function refreshPanel() {
  if (root && root.classList.contains('open')) renderPanel();
}

function attrRows(state) {
  return ATTRS.map((key) => {
    const value = state.attr[key];
    const potential = state.potential[key] ?? DEFAULT_POTENTIAL;
    const carry = state.carry[key] || 0;
    return `<details class="attr-item">
      <summary>
        <span class="trait-arrow">▸</span><div class="abrow static">
          <div class="nm">${ATTR_NAMES[key]}</div>
          <div class="bar" style="--fill:${Math.min(100, (value / ATTR_CAP) * 100)}%;--pot:${Math.min(100, (potential / ATTR_CAP) * 100)}%"><i></i><em></em></div>
          <div class="val"><b>${value}</b><span class="cost">${ATTR_ABBR[key]} ·上限 ${potential}${carry ? ` ·蓄${carry}` : ''}</span></div>
        </div>
      </summary>
      <div class="trait-desc">${escapeHtml(ATTR_DESC[key])}</div>
    </details>`;
  }).join('');
}

/**
 * 技能：只列出這個位置有 OVR 權重的六項（V4 §8.2 的核心 4 ＋次要 2），而且全部唯讀。
 *
 * 技能不是另一排要管理的滑桿，是「你這六個屬性在你這條路上長成什麼樣」的回饋。
 * 玩家看得到自己的開團很強，但要更強只能回去投決斷與意識。
 */
function skillRows(state) {
  const keys = roleSkills(state);
  const top = keys.slice(0, 4);   // V4 §8.2：每路核心 4 項＋次要 2 項
  return keys.map((key) => {
    const value = skillValue(state, key);
    return `<div class="abrow static">
      <div class="nm">${SKILL_NAMES[key]}</div>
      <div class="bar" style="--fill:${Math.min(100, (value / ATTR_CAP) * 100)}%"><i></i></div>
      <div class="val"><b>${value}</b><span class="cost">${top.includes(key) ? '本位置核心' : ''}</span></div>
    </div>`;
  }).join('');
}

function heroRows(state) {
  const all = HEROES_BY_ROLE[state.role];
  return all.map((h) => {
    const owned = state.heroPool.includes(h);
    const mastery = state.mastery[h] || 0;
    return `<span class="hero${owned ? ' owned' : ''}">${h}${mastery ? `<b>${mastery}</b>` : ''}</span>`;
  }).join('');
}

/** 依名稱反查特質的說明（fusedAway 只留名稱，要從兩張表找回 desc） */
function traitDescByName(name) {
  for (const table of [BASE_TRAITS, RARE_TRAITS, EPIC_TRAITS, LEGENDARY_TRAITS]) {
    const t = Object.values(table).find((x) => x.name === name);
    if (t) return t.desc;
  }
  return '';
}

/** 個人特質：小箭頭可展開，顯示該特質的作用（不顯示獲取來源）。高階特質排前面。 */
function traitRows(state) {
  const rows = [];
  for (const tier of ['legendary', 'epic', 'rare', 'traits']) {
    const held = tier === 'traits' ? state.traits : state[tier] || {};
    for (const [key, isHeld] of Object.entries(held)) {
      if (!isHeld) continue;
      const t = lookupTrait(key);
      rows.push({ name: t.name, desc: t.desc, cls: tier === 'traits' ? '' : tier });
    }
  }
  for (const name of state.fusedAway) {
    rows.push({ name, desc: traitDescByName(name), cls: 'gone' });
  }
  return rows.map((t) => `<details class="trait-item ${t.cls}">
      <summary><span class="trait-arrow">▸</span>${escapeHtml(t.name)}</summary>
      <div class="trait-desc">${escapeHtml(t.desc)}</div>
    </details>`).join('');
}

function renderPanel() {
  const state = currentState;
  const body = byId('panel-body');
  const penalty = patchPenalty(state);
  const league = LEAGUES[state.league];

  const traitList = traitRows(state) || '<span class="muted">尚未覺醒任何隱藏素質</span>';

  const mates = state.mates.length
    ? state.mates.map((m) => `<span class="tag">${m.name} ${m.ovr}</span>`).join('')
    : '<span class="muted">尚無固定隊友</span>';

  body.innerHTML = `
    <section>
      <h5>選手</h5>
      <div class="kv">
        <div><span>ID</span><b>${escapeHtml(state.name)}</b></div>
        <div><span>位置</span><b>${ROLE_NAMES[state.role]}</b></div>
        <div><span>年齡</span><b>${state.age}（退役上限 ${retirementAge(state)}）</b></div>
        <div><span>所屬</span><b>${escapeHtml(state.team || '—')}</b></div>
        <div><span>層級</span><b>${stageLabel(state)}${league ? `（par ${league.par}）` : ''}</b></div>
        <div><span>合約</span><b>${state.contract ? `剩 ${state.contract.years} 年 ×${state.contract.mult.toFixed(2)}` : '無合約'}</b></div>
        <div><span>綜合 OVR</span><b>${ovr(state)}${penalty < 0 ? ` <span class="dn">${penalty}</span> → ${effectiveOvr(state)}` : ''}</b></div>
        <div><span>生涯薪資</span><b>${formatMoney(state.salary)}</b></div>
      </div>
    </section>

    <section>
      <h5>屬性</h5>
      ${attrRows(state)}
      <p class="muted small">▸ 點開查看各屬性在峽谷內的作用；刻度線＝潛力上限，超過後成長成本 ×3。</p>
    </section>

    <section>
      <h5>技能（${ROLE_NAMES[state.role]}）</h5>
      ${skillRows(state)}
      <p class="muted small">技能由六大屬性換算而來，不能直接加點；由上到下＝對本位置 OVR 的影響由重到輕。</p>
    </section>

    <section>
      <h5>英雄池與專精</h5>
      <div class="heroes">${heroRows(state)}</div>
      <p class="muted small">亮起＝可用於比賽；數字＝專精場次。池深每多 1 隻可抵銷 1 點版本落差。</p>
    </section>

    <section>
      <h5>版本</h5>
      <div class="kv">
        <div><span>目前版本</span><b>${state.patchTheme || '—'}</b></div>
        <div><span>經歷改版</span><b>${state.patchCount} 次</b></div>
        <div><span>版本落差</span><b class="${penalty < 0 ? 'dn' : 'up'}">${state.patchDebt}（OVR ${penalty || 0}）</b></div>
      </div>
    </section>

    <section>
      <h5>人物側寫</h5>
      <div class="kv">
        ${mentalSummary(state).map((m) => `<div><span>${m.name}</span><b>${m.tier}</b></div>`).join('')}
      </div>
    </section>

    <section>
      <h5>隊伍</h5>
      <div class="kv">
        <div><span>教練</span><b>${state.coach || '—'}（+${coachBonus(state).toFixed(1)}）</b></div>
        <div><span>隊友均值</span><b>${matesAverage(state).toFixed(1)}</b></div>
      </div>
      <div class="tags">${mates}</div>
    </section>

    <section>
      <h5>隱藏素質</h5>
      <div class="trait-list">${traitList}</div>
      <p class="muted small">▸ 點開查看各特質的作用；劃線＝已被合成消耗。</p>
    </section>

    <section>
      <h5>榮譽（${state.honors.length}）</h5>
      <div class="tags">${state.honors.length ? state.honors.slice(-12).reverse().map((h) => `<span class="tag">${h}</span>`).join('') : '<span class="muted">尚無</span>'}</div>
    </section>`;
}
