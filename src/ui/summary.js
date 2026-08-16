/**
 * 生涯結算：檔案卡、數據表、榮譽、粉絲留言、分享圖。
 *
 * 這裡不印巔峰評價（V4 §10.1：教練評價是內部值，玩家從頭到尾看不到那個數字）。
 * `engine/career.js` 的生涯評分仍然吃 `state.peakRating`——那是 §10.3 明文允許的，
 * 結算分數本來就要有個單一尺度，但玩家看到的是「評分與等第」而不是評價本身。
 */
import { ATTR_CAP, ATTR_NAMES, ATTRS } from '../data/attributes.js';
import { AWARDS, awardCount } from '../data/awards.js';
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
 * 結算圖（轉播選手卡）。版面由上而下：
 *
 *   橘金頂線／作品名／選手名（大字橘金）／位置 · 等第 · 退役年（歲）
 *   ┌ 六維屬性雷達圖 ┐ ┌ 生涯數據表                        ┐  ← 兩張等高並排面板
 *   │                │ │ 各賽區出賽／K-D-A／KDA，末列合計   │
 *   │                │ │ 世界賽冠軍 N  MSI 冠軍 N  賽段冠軍 N│
 *   └                ┘ └ 例行賽 MVP N 次   單場 MVP N 次    ┘
 *   個人特質（依五階配色，被合成者灰字劃線）
 *   生涯總薪資 N 億台幣
 *   生涯傳記（buildBiography 五段，逐行換行，最多 BIO_MAX_LINES 行）
 *   seed: xxxx                                              vX.Y.Z
 *
 * ⚠ 所有落字一律走 `text()`，由它逐次設定 font／fillStyle／textAlign。
 *    v4.6.6 的版面跑掉就是裸 `fillText` 吃到別人留下的狀態：`drawStatTable`
 *    畫完「合計」的 KDA 後 textAlign 停在 'right'，下半張卡的每一段都被右對齊
 *    到 x=PAD，整片字畫到畫布左邊界之外。不要再用裸的 fillText。
 *
 * ⚠ 高度用兩趟渲染求得（先在暫存 context 跑一次同一份 `paintCard` 拿到末行基線，
 *    再開實際畫布畫第二次），不再手抄一份高度算式——手抄本遲早跟繪製漂移。
 *
 * ⚠ KDA 比值走 `ledger.kdaOf`（D=0 回 K+A），結算圖不直接除 raw 欄位。
 */
const W = 900; const PAD = 40; const SCALE = 2;
const FULL_W = W - PAD * 2;
const FOOT_H = 52;                    // 末行基線到畫布底緣：頁尾就落在這段留白裡
const BIO_MAX_LINES = 8;

// 面板與表格的 x 座標（單一來源，避免各處手抄漂移）
const L_X = PAD; const L_X2 = 392;    // 左面板：六維雷達
const R_X = 404; const R_X2 = W - PAD; // 右面板：生涯數據
const RADAR_R = 104; const RADAR_CX = (L_X + L_X2) / 2;
const COL_STAGE = R_X + 20; const COL_G = COL_STAGE + 148;
const COL_KDA = COL_STAGE + 278; const COL_RATIO = R_X2 - 20;
const ROW_H = 34;                     // 數據表列距：一行一個賽區，拉開才讀得順
const SUM_GAP = 12;                   // 分隔線與「合計」列之間額外讓開的一段
const HONOR_GAP = 22;                 // 「合計」列與榮譽計數之間的留白
const HONOR_ROW_H = 30;               // 榮譽計數列距（一行放不下就折行）
const PANEL_INSET = 20;               // 面板內縮：內容與框線之間的留白

const UI = "'Inter','Noto Sans TC',sans-serif";
const F_SECTION = `600 13px ${UI}`;   // 段落標題（金）
const F_TRAIT = `600 15px ${UI}`;
const F_HONOR_LABEL = `400 13px ${UI}`;
const F_HONOR_VALUE = `700 17px ${UI}`;
const F_BIO = `400 13px ${UI}`;

const C_BG = '#0d202b';
const C_ACCENT = '#d47559';
const C_GOLD = '#d9c05a';
const C_GHOST = '#7c8f92';
const C_INK = 'rgba(255,255,255,.92)';
const C_DIM = 'rgba(255,255,255,.82)';
const C_LINE = 'rgba(255,255,255,.14)';

// 特質五階配色，對齊 styles.css 的 --legendary/--unique/--epic/--rare
const TRAIT_COLORS = {
  legendary: '#ffd166', unique: '#e08a63', epic: '#c45dd6', rare: '#7cc4ff', common: C_INK,
};

/** 唯一的落字入口：font／色／對齊每次都設滿，不繼承前一筆留下的 context 狀態 */
function text(c, s, x, y, font, color, align = 'left') {
  c.font = font; c.fillStyle = color; c.textAlign = align;
  c.fillText(s, x, y);
}

function drawShareImage(out, { state, tier, seed, appVersion }) {
  const data = { state, tier, seed, appVersion };

  // 第一趟：暫存 context 只為量出末行基線（畫超出 300×150 的部分自然被丟棄）
  const H = Math.ceil(paintCard(el('canvas').getContext('2d'), data, 0)) + FOOT_H;

  const canvas = el('canvas');
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const c = canvas.getContext('2d');
  c.scale(SCALE, SCALE);
  paintCard(c, data, H);

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

/**
 * 把整張卡畫進 `c`，回傳最後一行的基線 y。
 *
 * `H` 為 0 表示這是量測回合：底色與頁尾要靠畫布高度定位，該回合先跳過，
 * 其餘一律照畫——量測與正式回合共用同一段程式，版面就不可能對不上。
 *
 * 對外只為 `tests/kernel/shareCard.mjs`：它拿假的 2D context 錄下每一筆落字，
 * 驗每個字都還在畫布裡（版面跑掉就是有字被畫到界外，那條測試守的就是這件事）。
 */
export function paintCard(c, { state, tier, seed, appVersion }, H) {
  const buckets = Object.entries(state.stats).filter(([, s]) => s.G > 0);
  const total = { G: 0, K: 0, D: 0, A: 0 };
  for (const [, s] of buckets) for (const k of ['G', 'K', 'D', 'A']) total[k] += s[k];

  const traitLines = layoutTokens(c, traitTokens(state), F_TRAIT, FULL_W);
  // 榮譽計數住在右面板裡（冠軍與 MVP 都是生涯數據的一部分），寬度吃面板內寬
  const honorLines = layoutHonors(c, honorCells(state, buckets), R_X2 - R_X - PANEL_INSET * 2);
  const bioLines = buildBiography(state)
    .flatMap((p) => wrapLines(c, p, F_BIO, FULL_W))
    .slice(0, BIO_MAX_LINES);

  /* ---- 背景與橘金頂線 ---- */
  c.fillStyle = C_BG; c.fillRect(0, 0, W, H);
  c.fillStyle = C_ACCENT; c.fillRect(0, 0, W, 4);

  /* ---- 標頭 ---- */
  text(c, '電競人生 · LoL 職業選手生涯模擬', PAD, 50, F_SECTION, C_GHOST);
  text(c, state.name, PAD, 100, `700 36px ${UI}`, C_ACCENT);
  // DEMO 期滿（§19，S21b）不是退役——同一張卡只換這一行的說法
  const ending = state.demoEnded
    ? `${state.year} 年 DEMO 結算（${state.age} 歲 · ${DEMO_YEARS} 個賽季）`
    : `${state.year} 年退役（${state.age} 歲）`;
  text(c, `${ROLE_NAMES[state.role]} · ${tierName(tier)} · ${ending}`, PAD, 144, `600 16px ${UI}`, C_INK);

  /* ---- 中段：左雷達、右數據表，兩張等高面板 ---- */
  const panelTop = 178;
  const panelH = Math.max(
    RADAR_R * 2 + 126,                              // 標題＋上下軸標籤＋圖
    statTableH(buckets.length, honorLines.length),  // 標題＋表頭＋各列＋合計＋榮譽計數
  );
  panel(c, L_X, panelTop, L_X2 - L_X, panelH);
  panel(c, R_X, panelTop, R_X2 - R_X, panelH);
  text(c, '六維屬性', L_X + PANEL_INSET, panelTop + 24, F_SECTION, C_GOLD);
  text(c, '生涯數據', COL_STAGE, panelTop + 24, F_SECTION, C_GOLD);
  drawRadar(c, RADAR_CX, panelTop + RADAR_R + 78, RADAR_R, state);
  drawStatTable(c, panelTop, buckets, total, honorLines);

  /* ---- 個人特質 ---- */
  let y = panelTop + panelH + 34;
  text(c, '個人特質', PAD, y, F_SECTION, C_GOLD);
  for (const line of traitLines) { y += 26; drawTokenLine(c, line, PAD, y, F_TRAIT); }

  /* ---- 生涯總薪資 ---- */
  y += 38;
  text(c, `生涯總薪資 ${formatMoney(state.salary)} 台幣`, PAD, y, `700 18px ${UI}`, C_GOLD);

  /* ---- 生涯傳記 ---- */
  y += 44;
  text(c, '生涯傳記', PAD, y, F_SECTION, C_GOLD);
  for (const line of bioLines) { y += 21; text(c, line, PAD, y, F_BIO, C_DIM); }

  /* ---- 頁尾（量測回合沒有畫布高度可定位，略過） ---- */
  if (H) {
    text(c, `seed: ${seed}`, PAD, H - 26, '12px monospace', C_GHOST);
    text(c, appVersion, W - PAD, H - 26, '12px monospace', C_GHOST, 'right');
  }
  return y;
}

/** 面板外框：極淡底色＋一條髮絲邊，圓角在沒有 roundRect 的環境退回直角 */
function panel(c, x, y, w, h) {
  c.beginPath();
  if (c.roundRect) c.roundRect(x, y, w, h, 10); else c.rect(x, y, w, h);
  c.fillStyle = 'rgba(255,255,255,.03)'; c.fill();
  c.strokeStyle = C_LINE; c.lineWidth = 1; c.stroke();
}

/** 中文沒有詞邊界，換行逐字量寬 */
function wrapLines(c, s, font, maxW) {
  c.font = font;
  const lines = [];
  let line = '';
  for (const ch of s) {
    if (line && c.measureText(line + ch).width > maxW) { lines.push(line); line = ch; } else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

/** 特質標籤：依五階配色，被合成掉的排在最後、灰字待劃線 */
function traitTokens(state) {
  const held = activeTraitNames(state);
  const tokens = [
    ...TIER_DISPLAY_ORDER.flatMap((t) => (held[t] || [])
      .map((n) => ({ label: `〔${n}〕`, color: TRAIT_COLORS[t] || C_INK, gone: false }))),
    ...state.fusedAway.map((n) => ({ label: `〔${n}〕`, color: C_GHOST, gone: true })),
  ];
  return tokens.length ? tokens : [{ label: '（無）', color: C_INK, gone: false }];
}

/** 逐顆標籤排進行內，超寬就換行；回傳每行的 {label,color,gone,dx,w} */
function layoutTokens(c, tokens, font, maxW) {
  c.font = font;
  const lines = [];
  let line = []; let x = 0;
  for (const t of tokens) {
    const w = c.measureText(t.label).width;
    if (line.length && x + w > maxW) { lines.push(line); line = []; x = 0; }
    line.push({ ...t, dx: x, w });
    x += w + 4;
  }
  if (line.length) lines.push(line);
  return lines;
}

function drawTokenLine(c, line, x0, y, font) {
  for (const t of line) {
    text(c, t.label, x0 + t.dx, y, font, t.color);
    if (!t.gone) continue;
    c.strokeStyle = t.color; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x0 + t.dx + 2, y - 5);
    c.lineTo(x0 + t.dx + t.w - 2, y - 5);
    c.stroke();
  }
}

/**
 * 榮譽計數列：只列有拿到的，零的那一格整格不出現。
 *
 * 兩種 MVP 是兩回事，所以兩格都列：
 *   - **例行賽 MVP**：一個聯賽一年只有一個人拿得到的年度獎（`phases/seasonEnd.js`）。
 *     依名目計數走 `awardCount`（milestones 帳本），不去 `honors` 做子字串比對。
 *   - **單場 MVP**：每場結算累加的 `stat.MVP`（`engine/season.js`），是次數不是獎項。
 */
function honorCells(state, buckets) {
  const gameMvp = buckets.reduce((n, [, s]) => n + s.MVP, 0);
  const seasonMvp = awardCount(state, AWARDS.REGULAR_MVP);
  return [
    { label: '世界賽冠軍', n: state.worldsWins, value: `${state.worldsWins}` },
    { label: 'MSI 冠軍', n: state.msiWins, value: `${state.msiWins}` },
    { label: '賽段冠軍', n: state.splitTitles, value: `${state.splitTitles}` },
    { label: AWARDS.REGULAR_MVP, n: seasonMvp, value: `${seasonMvp} 次` },
    { label: '單場 MVP', n: gameMvp, value: `${gameMvp} 次` },
  ].filter((cell) => cell.n > 0);
}

function layoutHonors(c, cells, maxW) {
  const lines = [];
  let line = []; let x = 0;
  for (const cell of cells) {
    c.font = F_HONOR_LABEL; const wl = c.measureText(cell.label).width;
    c.font = F_HONOR_VALUE; const w = wl + 8 + c.measureText(cell.value).width;
    if (line.length && x + w > maxW) { lines.push(line); line = []; x = 0; }
    line.push({ ...cell, dx: x, wl });
    x += w + 26;
  }
  if (line.length) lines.push(line);
  return lines;
}

function drawHonorLine(c, line, x0, y) {
  for (const cell of line) {
    text(c, cell.label, x0 + cell.dx, y, F_HONOR_LABEL, C_GHOST);
    text(c, cell.value, x0 + cell.dx + cell.wl + 8, y, F_HONOR_VALUE, C_GOLD);
  }
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
    const align = Math.abs(Math.cos(a)) < 0.35 ? 'center' : (Math.cos(a) > 0 ? 'left' : 'right');
    text(c, `${ATTR_NAMES[key]} ${state.attr[key]}`, lx, ly + 4, `600 12.5px ${UI}`, 'rgba(255,255,255,.78)', align);
  });
}

/**
 * 右面板要多高：標題＋表頭＋各賽區列＋合計，再加榮譽計數列（沒有就不佔位）。
 * 與 `drawStatTable` 的落點同一份算式，改列距只要改 ROW_H／HONOR_* 這幾個常數。
 */
function statTableH(rows, honorRows) {
  return 56 + (rows + 1) * ROW_H + SUM_GAP
    + (honorRows ? HONOR_GAP + honorRows * HONOR_ROW_H : 0)
    + PANEL_INSET;
}

/**
 * 右面板數據表：階段／出賽／K-D-A／KDA 比值，末列為生涯合計，
 * 合計之下接榮譽計數（冠軍與 MVP 也是生涯數據的一部分，不另開段落）。
 */
function drawStatTable(c, panelTop, buckets, total, honorLines = []) {
  const headY = panelTop + 56;
  const head = `600 12px ${UI}`;
  text(c, '階段', COL_STAGE, headY, head, C_GHOST);
  text(c, '出賽', COL_G, headY, head, C_GHOST, 'center');
  text(c, 'K / D / A', COL_KDA, headY, head, C_GHOST, 'center');
  text(c, 'KDA', COL_RATIO, headY, head, C_GHOST, 'right');

  let y = headY + ROW_H;
  const row = `400 12.5px ${UI}`;
  for (const [b, s] of buckets) {
    text(c, BUCKET_NAMES[b] || b, COL_STAGE, y, row, C_INK);
    text(c, `${s.G}`, COL_G, y, row, C_INK, 'center');
    text(c, `${s.K}/${s.D}/${s.A}`, COL_KDA, y, row, C_INK, 'center');
    text(c, `${kdaOf(s)}`, COL_RATIO, y, row, C_INK, 'right');
    y += ROW_H;
  }

  // 分隔線貼著最後一列的下緣，「合計」再往下讓開 SUM_GAP——線壓著字讀起來很擠
  const ruleY = y - ROW_H + 14;
  c.strokeStyle = C_LINE;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(COL_STAGE, ruleY);
  c.lineTo(COL_RATIO, ruleY);
  c.stroke();

  y += SUM_GAP;
  const sum = `600 13px ${UI}`;
  text(c, '合計', COL_STAGE, y, sum, C_GOLD);
  text(c, `${total.G}`, COL_G, y, sum, C_GOLD, 'center');
  text(c, `${total.K}/${total.D}/${total.A}`, COL_KDA, y, sum, C_GOLD, 'center');
  text(c, `${kdaOf(total)}`, COL_RATIO, y, sum, C_GOLD, 'right');

  // 冠軍與 MVP 接在合計之下——它們也是生涯數據，不必為此另開一個段落
  y += HONOR_GAP;
  for (const line of honorLines) {
    y += HONOR_ROW_H;
    drawHonorLine(c, line, COL_STAGE, y);
  }
}
