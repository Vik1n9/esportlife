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

console.log('▸ 9. 每個賽制分區都有中文名稱（避免結算表印出內部鍵值）');
{
  const { LEAGUES, BUCKET_NAMES } = await import('../src/data/world.js');
  const buckets = [...new Set(Object.values(LEAGUES).map((l) => l.bucket))];
  for (const b of buckets) check(`分區 ${b} 有對應名稱`, !!BUCKET_NAMES[b], `BUCKET_NAMES 缺 ${b}`);
  check('起點分區為 AMATEUR（網咖盃賽）', LEAGUES.AMATEUR?.name === '網咖盃賽', LEAGUES.AMATEUR?.name);
  check('起點無薪', LEAGUES.AMATEUR?.baseSalary === 0);
}

console.log('▸ 10. 生涯從網咖盃賽起步');
{
  const rng = new Rng('start-stage');
  const state = createState({ name: 'S', role: 'TOP', rng, seed: 'start-stage' });
  const { TEAMS_AMATEUR } = await import('../src/data/world.js');
  const { stageLabel } = await import('../src/engine/game.js');
  check('初始 stage 為 AMATEUR', state.stage === 'AMATEUR', state.stage);
  check('初始隊伍來自網咖名單', TEAMS_AMATEUR.includes(state.team), state.team);
  check('stageLabel 顯示網咖盃賽', stageLabel(state) === '網咖盃賽', stageLabel(state));
}

console.log('▸ 11. 數值達標就會被挖角，不必熬滿三年');

/** 一個 choice 是不是「有隊伍要簽你」——比對 option id，不依賴文案 */
const isSigningOffer = (beat) => (beat.options || []).some((o) => o.id.startsWith('sign-'));

/** 驅動 careerFlow 直到某條件成立或步數用盡，回傳所有 choice beat */
function driveUntil(state, rng, { stop, answer, maxBeats = 600 }) {
  const flow = careerFlow({ state, rng });
  const choices = [];
  let input;
  for (let i = 0; i < maxBeats; i++) {
    const { value, done } = flow.next(input);
    input = undefined;
    if (done) break;
    if (value.type === 'choice') {
      choices.push(value);
      input = answer(value);
    } else if (value.type === 'alloc') {
      allocate(state, value);
    }
    if (stop(state)) break;
  }
  return choices;
}

{
  // 天賦爆表的新人：一開局就遠超業餘水準
  const rng = new Rng('prodigy');
  const state = createState({ name: 'P', role: 'MID', rng, seed: 'prodigy' });
  for (const k of Object.keys(state.ability)) state.ability[k] = 60;
  for (const k of Object.keys(state.potential)) state.potential[k] = 80;

  const choices = driveUntil(state, rng, {
    stop: (st) => st.stage === 'PRO',
    answer: (beat) => beat.options[0].id,      // 一律接受最好的那個
  });
  check('三年期滿前就收到職業隊合約', choices.some(isSigningOffer), choices.map((c) => c.title).join(' / '));
  check('第一年（2012）就轉職業', state.stage === 'PRO' && state.year === 2012, `${state.stage}@${state.year}`);
  check('轉職業後有合約', !!state.contract);
  check('轉職業後 stageYear 歸零', state.stageYear === 0, String(state.stageYear));
}

{
  // 同一個天才選擇婉拒 → 留在業餘，隔年應該再次被找上門
  const rng = new Rng('prodigy');
  const state = createState({ name: 'P', role: 'MID', rng, seed: 'prodigy' });
  for (const k of Object.keys(state.ability)) state.ability[k] = 60;
  for (const k of Object.keys(state.potential)) state.potential[k] = 80;

  const choices = driveUntil(state, rng, {
    stop: (st) => st.year >= 2014,
    answer: (beat) => {
      if (!isSigningOffer(beat)) return beat.options[0].id;
      const wait = beat.options.find((o) => o.id === 'wait');
      return (wait || beat.options[0]).id;      // 一律婉拒
    },
  });
  const offers = choices.filter(isSigningOffer);
  check('婉拒後隔年仍會被找上門', offers.length >= 2, `收到 ${offers.length} 次邀約`);
  check('婉拒選項在強制年之前一定存在', offers.every((c) => c.options.some((o) => o.id === 'wait')));
  check('婉拒不會被強制轉職業', state.stage === 'AMATEUR', state.stage);
}

{
  // 數值不達標就不該有人上門
  const rng = new Rng('nobody');
  const state = createState({ name: 'N', role: 'SUP', rng, seed: 'nobody' });
  for (const k of Object.keys(state.ability)) state.ability[k] = 25;
  for (const k of Object.keys(state.potential)) state.potential[k] = 30;   // 加點也漲不動

  const choices = driveUntil(state, rng, {
    stop: (st) => st.year >= 2014,
    answer: (beat) => beat.options[0].id,
  });
  check('沒達標就沒有星探', !choices.some(isSigningOffer), choices.map((c) => c.title).join(' / '));
  check('沒達標仍留在業餘', state.stage === 'AMATEUR', state.stage);
}

{
  // 只夠青訓的實力，不該收到一隊的邀約（舊版就是把打不到的選項擺出來騙人）
  const { SCOUT_BAR } = await import('../src/engine/market.js');
  const rng = new Rng('academy-only');
  const state = createState({ name: 'A', role: 'JG', rng, seed: 'academy-only' });
  for (const k of Object.keys(state.ability)) state.ability[k] = 40;   // 介於青訓 36 與一隊 45 之間
  for (const k of Object.keys(state.potential)) state.potential[k] = 42;

  check('門檻層級由低到高', SCOUT_BAR.AM2 < SCOUT_BAR.HOME && SCOUT_BAR.HOME <= SCOUT_BAR.OVERSEAS,
    JSON.stringify(SCOUT_BAR));

  const choices = driveUntil(state, rng, {
    stop: (st) => st.stage !== 'AMATEUR',
    answer: (beat) => beat.options[0].id,
  });
  const offer = choices.find(isSigningOffer);
  check('這種實力會收到邀約', !!offer);
  check('只會是青訓二隊，不會有一隊選項',
    offer && offer.options.filter((o) => o.id.startsWith('sign-')).every((o) => /青訓二隊/.test(o.label)),
    offer && offer.options.map((o) => o.label).join(' / '));
  check('簽下後進入 AM2', state.stage === 'AM2', state.stage);
}

console.log('▸ 12. 青訓隊名不會出現時代錯置');
{
  const { academyTeamsOf } = await import('../src/engine/team.js');
  const { DISBAND_YEAR, TEAMS_HOME, eraOf } = await import('../src/data/world.js');
  const rng = new Rng('academy-era');
  const state = createState({ name: 'E', role: 'MID', rng, seed: 'academy-era' });
  for (const year of [2013, 2017, 2022, 2027]) {
    state.year = year;
    const pool = academyTeamsOf(state, 'HOME');
    check(`${year} 年二隊名單非空`, pool.length > 0);
    const parents = pool.map((t) => t.replace(/ 二隊$/, ''));
    const era = eraOf(year).home;
    for (const p of parents) {
      check(`${year} 年的二隊母隊當年存在（${p}）`, TEAMS_HOME[era].includes(p) && !(DISBAND_YEAR[p] <= year));
    }
  }
  state.year = 2013;
  check('2013 年不會出現 PSG Talon 二隊（PSG Talon 2020 才成立）',
    !academyTeamsOf(state, 'HOME').some((t) => t.includes('PSG Talon')),
    academyTeamsOf(state, 'HOME').join(' / '));
}

console.log('▸ 13. 賽段結構隨史實演進');
{
  const { splitsOf } = await import('../src/data/world.js');
  check('2012 主場賽區只有單季', splitsOf(2012, 'HOME').length === 1, splitsOf(2012, 'HOME').map((s) => s.name).join('/'));
  check('2016 主場賽區為春／夏兩賽段', splitsOf(2016, 'HOME').length === 2, splitsOf(2016, 'HOME').map((s) => s.name).join('/'));
  check('2025 主場賽區為三賽段', splitsOf(2025, 'HOME').length === 3, splitsOf(2025, 'HOME').map((s) => s.name).join('/'));
  check('2013 韓國是冬／春／夏三季（OGN Champions）', splitsOf(2013, 'KR').length === 3, splitsOf(2013, 'KR').map((s) => s.name).join('/'));
  check('2018 韓國回到兩賽段', splitsOf(2018, 'KR').length === 2, splitsOf(2018, 'KR').map((s) => s.name).join('/'));
  check('2023 歐洲已改三賽段', splitsOf(2023, 'EU').length === 3, splitsOf(2023, 'EU').map((s) => s.name).join('/'));
  for (const region of ['HOME', 'KR', 'CN', 'EU', 'NA']) {
    for (const year of [2012, 2016, 2021, 2025, 2031]) {
      const w = splitsOf(year, region).reduce((t, s) => t + s.weight, 0);
      check(`${year} ${region} 賽段場次權重總和為 1`, Math.abs(w - 1) < 1e-9, w);
    }
  }
}

console.log('▸ 14. 心理值不對玩家揭露數字');
{
  const { mentalSummary } = await import('../src/engine/mental.js');
  const rng = new Rng('mental-hidden');
  const state = createState({ name: 'M', role: 'SUP', rng, seed: 'mental-hidden' });
  const rows = mentalSummary(state);
  check('五個心理維度都有標籤', rows.length === 5 && rows.every((r) => r.tier), JSON.stringify(rows));
  check('摘要不含任何數值欄位', rows.every((r) => !('value' in r)), JSON.stringify(rows));
  check('標籤本身不含數字', rows.every((r) => !/\d/.test(r.tier)), rows.map((r) => r.tier).join('/'));
}

console.log('▸ 15. 扮演卡只動心理值，不碰能力值');
{
  const { ROLEPLAY_CARDS } = await import('../src/data/roleplay.js');
  const { MENTAL_KEYS } = await import('../src/data/mental.js');
  const allowed = new Set(MENTAL_KEYS);
  for (const c of ROLEPLAY_CARDS) {
    check(`${c.name} 有 2 個以上選項`, c.options.length >= 2);
    for (const o of c.options) {
      check(`${c.name}／${o.id} 不含 ability 欄位`, !o.ability);
      const keys = Object.keys(o.mental || {});
      check(`${c.name}／${o.id} 只寫心理維度`, keys.length > 0 && keys.every((k) => allowed.has(k)), keys.join(','));
    }
    check(`${c.name} 三種語氣齊備`, new Set(c.options.map((o) => o.tone)).size === c.options.length);
  }
}

console.log('▸ 16. 季後賽是逐局 BO 系列，不是一次擲骰');
{
  const { runSeries, worldsSeed, splitSeed } = await import('../src/engine/playoffs.js');
  const rng = new Rng('series');
  const state = createState({ name: 'P', role: 'TOP', rng, seed: 'series' });
  state.league = 'HOME'; state.stage = 'PRO';
  for (const bo of [3, 5]) {
    const need = Math.ceil(bo / 2);
    for (let i = 0; i < 200; i++) {
      const res = runSeries(state, rng, { bo, oppOvr: 53, seed: 2 });
      check(`BO${bo} 勝方剛好拿到 ${need} 勝`, Math.max(res.mine, res.theirs) === need, `${res.mine}-${res.theirs}`);
      check(`BO${bo} 總局數不超過 ${bo}`, res.mine + res.theirs <= bo, `${res.mine}-${res.theirs}`);
      check(`BO${bo} 比分與勝負一致`, res.win === (res.mine > res.theirs));
    }
  }
  check('冠軍點數不足就沒有世界賽門票', worldsSeed(0) === 0 && worldsSeed(39) === 0);
  check('點數越高種子序越前', worldsSeed(160) === 1 && worldsSeed(120) === 2 && worldsSeed(80) === 3 && worldsSeed(45) === 4);
  check('例行賽越強種子序越前', splitSeed(state, { G: 100, W: 80, delta: 5 }) === 1 && splitSeed(state, { G: 100, W: 30, delta: -3 }) === 4);
}

console.log('▸ 17. 下剋上劇本走得通，但不是常態');
{
  const { underdogBonus } = await import('../src/engine/mental.js');
  const rng = new Rng('underdog');
  const state = createState({ name: 'U', role: 'MID', rng, seed: 'underdog' });
  state.mental.nerve = 95; state.mental.chem = 90;
  check('第一種子拿不到下剋上加成', underdogBonus(state, 1) === 0);
  check('種子序越後加成越大', underdogBonus(state, 4) > underdogBonus(state, 2));
  check('加成有上限，不會讓弱隊變強隊', underdogBonus(state, 4) <= 11, underdogBonus(state, 4));
  const weak = createState({ name: 'W', role: 'MID', rng, seed: 'underdog-w' });
  weak.mental.nerve = 20; weak.mental.chem = 20;
  check('心理素質不夠就沒有下剋上', underdogBonus(weak, 4) === 0, underdogBonus(weak, 4));
}

console.log('▸ 18. 更衣室與輿論會有後果，但有冷卻不會變常態');
{
  const { clubVerdict } = await import('../src/engine/market.js');
  const rng = new Rng('verdict');
  const state = createState({ name: 'V', role: 'ADC', rng, seed: 'verdict' });
  state.stage = 'PRO'; state.league = 'HOME'; state.contract = { years: 3, mult: 1 }; state.year = 2020;

  state.mental.chem = 50; state.mental.rep = 0;
  let fired = 0;
  for (let i = 0; i < 200; i++) { state.lastVerdictYear = null; if (clubVerdict(state, rng).kind !== 'none') fired++; }
  check('心理狀態正常時不會被開除', fired === 0, fired);

  state.mental.chem = 5;
  fired = 0;
  for (let i = 0; i < 400; i++) { state.lastVerdictYear = null; if (clubVerdict(state, rng).kind === 'rift') fired++; }
  check('默契崩到底會被迫轉隊', fired > 100, fired);

  state.lastVerdictYear = 2020;
  check('冷卻期內不會連續兩年被拆隊', clubVerdict(state, rng).kind === 'none');
  state.year = 2024;
  check('冷卻結束後恢復判定', [0, 1].includes([...Array(50)].filter(() => { state.lastVerdictYear = 2020; return clubVerdict(state, rng).kind !== 'none'; }).length > 0 ? 1 : 0));
}

console.log('▸ 19. 例：一段生涯的年表');
{
  const { state } = playCareer({ seed: 'showcase', role: 'MID', name: 'Showcase', strategy: 'first' });
  console.log(`  ${state.name}｜${state.proYears} 職業季｜巔峰 OVR ${state.peakOvr}｜評分 ${careerScore(state)}（${TIER_NAMES[careerTier(state)]}）`);
  console.log(`  退役：${state.retireReason}`);
  console.log(`  榮譽 ${state.honors.length} 項，最後 3 項：${state.honors.slice(-3).join('、') || '無'}`);
}

console.log('');
if (failures) { console.error(`✗ ${failures} 項檢查失敗`); process.exit(1); }
console.log('✓ 全部檢查通過');
