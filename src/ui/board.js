/**
 * 頂端狀態帶：五列（§22.1，S38）。
 *
 * 列1 選手ID·位置·年齡 ｜ 年.月·階段 ｜ 距下階段倒數 ｜ ☰ ↺
 * 列2 體力條＋區間標籤＋短期效果／受傷
 * 列3 賽區 ｜ 隊伍名 ｜ 排名（資料待接）
 * 列4 生涯任務指示（無任務時整列折疊，§22.5）
 * 列5 十二月進度（#lamps）
 *
 * 舊版是四個數字格（年齡／年份／核心技能／生涯薪資），其中核心技能與生涯薪資兩格
 * 整段移除，不是搬位置：
 *
 * - **核心技能格違反 §22.1**「狀態帶不得出現任何技能值」——技能是導出值（§8.2），
 *   印在常駐區就等於給了一個可最佳化的總分。技能讀數唯一落點是選手 tab（§22.3，S40）。
 * - **生涯薪資格屬選手 tab「薪資」列**（§22.3 明訂），同樣由 S40 落地。
 *
 * 補上的是舊版缺的決策資訊：體力常駐可見（§6／§22.5——體力是要主動管理的資源，
 * 藏起來就不成決策）、階段與「距下階段倒數」（§6.1 體力節奏的規劃資訊，倒數由
 * `engine/calendar.js` 的 `nextStageIn` 算，不放 UI 層）。
 */
import { ROLE_NAMES } from '../data/skills.js';
import { calendarFor, nextStageIn } from '../engine/calendar.js';
import { DEMO_MONTHS, demoMonth, isDemo } from '../engine/demo.js';
import { currentLeagueKey, leagueLabel } from '../engine/roster.js';
import { BAND_FRESH, STAMINA_MAX, bandOf, staminaOf } from '../engine/stamina.js';
import { questRows } from './panel/index.js';
import { byId, escapeHtml, qsa } from './dom.js';

/** 階段 kind 的顯示名。SPLIT 用賽段自己的名字（春季賽／夏季賽…），不寫死在這裡 */
const STAGE_NAMES = { PLAYOFF: '季後賽', MSI: 'MSI', WORLDS: '世界賽', SEASON_END: '賽季結算' };

const kindLabel = (entry) => (entry.kind === 'SPLIT'
  ? (entry.split?.name || '賽段')
  : (STAGE_NAMES[entry.kind] || '休賽期'));

/**
 * 當下月份的階段名。當月有階段事件（季後賽月／MSI／世界賽）就用它；否則看養成回合
 * 屬於哪個賽段；都不屬（1 月與 12 月休賽期）就是休賽期。
 */
function currentStageName(state, cal) {
  const now = state.month || 1;
  const entries = cal.filter((p) => p.month === now);
  const st = entries.find((p) => p.kind !== 'MONTH');
  if (st && (st.kind === 'SPLIT' || STAGE_NAMES[st.kind])) return kindLabel(st);
  return entries.find((p) => p.kind === 'MONTH')?.split?.name || '休賽期';
}

export function renderBoard(state, month) {
  const cal = calendarFor(state, state.league);

  // 列1：位置是契約的一部分，用 ROLE_NAMES 查，不寫死在這裡
  byId('bd-name').innerHTML = `${escapeHtml(state.name)} <small>${ROLE_NAMES[state.role]}·${state.age} 歲</small>`;
  byId('bd-ym').textContent = `${state.year}.${state.month || 1}`;
  // DEMO 期程（§19，S21b）併在階段後面：三年是有限期程，剩幾個月影響玩家要不要為
  // 第三年鋪路（合約、任務期限），看不到就不成決策。完整生涯沒有這段
  byId('bd-stage').textContent = isDemo(state)
    ? `${currentStageName(state, cal)} · DEMO ${demoMonth(state)}/${DEMO_MONTHS}`
    : currentStageName(state, cal);
  fillNextStage(state, cal);

  fillStaminaRow(state);

  // 列3：排名資料源未定（§21.3 備忘），Phase 1 聯賽積分榜（§24）產出後填 #bd-rank
  byId('bd-league').textContent = leagueLabel(state, currentLeagueKey(state));
  byId('bd-team').textContent = state.team || '—';

  // 列4：無任務時整列折疊（§22.5）。questRows 與選手面板共用同一份，不抄第二份
  const quests = byId('bd-quests');
  const active = state.quests?.active ?? [];
  quests.hidden = active.length === 0;
  if (active.length) quests.innerHTML = questRows(state);

  // 列5：燈亮的是當下的月份。⚠ 讀 beat 傳來的 `month`（進場時 0＝一盞都不亮，
  // 年界時 runner 還握著上一年的 12），不是 `state.month`
  const now = typeof month === 'number' ? month : (state.month || 1);
  qsa('#lamps .lamp').forEach((lamp, i) => {
    lamp.classList.toggle('on', i + 1 === now);
    // 已經走過的月份留一個淡標記：一年剩幾個回合是玩家排訓練時真的會算的東西
    lamp.classList.toggle('done', i + 1 < now);
  });
}

/**
 * 狀態帶實高 → `--board-h`（S42b，§22.6）。
 *
 * 寬螢幕的左右兩欄是 sticky，落點得貼在狀態帶下緣；但狀態帶是五列且列4（任務）
 * 會整列折疊、標籤也會換行，高度不是常數。原本 CSS 寫死 56px，實際約 160px，
 * 側欄因此滑進狀態帶底下。這裡量一次真值寫回 CSS 變數，尺寸一變就重量。
 */
export function initBoardMetrics() {
  const board = byId('board');
  const layout = byId('layout');
  if (!board || !layout) return;
  const sync = () => layout.style.setProperty('--board-h', `${Math.round(board.offsetHeight)}px`);
  sync();
  if (typeof ResizeObserver === 'function') new ResizeObserver(sync).observe(board);
  else window.addEventListener('resize', sync);
}

/** 距下階段倒數。當年已無下一階段（12 月）時清空 */
function fillNextStage(state, cal) {
  const el = byId('bd-next');
  const next = nextStageIn(state);
  if (!next) {
    el.textContent = '';
    return;
  }
  const label = kindLabel(cal.find((p) => p.kind === next.kind && p.month === next.month));
  el.textContent = next.monthsAway === 0 ? `${label} 本月` : `距${label} ${next.monthsAway} 月`;
}

/**
 * 列2：體力常駐可見（§22.5 明訂）。與隱藏心理正好相反：心理連標籤都不給，
 * 體力則必須完整可見——刻度線＝充沛界線（BAND_FRESH），標籤是區間名。
 */
function fillStaminaRow(state) {
  const value = Math.round(staminaOf(state));
  byId('bd-stam-bar').style.cssText = `--fill:${(value / STAMINA_MAX) * 100}%;--pot:${BAND_FRESH}%`;
  byId('bd-stam-num').textContent = value;
  byId('bd-stam-band').textContent = bandOf(value).label;

  const tags = [];
  if (state.skipSeason) tags.push('復健年');
  else if (state.injuryWeeks > 0) tags.push(`傷缺約 ${state.injuryWeeks} 週`);
  if (state.benchedStreak > 0) tags.push('下放中');
  byId('bd-stam-tags').innerHTML = tags.map((t) => `<span class="tag inj">${t}</span>`).join('');
}
