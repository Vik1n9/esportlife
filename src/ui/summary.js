/**
 * 生涯結算：檔案卡、數據表、榮譽、粉絲留言、分享圖。
 *
 * 這裡不印巔峰評價（V4 §10.1：教練評價是內部值，玩家從頭到尾看不到那個數字）。
 * `engine/career.js` 的生涯評分仍然吃 `state.peakRating`——那是 §10.3 明文允許的，
 * 結算分數本來就要有個單一尺度，但玩家看到的是「評分與等第」而不是評價本身。
 */
import { ATTR_CAP, ATTR_NAMES, ATTRS } from '../data/attributes.js';
import { DEMO_YEARS } from '../data/eras.js';
import { ROLE_NAMES } from '../data/skills.js';
import { FAN_QUOTES } from '../data/events.js';
import { BUCKET_NAMES } from '../data/leagues.js';
import { buildBiography } from '../engine/biography.js';
import { careerScore, tierName } from '../engine/career.js';
import { kdaOf } from '../engine/ledger.js';
import { formatMoney } from '../engine/market.js';
import { activeTraitNames } from '../engine/progression.js';
import { TIER_DISPLAY_ORDER, TIER_STORES } from '../kernel/modifiers.js';
import { el, escapeHtml } from './dom.js';
import { renderLoose } from './log.js';
import { fill } from '../kernel/text.js';

export function renderSummary({ state, rng, tier, seed, appVersion }) {
  // 階與樣式讀 TIER_STORES（S20c 單一來源），加一階不用改這裡
  const held = activeTraitNames(state);
  const traits = [
    ...TIER_DISPLAY_ORDER.flatMap((t) => (held[t] || [])
      .map((n) => `<span class="tag ${TIER_STORES[t].cls}">${n}</span>`)),
    ...state.fusedAway.map((n) => `<span class="tag gone">${n}</span>`),
  ].join('') || '（無）';

  // DEMO 期滿（§19，S21b）不是退役——同一張檔案卡，只換這一格的標籤，
  // 免得玩家把「DEMO 到此為止」讀成「選手 21 歲掛靴」
  renderLoose(card('', state.demoEnded ? `生涯檔案（DEMO ${DEMO_YEARS} 季）` : '生涯檔案', `
    <div class="kv">
      <div><span>位置</span><b>${ROLE_NAMES[state.role]}</b></div>
      <div><span>${state.demoEnded ? 'DEMO 終點' : '退役'}</span><b>${state.year} 年 · ${state.age} 歲</b></div>
      <div><span>職業年資</span><b>${state.proYears} 季</b></div>
      <div><span>賽段冠軍</span><b>${state.splitTitles}</b></div>
      <div><span>世界賽冠軍</span><b>${state.worldsWins}</b></div>
      <div><span>MSI 冠軍</span><b>${state.msiWins}</b></div>
      <div><span>生涯總薪資</span><b class="hl">${formatMoney(state.salary)}</b></div>
      <div><span>生涯評分</span><b>${careerScore(state)}（${tierName(tier)}）</b></div>
    </div>
    <div class="tags" style="margin-top:10px">${traits}</div>
    ${state.labels?.length ? `<div class="tags" style="margin-top:6px">${state.labels.map((l) => `<span class="tag">${escapeHtml(l)}</span>`).join('')}</div>` : ''}`));

  const buckets = Object.entries(state.stats).filter(([, s]) => s.G > 0);
  if (buckets.length) {
    const rows = buckets.map(([b, s]) => `<tr>
      <td>${BUCKET_NAMES[b] || b}</td><td>${s.years}</td><td>${s.G}</td><td>${s.W}</td><td>${s.L}</td>
      <td>${s.K}/${s.D}/${s.A}</td><td>${s.SOLO}</td><td>${s.MVP}</td><td>${s.AS}</td></tr>`).join('');
    renderLoose(card('info', '生涯數據', `<div class="table-wrap"><table class="fin">
      <tr><th>階段</th><th>季</th><th>G</th><th>W</th><th>L</th><th>KDA</th><th>SOLO</th><th>MVP</th><th>AS</th></tr>
      ${rows}</table></div>`));
  }

  if (state.honors.length) {
    renderLoose(card('info', `生涯榮譽（${state.honors.length}）`,
      `<div class="tags">${state.honors.map((h) => `<span class="tag">${h}</span>`).join('')}</div>`));
  }

  // 生涯傳記（§15.5，S21a）：五段式的事實拼接，放在榮譽之後、粉絲語之前——
  // 它是這一局的故事，但「粉絲怎麼說」留給下一格。
  renderLoose(card('', '生涯傳記',
    buildBiography(state).map((p) => `<p>${escapeHtml(p)}</p>`).join('')));

  renderLoose(card('info', '粉絲看板', fanQuotes(state, rng, tier).map((q) => `「${q}」`).join('<br>')));
  renderLoose(shareCard({ state, tier, seed, appVersion }));
}

function fanQuotes(state, rng, tier) {
  const picks = rng.sample(FAN_QUOTES[tier], 3).map((q) => fill(q, { n: escapeHtml(state.name) }));
  // TODO(S21a)：不老傳奇的長壽敘事——S19a 已把它重定義為生命週期窗口（衰退極慢、
  // 巔峰延後），「30 歲還能在世界賽奪冠」的粉絲語等 S21a 依新敘事放回來。
  // S21 決定：暫不放回——DEMO 一年（19–20 歲）不會觸發不老語境，等 S19a 的
  // 新敘事完成後再依當時的生涯窗口條件接上（見 21-DEMO組裝.md 交接筆記）
  if (state.worldsWins > 0) picks.push('世界賽奪冠那一夜，全台灣都沒睡。謝謝你');
  if (state.honors.some((h) => h.includes('改寫歷史'))) picks.push('用世界冠軍贖回俱樂部，這劇本電影都不敢拍');
  if (state.traits.genius || state.epic.godhand) picks.push('出道就被叫天才的男人，真的把天賦兌現了');
  if (state.epic.indestructible) picks.push('鐵人謝幕，那個連續出賽紀錄大概很久都破不了');
  if (state.epic.ascetic) picks.push('自律到可怕，凌晨四點的訓練室都認得他');
  return picks;
}

function card(tone, title, body) {
  const node = el('div', { class: `card${tone ? ` ${tone}` : ''}` });
  if (title) node.appendChild(el('h4', { text: title }));
  node.appendChild(el('div', { class: 'card-body', html: body }));
  return node;
}

function shareCard({ state, tier, seed, appVersion }) {
  const node = el('div', { class: 'card' });
  node.innerHTML = `<h4>分享這段生涯</h4>
    <div class="row2">
      <button class="btn main" data-act="img">📸 產生結算圖</button>
      <button class="btn" data-act="url">🔗 複製天賦連結</button>
    </div>
    <div class="share-out"></div>
    <div class="row2" style="margin-top:10px">
      <button class="btn" data-act="new">⚡ 新的人生</button>
      <button class="btn ghost" data-act="same">同天賦再走一次</button>
    </div>`;

  const out = node.querySelector('.share-out');
  node.querySelector('[data-act="img"]').addEventListener('click', () => drawShareImage(out, { state, tier, seed, appVersion }));
  node.querySelector('[data-act="url"]').addEventListener('click', (e) => copyReplayLink(e.currentTarget, seed));
  node.querySelector('[data-act="new"]').addEventListener('click', () => { location.href = location.pathname; });
  node.querySelector('[data-act="same"]').addEventListener('click', () => { location.href = `${location.pathname}?seed=${encodeURIComponent(seed)}`; });
  return node;
}

function copyReplayLink(btn, seed) {
  const url = `${location.origin}${location.pathname}?seed=${encodeURIComponent(seed)}`;
  const ok = () => { btn.textContent = '✅ 已複製'; setTimeout(() => { btn.textContent = '🔗 複製天賦連結'; }, 1600); };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(ok, () => window.prompt('手動複製連結：', url));
  else window.prompt('手動複製連結：', url);
}

/**
 * 結算圖（v4.6.5 重設計：轉播選手卡風格）。
 *
 * 左欄六維屬性雷達圖＋右欄各賽區生涯數據（出賽／K/D/A／KDA 比值），
 * 下方依序放個人特質、頂級榮譽、生涯總薪資與生涯傳記。零依賴 Canvas 2D，
 * 維持老規矩：先量後畫——換行與高度都量過才設畫布。
 *
 * ⚠ KDA 比值走 `ledger.kdaOf`（D=0 回 K+A），結算圖不直接除 raw 欄位。
 */
// 數據表欄位 x 座標（drawShareImage 與 drawStatTable 共用，單一來源避免漂移）
const COL_STAGE = 424; const COL_G = COL_STAGE + 148; const COL_KDA = COL_STAGE + 278; const COL_RATIO = 860;
const UI = "'Inter','Noto Sans TC',sans-serif";

function drawShareImage(out, { state, tier, seed, appVersion }) {
  const W = 900; const PAD = 40; const SCALE = 2;
  const RADAR_R = 108; const RADAR_CX = PAD + 176;

  /* ---- 內容組裝 ---- */
  const buckets = Object.entries(state.stats).filter(([, s]) => s.G > 0);
  const total = { G: 0, K: 0, D: 0, A: 0 };
  for (const [, s] of buckets) for (const k of ['G', 'K', 'D', 'A']) total[k] += s[k];

  const held = activeTraitNames(state);
  const traitNames = TIER_DISPLAY_ORDER.flatMap((t) => held[t] || []);
  const honorRows = state.honors.filter((h) => /世界賽冠軍|MSI 冠軍|改寫歷史/.test(h)).slice(0, 4);

  /* ---- 先量：scratch context 做中文換行，高度全由內容累加 ---- */
  const scratch = el('canvas').getContext('2d');
  const FULL_W = W - PAD * 2;
  const wrapLines = (text, font) => {
    scratch.font = font;
    const lines = [];
    let line = '';
    for (const ch of text) {
      if (scratch.measureText(line + ch).width > FULL_W) { lines.push(line); line = ch; } else line += ch;
    }
    lines.push(line);
    return lines;
  };

  const traitLines = traitNames.length
    ? wrapLines(traitNames.map((n) => `【${n}】`).join(' '), `600 15px ${UI}`)
    : ['（無）'];
  const fusedLines = state.fusedAway.length
    ? wrapLines(`合成離隊：${state.fusedAway.join(' ')}`, `400 13px ${UI}`)
    : [];
  const honorLines = honorRows.flatMap((h) => wrapLines(`· ${h}`, `400 15px ${UI}`));
  const bioLines = buildBiography(state).flatMap((p) => wrapLines(p, `400 13px ${UI}`));

  const radarH = 46 + RADAR_R * 2 + 52;                              // 標題＋圖＋上下標籤
  const tableH = 46 + buckets.length * 28 + 54;                      // 標題＋表頭＋列＋總計
  const middleH = Math.max(radarH, tableH) + 12;

  // 與下面繪製同順的帳面高度：先量後畫，畫布不留空白
  const H = 100 + 44 + 38 + middleH
    + 36 + traitLines.length * 24 + (fusedLines.length ? 6 + fusedLines.length * 20 : 0)
    + (honorLines.length ? 44 + honorLines.length * 22 : 6)
    + 34
    + 38 + bioLines.length * 21
    + 52;

  const canvas = el('canvas');
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const c = canvas.getContext('2d');
  c.scale(SCALE, SCALE);

  /* ---- 背景與標頭 ---- */
  c.fillStyle = '#0d202b'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#d47559'; c.fillRect(0, 0, W, 4);
  c.textAlign = 'left';
  c.fillStyle = '#7c8f92'; c.font = `600 13px ${UI}`;
  c.fillText('電競人生 · LoL 職業選手生涯模擬', PAD, 50);

  let y = 100;
  c.fillStyle = '#d47559'; c.font = `700 36px ${UI}`;
  c.fillText(`${state.name}`, PAD, y); y += 44;
  c.fillStyle = 'rgba(255,255,255,.92)'; c.font = `600 16px ${UI}`;
  c.fillText(`${ROLE_NAMES[state.role]} · ${tierName(tier)} · ${state.year} 年`
    + `${state.demoEnded ? ` DEMO 結算（${state.age} 歲，${DEMO_YEARS} 個賽季）` : `退役（${state.age} 歲）`}`, PAD, y);
  y += 38;

  /* ---- 中段：左雷達圖、右數據表 ---- */
  const yMid = y;
  c.font = `600 13px ${UI}`; c.fillStyle = '#d9c05a';
  c.fillText('六維屬性', PAD, yMid + 18);
  c.fillText('生涯數據', COL_STAGE, yMid + 18);

  drawRadar(c, RADAR_CX, yMid + 46 + RADAR_R, RADAR_R, state);
  drawStatTable(c, yMid, buckets, total);
  y = yMid + middleH;

  /* ---- 特質 ---- */
  c.font = `600 13px ${UI}`; c.fillStyle = '#d9c05a';
  c.fillText('個人特質', PAD, y + 14); y += 36;
  c.font = `600 15px ${UI}`; c.fillStyle = 'rgba(255,255,255,.92)';
  for (const line of traitLines) { c.fillText(line, PAD, y); y += 24; }
  if (fusedLines.length) {
    y += 6;
    c.font = `400 13px ${UI}`; c.fillStyle = '#7c8f92';
    for (const line of fusedLines) { c.fillText(line, PAD, y); y += 20; }
  }

  /* ---- 頂級榮譽＋生涯總薪資 ---- */
  if (honorLines.length) {
    c.font = `600 13px ${UI}`; c.fillStyle = '#d9c05a';
    c.fillText('頂級榮譽', PAD, y + 16); y += 38;
    c.font = `400 15px ${UI}`; c.fillStyle = 'rgba(255,255,255,.92)';
    for (const line of honorLines) { c.fillText(line, PAD, y); y += 22; }
    y += 6;
  } else {
    y += 6;
  }
  c.font = `700 18px ${UI}`; c.fillStyle = '#d9c05a';
  c.fillText(`生涯總薪資 ${formatMoney(state.salary)} 台幣`, PAD, y); y += 34;

  /* ---- 生涯傳記 ---- */
  c.font = `600 13px ${UI}`; c.fillStyle = '#d9c05a';
  c.fillText('生涯傳記', PAD, y + 16); y += 38;
  c.font = `400 13px ${UI}`; c.fillStyle = 'rgba(255,255,255,.82)';
  for (const line of bioLines) { c.fillText(line, PAD, y); y += 21; }

  /* ---- 頁尾 ---- */
  c.fillStyle = '#7c8f92'; c.font = '12px monospace';
  c.textAlign = 'left';
  c.fillText(`seed: ${seed}`, PAD, H - 26);
  c.textAlign = 'right';
  c.fillText(appVersion, W - PAD, H - 26);

  const url = canvas.toDataURL('image/png');
  const fileName = `電競人生_${state.name}.png`;
  out.innerHTML = `<img src="${url}" alt="生涯結算圖" class="share-img">
    <div class="row2" style="margin-top:8px">
      <button class="btn main" data-act="save">💾 儲存 / 分享</button>
      <button class="btn" data-act="dl">下載到裝置</button>
    </div>`;

  const download = () => {
    const a = el('a', { href: url, download: fileName });
    document.body.appendChild(a); a.click(); a.remove();
  };
  out.querySelector('[data-act="dl"]').addEventListener('click', download);
  out.querySelector('[data-act="save"]').addEventListener('click', async () => {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], fileName, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '電競人生結算', text: `${escapeHtml(state.name)} 的電競人生` });
        return;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
    download();
  });
}

/** 六維屬性雷達圖：四圈網格＋六軸＋數值多邊形，頂點由 ATTRS 順序固定 */
function drawRadar(c, cx, cy, r, state) {
  const N = ATTRS.length;
  const pt = (i, rr) => {
    const a = ((i * 360) / N - 90) * (Math.PI / 180);
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  };

  c.strokeStyle = 'rgba(255,255,255,.12)';
  c.lineWidth = 1;
  for (let ring = 1; ring <= 4; ring++) {
    c.beginPath();
    for (let i = 0; i < N; i++) {
      const [x, yy] = pt(i, (r * ring) / 4);
      if (i) c.lineTo(x, yy); else c.moveTo(x, yy);
    }
    c.closePath();
    c.stroke();
  }
  c.strokeStyle = 'rgba(255,255,255,.07)';
  for (let i = 0; i < N; i++) {
    const [x, yy] = pt(i, r);
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, yy); c.stroke();
  }

  c.beginPath();
  ATTRS.forEach((key, i) => {
    const [x, yy] = pt(i, (r * state.attr[key]) / ATTR_CAP);
    if (i) c.lineTo(x, yy); else c.moveTo(x, yy);
  });
  c.closePath();
  c.fillStyle = 'rgba(212,117,89,.30)';
  c.fill();
  c.strokeStyle = '#d47559';
  c.lineWidth = 2;
  c.stroke();
  ATTRS.forEach((key, i) => {
    const [x, yy] = pt(i, (r * state.attr[key]) / ATTR_CAP);
    c.beginPath();
    c.arc(x, yy, 3, 0, Math.PI * 2);
    c.fillStyle = '#d9c05a';
    c.fill();
  });

  ATTRS.forEach((key, i) => {
    const a = ((i * 360) / N - 90) * (Math.PI / 180);
    const [lx, ly] = pt(i, r + 26);
    c.font = `600 12.5px ${UI}`;
    c.textAlign = Math.abs(Math.cos(a)) < 0.35 ? 'center' : (Math.cos(a) > 0 ? 'left' : 'right');
    c.fillStyle = 'rgba(255,255,255,.78)';
    c.fillText(`${ATTR_NAMES[key]} ${state.attr[key]}`, lx, ly + 4);
  });
}

/** 右欄數據表：階段／出賽／K-D-A／KDA 比值，末列為生涯合計 */
function drawStatTable(c, yMid, buckets, total) {
  const headY = yMid + 44;

  c.font = `600 12px ${UI}`;
  c.fillStyle = '#7c8f92';
  c.textAlign = 'left';
  c.fillText('階段', COL_STAGE, headY);
  c.textAlign = 'center';
  c.fillText('出賽', COL_G, headY);
  c.fillText('K / D / A', COL_KDA, headY);
  c.textAlign = 'right';
  c.fillText('KDA', COL_RATIO, headY);

  let y = headY + 28;
  c.font = `400 12.5px ${UI}`;
  for (const [b, s] of buckets) {
    c.textAlign = 'left';
    c.fillStyle = 'rgba(255,255,255,.92)';
    c.fillText(BUCKET_NAMES[b] || b, COL_STAGE, y);
    c.textAlign = 'center';
    c.fillText(`${s.G}`, COL_G, y);
    c.fillText(`${s.K}/${s.D}/${s.A}`, COL_KDA, y);
    c.textAlign = 'right';
    c.fillText(`${kdaOf(s)}`, COL_RATIO, y);
    y += 28;
  }

  c.strokeStyle = 'rgba(255,255,255,.14)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(COL_STAGE, y - 10);
  c.lineTo(COL_RATIO, y - 10);
  c.stroke();

  c.font = `600 13px ${UI}`;
  c.textAlign = 'left';
  c.fillStyle = '#d9c05a';
  c.fillText('合計', COL_STAGE, y);
  c.textAlign = 'center';
  c.fillText(`${total.G}`, COL_G, y);
  c.fillText(`${total.K}/${total.D}/${total.A}`, COL_KDA, y);
  c.textAlign = 'right';
  c.fillText(`${kdaOf(total)}`, COL_RATIO, y);
}
