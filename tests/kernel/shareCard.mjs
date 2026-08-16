/**
 * 結算圖版面不變式（`ui/summary.js` 的 `paintCard`）。
 *
 * 這條測試是 v4.6.6 的版面事故換來的：`drawStatTable` 畫完「合計」那列的 KDA
 * 之後，2D context 的 `textAlign` 停在 `'right'`；下半張卡（個人特質、榮譽、
 * 總薪資、生涯傳記）用的是裸 `fillText(line, PAD, y)`，於是每一段都被**右對齊
 * 到 x=40**，整片字畫到畫布左邊界之外——玩家存下來的圖只剩每行最後幾個字。
 * 沒有任何東西比對過落字位置，所以這個 bug 是靠肉眼看圖才發現的。
 *
 * 驗收線：
 *   1. 每一筆落字的水平範圍都在畫布內（0 ≤ 左緣、右緣 ≤ W）——版面跑掉必紅
 *   2. 每一筆落字都在畫布高度內，且內容不超過 `paintCard` 回報的末行基線
 *      （高度是兩趟渲染量出來的，量測回合與正式回合必須畫出同一份版面）
 *   3. 兩趟渲染的末行基線逐字相同——量測與繪製不得漂移
 *   4. 該進圖的關鍵字（選手名、段落標題、合計列、seed、版號）都真的落過筆
 *
 * ⚠ 這裡用假的 2D context：Node 沒有 Canvas，但 `paintCard` 只透過 context
 *    介面落字，錄下每一筆 `fillText` 的 x/y/對齊/字寬就足以驗版面。字寬用
 *    「全形 13px、半形 7px」近似——真實字體量出來的寬度不同，但版面是否越界
 *    差在數十 px 的量級，這個近似抓得住。
 */
import { createState } from '../../src/engine/state.js';
import { paintCard } from '../../src/ui/summary.js';

export const name = '結算圖版面不越界（paintCard）';

const W = 900;          // 與 summary.js 的畫布寬同號（那裡是 module 私有常數）

/** 假 2D context：只錄不畫。字寬近似全形 13px／半形 7px */
function fakeContext() {
  const calls = [];
  const c = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: 'left',
    calls,
    measureText: (s) => ({
      width: [...String(s)].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 13 : 7), 0),
    }),
    fillText(s, x, y) {
      calls.push({ text: String(s), x, y, align: this.textAlign, w: this.measureText(s).width });
    },
    fillRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() {}, rect() {}, roundRect() {}, fill() {}, stroke() {}, scale() {},
  };
  return c;
}

/** 落字的水平範圍，依對齊方式換算 */
function span({ x, w, align }) {
  if (align === 'right') return [x - w, x];
  if (align === 'center') return [x - w / 2, x + w / 2];
  return [x, x + w];
}

/** 一份「已退役、可結算」的 state：三個賽區都有出賽數，特質與榮譽都不空 */
function retiredState() {
  const s = createState({ name: '陳「Nightowl」柏宇', role: 'MID', seed: 'share-card', stage: 'PRO' });
  s.done = true;
  s.year = 2036;
  s.age = 28;
  s.proYears = 12;
  s.salary = 52000;
  s.worldsWins = 2;
  s.msiWins = 1;
  s.splitTitles = 5;
  s.honors = ['2032 世界賽冠軍', '2033 MSI 冠軍'];
  s.fusedAway = ['鏡頭感', '人氣選手'];
  s.retireReason = '狀態下滑，2036 年掛靴。';
  const bucket = (over) => ({
    years: 3, G: 0, W: 0, L: 0, K: 0, D: 0, A: 0, CS: 0, VIS: 0, DMG: 0, SOLO: 0, MVP: 0, AS: 0, ...over,
  });
  s.stats = {
    AMATEUR: bucket({ G: 24, W: 14, L: 10, K: 68, D: 41, A: 102, MVP: 3 }),
    HOME: bucket({ G: 312, W: 190, L: 122, K: 1042, D: 688, A: 954, MVP: 41 }),
    INTL: bucket({ G: 186, W: 96, L: 90, K: 517, D: 402, A: 601, MVP: 12 }),
  };
  return s;
}

export async function run({ check, log }) {
  const state = retiredState();
  const data = { state, tier: 'legend', seed: '8f3a21c9', appVersion: 'v9.9.9' };

  const probe = fakeContext();
  const baseline = paintCard(probe, data, 0);
  const H = Math.ceil(baseline) + 52;

  const real = fakeContext();
  const baseline2 = paintCard(real, data, H);

  check('兩趟渲染的末行基線相同', baseline === baseline2, `量測 ${baseline}／正式 ${baseline2}`);
  check('末行基線是正數', baseline > 0, `讀到 ${baseline}`);
  check('正式回合有落字', real.calls.length > 20, `只有 ${real.calls.length} 筆`);

  const outLeft = real.calls.filter((k) => span(k)[0] < 0);
  const outRight = real.calls.filter((k) => span(k)[1] > W);
  check('沒有落字被畫到畫布左界之外', outLeft.length === 0,
    outLeft.slice(0, 3).map((k) => `「${k.text}」x=${k.x}(${k.align})`).join('／'));
  check('沒有落字被畫到畫布右界之外', outRight.length === 0,
    outRight.slice(0, 3).map((k) => `「${k.text}」x=${k.x}(${k.align})`).join('／'));

  const outTop = real.calls.filter((k) => k.y <= 0);
  const outBottom = real.calls.filter((k) => k.y > H);
  check('沒有落字被畫到畫布上界之外', outTop.length === 0, `${outTop.length} 筆`);
  check('沒有落字被畫到畫布下界之外', outBottom.length === 0, `${outBottom.length} 筆`);

  // 頁尾以外的內容都得落在末行基線之上——否則兩趟量高度就沒對到同一份版面
  const footer = real.calls.filter((k) => k.text.startsWith('seed:') || k.text === data.appVersion);
  const spill = real.calls.filter((k) => !footer.includes(k) && k.y > baseline);
  check('頁尾以外的內容不超出末行基線', spill.length === 0,
    spill.slice(0, 3).map((k) => `「${k.text}」y=${k.y} > ${baseline}`).join('／'));
  check('頁尾兩格（seed／版號）都畫了', footer.length === 2, `讀到 ${footer.length} 筆`);

  const drawn = real.calls.map((k) => k.text);
  for (const want of [state.name, '六維屬性', '生涯數據', '個人特質', '生涯傳記', '合計',
    '世界賽冠軍', 'MSI 冠軍', '賽段冠軍', `seed: ${data.seed}`, data.appVersion]) {
    check(`結算圖印出「${want}」`, drawn.includes(want));
  }

  // 榮譽計數列只列有拿到的：獨有特質那一格沒拿到就整格不出現
  const noTitle = retiredState();
  noTitle.worldsWins = 0; noTitle.msiWins = 0; noTitle.splitTitles = 0;
  for (const s of Object.values(noTitle.stats)) s.MVP = 0;
  const bare = fakeContext();
  paintCard(bare, { ...data, state: noTitle }, 0);
  const bareText = bare.calls.map((k) => k.text);
  check('沒拿過冠軍就不印榮譽計數列', !bareText.includes('世界賽冠軍') && !bareText.includes('賽段冠軍'));
  check('沒拿過冠軍仍然印得出生涯傳記', bareText.includes('生涯傳記'));

  log(`結算圖 ${W}×${H}｜落字 ${real.calls.length} 筆｜末行基線 ${baseline}`);
}
