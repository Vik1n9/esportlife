/**
 * 生涯結算：檔案卡、數據表、榮譽、粉絲留言、分享圖。
 *
 * 這裡不印巔峰評價（V4 §10.1：教練評價是內部值，玩家從頭到尾看不到那個數字）。
 * `engine/career.js` 的生涯評分仍然吃 `state.peakRating`——那是 §10.3 明文允許的，
 * 結算分數本來就要有個單一尺度，但玩家看到的是「評分與等第」而不是評價本身。
 */
import { DEMO_YEARS } from '../data/eras.js';
import { ROLE_NAMES } from '../data/skills.js';
import { FAN_QUOTES } from '../data/events.js';
import { BUCKET_NAMES } from '../data/leagues.js';
import { buildBiography } from '../engine/biography.js';
import { careerScore, tierName } from '../engine/career.js';
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
 * 結算圖。舊版在 fillText 之後才設 textAlign，第一行標題永遠對不齊，
 * 且畫布高度寫死 420 但只畫到 200，下半截空白。這裡改成先量後畫。
 */
function drawShareImage(out, { state, tier, seed, appVersion }) {
  const W = 900; const PAD = 40; const SCALE = 2;
  const lines = [
    ['big', `${state.name}`],
    ['sub', `${ROLE_NAMES[state.role]} · ${tierName(tier)} · ${state.year} 年`
      + `${state.demoEnded ? ` DEMO 結算（${state.age} 歲，${DEMO_YEARS} 個賽季）` : `退役（${state.age} 歲）`}`],
    ['gap', ''],
    ['row', `世界賽冠軍 ${state.worldsWins}　MSI 冠軍 ${state.msiWins}　職業年資 ${state.proYears} 季`],
    ['row', `賽段冠軍 ${state.splitTitles}　例行賽 MVP ${state.honors.filter((h) => h.includes('例行賽 MVP')).length} 次`],
    ['gold', `生涯總薪資 ${formatMoney(state.salary)} 台幣`],
  ];
  const topHonors = state.honors.filter((h) => /世界賽冠軍|MSI 冠軍|改寫歷史/.test(h)).slice(0, 4);
  if (topHonors.length) { lines.push(['gap', '']); for (const h of topHonors) lines.push(['row', `· ${h}`]); }

  // 先量再畫：畫布高度由實際行高累加而來，才不會像舊版一樣留下半張空白
  const LINE_HEIGHT = { big: 44, sub: 34, gold: 34, row: 30, gap: 12 };
  const contentHeight = lines.reduce((sum, [kind]) => sum + LINE_HEIGHT[kind], 0);
  const H = 100 + contentHeight + 56;
  const canvas = el('canvas');
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const c = canvas.getContext('2d');
  c.scale(SCALE, SCALE);

  c.fillStyle = '#0A1428'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#C89B3C'; c.fillRect(0, 0, W, 4);

  c.textAlign = 'left';
  c.fillStyle = '#A09B8C'; c.font = '700 14px Rajdhani, sans-serif';
  c.fillText('電競人生 · LoL 職業選手生涯模擬', PAD, 50);

  let y = 100;
  for (const [kind, text] of lines) {
    if (kind === 'gap') { y += 12; continue; }
    if (kind === 'big') { c.fillStyle = '#C89B3C'; c.font = '900 40px Cinzel, sans-serif'; c.fillText(text, PAD, y); y += 44; continue; }
    if (kind === 'sub') { c.fillStyle = '#F0E6D2'; c.font = '600 17px Rajdhani, sans-serif'; c.fillText(text, PAD, y); y += 34; continue; }
    if (kind === 'gold') { c.fillStyle = '#C89B3C'; c.font = '800 20px Rajdhani, sans-serif'; c.fillText(text, PAD, y); y += 34; continue; }
    c.fillStyle = '#F0E6D2'; c.font = '500 16px Rajdhani, sans-serif'; c.fillText(text, PAD, y); y += 30;
  }

  c.fillStyle = '#A09B8C'; c.font = '12px monospace';
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
