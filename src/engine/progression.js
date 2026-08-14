/** 受傷、版本改動、英雄專精、特質解鎖與合成。 */
import { clamp } from '../core/rng.js';
import { HEROES_BY_ROLE, PATCH_THEMES } from '../data/heroes.js';
import { BASE_TRAITS, RARE_TRAITS } from '../data/traits.js';
import { EPIC_TRAITS, FUSIONS, LEGENDARY_TRAITS } from '../data/epics.js';
import { capOf, factor, flag, TIER_STORES, traitName } from '../kernel/modifiers.js';
import { injuryMul, staminaOf } from './stamina.js';

/* ---------------- 受傷 ---------------- */

export function injuryProbability(state) {
  let p = 15;
  if (state.age >= 33) p += 12;
  else if (state.age >= 30) p += 6;
  /*
   * 體力（V4 §6.2：透支區受傷風險上升，見底更是大增）。
   *
   * 乘法而不是加法：年齡是「身體本來的脆弱度」，體力是「今天有沒有在硬撐」——
   * 硬撐對 33 歲的人本來就比對 20 歲的人危險，兩者相乘才有那個交互作用。
   * 放在 `capOf` 之前是刻意的：帶著受傷率上限那類特質的人，撐再兇也還是有天花板。
   */
  p *= injuryMul(staminaOf(state));
  p = capOf(state, 'injuryRate', p);
  if (flag(state, 'injuryImmune')) return 0;
  p += (state.tempInjuryRisk || 0);
  return clamp(p, 3, 95);
}

/**
 * 傷勢。
 *
 * 舊版只有兩檔：小傷，或者「整季報銷、下季復健年」。那是棒球的開刀報銷模型。
 * LoL 的手腕／背傷絕大多數是**缺席幾週、替補頂上**，回來之後位子還在不在是另一
 * 回事；真的要動刀報銷一整季的極少。所以改成三檔，用缺席週數表示。
 *
 * @returns {{kind:'none'|'minor'|'major'|'severe', weeks:number}}
 */
export function rollInjury(state, rng) {
  if (flag(state, 'injuryImmune')) return { kind: 'none', weeks: 0 };
  if (!rng.chance(injuryProbability(state))) return { kind: 'none', weeks: 0 };

  if (rng.chance(30 * factor(state, 'injuryMinorChance'))) {
    // 這一檔裡只有一小部分需要動刀
    if (rng.chance(12)) {
      state.majorInjuries += 1;
      state.rehabYears = 1;
      return { kind: 'severe', weeks: 0 };
    }
    state.majorInjuries += 1;
    const weeks = rng.int(8, 16);
    state.injuryWeeks = (state.injuryWeeks || 0) + weeks;
    return { kind: 'major', weeks };
  }

  const weeks = rng.int(2, 5);
  state.injuryWeeks = (state.injuryWeeks || 0) + weeks;
  state.tempInjuryRisk = (state.tempInjuryRisk || 0) + 6;
  return { kind: 'minor', weeks };
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
  const all = HEROES_BY_ROLE[state.role];
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
    const to = TIER_STORES[recipe.outTier];
    if (to.store(state)[recipe.out]) continue;
    if (!recipe.need.every(([tier, key]) => TIER_STORES[tier].store(state)[key])) continue;
    for (const [tier, key] of recipe.need) {
      const { store, table } = TIER_STORES[tier];
      delete store(state)[key];
      const n = table()[key].name;
      if (!state.fusedAway.includes(n)) state.fusedAway.push(n);
    }
    to.store(state)[recipe.out] = true;
    gained.push(recipe.out);
  }
  return gained;
}

export function activeTraitNames(state) {
  const common = Object.keys(state.traits).filter((k) => state.traits[k]).map((k) => BASE_TRAITS[k].name);
  const rare = Object.keys(state.rare).filter((k) => state.rare[k]).map((k) => RARE_TRAITS[k].name);
  const epic = Object.keys(state.epic).filter((k) => state.epic[k]).map((k) => EPIC_TRAITS[k].name);
  const legendary = Object.keys(state.legendary).filter((k) => state.legendary[k]).map((k) => LEGENDARY_TRAITS[k].name);
  return { common, rare, epic, legendary, base: common };
}
