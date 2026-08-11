/** 能力值計算：OVR、成長成本、加點、年齡衰退、退役上限。純函式（會就地修改 state.ability）。 */
import { clamp } from '../core/rng.js';
import {
  ABILITY_CAP, ABILITY_CAP_GODHAND, GROWTH_COST,
  OVER_POTENTIAL_MULTIPLIER, OVR_WEIGHTS, ROLE_ABILITIES,
} from '../data/abilities.js';
import { bonus, capOf, factor, flag, floorOf } from '../kernel/modifiers.js';

export function abilityCap(state) {
  return flag(state, 'abilityCapUp') ? ABILITY_CAP_GODHAND : ABILITY_CAP;
}

/** 位置加權 OVR（不含版本落差懲罰） */
export function ovr(state) {
  const w = OVR_WEIGHTS[state.role] || {};
  let v = 0;
  for (const [k, p] of Object.entries(w)) v += (state.ability[k] || 0) * p;
  v += bonus(state, 'ovrAdd');
  // 年齡條件無法寫進特質資料表，留在這裡
  if (state.epic.ageless && state.age >= 30) v += 1;
  return Math.round(v);
}

/**
 * 版本落差懲罰。英雄池越廣越能吸收版本變動。
 * 舊版把「版本補習成功」也算成 metaCount，好結果反而變懲罰——已修正。
 */
export function patchPenalty(state) {
  if (flag(state, 'patchImmune')) return 0;
  const absorbed = Math.max(0, state.heroPool.length - 3);
  const debt = Math.max(0, state.patchDebt - absorbed) * factor(state, 'patchDebt');
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
 * 成長門檻資訊（純顯示用）。
 * 回傳目前的單點成本、是否已超過潛力上限（成本 ×3），
 * 以及下一個會漲價的數值門檻與屆時成本。
 */
export function growthThreshold(state, key) {
  const value = state.ability[key];
  const potentialCap = state.potential[key] ?? 62;
  const over = value >= potentialCap;
  const mult = over ? OVER_POTENTIAL_MULTIPLIER : 1;
  const current = GROWTH_COST.find((g) => g.at <= value) || GROWTH_COST[GROWTH_COST.length - 1];
  // GROWTH_COST 依 at 遞減排列，反轉後找「最小的、高於目前值」的門檻
  const next = [...GROWTH_COST].reverse().find((g) => g.at > value) || null;
  return {
    cost: current.cost * mult,
    over,
    nextAt: next ? next.at : null,
    nextCost: next ? next.cost * mult : null,
  };
}

/** 距離下一點 +1，還需要投入多少訓練點（已扣除蓄力）。 */
export function needForNextGain(state, key) {
  const carry = state.carry[key] || 0;
  return Math.max(0, growthThreshold(state, key).cost - carry);
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
  let budget = points * factor(state, 'growthMult') + (state.carry[key] || 0);
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
  return floorOf(state, 'retireAge', 34);
}

/**
 * 年齡衰退。回傳 null 表示本季未衰退。
 * @returns {{amount:number, phase:1|2, keys:string[], grown:string[]}|null}
 */
export function applyAgeDecline(state, rng) {
  const declineAge = state.age - floorOf(state, 'declineOffset', 0);
  if (declineAge < 30) return null;

  const raw = declineAge >= 33 ? 4 + (declineAge - 33) : 2;
  const amount = Math.max(1, Math.round(raw * capOf(state, 'declineMult', 1)));

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
