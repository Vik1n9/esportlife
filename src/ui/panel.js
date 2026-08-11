/**
 * 選手資訊面板（設計文件寫了但舊版沒做的部分）。
 *
 * 舊版只有在「訓練期加點」那幾秒能看到能力值，英雄池、專精、版本落差、
 * 隊友與教練、合約狀態全程都藏在 state 裡沒有出口。這裡補上一個隨時可開的面板。
 */
import { ABILITY_CAP, ABILITY_NAMES, ROLE_NAMES } from '../data/abilities.js';
import { HEROES } from '../data/heroes.js';
import { LEAGUES } from '../data/leagues.js';
import { effectiveOvr, ovr, patchPenalty, retirementAge } from '../engine/abilities.js';
import { stageLabel } from '../engine/game.js';
import { formatMoney } from '../engine/market.js';
import { mentalSummary } from '../engine/mental.js';
import { activeTraitNames } from '../engine/progression.js';
import { coachBonus, matesAverage } from '../kernel/strength.js';
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

function abilityRows(state) {
  return Object.keys(state.ability).map((key) => {
    const value = state.ability[key];
    const potential = state.potential[key] ?? 62;
    const carry = state.carry[key] || 0;
    return `<div class="abrow static">
      <div class="nm">${ABILITY_NAMES[key]}</div>
      <div class="bar" style="--fill:${Math.min(100, (value / ABILITY_CAP) * 100)}%;--pot:${Math.min(100, (potential / ABILITY_CAP) * 100)}%"><i></i><em></em></div>
      <div class="val"><b>${value}</b><span class="cost">上限 ${potential}${carry ? ` ·蓄${carry}` : ''}</span></div>
    </div>`;
  }).join('');
}

function heroRows(state) {
  const all = HEROES[state.role];
  return all.map((h) => {
    const owned = state.heroPool.includes(h);
    const mastery = state.mastery[h] || 0;
    return `<span class="hero${owned ? ' owned' : ''}">${h}${mastery ? `<b>${mastery}</b>` : ''}</span>`;
  }).join('');
}

function renderPanel() {
  const state = currentState;
  const body = byId('panel-body');
  const penalty = patchPenalty(state);
  const { base, epic } = activeTraitNames(state);
  const league = LEAGUES[state.league];

  const traitHtml = [
    ...epic.map((n) => `<span class="tag epic">${n}</span>`),
    ...base.map((n) => `<span class="tag">${n}</span>`),
    ...state.fusedAway.map((n) => `<span class="tag gone">${n}</span>`),
  ].join('') || '<span class="muted">尚未覺醒任何隱藏素質</span>';

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
      <h5>能力值</h5>
      ${abilityRows(state)}
      <p class="muted small">刻度線＝該項潛力上限，超過上限後成長成本 ×3。</p>
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
      <div class="tags">${traitHtml}</div>
      <p class="muted small">劃線＝已被合成消耗。</p>
    </section>

    <section>
      <h5>榮譽（${state.honors.length}）</h5>
      <div class="tags">${state.honors.length ? state.honors.slice(-12).reverse().map((h) => `<span class="tag">${h}</span>`).join('') : '<span class="muted">尚無</span>'}</div>
    </section>`;
}
