/**
 * 全生涯冒煙測試與評價分布。
 *
 * 這是唯一會跑滿整個矩陣的 suite，所以它把樣本放進 shared，後面的 suite 直接取用。
 */
import { playMatrix } from '../lib/harness.mjs';
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
   * 換成**國際賽冠軍當量**。理由是這才是加點準度真正兌現的地方：常規賽門檻低，
   * 練得糊也打得過；世界賽與 MSI 的對手強度是全聯盟頂端，位置戰力差幾點就會被吃掉。
   * 這也是賽馬娘式養成的老規矩——後期賽事把門檻拉高，前期偷懶的配點在那裡才現形。
   *
   * 這個指標穩得多：三組獨立種子量到的比值是 1.92 / 1.69 / 1.88 倍，
   * 而同樣三組的「生涯評分中位數」有兩組是新手贏，「國際賽出場數」只有 1.06～1.33 倍。
   * 門檻取 1.4 倍，比實測最低的 1.69 留兩成餘裕。
   */
  const avgPeak = (style) => runs
    .filter((r) => r.style === style)
    .reduce((t, r) => t + r.state.peakOvr, 0) / perStyle;
  const peakFocus = avgPeak('focus');
  const peakSpread = avgPeak('spread');

  // 世界冠 2 ／ 世界亞 1 ／ MSI 冠 1。三種都是稀有事件，合成一個當量才不會被單一項的雜訊帶走
  const intlCrowns = (style) => runs
    .filter((r) => r.style === style)
    .reduce((t, r) => t + r.state.worldsWins * 2 + r.state.worldsFinals + r.state.msiWins, 0) / perStyle;
  const intlFocus = intlCrowns('focus');
  const intlSpread = intlCrowns('spread');

  check('老手打法：傳奇不得超過三成（舊版是人人傳奇）', tierCounts.focus[0] <= perStyle * 0.3, `傳奇 ${tierCounts.focus[0]}/${perStyle} 段`);
  check('加點在頂端才兌現：老手的國際賽冠軍當量至少是新手的 1.4 倍',
    intlFocus >= intlSpread * 1.4,
    `老手 ${intlFocus.toFixed(2)} vs 新手 ${intlSpread.toFixed(2)}（${(intlFocus / (intlSpread || 1)).toFixed(2)} 倍）`);
  check('加點仍是決策：老手的平均巔峰 OVR 至少高 1.5',
    peakFocus - peakSpread >= 1.5, `${peakFocus.toFixed(1)} vs ${peakSpread.toFixed(1)}`);
  check('五個等第都出現得到', TIER_NAMES.every((_, i) => tierCounts.focus[i] + tierCounts.spread[i] > 0), JSON.stringify(tierCounts));
}
