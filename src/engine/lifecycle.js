/**
 * 生命週期曲線（V4 §7.2）。
 *
 * 成長與衰退統一成同一條 `ceiling_curve` 的兩面：屬性「現在的天花板」隨年齡起伏，
 * 上升期是成長的空間、下降期是衰退的拉力。這取代了三件棒球版的遺毒——固定年齡衰退表、
 * 退役硬上限、以及「老將靠意識吃飯」的寫死特例。
 *
 * 這裡只有純函式（曲線、有效潛力、衰退跟隨）與出生流的抽取。衰退**什麼時候**發生由
 * 年界決定（`engine/game.js` 的 `yearOpen`），不是這個檔的責任。
 */
import { ATTRS } from '../data/attributes.js';
import { LIFECYCLE_BASE, LIFECYCLE_PARAMS, LIFECYCLE_RANGE } from '../data/lifecycle.js';
import { lifecycleWindows } from '../kernel/modifiers.js';

/**
 * 天花板曲線（§7.2）。
 *
 *     age ≤ peak_age：(age / peak_age) ^ rise_k           ← 上升期
 *     age > peak_age：e^( −fall_k × (age − peak_age)^fall_accel )  ← 衰退期
 *
 * 「老將靠意識吃飯」是這條曲線的直接後果：awr 的 peak_age 晚（29）、fall_k 極小
 * （0.010），所以它的天花板在別人衰退時才剛到頂、之後也掉得極慢——不再需要寫死
 * 「awr/dec 續升」的特例。
 */
export function ceilingCurve(params, age) {
  const { peak_age, rise_k, fall_k, fall_accel } = params;
  if (age <= peak_age) return Math.pow(age / peak_age, rise_k);
  return Math.exp(-fall_k * Math.pow(age - peak_age, fall_accel));
}

/**
 * 屬性現在的有效曲線參數＝種子抽出的基準參數 × 特質調整窗口。
 *
 * 窗口結算順序**先加後乘、寫死**（§7.2）：`peak_age` 加 `peak_age_shift`，其餘四項
 * 乘各自的 `*_mul`。窗口值在 `kernel/modifiers.js` 的 `lifecycleWindows` 裡已經逐項
 * clamp，這裡只做組裝。
 */
export function effectiveParams(state, attr) {
  const base = state.lifecycle?.[attr] ?? LIFECYCLE_BASE[attr];
  const w = lifecycleWindows(state);
  return {
    peak_age: base.peak_age + w.peak_age_shift,
    rise_k: base.rise_k * w.rise_k_mul,
    fall_k: base.fall_k * w.fall_k_mul,
    fall_accel: base.fall_accel * w.fall_accel_mul,
    decline_pull: base.decline_pull * w.decline_pull_mul,
  };
}

/**
 * 有效潛力天花板＝`base_potential × ceiling_curve(age)`。
 *
 * §7.1 的天花板係數與 §7.3 的起始值都讀這個，而不是固定潛力——天花板隨年齡移動，
 * 成長與衰退才真的接在同一條線上。
 */
export function effectivePotential(state, attr) {
  return (state.potential?.[attr] ?? 0) * ceilingCurve(effectiveParams(state, attr), state.age);
}

/** `growth_rate_mul` 窗口：訓練成長速率的額外乘數（§7.2 明寫「不影響曲線」） */
export function growthRateWindow(state) {
  return lifecycleWindows(state).growth_rate_mul;
}

/**
 * 衰退跟隨量（§7.2）：`(current − effective_potential) × decline_pull`。
 *
 * 只在 current 高過有效天花板時非零——上升期（current 追著天花板跑）不會被這個函式
 * 誤傷。回傳的是**期望量**（帶小數），落地取整在 `applyLifecycleDecline`。
 */
export function annualPull(state, attr) {
  const over = state.attr[attr] - effectivePotential(state, attr);
  return over > 0 ? over * effectiveParams(state, attr).decline_pull : 0;
}

/**
 * 機率性取整：`2.5` 有一半機率變 2、一半變 3。
 *
 * 衰退跟隨量帶小數，但屬性是整數。直接 `Math.round(2.5)` 一律進位成 3，等於把慢速
 * 衰退（awr 每年約 0.3 點）整段吃掉——機率性取整的期望值就是原本的小數，不必為了
 * 保留小數而讓存檔多帶一個累加欄位。
 */
function stochasticRound(rng, x) {
  const base = Math.floor(x);
  return base + (rng.next() < x - base ? 1 : 0);
}

/**
 * 年度邊界的衰退跟隨。
 *
 * 曲線往下掉、屬性值被往下拉，自然而非斷崖。回傳實際衰退的屬性清單供敘事用；
 * 沒有屬性衰退時回傳空陣列（不是 null——上升期或持平期每年都是空陣列）。
 *
 * 訓練抵消量（§7.2 的 `max(0, annual_pull − 訓練抵消量)`）留給 S16，這一站先把
 * 「曲線下掉時屬性被往下拉」的機制落地。
 */
export function applyLifecycleDecline(state, rng) {
  const declined = [];
  for (const k of ATTRS) {
    if (!(k in state.attr)) continue;
    const pull = annualPull(state, k);
    if (pull <= 0) continue;
    const amount = stochasticRound(rng, pull);
    if (amount <= 0) continue;
    state.attr[k] = Math.max(1, state.attr[k] - amount);
    declined.push({ key: k, amount });
  }
  return declined;
}

/**
 * 從出生亂數流抽出六屬性 × 5 個參數（§1.4 birth 流尾端，接在「業餘隊伍」之後）。
 *
 * ⚠ **這是出生流的最後 30 次抽取，不可插到前面**——插隊會位移所有既有種子的天賦
 * （S19d 那站已經警告過一次）。`peak_age` 是整數，其餘是連續值。
 */
export function drawLifecycle(birth) {
  const out = {};
  for (const attr of ATTRS) {
    const range = LIFECYCLE_RANGE[attr];
    const params = {};
    for (const key of LIFECYCLE_PARAMS) {
      const [lo, hi] = range[key];
      params[key] = key === 'peak_age' ? birth.int(lo, hi) : lo + birth.next() * (hi - lo);
    }
    out[attr] = params;
  }
  return out;
}
