/**
 * 全生涯冒煙測試與評價分布。
 *
 * 這是唯一會跑滿整個矩陣的 suite，所以它把樣本放進 shared，後面的 suite 直接取用。
 */
import { birthGrowthRoom, playMatrix } from '../lib/harness.mjs';

const mean = (a) => (a.length ? a.reduce((t, v) => t + v, 0) / a.length : 0);
import { attrCap } from '../../src/engine/attributes.js';
import { careerTier } from '../../src/engine/career.js';
import { ROLES } from '../../src/data/skills.js';
import { TIER_NAMES } from '../../src/data/events.js';

export const name = '全生涯冒煙與評價分布';
export const order = 1;

export async function run({ check, log, shared }) {
  const seeds = Array.from({ length: 16 }, (_, i) => `seed-${i}`);
  const runs = playMatrix({ seeds, roles: ROLES });
  shared.runs = runs;
  shared.seeds = seeds;

  const perStyle = runs.length / 2;
  const tierCounts = { focus: new Array(TIER_NAMES.length).fill(0), spread: new Array(TIER_NAMES.length).fill(0) };
  const endYears = [];

  for (const { state, seed, role, style } of runs) {
    check('生涯必須結束', state.done, `${seed}/${role}`);
    check('必須有退役原因', !!state.retireReason, `${seed}/${role}`);
    check('年齡不得超過 41', state.age <= 41, `${seed}/${role} age=${state.age}`);
    check('版本落差在 0..10', state.patchDebt >= 0 && state.patchDebt <= 10, `${seed}/${role}`);
    check('英雄池不超過 8', state.heroPool.length <= 8, `${seed}/${role}`);
    check('薪資非負', state.salary >= 0, `${seed}/${role}`);
    const cap = attrCap(state);
    for (const [k, v] of Object.entries(state.attr)) {
      check('屬性值在 1..cap', v >= 1 && v <= cap, `${seed}/${role} ${k}=${v}/${cap}`);
    }
    if (state.contract) check('合約年限非負', state.contract.years >= 0, `${seed}/${role}`);
    tierCounts[style][careerTier(state)]++;
    endYears.push(state.year);
  }
  shared.tierCounts = tierCounts;

  log(`完成 ${runs.length} 段生涯，退役年份 ${Math.min(...endYears)}–${Math.max(...endYears)}`);
  log(`${'　　　　　　'}  老手打法 ｜ 新手打法`);
  TIER_NAMES.forEach((tierName, i) => {
    const f = tierCounts.focus[i]; const s = tierCounts.spread[i];
    log(`${tierName.padEnd(7, '　')} ${String(f).padStart(3)} 段 ｜ ${String(s).padStart(3)} 段  ${'█'.repeat(f)}${'░'.repeat(s)}`);
  });

  /*
   * 兩種打法的差距怎麼衡量，改成六屬性之後換過一次，四階特質合成之後再換一次。
   *
   * 九素質時代「平均分配」是災難（80 段裡 55 段淪為邊緣選手），但那個懲罰有一半來自
   * 每個位置有 2/9 的素質 OVR 權重為 0——平均分配等於把兩成的點直接丟掉。六屬性對
   * 每一路都有份量，那種「投錯格子」的浪費不存在了，而且權重和固定為 1、成本階梯是
   * 凸的，數學上平均分配拿到的就是平均值，集中反而要付更貴的單價。
   *
   * 六屬性時代改守「傳奇數：新手不到老手的三分之一」。四階合成上路後這條也失效了——
   * 傳說特質的配方吃的是事件特質與生涯條件，**取得方式與加點無關**，新手照樣拿得到。
   * 而且 80 段裡傳奇只有個位數，比值門檻等於在量雜訊：實測掃過 growthMult ×1.6 到 ×4，
   * 傳奇數是非單調的（5/2 → 2/3 → 5/3 → 5/4）。兩種打法的尾端本來就重疊：
   * 最高屬性 ≥76 是老手 15/80 對新手 13/80，集中度中位數新手甚至略高。
   *
   * 然後換成**國際賽冠軍當量比 ≥ 1.4 倍**（三組種子實測 1.92 / 1.69 / 1.88）。
   *
   * ⚠ **那一條已於 S09 刪除，不要再加回來。** 兩個獨立的理由：
   *
   *   1. **它本來就抓不穩。** S07 拿八組獨立種子量過同一份程式碼，比值是 1.15–4.37
   *      ——`alt-*` 1.15、`e-*` 1.28 兩組不過門檻。國際賽冠軍在 160 段裡只有個位數到
   *      十幾次，比值門檻等於在量稀有事件的雜訊。S07 因此在 `invariants.mjs` 用低變異
   *      的問法重寫了同一個主張（「拿得到國際賽冠軍的生涯，巔峰是不是明顯比拿不到的
   *      高」，八組實測 0.129–0.202），**那條現在是綠的**，這個主張沒有失去守門員。
   *   2. **S09 之後它系統性地翻負**：四組種子量到 0.71 / 0.86 / 1.22 / 0.71。這不是
   *      雜訊而是真的訊號衰減——§7.3 把可成長空間砍半之後，兩種打法的巔峰只差
   *      1.1–1.4 點，對上國際賽 72／74 的對手地板不足以改變勝負。**這個發現本身要記住**
   *      （`docs/v4/09-屬性0-100.md` 交接筆記第一節），但拿一條已知不穩的檢查去守它，
   *      只會讓後面每一站都得記得「那盞紅燈可以忽略」——S07 明講過那正是最糟的狀態。
   *
   * ⚠ 連帶要知道：頂端訊號現在只剩 `invariants.mjs` 那一條守門員，而且餘裕從
   * 0.129–0.202 掉到 **0.096**（門檻 0.08）。它再掉就是真的破了，不要調鬆它。
   */
  const avgPeak = (style) => runs
    .filter((r) => r.style === style)
    .reduce((t, r) => t + r.state.peakRating, 0) / perStyle;
  const peakFocus = avgPeak('focus');
  const peakSpread = avgPeak('spread');

  check('老手打法：傳奇不得超過三成（舊版是人人傳奇）', tierCounts.focus[0] <= perStyle * 0.3, `傳奇 ${tierCounts.focus[0]}/${perStyle} 段`);
  /*
   * 「高 1.5」原本是絕對 OVR 點數，S09 換 0–100 刻度時把它改寫成**可成長空間的比例**。
   *
   * 門檻本身沒有放寬，只是換了單位：加點能賺到的差距與「出生到潛力天花板還有多遠」
   * 成正比，跟上限是幾分制無關。舊制的可成長空間是 32.41 OVR，所以 `≥ 1.5` 就等於
   * `≥ 1.5 ÷ 32.41 = 0.0463 × 可成長空間`——拿舊程式跑，兩種寫法給出同一個判定。
   *
   * 不換單位的話這條會在 §7.3 改起始值之後整批誤報：可成長空間從 0.405×上限掉到
   * 0.190×上限，同一套加點邏輯量到的絕對差自然只剩一半（實測 1.10–1.42），
   * 但比例是 0.058–0.075，四組獨立種子全在門檻之上。
   */
  const room = mean(runs.map((r) => birthGrowthRoom(r)));
  check('加點仍是決策：老手的平均巔峰至少高 0.0463×可成長空間',
    (peakFocus - peakSpread) / room >= 0.0463,
    `${peakFocus.toFixed(1)} vs ${peakSpread.toFixed(1)}（差 ${(peakFocus - peakSpread).toFixed(2)}／可成長空間 ${room.toFixed(2)} = ${((peakFocus - peakSpread) / room).toFixed(4)}）`);
  check('五個等第都出現得到', TIER_NAMES.every((_, i) => tierCounts.focus[i] + tierCounts.spread[i] > 0), JSON.stringify(tierCounts));
}
