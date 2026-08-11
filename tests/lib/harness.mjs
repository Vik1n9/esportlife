/**
 * 測試共用工具：驅動生涯、加點策略、決策策略。
 *
 * 引擎完全不碰 DOM，所以整段生涯可以在 Node 裡跑完。這個檔只提供「怎麼把
 * careerFlow 跑起來」，斷言留給各個 suite。
 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { careerFlow } from '../../src/engine/game.js';
import { investAbility, abilityCap, abilityKeys } from '../../src/engine/abilities.js';
import { OVR_WEIGHTS } from '../../src/data/abilities.js';

export const MAX_BEATS = 20000;

/** 策略：first 一律選第一個；last 盡量選最後一個非退役選項；random 隨機挑安全選項 */
export function decide(beat, strategy, rng) {
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
export function allocate(state, beat, style = 'focus') {
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

/**
 * 跑完一整段生涯。
 *
 * 引擎是 `(出生種子, 人生種子, 選擇)` 的確定性函式——遊戲本身每次開新局會隨機抽一個
 * 人生種子，所以同一個天賦每次過的人生都不同；測試則明確指定 `lifeSeed`，這樣回歸
 * 比對才有意義。`lifeSeed` 不給時預設等於出生種子，讓大多數測試只要寫一個種子。
 */
export function playCareer({ seed, lifeSeed = seed, role, name = 'TEST', strategy = 'first', style = 'focus' }) {
  const state = createState({ name, role, seed });
  const rng = new Rng(`${lifeSeed}:life`);
  const decisionRng = new Rng(`${lifeSeed}:decisions`);
  const flow = careerFlow({ state, rng });

  let input;
  let beats = 0;
  const beatTypes = {};
  for (;;) {
    const { value, done } = flow.next(input);
    input = undefined;
    if (done) break;
    if (++beats > MAX_BEATS) throw new Error(`beat 數超過 ${MAX_BEATS}，疑似無限迴圈（seed=${seed} life=${lifeSeed} role=${role}）`);
    beatTypes[value.type] = (beatTypes[value.type] || 0) + 1;

    if (value.type === 'choice') input = decide(value, strategy, decisionRng);
    else if (value.type === 'alloc') allocate(state, value, style);
  }
  return { state, beats, beatTypes, rng };
}

/** 一個 choice 是不是「有隊伍要簽你」——比對 option id，不依賴文案 */
export const isSigningOffer = (beat) => (beat.options || []).some((o) => o.id.startsWith('sign-'));

/** 驅動 careerFlow 直到某條件成立或步數用盡，回傳沿途所有 choice beat */
export function driveUntil(state, rng, { stop, answer, maxBeats = 600 }) {
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

/**
 * 跑一批生涯並收集結果。冒煙測試與黃金種子共用同一組樣本，避免兩邊各跑一次。
 */
export function playMatrix({ seeds, roles, styles = ['focus', 'spread'] }) {
  const runs = [];
  for (const seed of seeds) {
    for (const role of roles) {
      for (const style of styles) {
        const strategy = ['first', 'last', 'random'][seed.length % 3];
        runs.push({ seed, role, style, strategy, ...playCareer({ seed, role, strategy, style }) });
      }
    }
  }
  return runs;
}
