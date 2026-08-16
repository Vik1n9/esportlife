/**
 * 選手 tab：個人資料全列（§22.3）。
 *
 * 玩家能知道的一切都在這裡：基本／薪資／六屬性＋潛力／十二技能（核心 4 ＋次要 2
 * 標註，下拉可看說明與來源屬性）／英雄池與專精／版本落差／聲量分級／個人特質列表／
 * 目前任務／存檔・重開。
 *
 * §22.4 自查：
 * - 隱藏心理六維：不顯示 ✓（reputeSummary 只回 fame）
 * - 教練評價：不顯示 ✓（coachBonus 是隊伍加成，不是 §10.2 教練評價）
 * - 聲量：可見，有分級標籤 ✓
 * - 技能全部唯讀 ✓（abrow.static）
 * - 特質列表只顯示已持有者的益處與副作用 ✓
 * - 配方不揭露 ✓（不提合成）
 */
import { ATTR_ABBR, ATTR_CAP, ATTR_DESC, ATTR_NAMES, ATTRS, POTENTIAL_BANDS } from '../../data/attributes.js';
import { ROLE_NAMES, SKILL_DESC, SKILL_NAMES, SKILL_WEIGHTS } from '../../data/skills.js';
import { HEROES_BY_ROLE } from '../../data/heroes.js';
import { EPIC_TRAITS, LEGENDARY_TRAITS } from '../../data/epics.js';
import { BASE_TRAITS, RARE_TRAITS } from '../../data/traits.js';
import { patchPenalty, roleSkills, skillValue } from '../../engine/attributes.js';
import { stageLabel } from '../../engine/game.js';
import { formatMoney } from '../../engine/market.js';
import { reputeSummary } from '../../engine/mental.js';
import { BAND_FRESH, BAND_TIRED, STAMINA_MAX, bandOf, staminaOf } from '../../engine/stamina.js';
import { lookupTrait, TIER_DISPLAY_ORDER, TIER_STORES } from '../../kernel/modifiers.js';
import { escapeHtml } from '../dom.js';
import { questRows } from './index.js';

const DEFAULT_POTENTIAL = Math.round((POTENTIAL_BANDS[3][0] + POTENTIAL_BANDS[3][1]) / 2);

/** 蓄力是小數，原樣印會把 0.1376267417605339 塞進屬性列把整列擠成兩行（與 attrbar 同一套） */
const num = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export function renderPlayer(state) {
  const league = state.league;
  const penalty = patchPenalty(state);
  const traitList = traitRows(state) || '<span class="muted">尚未覺醒任何隱藏素質</span>';

  return `
    ${basicSection(state)}
    ${staminaSection(state)}
    ${attrSection(state)}
    ${skillSection(state)}
    ${heroSection(state)}
    ${patchSection(state, penalty)}
    ${fameSection(state)}
    ${traitSection(traitList)}
    ${questSection(state)}
    ${actionSection()}`;
}

function basicSection(state) {
  const { ROLE_NAMES: _rn } = {};
  const roleName = ROLE_NAMES[state.role];
  return `<section>
    <h5>基本資料</h5>
    <div class="kv">
      <div><span>ID</span><b>${escapeHtml(state.name)}</b></div>
      <div><span>位置</span><b>${roleName}</b></div>
      <div><span>年齡</span><b>${state.age}</b></div>
      <div><span>所屬</span><b>${escapeHtml(state.team || '—')}</b></div>
      <div><span>層級</span><b>${stageLabel(state)}</b></div>
      <div><span>目前年薪</span><b>${formatMoney(state.salary)}</b></div>
      <div><span>生涯薪資</span><b>${formatMoney(state.salary + (state.bonusSalary || 0))}</b></div>
    </div>
  </section>`;
}

function staminaSection(state) {
  const value = Math.round(staminaOf(state));
  const band = bandOf(value);
  return `<section>
    <h5>體力</h5>
    <div class="abrow static">
      <div class="nm">體力</div>
      <div class="bar" style="--fill:${(value / STAMINA_MAX) * 100}%;--pot:${BAND_FRESH}%"><i></i><em></em></div>
      <div class="val"><b>${value}</b><span class="cost">${band.label}</span></div>
    </div>
    <p class="muted small">${band.note}。刻度線＝${BAND_FRESH}，以上訓練成功率正常；
      低於 ${BAND_TIRED} 成功率腰斬並提高受傷風險。賽事期間不能休息，只能減少訓練。</p>
  </section>`;
}

function attrSection(state) {
  const rows = ATTRS.map((key) => {
    const value = state.attr[key];
    const potential = state.potential[key] ?? DEFAULT_POTENTIAL;
    const carry = state.carry[key] || 0;
    return `<details class="attr-item">
      <summary>
        <span class="trait-arrow">▸</span><div class="abrow static">
          <div class="nm">${ATTR_NAMES[key]}</div>
          <div class="bar" style="--fill:${Math.min(100, (value / ATTR_CAP) * 100)}%;--pot:${Math.min(100, (potential / ATTR_CAP) * 100)}%"><i></i><em></em></div>
          <div class="val"><b>${value}</b><span class="cost">${ATTR_ABBR[key]} ·上限 ${potential}${carry ? ` ·蓄${num(carry)}` : ''}</span></div>
        </div>
      </summary>
      <div class="trait-desc">${escapeHtml(ATTR_DESC[key])}</div>
    </details>`;
  }).join('');

  return `<section>
    <h5>屬性</h5>
    ${rows}
    <p class="muted small">▸ 點開查看各屬性在峽谷內的作用；刻度線＝潛力上限，越靠近天花板成長越慢。</p>
  </section>`;
}

function skillSection(state) {
  const keys = roleSkills(state);
  const top = keys.slice(0, 4);
  const rows = keys.map((key) => {
    const value = skillValue(state, key);
    const attrsTxt = Object.keys(SKILL_WEIGHTS[key]).map((a) => ATTR_NAMES[a]).join('、');
    return `<details class="skill-item">
      <summary>
        <span class="trait-arrow">▸</span><div class="abrow static">
          <div class="nm">${SKILL_NAMES[key]}</div>
          <div class="bar" style="--fill:${Math.min(100, (value / ATTR_CAP) * 100)}%"><i></i></div>
          <div class="val"><b>${value}</b><span class="cost">${top.includes(key) ? '本位置核心' : ''}</span></div>
        </div>
      </summary>
      <div class="trait-desc">${escapeHtml(SKILL_DESC[key])}<br>相關屬性：${attrsTxt}。</div>
    </details>`;
  }).join('');

  return `<section>
    <h5>技能（${ROLE_NAMES[state.role]}）</h5>
    ${rows}
    <p class="muted small">▸ 點開查看各技能的作用與來源；技能由六大屬性換算而來，不能直接加點；由上到下＝對本位置戰力的影響由重到輕。<br>沒有單一總評數字——這一路要強，看的是這六項。</p>
  </section>`;
}

function heroSection(state) {
  const all = HEROES_BY_ROLE[state.role];
  const heroes = all.map((h) => {
    const owned = state.heroPool.includes(h);
    const mastery = state.mastery[h] || 0;
    return `<span class="hero${owned ? ' owned' : ''}">${h}${mastery ? `<b>${mastery}</b>` : ''}</span>`;
  }).join('');

  return `<section>
    <h5>英雄池與專精</h5>
    <div class="heroes">${heroes}</div>
    <p class="muted small">亮起＝可用於比賽；數字＝專精場次。池深每多 1 隻可抵銷 1 點版本落差。</p>
  </section>`;
}

function patchSection(state, penalty) {
  return `<section>
    <h5>版本</h5>
    <div class="kv">
      <div><span>目前版本</span><b>${state.patchTheme || '—'}</b></div>
      <div><span>經歷改版</span><b>${state.patchCount} 次</b></div>
      <div><span>版本落差</span><b class="${penalty < 0 ? 'dn' : 'up'}">${state.patchDebt}（戰力 ${penalty || 0}）</b></div>
    </div>
  </section>`;
}

function fameSection(state) {
  return `<section>
    <h5>聲量</h5>
    <div class="kv">
      ${reputeSummary(state).map((m) => `<div><span>${m.name}</span><b>${m.tier}</b></div>`).join('')}
    </div>
    <p class="muted small">聲量是唯一看得到的一項。你的心態沒有數字也沒有標籤——只能從比賽數據與事件反應去猜。</p>
  </section>`;
}

function traitRows(state) {
  const rows = [];
  for (const tier of TIER_DISPLAY_ORDER) {
    const { store, cls } = TIER_STORES[tier];
    for (const [key, isHeld] of Object.entries(store(state) || {})) {
      if (!isHeld) continue;
      const t = lookupTrait(key);
      if (!t) continue;
      rows.push({ name: t.name, desc: t.desc, cls });
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

function traitDescByName(name) {
  for (const table of [BASE_TRAITS, RARE_TRAITS, EPIC_TRAITS, LEGENDARY_TRAITS]) {
    const t = Object.values(table).find((x) => x.name === name);
    if (t) return t.desc;
  }
  return '';
}

function traitSection(traitList) {
  return `<section>
    <h5>隱藏素質</h5>
    <div class="trait-list">${traitList}</div>
    <p class="muted small">▸ 點開查看各特質的作用；劃線＝已被合成消耗。</p>
  </section>`;
}

function questSection(state) {
  return `<section>
    <h5>生涯任務（${state.quests?.active?.length ?? 0}）</h5>
    ${questRows(state)}
    <p class="muted small">目標與期限都看得到——看不到就不成決策（§12.3）。</p>
  </section>`;
}

function actionSection() {
  return `<section>
    <h5>存檔與重開</h5>
    <button class="btn warn" data-action="restart">重新開始這段生涯</button>
  </section>`;
}
