/**
 * 賽程 tab：年曆、戰績、冠軍登記表、時代。
 *
 * 年曆是 §0.5 直覺檢驗的落點——玩家自己看得出「為什麼下個月不能練」。
 * 當下月份標記，跨月後跟著移動（refreshPanel 重繪）。
 *
 * 冠軍登記表（state.titleHistory）是 §16.2 的世界賽冠軍紀錄，玩家與 NPC
 * 同一張表。時代（eras.js）顯示當前年度的世界設定。
 */
import { eraOf } from '../../data/eras.js';
import { BUCKET_NAMES, LEAGUES } from '../../data/leagues.js';
import { calendarFor, monthLayout } from '../../engine/calendar.js';
import { escapeHtml } from '../dom.js';

const MONTH_KIND_LABEL = {
  regular: '常規賽',
  playoff: '季後賽',
  msi: 'MSI',
  worlds: '世界賽',
  offseason: '休賽',
};

export function renderSchedule(state) {
  return [
    calendarSection(state),
    recordSection(state),
    titleHistorySection(state),
    eraSection(state),
  ].join('');
}

function calendarSection(state) {
  const region = LEAGUES[state.league]?.region;
  const layout = monthLayout(state.year, region);
  const now = state.month || 1;

  const eventMonths = new Set(layout.spans.map((s) => s.playoff));
  for (let m = 10; m <= 11; m++) eventMonths.add(m);
  if (layout.msiMonth) eventMonths.add(layout.msiMonth);

  let html = '';
  for (let m = 1; m <= 12; m++) {
    const cls = ['cal-m'];
    if (m === now) cls.push('now');
    let kind = 'offseason';
    let label = MONTH_KIND_LABEL.offseason;
    for (const span of layout.spans) {
      if (span.regular.includes(m)) {
        kind = 'regular';
        label = span.split.name || MONTH_KIND_LABEL.regular;
        break;
      }
    }
    if (eventMonths.has(m)) {
      if (layout.msiMonth === m) { kind = 'msi'; label = 'MSI'; }
      else if (m >= 10) { kind = 'worlds'; label = '世界賽'; }
      else { kind = 'playoff'; label = '季後賽'; }
    }
    cls.push(kind);
    html += `<div class="${cls.join(' ')}"><b>${m}</b><span>${label}</span></div>`;
  }

  return `<section>
    <h5>${state.year} 年曆</h5>
    <div class="cal-grid">${html}</div>
    <p class="muted small">亮色月份＝賽事期間，無法安排訓練；灰底＝休賽可自由調配。</p>
  </section>`;
}

function recordSection(state) {
  const stats = state.stats || {};
  const entries = Object.entries(stats);
  const records = entries.length
    ? entries.map(([bucket, s]) => {
        const name = BUCKET_NAMES[bucket] || bucket;
        return `<div><span>${escapeHtml(name)}</span><b>${s.W}W ${s.L}L（${s.G} 場）</b></div>`;
      }).join('')
    : '<div><span>戰績</span><b class="muted">尚無</b></div>';

  return `<section>
    <h5>戰績</h5>
    <div class="kv">
      ${records}
      <div><span>賽段冠軍</span><b>${state.splitTitles || 0}</b></div>
    </div>
  </section>`;
}

function titleHistorySection(state) {
  const titles = state.titleHistory || [];
  const list = titles.length
    ? titles.slice().reverse().map((t) =>
        `<div class="abrow static">
          <div class="nm">${t.year}</div>
          <div class="val"><b>${escapeHtml(t.team)}</b>
            <span class="cost">${t.region}${t.isPlayer ? ' · 你' : ''}</span></div>
        </div>`
      ).join('')
    : '<span class="muted">尚無紀錄</span>';

  return `<section>
    <h5>世界賽冠軍登記（${titles.length}）</h5>
    ${list}
  </section>`;
}

function eraSection(state) {
  const era = eraOf(state.year);
  return `<section>
    <h5>時代</h5>
    <div class="kv">
      <div><span>當前時代</span><b>${era.label}</b></div>
      <div><span>主場賽區</span><b>${era.home}</b></div>
      <div><span>薪資水準</span><b>×${era.salary}</b></div>
    </div>
  </section>`;
}
