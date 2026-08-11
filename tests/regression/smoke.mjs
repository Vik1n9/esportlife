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
   * 兩種打法的差距怎麼衡量，在改成六屬性之後換了指標。
   *
   * 九素質時代「平均分配」是災難（80 段裡 55 段淪為邊緣選手），但那個懲罰有一半來自
   * 每個位置有 2/9 的素質 OVR 權重為 0——平均分配等於把兩成的點直接丟掉。六屬性對
   * 每一路都有份量，那種「投錯格子」的浪費不存在了，而且權重和固定為 1、成本階梯是
   * 凸的，數學上平均分配拿到的就是平均值，集中反而要付更貴的單價。所以舊的斷言
   * （新手 0 座傳奇、新手的邊緣選手必須多於老手）在新模型下不可能成立，也不該成立。
   *
   * 留下來要守的是「加點仍然是個決策」：老手能穩定推到更高的巔峰，傳奇仍然罕見。
   */
  const avgPeak = (style) => runs
    .filter((r) => r.style === style)
    .reduce((t, r) => t + r.state.peakOvr, 0) / perStyle;
  const peakFocus = avgPeak('focus');
  const peakSpread = avgPeak('spread');

  check('老手打法：傳奇不得超過三成（舊版是人人傳奇）', tierCounts.focus[0] <= perStyle * 0.3, `傳奇 ${tierCounts.focus[0]}/${perStyle} 段`);
  check('新手打法：傳奇要罕見（不到老手的三分之一）',
    tierCounts.spread[0] * 3 <= tierCounts.focus[0], `傳奇 新手 ${tierCounts.spread[0]} vs 老手 ${tierCounts.focus[0]}`);
  check('加點仍是決策：老手的平均巔峰 OVR 至少高 1.5',
    peakFocus - peakSpread >= 1.5, `${peakFocus.toFixed(1)} vs ${peakSpread.toFixed(1)}`);
  check('五個等第都出現得到', TIER_NAMES.every((_, i) => tierCounts.focus[i] + tierCounts.spread[i] > 0), JSON.stringify(tierCounts));
}
