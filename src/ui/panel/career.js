/**
 * 生涯 tab：生涯軌跡五欄位（§22.3）＋榮譽。
 *
 * §22.4 明訂 route 任務卡的軌跡數字全公開——看不到就湊不成（§12.3）。
 * 五欄位：milestones／teamHistory／awards／intlRecord／disbandCrises，
 * 全部由 S17a 帳本（engine/ledger.js）管理。
 *
 * ⚠ 這裡的數字是 route 任務卡的觸發條件依據，顯示格式要讓玩家能直接
 * 對照任務卡的條件式（例如「生涯效力 ≥ 4 支不同戰隊」→ 歷任戰隊：4）。
 */
import { LEAGUES } from '../../data/leagues.js';
import { distinctTeams, intlWinRate, longestTenure } from '../../engine/ledger.js';
import { escapeHtml } from '../dom.js';

const MILESTONE_KIND_NAME = {
  debut: '出道',
  intl: '國際賽',
  award: '個人獎項',
  disband: '解散危機',
  transfer: '轉會',
  split: '賽段',
};

export function renderCareer(state) {
  return [
    milestonesSection(state),
    teamHistorySection(state),
    awardsSection(state),
    intlSection(state),
    disbandSection(state),
    honorsSection(state),
  ].join('');
}

function milestonesSection(state) {
  const items = state.milestones || [];
  const list = items.length
    ? items.slice().reverse().slice(0, 20).map((m) => {
        const kind = MILESTONE_KIND_NAME[m.kind] || m.kind;
        return `<div class="abrow static">
          <div class="nm">${m.year}</div>
          <div class="val"><b>${escapeHtml(kind)}</b><span class="cost">${escapeHtml(m.text || '')}</span></div>
        </div>`;
      }).join('')
    : '<span class="muted">尚無里程碑</span>';

  return `<section>
    <h5>里程碑（${items.length}）</h5>
    ${list}
    ${items.length > 20 ? '<p class="muted small">僅顯示最近 20 筆</p>' : ''}
  </section>`;
}

function teamHistorySection(state) {
  const entries = state.teamHistory || [];
  const list = entries.length
    ? entries.slice().reverse().map((e) => {
        const to = e.toYear ? `${e.toYear}` : '現役';
        const leagueName = LEAGUES[e.league]?.name || e.league || '';
        return `<div class="abrow static">
          <div class="nm">${escapeHtml(e.team)}</div>
          <div class="val"><b>${e.fromYear}–${to}</b>
            <span class="cost">${escapeHtml(leagueName)}${e.firstSeasonRating ? ` · 評價 ${Math.round(e.firstSeasonRating)}` : ''}</span></div>
        </div>`;
      }).join('')
    : '<span class="muted">尚未加入職業戰隊</span>';

  return `<section>
    <h5>效力紀錄（歷任 ${distinctTeams(state)} 隊${longestTenure(state) > 1 ? ` · 最長駐 ${longestTenure(state)} 年` : ''}）</h5>
    ${list}
  </section>`;
}

function awardsSection(state) {
  return `<section>
    <h5>個人獎項（${state.awards || 0}）</h5>
    <div class="kv">
      <div><span>生涯獎項總數</span><b>${state.awards || 0}</b></div>
    </div>
    <p class="muted small">包含 MVP、最佳新人、單殺王、全明星等個人榮譽。</p>
  </section>`;
}

function intlSection(state) {
  const { W, L } = state.intlRecord || { W: 0, L: 0 };
  const rate = intlWinRate(state);
  const hasIntl = W + L > 0;

  return `<section>
    <h5>國際賽紀錄</h5>
    <div class="kv">
      <div><span>勝／負</span><b>${W}W ${L}L</b></div>
      <div><span>勝率</span><b>${hasIntl ? `${rate}%` : '—'}</b></div>
      <div><span>出場次數</span><b>${state.intlAppearances || 0}</b></div>
      <div><span>世界賽冠軍</span><b>${state.worldsWins || 0}</b></div>
      <div><span>世界賽亞軍</span><b>${state.worldsFinals || 0}</b></div>
      <div><span>MSI 冠軍</span><b>${state.msiWins || 0}</b></div>
    </div>
  </section>`;
}

function disbandSection(state) {
  return `<section>
    <h5>降級危機與重建</h5>
    <div class="kv">
      <div><span>生涯累計</span><b>${state.disbandCrises || 0} 次</b></div>
    </div>
    <p class="muted small">包含降級危機、戰隊重建期等經歷（單季最多計 1 次）。</p>
  </section>`;
}

function honorsSection(state) {
  const honors = state.honors || [];
  const list = honors.length
    ? honors.slice(-12).reverse().map((h) => `<span class="tag">${h}</span>`).join('')
    : '<span class="muted">尚無</span>';

  return `<section>
    <h5>榮譽（${honors.length}）</h5>
    <div class="tags">${list}</div>
  </section>`;
}
