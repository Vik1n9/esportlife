/**
 * 測試共用工具：驅動生涯、加點策略、決策策略。
 *
 * 引擎完全不碰 DOM，所以整段生涯可以在 Node 裡跑完。這個檔只提供「怎麼把
 * careerFlow 跑起來」，斷言留給各個 suite。
 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { careerFlow } from '../../src/engine/game.js';
import { investAttr, attrCap, attrKeys, decayCoef, coachRating } from '../../src/engine/attributes.js';
import { staminaOf } from '../../src/engine/stamina.js';
import { ROLE_ATTR_WEIGHTS } from '../../src/data/skills.js';
import { ATTRS, POTENTIAL_BANDS } from '../../src/data/attributes.js';

/** `state.potential` 缺鍵時的保底，與 `engine/attributes.js` 同一個值 */
const DEFAULT_POTENTIAL = Math.round((POTENTIAL_BANDS[3][0] + POTENTIAL_BANDS[3][1]) / 2);

/**
 * 一段生涯的 beat 上限。
 *
 * S14 把回合粒度從年換成月，一年多出約八個養成回合（各自帶選單、訓練成果、可能的
 * 事件與當月戰報），beat 數約成長 2.4 倍（實測平均 811 → 1936、最長 3500 上下）。
 * 20000 對月回合仍有五倍餘裕，但它擋的是「無限迴圈」而不是「有點多」，所以照樣調高
 * 一級留同樣的比例。
 */
export const MAX_BEATS = 40000;

/**
 * 月回合的行動策略（保守玩法）。
 *
 * S13 時這段判斷住在引擎裡（`stamina.js` 的 `planMonth` 自動駕駛），因為玩家還沒有
 * 每月選擇的入口。S14 之後**引擎不再替玩家做決定**，但測試需要一個「玩家」——所以
 * 同一條判準搬到這裡：體力掉到 45 以下就休息。45 ＝ §6.2 的透支線 30 再加半次訓練
 * 的緩衝，低於這條線還硬練一定會踩進「成功率腰斬」那一格。
 *
 * ⚠ 這條策略就是「體力節奏」不變式量到的那個玩家。改它等於改那條不變式的受測對象。
 */
export const REST_AT = 45;

export function monthAction(state, beat) {
  const ids = beat.options.map((o) => o.id);
  const pick = (...want) => want.find((id) => ids.includes(id)) || ids[0];
  if (staminaOf(state) >= REST_AT) return pick('train');
  return pick('rest', 'light');
}

/**
 * 備賽戰術的策略（保守玩法）。賽事期間不能休息，唯一的決策是「這一場 BO 花多少
 * 體力去準備」：
 *
 * - 體力低（< 45）→ 心態調整與休息（mindset）：賽事期唯一的恢復手段，不選它等於
 *   帶着疲勞進下一輪
 * - 體力夠 → 強化自身體系（system）：沒有隨機項的穩定加成。刻意避開 research（會被
 *   反制）與 bootcamp（受傷風險）——那是賭博型玩家的選擇，不是保守玩法的
 *
 * 這條策略是「體力節奏」不變式量到的那個玩家的一部分，跟 `monthAction` 同一個道理：
 * 保守玩家不會拿受傷風險去換那多一點勝率。
 */
export function tacticsAction(state, beat) {
  const ids = beat.options.map((o) => o.id);
  if (staminaOf(state) < REST_AT) return ids.includes('mindset') ? 'mindset' : ids[0];
  return ids.includes('system') ? 'system' : ids[0];
}

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
  return Math.max(1, ceiling - coachRating(state));
}

/** 同一個種子／位置在**出生那一刻**的可成長空間（天賦是出生種子的確定性函式，重生即可） */
export function birthGrowthRoom({ seed, role }) {
  return growthRoom(createState({ name: 'ROOM', role, seed }));
}

/**
 * 策略：first 一律選第一個；last 盡量選最後一個非退役選項；random 隨機挑安全選項。
 *
 * 月回合的行動選單不吃這三種策略——它有正確答案（見 `monthAction`）。「一律選最後
 * 一個」在那張選單上等於「每個月都復健」，量到的就不是這組數值的節奏了。
 */
export function decide(beat, strategy, rng, state) {
  if (beat.kind === 'month' && state) return monthAction(state, beat);
  if (beat.kind === 'tactics' && state) return tacticsAction(state, beat);
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
 *
 * ⚠ `cursor` 是 `spread` 的輪替位置，**必須跨 beat 活著**。S14 之前一年只發一次骰
 * （4~7 顆），輪替在單次呼叫裡就跑完一圈；月回合之後一次只發一顆，游標若每次從 0
 * 開始，「平均分配」會退化成「永遠投第一個屬性」——新手打法會被弄成一個比新手更
 * 極端的打法，而 `smoke.mjs` 的等第分布與傳奇率全部靠這兩種打法的對照。
 */
export function allocate(state, beat, style = 'focus', cursor = { i: 0 }) {
  const keys = attrKeys(state);
  const cap = attrCap(state);
  const units = beat.mode === 'dice' ? beat.dice : Array.from({ length: beat.points }, () => 1);
  // 位置 → 屬性的合成權重，等同於「這一點投下去，OVR 會漲多少」
  const weights = ROLE_ATTR_WEIGHTS[state.role];

  let i = cursor.i;
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
  cursor.i = i;
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

  const cursor = { i: 0 };
  let input;
  let beats = 0;
  const beatTypes = {};
  for (;;) {
    const { value, done } = flow.next(input);
    input = undefined;
    if (done) break;
    if (++beats > MAX_BEATS) throw new Error(`beat 數超過 ${MAX_BEATS}，疑似無限迴圈（seed=${seed} life=${lifeSeed} role=${role}）`);
    beatTypes[value.type] = (beatTypes[value.type] || 0) + 1;

    if (value.type === 'choice') input = decide(value, strategy, decisionRng, state);
    else if (value.type === 'alloc') allocate(state, value, style, cursor);
  }
  return { state, beats, beatTypes, rng };
}

/** 一個 choice 是不是「有隊伍要簽你」——比對 option id，不依賴文案 */
export const isSigningOffer = (beat) => (beat.options || []).some((o) => o.id.startsWith('sign-'));

/** 驅動 careerFlow 直到某條件成立或步數用盡，回傳沿途所有 choice beat */
export function driveUntil(state, rng, { stop, answer, maxBeats = 3000 }) {
  const flow = careerFlow({ state, rng });
  const choices = [];
  const cursor = { i: 0 };
  let input;
  for (let i = 0; i < maxBeats; i++) {
    const { value, done } = flow.next(input);
    input = undefined;
    if (done) break;
    if (value.type === 'choice') {
      // 月回合的行動選單與賽事備賽戰術不進 choices，也不問 answer——它們是策略題不是劇情題
      if (value.kind === 'month') { input = monthAction(state, value); continue; }
      if (value.kind === 'tactics') { input = tacticsAction(state, value); continue; }
      choices.push(value);
      input = answer(value);
    } else if (value.type === 'alloc') {
      allocate(state, value, 'focus', cursor);
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
