/** 受傷、版本改動、英雄專精、特質解鎖與合成。 */
import { clamp } from '../core/rng.js';
import { HEROES_BY_ROLE, PATCH_THEMES } from '../data/heroes.js';
import { FUSIONS, UNIQUE_TRAITS } from '../data/epics.js';
import { capOf, factor, flag, lookupTrait, TIER_STORES, traitName, traitTier } from '../kernel/modifiers.js';
import { injuryMul, staminaOf, vitInjuryCoef } from './stamina.js';
import { evalCond } from './conditions.js';

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
  /*
   * 體能（S47）：這副身體耐不耐操。同上走乘法——體能與年齡、體力是同一件事的三個
   * 因子（33 歲 ＋ 透支 ＋ 低體能才是真的危險，任兩項單獨都不是）。放 `capOf` 之前
   * 的理由與體力同條：帶受傷率上限特質的人，體能再差也還是有天花板。
   */
  p *= vitInjuryCoef(state);
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
 * 互斥檢查（§13.3 第二層）。取得任一特質時，檢查它宣告的互斥清單——
 * 同組其他特質已持有的話，這條路線就鎖死（「取得其一鎖掉整條路線」）。
 *
 * 對稱性由測試強制：A 排他 B，B 的資料也要排他 A——所以這裡只需要單向查詢。
 *
 * ⚠ 修前這裡有一份 `TIER_TO_STORE` 把 `traitTier()` 的階名翻譯成 `TIER_STORES`
 * 的鍵。兩套拼法收斂之後翻譯表整條退役（S20c）；`store` 取不到時回退成空物件，
 * 是因為舊存檔可能缺該階的欄位——`TIER_STORES[tier].store(state)` 直接索引會
 * TypeError（unique 接上之後這條路就走得到了）。
 */
export function exclusiveHeld(state, key) {
  const t = lookupTrait(key);
  if (!t?.exclusiveWith) return false;
  return t.exclusiveWith.some((other) => {
    const store = TIER_STORES[traitTier(other)]?.store(state) || {};
    return !!store[other];
  });
}

/**
 * 解鎖一個基礎特質。已經被合成消耗掉的特質不會重複解鎖；與已持有特質互斥的
 * 也不會（§13.3）。
 * @returns {boolean} 是否為新解鎖
 */
export function unlockTrait(state, key) {
  if (state.traits[key]) return false;
  if (state.fusedAway.includes(traitName(key))) return false;
  if (exclusiveHeld(state, key)) return false;
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
    if (exclusiveHeld(state, recipe.out)) continue;
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

/**
 * 維持條件檢查（§14.2）：`maintain` 不成立的特質在年度邊界失去。
 *
 * 這是「取得是選擇、持有也是選擇」的另一半——單身交往就失去、毒瘤洗白就失去。
 * 回傳失去的特質鍵清單，由呼叫端（年度邊界）組敘事 beat。
 */
export function maintenanceLoss(state) {
  const lost = [];
  for (const { store, table } of Object.values(TIER_STORES)) {
    for (const [key, held] of Object.entries(store(state) || {})) {
      if (!held) continue;
      const t = table()[key];
      if (t?.maintain && !t.maintain(state)) {
        delete store(state)[key];
        lost.push(key);
      }
    }
  }
  return lost;
}

/**
 * 各階已持有特質的顯示名。逐階走 `TIER_STORES`——加一階不用改這裡（S20c）。
 *
 * ⚠ 缺欄位回空陣列而不是裸 `Object.keys` 炸掉：階是會增加的，而存檔跨版本
 * 一定會出現「新階在舊存檔裡不存在」的一刻（N15）。
 */
export function activeTraitNames(state) {
  const out = {};
  for (const [tier, { store, table }] of Object.entries(TIER_STORES)) {
    out[tier] = Object.entries(store(state) || {})
      .filter(([, held]) => held)
      .map(([key]) => table()[key]?.name)
      .filter(Boolean);
  }
  return out;
}

/* ---------------- 獨有特質（§14.1，S20c 接線） ---------------- */

/**
 * 獨有特質的授予檢查。
 *
 * 獨有特質不進合成樹、不能當素材，唯一的取得管道是**生涯條件直接授予**——所以
 * 它需要一個自己的發放口。形狀仿 `quests.js` 的傳說發放：互斥擋住就不發，
 * 但不丟例外。
 *
 * ⚠ **不能走 `unlockTrait`**：那個函式寫死 `state.traits`（common 階），
 * 拿它發獨有特質會把 unique 的鍵寫進通用池。
 *
 * 授予條件是條件式（`grantWhen`），與任務卡、事件卡同一套 `evalCond`
 * （`AGENTS.md` 條件語言規則：全專案只有一套條件語言）。`grantWhen` 為
 * null 的特質代表「由事件即時授予、不走年度檢查」——S20g 的 `torch_bearer`
 * 就是這種（世界賽淘汰衛冕冠軍當下發），不是前提沒建好。
 *
 * @returns {string[]} 這次新授予的獨有特質鍵
 */
export function grantUniqueTraits(state) {
  const gained = [];
  for (const [key, t] of Object.entries(UNIQUE_TRAITS)) {
    if (!t.grantWhen) continue;
    if (!evalCond(state, t.grantWhen)) continue;
    if (grantUnique(state, key)) gained.push(key);
  }
  return gained;
}

/**
 * 直接授予一個獨有特質（`torch_bearer` 這種「事件當下發」的走這裡，不走年度檢查）。
 * 已持有或與已持有特質互斥則不發。回傳是否為新授予。
 */
export function grantUnique(state, key) {
  const store = TIER_STORES.unique.store(state);
  if (!store || store[key]) return false;
  if (exclusiveHeld(state, key)) return false;
  store[key] = true;
  return true;
}
