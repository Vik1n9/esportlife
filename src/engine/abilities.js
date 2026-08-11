/** 能力值計算：OVR、成長成本、加點、年齡衰退、退役上限。純函式（會就地修改 state.ability）。 */
import { clamp } from '../core/rng.js';
import {
  ABILITY_CAP, ABILITY_CAP_GODHAND, GROWTH_COST,
  OVER_POTENTIAL_MULTIPLIER, OVR_WEIGHTS, ROLE_ABILITIES,
} from '../data/abilities.js';

export function abilityCap(state) {
  return state.epic.godhand ? ABILITY_CAP_GODHAND : ABILITY_CAP;
}

/** 位置加權 OVR（不含版本落差懲罰） */
export function ovr(state) {
  const w = OVR_WEIGHTS[state.role] || {};
  let v = 0;
  for (const [k, p] of Object.entries(w)) v += (state.ability[k] || 0) * p;
  if (state.epic.godhand) v += 2;
  if (state.epic.ageless && state.age >= 30) v += 1;
  return Math.round(v);
}

/**
 * 版本落差懲罰。英雄池越廣越能吸收版本變動。
 * 舊版把「版本補習成功」也算成 metaCount，好結果反而變懲罰——已修正。
 */
export function patchPenalty(state) {
  if (state.epic.prophet) return 0;
  const absorbed = Math.max(0, state.heroPool.length - 3);
  let debt = Math.max(0, state.patchDebt - absorbed);
  if (state.traits.meta) debt *= 0.5;
  return -Math.round(debt * 1.5);
}

/** 實戰 OVR＝位置加權 OVR ＋ 版本落差懲罰 */
export function effectiveOvr(state) {
  return ovr(state) + patchPenalty(state);
}

function stepCost(current, cap) {
  const base = GROWTH_COST.find((g) => current >= g.at).cost;
  return current >= cap ? base * OVER_POTENTIAL_MULTIPLIER : base;
}

/** 下一點需要多少訓練點（給 UI 顯示用） */
export function nextStepCost(state, key) {
  return stepCost(state.ability[key], state.potential[key] ?? 62);
}

/**
 * 投入 `points` 點訓練成果到某項能力。
 * 不足以買下一階時會存進 `carry` 蓄力，下次接續——避免小骰子完全浪費。
 * @returns {number} 實際提升的點數
 */
export function investAbility(state, key, points) {
  if (!(key in state.ability)) return 0;
  const before = state.ability[key];
  const cap = abilityCap(state);

  if (points < 0) {
    state.ability[key] = clamp(before + points, 1, cap);
    return state.ability[key] - before;
  }

  const potentialCap = state.potential[key] ?? 62;
  const multiplier = state.epic.godhand ? 2 : 1;
  let budget = points * multiplier + (state.carry[key] || 0);
  let current = before;

  while (current < cap) {
    const cost = stepCost(current, potentialCap);
    if (budget < cost) break;
    budget -= cost;
    current++;
  }

  state.carry[key] = current >= cap ? 0 : budget;
  state.ability[key] = current;
  return current - before;
}

/** 直接加減（事件卡用），不走蓄力機制 */
export function adjustAbility(state, key, delta) {
  if (!(key in state.ability)) return 0;
  if (delta > 0) return investAbility(state, key, delta);
  const before = state.ability[key];
  state.ability[key] = clamp(before + delta, 1, abilityCap(state));
  return state.ability[key] - before;
}

/** 退役硬上限 */
export function retirementAge(state) {
  if (state.epic.ageless) return 40;
  if (state.epic.godhand) return 38;
  if (state.traits.veteran) return 36;
  return 34;
}

/**
 * 年齡衰退。回傳 null 表示本季未衰退。
 * @returns {{amount:number, phase:1|2, keys:string[], grown:string[]}|null}
 */
export function applyAgeDecline(state, rng) {
  const offset = state.epic.ageless ? 4 : state.epic.godhand ? 2 : state.traits.veteran ? 2 : 0;
  const declineAge = state.age - offset;
  if (declineAge < 30) return null;

  const raw = declineAge >= 33 ? 4 + (declineAge - 33) : 2;
  let multiplier = state.epic.ageless ? 0.5 : state.traits.veteran ? 0.7 : 1;
  const amount = Math.max(1, Math.round(raw * multiplier));

  const keys = ['ref', 'op', 'sta'].filter((k) => k in state.ability);
  for (const k of keys) {
    // `不老傳奇` 對反應/操作再減半
    const hit = state.epic.ageless && (k === 'ref' || k === 'op') ? Math.max(1, Math.round(amount / 2)) : amount;
    state.ability[k] = clamp(state.ability[k] - hit, 1, abilityCap(state));
  }

  // 經驗型能力 30 歲後仍可能續升
  const grown = [];
  for (const k of ['macro', 'vis']) {
    if (k in state.ability && rng.next() < 0.5) {
      state.ability[k] = clamp(state.ability[k] + 1, 1, abilityCap(state));
      grown.push(k);
    }
  }

  return { amount, phase: declineAge >= 33 ? 2 : 1, keys, grown };
}

export function abilityKeys(state) {
  return ROLE_ABILITIES[state.role];
}
