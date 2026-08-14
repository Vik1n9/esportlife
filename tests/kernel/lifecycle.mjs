/**
 * 生命週期曲線（V4 §7.2）。
 *
 * 這站動的是成長與衰退兩端的平衡，而且錯誤要到 160 段生涯的終局分布才看得出來——
 * 所以這裡守的是**曲線本身的形狀**（單調、峰在 peak_age、天花板 = 1）與**機制的不變式**
 * （同種子同曲線、窗口 clamp、衰退是跟隨不是斷崖），把「數值會不會咬人」留給
 * `regression/invariants.mjs` 的 160 段分布檢查。
 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import {
  annualPull, applyLifecycleDecline, ceilingCurve, drawLifecycle, effectiveParams,
  effectivePotential,
} from '../../src/engine/lifecycle.js';
import { ATTRS } from '../../src/data/attributes.js';
import { LIFECYCLE_BASE, LIFECYCLE_PARAMS, LIFECYCLE_RANGE } from '../../src/data/lifecycle.js';
import { LIFECYCLE_WINDOWS, lifecycleWindows } from '../../src/kernel/modifiers.js';
import { BASE_TRAITS } from '../../src/data/traits.js';

export const name = '生命週期曲線';

export async function run({ check, log }) {
  /* ---------------- 曲線形狀 ---------------- */

  for (const [attr, base] of Object.entries(LIFECYCLE_BASE)) {
    const peak = base.peak_age;
    check('曲線：peak_age 處天花板恰好是 1',
      Math.abs(ceilingCurve(base, peak) - 1) < 1e-9, `${attr} 在 ${peak} 歲 = ${ceilingCurve(base, peak)}`);
    for (let age = 15; age < peak; age++) {
      check('曲線：peak_age 之前單調上升',
        ceilingCurve(base, age + 1) > ceilingCurve(base, age),
        `${attr} ${age}→${age + 1} = ${ceilingCurve(base, age).toFixed(4)}→${ceilingCurve(base, age + 1).toFixed(4)}`);
    }
    check('曲線：peak_age 之後單調下降',
      ceilingCurve(base, peak + 5) < ceilingCurve(base, peak),
      `${attr} 峰後 ${ceilingCurve(base, peak + 5).toFixed(4)} < 峰 ${ceilingCurve(base, peak).toFixed(4)}`);
    check('曲線：衰退期天花板仍在往下掉（< 1）',
      ceilingCurve(base, peak + 20) < 1, `${attr} 峰後 20 年 = ${ceilingCurve(base, peak + 20).toFixed(4)}`);
  }

  // 「老將靠意識吃飯」是曲線的直接後果：agi（身體）衰退比 awr（意識）快得多
  check('曲線：agi 峰後 20 年的天花板遠低於 awr（身體先走、意識留下）',
    ceilingCurve(LIFECYCLE_BASE.agi, LIFECYCLE_BASE.agi.peak_age + 20)
      < ceilingCurve(LIFECYCLE_BASE.awr, LIFECYCLE_BASE.awr.peak_age + 20) / 2,
    `agi ${ceilingCurve(LIFECYCLE_BASE.agi, LIFECYCLE_BASE.agi.peak_age + 20).toFixed(3)} vs awr ${ceilingCurve(LIFECYCLE_BASE.awr, LIFECYCLE_BASE.awr.peak_age + 20).toFixed(3)}`);

  /* ---------------- 種子確定性與範圍 ---------------- */

  const a = drawLifecycle(new Rng('lifecycle-seed'));
  const b = drawLifecycle(new Rng('lifecycle-seed'));
  for (const attr of ATTRS) {
    for (const key of LIFECYCLE_PARAMS) {
      check('同種子同曲線：六屬性的五個參數完全相同',
        a[attr][key] === b[attr][key], `${attr}.${key} = ${a[attr][key]} vs ${b[attr][key]}`);
    }
    const p = a[attr];
    const range = LIFECYCLE_RANGE[attr];
    check('種子隨機化：peak_age 落在範圍內且是整數',
      Number.isInteger(p.peak_age) && p.peak_age >= range.peak_age[0] && p.peak_age <= range.peak_age[1],
      `${attr}.peak_age = ${p.peak_age}`);
    for (const key of ['rise_k', 'fall_k', 'fall_accel', 'decline_pull']) {
      check('種子隨機化：連續參數落在範圍內',
        p[key] >= range[key][0] && p[key] <= range[key][1],
        `${attr}.${key} = ${p[key]} 不在 [${range[key][0]}, ${range[key][1]}]`);
    }
  }

  // state 層級的確定性：同 seed 生兩份，lifecycle 逐位元一致
  const s1 = createState({ name: 'L', role: 'MID', seed: 'lifecycle-state' });
  const s2 = createState({ name: 'L', role: 'MID', seed: 'lifecycle-state' });
  for (const attr of ATTRS) {
    check('同種子同曲線：state.lifecycle 逐位元一致',
      JSON.stringify(s1.lifecycle[attr]) === JSON.stringify(s2.lifecycle[attr]), attr);
  }

  /* ---------------- 有效潛力隨年齡起伏 ---------------- */

  const state = createState({ name: 'E', role: 'MID', seed: 'effective-probe' });
  state.age = 16;
  for (const attr of ATTRS) {
    check('有效潛力：16 歲低於潛力（天花板還在上坡）',
      effectivePotential(state, attr) < state.potential[attr], `${attr}`);
  }
  state.age = 60;
  for (const attr of ATTRS) {
    check('有效潛力：60 歲低於潛力（天花板已下坡）',
      effectivePotential(state, attr) < state.potential[attr], `${attr}`);
  }

  /* ---------------- 特質窗口：key 存在、clamp 寫死 ---------------- */

  const expected = {
    peak_age_shift: [-4, 4],
    rise_k_mul: [0.5, 2.0],
    fall_k_mul: [0.3, 2.5],
    fall_accel_mul: [0.5, 2.0],
    decline_pull_mul: [0.4, 2.0],
    growth_rate_mul: [0.5, 2.0],
  };
  for (const [key, [lo, hi]] of Object.entries(expected)) {
    check('窗口：六個生命週期窗口鍵都存在且 clamp 對得上 §7.2',
      LIFECYCLE_WINDOWS[key] && LIFECYCLE_WINDOWS[key].clamp[0] === lo && LIFECYCLE_WINDOWS[key].clamp[1] === hi,
      key);
  }

  // 沒有特質時，窗口全中性（不加、不乘）
  const neutral = lifecycleWindows(createState({ name: 'N', role: 'MID', seed: 'neutral-window' }));
  check('窗口：無特質時 peak_age_shift 為 0', neutral.peak_age_shift === 0, String(neutral.peak_age_shift));
  check('窗口：無特質時五個乘數都是 1',
    neutral.rise_k_mul === 1 && neutral.fall_k_mul === 1 && neutral.fall_accel_mul === 1
    && neutral.decline_pull_mul === 1 && neutral.growth_rate_mul === 1, JSON.stringify(neutral));

  // clamp 真的生效：塞一個超標特質，驗證窗口被壓回界內
  const saved = BASE_TRAITS._windowprobe;
  BASE_TRAITS._windowprobe = {
    name: '窗口探針',
    effects: {
      peak_age_shift: 99,               // 加法，會被 clamp 回 +4
      rise_k_mul: { mul: 99 },          // 乘法，會被 clamp 回 2.0
      fall_k_mul: { mul: 99 },          // 乘法，會被 clamp 回 2.5
      fall_accel_mul: { mul: 0.01 },    // 乘法，會被 clamp 回 0.5
      decline_pull_mul: { mul: 99 },    // 乘法，會被 clamp 回 2.0
      growth_rate_mul: { mul: 0.01 },   // 乘法，會被 clamp 回 0.5
    },
  };
  try {
    const probe = createState({ name: 'W', role: 'MID', seed: 'window-clamp' });
    probe.traits._windowprobe = true;
    const w = lifecycleWindows(probe);
    check('窗口 clamp：peak_age_shift 壓回 [−4, +4]', w.peak_age_shift === 4, String(w.peak_age_shift));
    check('窗口 clamp：rise_k_mul 壓回 [0.5, 2.0]', w.rise_k_mul === 2.0, String(w.rise_k_mul));
    check('窗口 clamp：fall_k_mul 壓回 [0.3, 2.5]', w.fall_k_mul === 2.5, String(w.fall_k_mul));
    check('窗口 clamp：fall_accel_mul 壓回 [0.5, 2.0]', w.fall_accel_mul === 0.5, String(w.fall_accel_mul));
    check('窗口 clamp：decline_pull_mul 壓回 [0.4, 2.0]', w.decline_pull_mul === 2.0, String(w.decline_pull_mul));
    check('窗口 clamp：growth_rate_mul 壓回 [0.5, 2.0]', w.growth_rate_mul === 0.5, String(w.growth_rate_mul));

    // 窗口套進有效參數（先加後乘）
    const params = effectiveParams(probe, 'agi');
    check('窗口結算：peak_age 加了 shift（先加）',
      params.peak_age === probe.lifecycle.agi.peak_age + 4, `${params.peak_age}`);
    check('窗口結算：rise_k 乘了 mul（後乘）',
      Math.abs(params.rise_k - probe.lifecycle.agi.rise_k * 2.0) < 1e-9, `${params.rise_k}`);
  } finally {
    if (saved) BASE_TRAITS._windowprobe = saved;
    else delete BASE_TRAITS._windowprobe;
  }

  /* ---------------- 衰退跟隨：不是斷崖 ---------------- */

  const d = createState({ name: 'D', role: 'MID', seed: 'decline-probe' });
  // 上升期（16 歲）：天花板還在上坡，屬性貼著或低於天花板，不該衰退
  d.age = 16;
  for (const k of ATTRS) {
    check('衰退跟隨：上升期（16 歲）沒有衰退', annualPull(d, k) <= 0, `${k} pull=${annualPull(d, k).toFixed(3)}`);
  }

  // 衰退期：把屬性故意推高到超過有效天花板，驗證每年的衰退量只是缺口的一小部分
  d.age = 40;
  for (const k of ATTRS) {
    const ep = effectivePotential(d, k);
    d.attr[k] = Math.round(ep) + 20;
    const gap = d.attr[k] - ep;
    const pull = annualPull(d, k);
    check('衰退跟隨：每年的衰退量小於缺口（decline_pull < 1，是收斂不是抹平）',
      pull > 0 && pull < gap, `${k} pull=${pull.toFixed(2)} < gap=${gap.toFixed(2)}`);
  }

  // applyLifecycleDecline 落地：只動超過天花板的屬性，且不會降到 1 以下
  const e = createState({ name: 'A', role: 'MID', seed: 'apply-decline' });
  e.age = 40;
  e.attr.agi = 60;
  const declined = applyLifecycleDecline(e, new Rng('decline-rng'));
  check('衰退落地：回傳了實際衰退的屬性', declined.length > 0 && declined.some((x) => x.key === 'agi'),
    declined.map((x) => `${x.key}−${x.amount}`).join('、'));
  check('衰退落地：屬性值仍在 1..上限',
    e.attr.agi >= 1 && e.attr.agi <= 100, String(e.attr.agi));

  log(`六屬性峰值 ${LIFECYCLE_BASE.agi.peak_age}（agi）～ ${LIFECYCLE_BASE.awr.peak_age}（awr）歲；`
    + `agi 峰後 20 年天花板 ${ceilingCurve(LIFECYCLE_BASE.agi, LIFECYCLE_BASE.agi.peak_age + 20).toFixed(3)}、`
    + `awr 峰後 20 年天花板 ${ceilingCurve(LIFECYCLE_BASE.awr, LIFECYCLE_BASE.awr.peak_age + 20).toFixed(3)}（老將靠意識吃飯）`);
}
