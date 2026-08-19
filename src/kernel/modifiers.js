/**
 * 特質／史詩／教練效果的單一查詢入口。
 *
 * 舊版把效果寫成散在十個引擎檔裡的 `if (state.traits.clutch) p += 4`——
 * `state.traits.*` 有 40 個消費點、`state.epic.*` 有 36 個，分佈在 game / market /
 * abilities / mental / international / season / progression / team / playoffs / ui。
 * 結果新增或調整一個特質要先在十個檔裡把它找出來。
 *
 * 現在特質在 `data/traits.js`（通用／稀有）與 `data/epics.js`（史詩／傳說）各自宣告
 * 效果，消費端只問這裡的查詢函式。加減一個特質＝改一個檔。
 *
 * S49 起**教練是第五個效果來源**：`data/coaches.js` 的 `effects`／`sideEffects` 走
 * 同一套寫法，`effectsFor` 多 yield 一段當前教練的效果——改一個產生器，所有既有
 * 消費點自動吃到教練效果，零新增串接。引擎檔裡不該再長出 `if (state.coach === …)`。
 *
 * 運算刻意分開而不合成一個 `apply()`：不同消費點的組合順序不同（有的先加再封頂，
 * 有的先保底再加），統一成一個函式反而會把順序藏起來。
 */
import { BASE_TRAITS, RARE_TRAITS } from '../data/traits.js';
import { EPIC_TRAITS, LEGENDARY_TRAITS, UNIQUE_TRAITS } from '../data/epics.js';
import { COACHES } from '../data/coaches.js';
import { clamp } from '../core/rng.js';

/**
 * `key: 5` 與 `key: true` 是簡寫，統一展開成物件。
 * `key: false` 是「免疫」簡寫（S49）：展開成 `{ immune: true }`，取消同鍵的旗標。
 */
function normalize(effect) {
  if (typeof effect === 'number') return { add: effect };
  if (effect === true) return { flag: true };
  if (effect === false) return { immune: true };
  return effect;
}

/**
 * 各階特質的存放位置、資料表與顯示樣式。**階名的單一來源**（S20c）。
 *
 * ⚠ 階名以前有四套拼法：這張表的鍵是 `traits`、`traitTier()` 回 `common`、
 * `conditions.js` 與 `progression.js` 各有一份 `TIER_TO_STORE` 在兩者之間翻譯、
 * 配方資料寫 `traits`、任務卡條件式寫 `common`。四套拼法只要有一處對不上就是
 * 靜默查表失敗。現在全專案只有一套：`common / rare / epic / legendary / unique`，
 * 加一階＝在這裡加一列，消費端不用改。
 *
 * `unique` 是獨有特質（§14.1）：不可合成、不能當配方素材，只由生涯條件直接授予。
 */
export const TIER_STORES = {
  common: { store: (s) => s.traits, table: () => BASE_TRAITS, cls: '' },
  rare: { store: (s) => s.rare, table: () => RARE_TRAITS, cls: 'rare' },
  epic: { store: (s) => s.epic, table: () => EPIC_TRAITS, cls: 'epic' },
  legendary: { store: (s) => s.legendary, table: () => LEGENDARY_TRAITS, cls: 'legendary' },
  unique: { store: (s) => s.unique, table: () => UNIQUE_TRAITS, cls: 'unique' },
};

/** 階名全集（測試、編輯器、UI 的可選值來源） */
export const TIER_KEYS = Object.keys(TIER_STORES);

/** UI 由高階往低階列的順序。獨有特質排在傳說之後、史詩之前——它是另一條取得管道 */
export const TIER_DISPLAY_ORDER = ['legendary', 'unique', 'epic', 'rare', 'common'];

/** 目前教練的資料筆（依名字字串查）。`state.coach` 存名字字串（S49 起教練帶
 *  desc／effects，仍不做存檔遷移——`coachBonus` 本來就依名字查表） */
export function coachOf(state) {
  return COACHES.find((c) => c.name === state.coach) || null;
}

/** 逐一吐出所有「已持有且對這個 key 有影響」的效果。
 *  益處（`effects`）與副作用（`sideEffects`）共用同一組鍵與同一套寫法——差別只在
 *  資料欄位的語意（§13.1 的雙面性），消費端不需要區分。副作用要能被另一特質的
 *  益處抵銷（§11.2），正是因為兩者走同一個 `bonus`／`factor` 加法乘法。 */
function* effectsFor(state, key) {
  for (const { store, table } of Object.values(TIER_STORES)) {
    const held = store(state) || {};
    for (const [name, isHeld] of Object.entries(held)) {
      if (!isHeld) continue;
      const t = table()[name];
      const e = t?.effects?.[key] ?? t?.sideEffects?.[key];
      if (e !== undefined) yield normalize(e);
    }
  }
  // 教練（S49，第五個效果來源）：effects 與 sideEffects 同一個寫法。教練只有一個，
  // 依名字查表；與特質四階一起走同一批查詢，消費端不必知道來源
  const coach = coachOf(state);
  const ce = coach?.effects?.[key] ?? coach?.sideEffects?.[key];
  if (ce !== undefined) yield normalize(ce);
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
 * 免疫（S49）：任一來源宣告 `false`（或 `{ immune: true }`）即為真——取消同鍵的
 * 旗標。消費端寫 `flag(state, 'offerPenalty') && !immune(state, 'offerPenalty')`。
 * `flag()` 本身只能設真不能取消，所以免疫是獨立的第六種查詢，不是旗標的反面。
 */
export function immune(state, key) {
  for (const e of effectsFor(state, key)) if (e.immune) return true;
  return false;
}

/**
 * 教練倍率鍵的 clamp（S49）。照 `LIFECYCLE_WINDOWS` 的作法：表是資料，消費端讀
 * `coachFactors` 的夾過值——教練效果與特質疊加時乘積不得突破上下界
 * （訓練狂 ＋ 成長史詩特質不得無上限疊上去）。
 */
export const COACH_FACTORS = {
  trainYield: { clamp: [0.5, 2.0] },
  trainCostMul: { clamp: [0.6, 1.5] },
  recoverMul: { clamp: [0.6, 1.6] },
  tacticMul: { clamp: [0.5, 2.0] },
};

/** 教練四鍵的夾過值。沒有教練（或沒有來源）時 `factor` 回 1，夾完仍 1 */
export function coachFactors(state) {
  return Object.fromEntries(
    Object.keys(COACH_FACTORS).map((k) => [k, clamp(factor(state, k), ...COACH_FACTORS[k].clamp)]),
  );
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

/** 查詢任一階特質的資料（名稱／描述／效果）。逐階查 `TIER_STORES`，加一階不用改這裡 */
export function lookupTrait(key) {
  for (const { table } of Object.values(TIER_STORES)) {
    const t = table()[key];
    if (t) return t;
  }
  return null;
}

/** 查詢任一階特質屬於哪一階（回 `TIER_STORES` 的鍵）。 */
export function traitTier(key) {
  for (const [tier, { table }] of Object.entries(TIER_STORES)) {
    if (table()[key]) return tier;
  }
  return null;
}

/** 顯示名。四階特質共用一個命名空間，所以查詢也只有一個入口。 */
export function traitName(key) {
  return (lookupTrait(key) || { name: key }).name;
}
