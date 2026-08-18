/**
 * 隊伍 tab：隊友、教練、合約、下放狀態。
 *
 * 從舊 panel.js 的「隊伍」section 搬來，補上合約與下放兩個原本沒有出口的欄位。
 * coachBonus 是「教練對隊伍戰力的加成」（可見），不是 §10.2 的教練評價（隱藏）。
 *
 * 隊友卡（S28）：職業期隊友是 NPC（帶 `npcId`），顯示縮寫隊名與位置；業餘期與
 * 合成隊友（`npcId` 為 null）只顯示虛構名與 rating。
 * §22.4 揭露禁令對 NPC 同樣適用：心理六維與教練評價不顯示——rating 是隊友戰力
 * （S23.6 schema 明列的可見欄位），位置與隊名是公開資訊。
 */
import { LEAGUES } from '../../data/leagues.js';
import { ROLES, ROLE_NAMES } from '../../data/skills.js';
import { calendarFor } from '../../engine/calendar.js';
import { standingsFor, statsFor } from '../../engine/leagueSim.js';
import { leaderboard } from '../../engine/microStats.js';
import { currentLeagueKey, mateTeamId } from '../../engine/roster.js';
import { formatMoney } from '../../engine/market.js';
import { coachBonus, matesAverage } from '../../kernel/strength.js';
import { escapeHtml } from '../dom.js';

function mateTag(m) {
  const teamId = m.npcId ? mateTeamId(m.npcId) : null;
  const team = teamId ? `（${teamId}）` : '';
  const pos = m.position ? `· ${ROLE_NAMES[m.position]} ` : ' ';
  return `<span class="tag">${escapeHtml(m.name)}${team}${pos}${m.rating}</span>`;
}

/**
 * 當下月份所屬的賽段（跟 `board.js` 的 `fillRank` 同一條判準）：業餘／青訓期或
 * 賽段開幕當月（積分榜還沒有任何一場結算）沒有榜可讀，回 null。
 */
function currentSplit(state) {
  const now = state.month || 1;
  return calendarFor(state, currentLeagueKey(state)).find((p) => p.month === now && p.split) ?? null;
}

/** 聯賽積分榜（§24.2，S32 宏觀＋S33 補完 UI）：全榜名次，不只板子上的一個數字 */
function renderStandings(state, entry) {
  const standings = entry && standingsFor(state, state.year, entry.split.key);
  if (!standings) return '';
  const rows = standings.map((r, i) => `
    <div><span>${i + 1}. ${escapeHtml(r.name)}</span><b${r.isPlayer ? ' class="hl"' : ''}>${r.W}W-${r.L}L</b></div>
  `).join('');
  return `
    <section>
      <h5>${escapeHtml(entry.split.name)}積分榜</h5>
      <div class="kv">${rows}</div>
    </section>`;
}

/** 個人數據榜（§24.2.3／§24.3，S33）：各位置 KDA／DPM／視野的榜首，玩家數據尚未併池（S34） */
function renderMicroLeaderboard(state, entry) {
  const stats = entry && statsFor(state, state.year, entry.split.key);
  if (!stats) return '';
  const rows = ROLES.map((role) => {
    const cell = (metric, label) => {
      const top = leaderboard(stats, role, metric, 1)[0];
      return top ? `${label} ${escapeHtml(top.id)} ${top.value.toFixed(1)}` : `${label} —`;
    };
    return `<div><span>${ROLE_NAMES[role]}</span><b>${cell('KDA', 'KDA')}｜${cell('DPM', 'DPM')}｜${cell('VSPM', '視野')}</b></div>`;
  }).join('');
  return `
    <section>
      <h5>個人數據榜（各位置榜首）</h5>
      <div class="kv">${rows}</div>
    </section>`;
}

export function renderTeam(state) {
  const league = LEAGUES[state.league];
  const split = currentSplit(state);

  const mates = state.mates.length
    ? state.mates.map(mateTag).join('')
    : '<span class="muted">尚無固定隊友</span>';

  const contract = state.contract
    ? `<div><span>合約</span><b>剩 ${state.contract.years} 年 ×${state.contract.mult.toFixed(2)}</b></div>`
    : `<div><span>合約</span><b>無合約</b></div>`;

  const bench = state.benchedStreak > 0
    ? `<div><span>下放狀態</span><b class="dn">連續 ${state.benchedStreak} 段被下放</b></div>`
    : '';

  return `
    <section>
      <h5>教練與隊友</h5>
      <div class="kv">
        <div><span>教練</span><b>${state.coach || '—'}（+${coachBonus(state).toFixed(1)}）</b></div>
        <div><span>隊友平均戰力</span><b>${matesAverage(state).toFixed(1)}</b></div>
      </div>
      <div class="tags">${mates}</div>
    </section>

    <section>
      <h5>合約</h5>
      <div class="kv">
        ${contract}
        <div><span>目前年薪</span><b>${formatMoney(state.salary)}</b></div>
        <div><span>生涯總薪資</span><b>${formatMoney(state.salary + (state.bonusSalary || 0))}</b></div>
        ${bench}
      </div>
    </section>

    <section>
      <h5>所屬</h5>
      <div class="kv">
        <div><span>戰隊</span><b>${escapeHtml(state.team || '—')}</b></div>
        <div><span>層級</span><b>${league ? `${league.name}（par ${league.par}）` : '—'}</b></div>
      </div>
    </section>

    ${renderStandings(state, split)}
    ${renderMicroLeaderboard(state, split)}`;
}
