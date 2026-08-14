/**
 * 特質／史詩效果的單一查詢入口。
 *
 * 舊版把效果寫成散在十個引擎檔裡的 `if (state.traits.clutch) p += 4`——
 * `state.traits.*` 有 40 個消費點、`state.epic.*` 有 36 個，分佈在 game / market /
 * abilities / mental / international / season / progression / team / playoffs / ui。
 * 結果新增或調整一個特質要先在十個檔裡把它找出來。
 *
 * 現在特質在 `data/traits.js`（通用／稀有）與 `data/epics.js`（史詩／傳說）各自宣告
 * 效果，消費端只問這裡的四個函式。加減一個特質＝改一個檔。
 *
 * 四種運算刻意分開而不合成一個 `apply()`：不同消費點的組合順序不同（有的先加再封頂，
 * 有的先保底再加），統一成一個函式反而會把順序藏起來。
 */
import { BASE_TRAITS, RARE_TRAITS } from '../data/traits.js';
import { EPIC_TRAITS, LEGENDARY_TRAITS } from '../data/epics.js';
import { clamp } from '../core/rng.js';

/** `key: 5` 與 `key: true` 是簡寫，統一展開成物件 */
function normalize(effect) {
  if (typeof effect === 'number') return { add: effect };
  if (effect === true) return { flag: true };
  return effect;
}

/** 四階特質各自的存放位置與資料表 */
export const TIER_STORES = {
  traits: { store: (s) => s.traits, table: () => BASE_TRAITS },
  rare: { store: (s) => s.rare, table: () => RARE_TRAITS },
  epic: { store: (s) => s.epic, table: () => EPIC_TRAITS },
  legendary: { store: (s) => s.legendary, table: () => LEGENDARY_TRAITS },
};

/** 逐一吐出所有「已持有且對這個 key 有影響」的效果 */
function* effectsFor(state, key) {
  for (const { store, table } of Object.values(TIER_STORES)) {
    const held = store(state) || {};
    for (const [name, isHeld] of Object.entries(held)) {
      if (!isHeld) continue;
      const e = table()[name]?.effects?.[key];
      if (e !== undefined) yield normalize(e);
    }
  }
}

/** 加法：累加所有來源，沒有來源時回傳 0 */
export function bonus(state, key) {
  let total = 0;
  for (const e of effectsFor(state, key)) total += e.add ?? 0;
  return total;
}

/** 乘法：連乘所有來源，沒有來源時回傳 1 */
export function factor(state, key) {
  let product = 1;
  for (const e of effectsFor(state, key)) product *= e.mul ?? 1;
  return product;
}

/** 保底：取基準值與所有 floor 的最大值 */
export function floorOf(state, key, base) {
  let value = base;
  for (const e of effectsFor(state, key)) if (e.floor !== undefined) value = Math.max(value, e.floor);
  return value;
}

/** 封頂：取基準值與所有 cap 的最小值 */
export function capOf(state, key, base) {
  let value = base;
  for (const e of effectsFor(state, key)) if (e.cap !== undefined) value = Math.min(value, e.cap);
  return value;
}

/** 旗標：任一來源成立即為真 */
export function flag(state, key) {
  for (const e of effectsFor(state, key)) if (e.flag) return true;
  return false;
}

/**
 * 生命週期調整窗口（V4 §7.2）。
 *
 * 特質不再直接加值，改透過六個**預定義窗口**調整曲線參數。這六個鍵就是特質在資料表
 * 裡宣告效果的鍵（S19a 重建特質時寫成 `effects: { peak_age_shift: 2, fall_k_mul: 0.5 }`），
 * 型別固定：`peak_age_shift` 是加法、其餘五個是乘法——跟既有 `bonus`／`factor` 同一套
 * 寫法，差別在**窗口有 clamp 且「先加後乘」順序寫死**（見 `engine/lifecycle.js`）。
 *
 * 窗口本身是資料（下表），不是程式碼——新增一個窗口只要加一列，消費端不用改。
 */
export const LIFECYCLE_WINDOWS = {
  peak_age_shift: { kind: 'add', clamp: [-4, 4] },
  rise_k_mul: { kind: 'mul', clamp: [0.5, 2.0] },
  fall_k_mul: { kind: 'mul', clamp: [0.3, 2.5] },
  fall_accel_mul: { kind: 'mul', clamp: [0.5, 2.0] },
  decline_pull_mul: { kind: 'mul', clamp: [0.4, 2.0] },
  growth_rate_mul: { kind: 'mul', clamp: [0.5, 2.0] },
};

/** 累加所有特質對六個生命週期窗口的調整，逐項 clamp（先加後乘在 `engine/lifecycle.js` 結算） */
export function lifecycleWindows(state) {
  return {
    peak_age_shift: clamp(bonus(state, 'peak_age_shift'), -4, 4),
    rise_k_mul: clamp(factor(state, 'rise_k_mul'), 0.5, 2.0),
    fall_k_mul: clamp(factor(state, 'fall_k_mul'), 0.3, 2.5),
    fall_accel_mul: clamp(factor(state, 'fall_accel_mul'), 0.5, 2.0),
    decline_pull_mul: clamp(factor(state, 'decline_pull_mul'), 0.4, 2.0),
    growth_rate_mul: clamp(factor(state, 'growth_rate_mul'), 0.5, 2.0),
  };
}

/** 查詢任一階特質的資料（名稱／描述／效果）。 */
export function lookupTrait(key) {
  return BASE_TRAITS[key] || RARE_TRAITS[key] || EPIC_TRAITS[key] || LEGENDARY_TRAITS[key] || null;
}

/** 查詢任一階特質屬於哪一階。 */
export function traitTier(key) {
  if (BASE_TRAITS[key]) return 'common';
  if (RARE_TRAITS[key]) return 'rare';
  if (EPIC_TRAITS[key]) return 'epic';
  if (LEGENDARY_TRAITS[key]) return 'legendary';
  return null;
}

/** 顯示名。四階特質共用一個命名空間，所以查詢也只有一個入口。 */
export function traitName(key) {
  return (lookupTrait(key) || { name: key }).name;
}
