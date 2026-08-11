/** 受傷、版本改動、英雄專精、特質解鎖與合成。 */
import { clamp } from '../core/rng.js';
import { HEROES, PATCH_THEMES } from '../data/heroes.js';
import { BASE_TRAITS } from '../data/traits.js';
import { EPIC_TRAITS, FUSIONS } from '../data/epics.js';
import { capOf, factor, flag, traitName } from '../kernel/modifiers.js';

/* ---------------- 受傷 ---------------- */

export function injuryProbability(state) {
  let p = 15;
  if (state.age >= 33) p += 12;
  else if (state.age >= 30) p += 6;
  p = capOf(state, 'injuryRate', p);
  if (flag(state, 'injuryImmune')) return 0;
  p += (state.carryInjuryRisk || 0) + (state.tempInjuryRisk || 0);
  return clamp(p, 3, 95);
}

/**
 * @returns {{kind:'none'|'minor'|'major'}}
 */
export function rollInjury(state, rng) {
  if (flag(state, 'injuryImmune')) return { kind: 'none' };
  if (!rng.chance(injuryProbability(state))) return { kind: 'none' };
  if (rng.chance(30 * factor(state, 'injuryMinorChance'))) {
    state.majorInjuries += 1;
    state.rehabYears = 1;
    return { kind: 'major' };
  }
  state.tempInjuryRisk = (state.tempInjuryRisk || 0) + 6;
  return { kind: 'minor' };
}

/* ---------------- 版本 / 英雄池 ---------------- */

export function applyPatch(state, rng) {
  state.patchCount += 1;
  state.patchDebt = clamp(state.patchDebt + 1, 0, 10);
  state.patchTheme = rng.pick(PATCH_THEMES);
  return state.patchTheme;
}

export function adjustPatchDebt(state, delta) {
  state.patchDebt = clamp(state.patchDebt + delta, 0, 10);
}

/** 出賽會累積專精，專精滿了就把新英雄納入池子 */
export function trainHeroes(state, rng, games) {
  const all = HEROES[state.role];
  const learned = [];
  const reps = Math.min(Math.max(1, Math.round(games / 8)), 6);
  for (let i = 0; i < reps; i++) {
    // 七成練既有池、三成嘗試新英雄
    const useNew = state.heroPool.length < all.length && rng.chance(30);
    const target = useNew
      ? rng.pick(all.filter((h) => !state.heroPool.includes(h)))
      : rng.pick(state.heroPool);
    state.mastery[target] = (state.mastery[target] || 0) + 1;
    if (!state.heroPool.includes(target) && state.mastery[target] >= 2) {
      state.heroPool.push(target);
      learned.push(target);
    }
  }
  return learned;
}

/* ---------------- 特質 ---------------- */

/**
 * 解鎖一個基礎特質。已經被合成消耗掉的特質不會重複解鎖。
 * @returns {boolean} 是否為新解鎖
 */
export function unlockTrait(state, key) {
  if (state.traits[key]) return false;
  if (state.fusedAway.includes(traitName(key))) return false;
  state.traits[key] = true;
  return true;
}

/**
 * 檢查合成配方。命中即消耗基礎特質、賦予史詩特質。
 * @returns {string[]} 這次合成出的史詩特質鍵
 */
export function checkFusions(state) {
  const gained = [];
  for (const recipe of FUSIONS) {
    if (state.epic[recipe.out]) continue;
    if (!recipe.need.every((k) => state.traits[k])) continue;
    for (const k of recipe.need) {
      delete state.traits[k];
      const n = BASE_TRAITS[k].name;
      if (!state.fusedAway.includes(n)) state.fusedAway.push(n);
    }
    state.epic[recipe.out] = true;
    gained.push(recipe.out);
  }
  return gained;
}

export function activeTraitNames(state) {
  const base = Object.keys(state.traits).filter((k) => state.traits[k]).map((k) => BASE_TRAITS[k].name);
  const epic = Object.keys(state.epic).filter((k) => state.epic[k]).map((k) => EPIC_TRAITS[k].name);
  return { base, epic };
}
