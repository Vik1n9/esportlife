/**
 * 天生特質（V4 §1.4／§9.1／§14.1，S19d）：
 * 池結構（≤5、雙池、副作用、mentalBias）、機率分布收斂、同種子同組合、
 * mentalBias 一致性與有向區間、0 特質種子六維不變。
 */
import { createState } from '../../src/engine/state.js';
import { INNATE_POOL } from '../../src/data/innate.js';
import { BASE_TRAITS } from '../../src/data/traits.js';
import { MENTAL_KEYS, MENTAL_BASE, MENTAL_JITTER } from '../../src/data/mental.js';

export const name = '天生特質池（種子）';

function innateHeld(state) {
  return INNATE_POOL.filter((e) => state.traits[e.key]).map((e) => e.key);
}

export async function run({ check }) {
  /* ---- 池結構（§14.1） ---- */
  {
    // v4.2 硬上限：0.8 ÷ N ≥ 15% → N ≤ 5。池開得越大每一個就越拿不到，與直覺相反
    check('天生特質池 ≤ 5 條（0.8 ÷ N ≥ 15%）', INNATE_POOL.length <= 5, `${INNATE_POOL.length} 條`);
    for (const e of INNATE_POOL) {
      const t = BASE_TRAITS[e.key];
      check(`天生特質 ${e.key} 條目存在於通用池`, !!t);
      check(`${e.key} 標記天生來源`, t.innate === true);
      // §14.2 死路檢驗：每個天生特質必須指派合成池（persona 或 performance）
      check(`${e.key} 指派合成池（persona／performance）`, t.pool === 'persona' || t.pool === 'performance', t.pool);
      // §13.1：白拿的天生特質副作用不能省
      check(`${e.key} 有副作用`, t.sideEffects && Object.keys(t.sideEffects).length > 0);
      if (e.mentalBias) {
        check(`${e.key} mentalBias 維度合法`, MENTAL_KEYS.includes(e.mentalBias.dim));
        check(`${e.key} mentalBias 方向合法（+1 正／−1 負）`, e.mentalBias.dir === 1 || e.mentalBias.dir === -1);
      }
    }
    // §9.1：體質類不宣告 mentalBias（動的是受傷率，不是心理）
    const bodies = INNATE_POOL.filter((e) => !e.mentalBias);
    check('體質類（無 mentalBias）都屬 performance 池',
      bodies.length > 0 && bodies.every((e) => BASE_TRAITS[e.key].pool === 'performance'),
      bodies.map((e) => e.key).join('、'));
    // 池內 mentalBias 維度不重複：否則同種子抽到同維度正負兩條，初始值不知道聽誰的
    const dims = INNATE_POOL.filter((e) => e.mentalBias).map((e) => `${e.mentalBias.dim}:${e.mentalBias.dir}`);
    check('池內 mentalBias 維度不重複', new Set(dims).size === dims.length, dims.join('、'));
    // §1.4：只收人格／體質類——池內不允許競技表現類條目（「天生會打團」推不出來）。
    // 標 innate:true 的條目必須全部進池：標了天生卻抽不到等於死路
    const innateKeys = new Set(INNATE_POOL.map((e) => e.key));
    const tagged = Object.entries(BASE_TRAITS).filter(([, t]) => t.innate).map(([k]) => k);
    check('標記天生來源的條目都進池、池內都是天生條目',
      tagged.every((k) => innateKeys.has(k)) && innateKeys.size === tagged.length,
      `標記 ${tagged.length} 條／池 ${innateKeys.size} 條`);
  }

  /* ---- 機率分布收斂（§1.4：10,000 種子，40/40/20 ±2%） ---- */
  {
    const counts = [0, 0, 0];
    for (let i = 0; i < 10000; i++) {
      const s = createState({ name: 'P', role: 'MID', seed: `innate-dist-${i}` });
      counts[innateHeld(s).length] += 1;
    }
    const pct = counts.map((c) => (c / 10000) * 100);
    check('0 個天生特質 40±2%', Math.abs(pct[0] - 40) <= 2, `${pct[0].toFixed(2)}%`);
    check('1 個天生特質 40±2%', Math.abs(pct[1] - 40) <= 2, `${pct[1].toFixed(2)}%`);
    check('2 個天生特質 20±2%', Math.abs(pct[2] - 20) <= 2, `${pct[2].toFixed(2)}%`);
  }

  /* ---- 同種子必定同組合（§1.4） ---- */
  {
    const first = innateHeld(createState({ name: 'S', role: 'MID', seed: 'innate-same' })).sort().join(',');
    let ok = true;
    for (let i = 0; i < 100; i++) {
      const got = innateHeld(createState({ name: 'S', role: 'MID', seed: 'innate-same' })).sort().join(',');
      if (got !== first) ok = false;
    }
    check('同種子必定同組合（100 次一致）', ok, first || '（0 個）');
    check('同一種子 2 個天生特質不重複', new Set(first.split(',')).size === (first ? first.split(',').length : 0));
  }

  /* ---- mentalBias 一致性（§9.1） ---- */
  {
    const want = INNATE_POOL.filter((e) => e.mentalBias);
    const seen = {};
    let i = 0;
    while (Object.keys(seen).length < want.length && i < 2000) {
      const s = createState({ name: 'M', role: 'MID', seed: `innate-bias-${i}` });
      i += 1;
      for (const e of want) {
        if (s.traits[e.key] && !seen[e.key]) {
          const v = s.mental[e.mentalBias.dim];
          const name = BASE_TRAITS[e.key].name;
          const pos = e.mentalBias.dir > 0;
          // §9.1：被指定維度改抽有向區間（+6~+10 或 −10~−6），不再是對稱 jitter
          const inRange = pos ? v >= MENTAL_BASE + 6 && v <= MENTAL_BASE + 10 : v >= MENTAL_BASE - 10 && v <= MENTAL_BASE - 6;
          check(`一致性：${name} 初始 ${e.mentalBias.dim} ${pos ? '>50' : '<50'}`, pos ? v > MENTAL_BASE : v < MENTAL_BASE, `${v}`);
          check(`有向區間：${name} ${e.mentalBias.dim} 落在 ${pos ? '56–60' : '40–44'}`, inRange, `${v}`);
          seen[e.key] = true;
        }
      }
    }
    check('所有帶 mentalBias 的條目都取到樣本', want.every((e) => seen[e.key]), Object.keys(seen).join('、'));
    // 2 個天生特質的種子：指定維度之外照舊 jitter（±10 內）
    const pair = innateHeld(createState({ name: 'M', role: 'MID', seed: 'innate-bias-2000' }));
    if (pair.length === 2) {
      const s = createState({ name: 'M', role: 'MID', seed: 'innate-bias-2000' });
      const biased = new Set(want.filter((e) => s.traits[e.key]).map((e) => e.mentalBias.dim));
      for (const k of MENTAL_KEYS) {
        if (biased.has(k)) continue;
        check(`未指定維度 ${k} 維持 ±10 jitter`, Math.abs(s.mental[k] - MENTAL_BASE) <= MENTAL_JITTER, `${s.mental[k]}`);
      }
    }
  }

  /* ---- 0 個天生特質的種子：六維維持 ±10 jitter（§9.1，行為與 v4.0 相同） ---- */
  {
    const sums = Object.fromEntries(MENTAL_KEYS.map((k) => [k, 0]));
    let n = 0;
    for (let i = 0; i < 600; i++) {
      const s = createState({ name: 'Z', role: 'MID', seed: `innate-zero-${i}` });
      if (innateHeld(s).length) continue;
      n += 1;
      for (const k of MENTAL_KEYS) {
        check(`0 特質種子六維在 jitter 範圍（${k}）`, Math.abs(s.mental[k] - MENTAL_BASE) <= MENTAL_JITTER, `${s.mental[k]}`);
        sums[k] += s.mental[k];
      }
    }
    check('0 特質種子樣本足夠（≥ 200）', n >= 200, `${n}`);
    for (const k of MENTAL_KEYS) {
      const mean = sums[k] / n;
      check(`0 特質種子 ${k} 均值貼近 50（±1）`, Math.abs(mean - MENTAL_BASE) <= 1, `${mean.toFixed(2)}`);
    }
  }
}
