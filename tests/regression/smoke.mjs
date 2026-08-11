/**
 * 全生涯冒煙測試與評價分布。
 *
 * 這是唯一會跑滿整個矩陣的 suite，所以它把樣本放進 shared，後面的 suite 直接取用。
 */
import { playMatrix } from '../lib/harness.mjs';
import { abilityCap } from '../../src/engine/abilities.js';
import { careerTier } from '../../src/engine/career.js';
import { ROLES } from '../../src/data/abilities.js';
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
    const cap = abilityCap(state);
    for (const [k, v] of Object.entries(state.ability)) {
      check('能力值在 1..cap', v >= 1 && v <= cap, `${seed}/${role} ${k}=${v}/${cap}`);
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

  check('老手打法：傳奇不得超過三成（舊版是人人傳奇）', tierCounts.focus[0] <= perStyle * 0.3, `傳奇 ${tierCounts.focus[0]}/${perStyle} 段`);
  check('新手打法：不該出現傳奇', tierCounts.spread[0] === 0, `傳奇 ${tierCounts.spread[0]} 段`);
  check('打法要拉得開差距', tierCounts.spread[4] > tierCounts.focus[4], `邊緣 新手 ${tierCounts.spread[4]} vs 老手 ${tierCounts.focus[4]}`);
  check('五個等第都出現得到', TIER_NAMES.every((_, i) => tierCounts.focus[i] + tierCounts.spread[i] > 0), JSON.stringify(tierCounts));
}
