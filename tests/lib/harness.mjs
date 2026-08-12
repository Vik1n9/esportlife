/**
 * 測試共用工具：驅動生涯、加點策略、決策策略。
 *
 * 引擎完全不碰 DOM，所以整段生涯可以在 Node 裡跑完。這個檔只提供「怎麼把
 * careerFlow 跑起來」，斷言留給各個 suite。
 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { careerFlow } from '../../src/engine/game.js';
import { investAttr, attrCap, attrKeys, decayCoef, ovr } from '../../src/engine/attributes.js';
import { ROLE_ATTR_WEIGHTS } from '../../src/data/skills.js';
import { ATTRS, POTENTIAL_BANDS } from '../../src/data/attributes.js';

/** `state.potential` 缺鍵時的保底，與 `engine/attributes.js` 同一個值 */
const DEFAULT_POTENTIAL = Math.round((POTENTIAL_BANDS[3][0] + POTENTIAL_BANDS[3][1]) / 2);

export const MAX_BEATS = 20000;

/**
 * 這個天賦從現在到潛力天花板還有多少 OVR 可以長。
 *
 * 「加點是不是決策」的門檻要拿它當母數，不能拿 `ATTR_CAP`：加點能賺到的差距與
 * 「還有多遠可以長」成正比，跟上限是幾分制無關。比例只對**刻度**免疫，對**起始值**
 * 不免疫——S09 依 V4 §7.3 把起始值改成潛力的 0.80／0.70 之後（可成長空間從
 * 0.405×上限掉到 0.190×上限），原本除以 `ATTR_CAP` 的門檻就整批誤報了。
 *
 * ⚠ 要量的是**出生時**的空間。生涯跑完之後它已經被花掉了，對著結束狀態算會得到
 * 接近零甚至負的數字——所以生涯層級的用法要走 `birthGrowthRoom` 重生一份天賦。
 */
export function growthRoom(state) {
  const w = ROLE_ATTR_WEIGHTS[state.role] || {};
  const ceiling = ATTRS.reduce((t, k) => t + (w[k] || 0) * (state.potential[k] ?? DEFAULT_POTENTIAL), 0);
  return Math.max(1, ceiling - ovr(state));
}

/** 同一個種子／位置在**出生那一刻**的可成長空間（天賦是出生種子的確定性函式，重生即可） */
export function birthGrowthRoom({ seed, role }) {
  return growthRoom(createState({ name: 'ROOM', role, seed }));
}

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
 * 加點策略。投的是六大屬性——技能是導出值，沒有加點這回事。
 * - `spread` 輪流平均投入（新手打法，故意打得很差）。
 * - `focus`  優先餵權重高、且還沒碰到潛力天花板的屬性（老手打法）。
 */
export function allocate(state, beat, style = 'focus') {
  const keys = attrKeys(state);
  const cap = attrCap(state);
  const units = beat.mode === 'dice' ? beat.dice : Array.from({ length: beat.points }, () => 1);
  // 位置 → 屬性的合成權重，等同於「這一點投下去，OVR 會漲多少」
  const weights = ROLE_ATTR_WEIGHTS[state.role];

  let i = 0;
  for (const unit of units) {
    let key;
    if (style === 'spread') {
      let tries = 0;
      while (state.attr[keys[i % keys.length]] >= cap && tries < keys.length) { i++; tries++; }
      if (tries >= keys.length) break;
      key = keys[i % keys.length];
      i++;
    } else {
      const usable = keys.filter((k) => state.attr[k] < cap);
      if (!usable.length) break;
      /*
       * 分數＝OVR 權重 × 這一點的實際成長效率，並強烈懲罰已超過潛力上限的項目。
       *
       * 舊版把價位寫成 1–80 刻度的門檻表（`>=66 ? 7 : >=58 ? 4 : >=50 ? 2 : 1`），
       * 那是 `GROWTH_COST` 的手抄本。0–100 之後成本不再是階梯而是連續的潛力衰減，
       * 所以直接讀引擎的 `decayCoef`（＝ 1 ÷ 單點成本）——換刻度時這裡不必再跟著抄，
       * 老手策略也不會退化成「看權重不看價位」（S07 交接筆記點名的坑）。
       */
      key = usable.reduce((best, k) => {
        const potential = state.potential[k] ?? DEFAULT_POTENTIAL;
        const score = (weights[k] || 0.02)
          * (state.attr[k] >= potential ? 0.25 : 1)
          * decayCoef(state.attr[k], potential);
        return score > best.score ? { k, score } : best;
      }, { k: usable[0], score: -1 }).k;
    }
    investAttr(state, key, unit);
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
