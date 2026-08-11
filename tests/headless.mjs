/**
 * Headless 回歸測試。
 *
 * 引擎完全不碰 DOM，所以整段生涯可以在 Node 裡跑完。
 * 這支腳本會：
 *   1. 用多組種子 × 五個位置跑完整生涯，確認不會拋例外、不會無限迴圈。
 *   2. 驗證種子決定論（同種子＋同策略＝逐字相同的狀態）。
 *   3. 統計生涯評價分布，檢查分級沒有全部塞在同一格。
 *   4. 抽查一批不變式（能力上限、合約年限、版本落差上下界…）。
 *
 * 執行：node tests/headless.mjs
 */
import { Rng } from '../src/core/rng.js';
import { createState } from '../src/engine/state.js';
import { careerFlow } from '../src/engine/game.js';
import { investAbility, abilityCap, abilityKeys } from '../src/engine/abilities.js';
import { careerTier, careerScore } from '../src/engine/career.js';
import { ROLES, OVR_WEIGHTS } from '../src/data/abilities.js';
import { TIER_NAMES } from '../src/data/events.js';

const MAX_BEATS = 20000;

/** 策略：aggressive 一律選第一個選項；cautious 盡量選最後一個非退役選項 */
function decide(beat, strategy, rng) {
  const options = beat.options;
  if (strategy === 'first') return options[0].id;
  if (strategy === 'last') {
    const safe = options.filter((o) => !o.warn);
    return (safe.length ? safe[safe.length - 1] : options[0]).id;
  }
  const safe = options.filter((o) => !o.warn);
  return (safe.length ? safe[Math.floor(rng.next() * safe.length)] : options[0]).id;
}

/**
 * 加點策略。
 * - `spread` 輪流平均投入（新手打法，故意打得很差）。
 * - `focus`  優先餵權重高、且還沒碰到潛力天花板的能力（老手打法）。
 */
function allocate(state, beat, style = 'focus') {
  const keys = abilityKeys(state);
  const cap = abilityCap(state);
  const units = beat.mode === 'dice' ? beat.dice : Array.from({ length: beat.points }, () => 1);
  const weights = OVR_WEIGHTS[state.role];

  let i = 0;
  for (const unit of units) {
    let key;
    if (style === 'spread') {
      let tries = 0;
      while (state.ability[keys[i % keys.length]] >= cap && tries < keys.length) { i++; tries++; }
      if (tries >= keys.length) break;
      key = keys[i % keys.length];
      i++;
    } else {
      const usable = keys.filter((k) => state.ability[k] < cap);
      if (!usable.length) break;
      // 分數＝OVR 權重 ÷ 目前價位，並強烈懲罰已超過潛力上限的項目
      key = usable.reduce((best, k) => {
        const score = (weights[k] || 0.02)
          * (state.ability[k] >= (state.potential[k] ?? 62) ? 0.25 : 1)
          / (state.ability[k] >= 66 ? 7 : state.ability[k] >= 58 ? 4 : state.ability[k] >= 50 ? 2 : 1);
        return score > best.score ? { k, score } : best;
      }, { k: usable[0], score: -1 }).k;
    }
    investAbility(state, key, unit);
  }
}

function playCareer({ seed, role, name = 'TEST', strategy = 'first', style = 'focus' }) {
  const rng = new Rng(seed);
  const state = createState({ name, role, rng, seed });
  const decisionRng = new Rng(`${seed}:decisions`);
  const flow = careerFlow({ state, rng });

  let input;
  let beats = 0;
  const beatTypes = {};
  for (;;) {
    const { value, done } = flow.next(input);
    input = undefined;
    if (done) break;
    if (++beats > MAX_BEATS) throw new Error(`beat 數超過 ${MAX_BEATS}，疑似無限迴圈（seed=${seed} role=${role}）`);
    beatTypes[value.type] = (beatTypes[value.type] || 0) + 1;

    if (value.type === 'choice') input = decide(value, strategy, decisionRng);
    else if (value.type === 'alloc') allocate(state, value, style);
  }
  return { state, beats, beatTypes, rng };
}

/* ---------------- 測試 ---------------- */

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) return;
  failures++;
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
};

const seeds = Array.from({ length: 16 }, (_, i) => `seed-${i}`);
const RUNS = seeds.length * ROLES.length;
console.log(`▸ 1. 全生涯冒煙測試（${RUNS * 2} 段生涯：老手打法 ×${RUNS}、新手打法 ×${RUNS}）`);
const tierCounts = { focus: new Array(TIER_NAMES.length).fill(0), spread: new Array(TIER_NAMES.length).fill(0) };
const endYears = [];
for (const seed of seeds) {
  for (const role of ROLES) {
   for (const style of ['focus', 'spread']) {
    const strategy = ['first', 'last', 'random'][seed.length % 3];
    const { state } = playCareer({ seed, role, strategy, style });
    check('生涯必須結束', state.done, `${seed}/${role}`);
    check('必須有退役原因', !!state.retireReason, `${seed}/${role}`);
    check('年齡不得超過 41', state.age <= 41, `${seed}/${role} age=${state.age}`);
    check('版本落差在 0..10', state.patchDebt >= 0 && state.patchDebt <= 10, `${seed}/${role}`);
    check('英雄池不超過 8', state.heroPool.length <= 8, `${seed}/${role}`);
    check('薪資非負', state.salary >= 0, `${seed}/${role}`);
    const cap = abilityCap(state);
    for (const [k, v] of Object.entries(state.ability)) {
      check('能力值在 1..cap', v >= 1 && v <= cap, `${seed}/${role} ${k}=${v}/${cap}`);
    }
    if (state.contract) check('合約年限非負', state.contract.years >= 0, `${seed}/${role}`);
    tierCounts[style][careerTier(state)]++;
    endYears.push(state.year);
   }
  }
}
console.log(`  完成 ${RUNS * 2} 段生涯，退役年份 ${Math.min(...endYears)}–${Math.max(...endYears)}`);

console.log('▸ 2. 種子決定論');
for (const role of ['MID', 'SUP']) {
  const a = playCareer({ seed: 'determinism', role, strategy: 'first' });
  const b = playCareer({ seed: 'determinism', role, strategy: 'first' });
  check(`同種子同策略結果一致（${role}）`, JSON.stringify(a.state) === JSON.stringify(b.state));
  check(`同種子亂數進度一致（${role}）`, a.rng.state === b.rng.state);
}
const diff = playCareer({ seed: 'determinism-x', role: 'MID', strategy: 'first' });
const same = playCareer({ seed: 'determinism', role: 'MID', strategy: 'first' });
check('不同種子產生不同人生', JSON.stringify(diff.state) !== JSON.stringify(same.state));

console.log('▸ 3. 生涯評價分布');
console.log(`  ${'　　　　　　'}  老手打法 ｜ 新手打法`);
TIER_NAMES.forEach((name, i) => {
  const f = tierCounts.focus[i]; const s2 = tierCounts.spread[i];
  console.log(`  ${name.padEnd(7, '　')} ${String(f).padStart(3)} 段 ｜ ${String(s2).padStart(3)} 段  ${'█'.repeat(f)}${'░'.repeat(s2)}`);
});
check('老手打法：傳奇不得超過三成（舊版是人人傳奇）', tierCounts.focus[0] <= RUNS * 0.3, `傳奇 ${tierCounts.focus[0]}/${RUNS} 段`);
check('新手打法：不該出現傳奇', tierCounts.spread[0] === 0, `傳奇 ${tierCounts.spread[0]} 段`);
check('打法要拉得開差距', tierCounts.spread[4] > tierCounts.focus[4], `邊緣 新手 ${tierCounts.spread[4]} vs 老手 ${tierCounts.focus[4]}`);
check('五個等第都出現得到', TIER_NAMES.every((_, i) => tierCounts.focus[i] + tierCounts.spread[i] > 0), JSON.stringify(tierCounts));

console.log('▸ 4. 特質合成');
{
  const rng = new Rng('fusion');
  const state = createState({ name: 'F', role: 'MID', rng, seed: 'fusion' });
  const { checkFusions, unlockTrait } = await import('../src/engine/progression.js');
  unlockTrait(state, 'veteran'); unlockTrait(state, 'disc'); unlockTrait(state, 'single');
  const gained = checkFusions(state);
  check('老將＋自律＋單身 → 不老傳奇', gained.includes('ageless'), gained.join(','));
  check('基礎特質被消耗', !state.traits.veteran && !state.traits.disc && !state.traits.single);
  check('消耗紀錄留下', state.fusedAway.length === 3);
  check('被消耗的特質不會重新解鎖', unlockTrait(state, 'veteran') === false);
}

console.log('▸ 5. 版本落差方向');
{
  const rng = new Rng('patch');
  const state = createState({ name: 'P', role: 'ADC', rng, seed: 'patch' });
  const { applyPatch, adjustPatchDebt } = await import('../src/engine/progression.js');
  const { patchPenalty } = await import('../src/engine/abilities.js');
  for (let i = 0; i < 6; i++) applyPatch(state, rng);
  const worse = patchPenalty(state);
  adjustPatchDebt(state, -4);
  const better = patchPenalty(state);
  check('改版讓落差變重', worse < 0, `penalty=${worse}`);
  check('版本補習讓落差變輕（舊版方向寫反）', better > worse, `${worse} → ${better}`);
}

console.log('▸ 6. 自由市場不會把海外選手強制降級');
{
  const rng = new Rng('market');
  const state = createState({ name: 'M', role: 'TOP', rng, seed: 'market' });
  const { generateOffers } = await import('../src/engine/market.js');
  state.stage = 'PRO'; state.league = 'LCK'; state.team = 'T1'; state.lastDelta = 4;
  for (const k of Object.keys(state.ability)) state.ability[k] = 75;
  const offers = generateOffers(state, rng, { excludeCurrentTeam: false });
  check('頂尖選手收到海外報價', offers.some((o) => ['LCK', 'LPL', 'LEC', 'LCS'].includes(o.league)), JSON.stringify(offers.map((o) => o.league)));
}

console.log('▸ 7. 已解散的戰隊不會再出現在簽約名單');
{
  const { teamsOf } = await import('../src/engine/team.js');
  const { DISBAND_YEAR } = await import('../src/data/world.js');
  const rng = new Rng('disband');
  const state = createState({ name: 'D', role: 'JG', rng, seed: 'disband' });
  for (const year of [2016, 2019, 2020, 2023, 2026]) {
    state.year = year;
    for (const league of ['HOME', 'LCK', 'LPL', 'LEC', 'LCS']) {
      const pool = teamsOf(state, league);
      const dead = pool.filter((t) => DISBAND_YEAR[t] <= year);
      check(`${year} 年 ${league} 名單不含已解散戰隊`, dead.length === 0, dead.join(','));
      check(`${year} 年 ${league} 名單非空`, pool.length > 0);
    }
  }
  // 閃電狼 2019 解散：2018 年可簽、2019 年起不可簽
  state.year = 2018;
  check('2018 年閃電狼仍可簽', teamsOf(state, 'HOME').includes('閃電狼'));
  state.year = 2019;
  check('2019 年閃電狼不可再簽（舊版可以，導致史實解散被繞過）', !teamsOf(state, 'HOME').includes('閃電狼'));
}

console.log('▸ 8. 在解散年身處該隊 → 強制自由市場');
{
  const rng = new Rng('forced-fa');
  const state = createState({ name: 'X', role: 'ADC', rng, seed: 'forced-fa' });
  const { disbandNoteFor } = await import('../src/engine/market.js');
  state.year = 2019; state.team = '閃電狼'; state.stage = 'PRO'; state.league = 'HOME';
  check('解散事件查得到', !!disbandNoteFor(state));
  state.team = 'J Team';
  check('同年其他隊不受影響', !disbandNoteFor(state));
}

console.log('▸ 9. 例：一段生涯的年表');
{
  const { state } = playCareer({ seed: 'showcase', role: 'MID', name: 'Showcase', strategy: 'first' });
  console.log(`  ${state.name}｜${state.proYears} 職業季｜巔峰 OVR ${state.peakOvr}｜評分 ${careerScore(state)}（${TIER_NAMES[careerTier(state)]}）`);
  console.log(`  退役：${state.retireReason}`);
  console.log(`  榮譽 ${state.honors.length} 項，最後 3 項：${state.honors.slice(-3).join('、') || '無'}`);
}

console.log('');
if (failures) { console.error(`✗ ${failures} 項檢查失敗`); process.exit(1); }
console.log('✓ 全部檢查通過');
