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
import { PLAYER_STAT_ID, standingsFor, statsFor } from '../../engine/leagueSim.js';
import { leaderboard, metricAverage } from '../../engine/microStats.js';
import { intlPercentile, percentileBand, splitPercentile } from '../../kernel/leagueStats.js';
import { currentLeagueKey, mateTeamId } from '../../engine/roster.js';
import { formatMoney } from '../../engine/market.js';
import { coachBonus, matesAverage } from '../../kernel/strength.js';
import { coachOf } from '../../kernel/modifiers.js';
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

/** 個人數據榜（§24.2.3／§24.3，S33 榜單＋S34 玩家併池）：各位置 KDA／DPM／視野的榜首 */
function renderMicroLeaderboard(state, entry) {
  const stats = entry && statsFor(state, state.year, entry.split.key);
  if (!stats) return '';
  const rows = ROLES.map((role) => {
    const cell = (metric, label) => {
      const top = leaderboard(stats, role, metric, 1)[0];
      if (!top) return `${label} —`;
      const name = top.id === PLAYER_STAT_ID ? '你' : escapeHtml(top.id);
      return `${label} ${top.id === PLAYER_STAT_ID ? `<b class="hl">${name}</b>` : name} ${top.value.toFixed(1)}`;
    };
    return `<div><span>${ROLE_NAMES[role]}</span><b>${cell('KDA', 'KDA')}｜${cell('DPM', 'DPM')}｜${cell('VSPM', '視野')}</b></div>`;
  }).join('');
  return `
    <section>
      <h5>個人數據榜（各位置榜首）</h5>
      <div class="kv">${rows}</div>
    </section>`;
}

/** 玩家自己的聯賽數據與同位置百分位（§24.3.1，S34）：本賽段本人尚未出賽（G=0）時不顯示 */
function renderOwnLeagueStats(state, entry) {
  const stats = entry && statsFor(state, state.year, entry.split.key);
  const mine = stats && stats[PLAYER_STAT_ID];
  if (!mine || !mine.G) return '';
  const kdaPct = splitPercentile(state, 'kda', entry.split.key);
  const dpmPct = splitPercentile(state, 'dpm', entry.split.key);
  const band = percentileBand(kdaPct);
  const pctNote = band
    ? `<div><span>聯賽百分位</span><b>KDA ${kdaPct.toFixed(0)}（${band}）｜DPM ${dpmPct === null ? '—' : dpmPct.toFixed(0)}</b></div>`
    : `<div><span>聯賽百分位</span><b class="muted">母體不足，尚無法計算</b></div>`;
  return `
    <section>
      <h5>本賽段個人數據</h5>
      <div class="kv">
        <div><span>KDA</span><b>${metricAverage(mine, 'KDA').toFixed(2)}</b></div>
        <div><span>DPM</span><b>${metricAverage(mine, 'DPM').toFixed(0)}</b></div>
        ${pctNote}
      </div>
    </section>`;
}

/**
 * 國際賽獨立評價（§24.4.3，S34）：母體＝當季 `leaguePool[年].intl`，跟賽區基準
 * 是兩套表、互不推導（母體本來就是比較強的那群人，基準自然更高，不設額外常數）。
 * 玩家今年還沒打過國際賽（或 intl 段還沒有資料）時整節不顯示。
 */
function renderIntlStats(state) {
  const intl = state.leaguePool?.[state.year]?.intl?.stats;
  const mine = intl && intl[PLAYER_STAT_ID];
  if (!mine || !mine.G) return '';
  const kdaPct = intlPercentile(state, 'kda');
  const band = percentileBand(kdaPct);
  const pctNote = band
    ? `<div><span>國際賽百分位</span><b>KDA ${kdaPct.toFixed(0)}（同位置${band}）</b></div>`
    : `<div><span>國際賽百分位</span><b class="muted">母體不足，尚無法計算</b></div>`;
  return `
    <section>
      <h5>${state.year} 國際賽數據</h5>
      <div class="kv">
        <div><span>KDA</span><b>${metricAverage(mine, 'KDA').toFixed(2)}</b></div>
        <div><span>DPM</span><b>${metricAverage(mine, 'DPM').toFixed(0)}</b></div>
        ${pctNote}
      </div>
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

  // S49：教練列補一句話效果（desc）——玩家分得出六個教練的差別。印的是教練體系的
  // 效果（可見層），不是 §10.2 教練評價（§22.4 禁止顯示的隱藏層）
  const coach = coachOf(state);
  const coachRow = coach
    ? `<div><span>教練</span><b>${escapeHtml(coach.name)}（+${coachBonus(state).toFixed(1)}）<br><span class="muted">${escapeHtml(coach.desc)}</span></b></div>`
    : `<div><span>教練</span><b>${state.coach || '—'}（+${coachBonus(state).toFixed(1)}）</b></div>`;

  return `
    <section>
      <h5>教練與隊友</h5>
      <div class="kv">
        ${coachRow}
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
    ${renderOwnLeagueStats(state, split)}
    ${renderMicroLeaderboard(state, split)}
    ${renderIntlStats(state)}`;
}
