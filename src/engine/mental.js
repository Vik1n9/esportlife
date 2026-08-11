/**
 * 心理值的讀寫與衍生效果。
 *
 * 設計原則：能力值決定「你打得多好」，心理值決定「你在什麼場合打得出來、
 * 隊友願不願意跟你打、戰隊願不願意留你」。兩條軸不互相加減，只在結算時交會。
 */
import { clamp } from '../core/rng.js';
import { MENTAL_KEYS, MENTAL_NAMES, MENTAL_RANGE, mentalTier } from '../data/mental.js';

/**
 * 邊際遞減。
 *
 * 一段生涯會經過四、五十個扮演路口，如果每次 +5 都照單全收，只要一路選同一種
 * 語氣，每一項都會在中期就頂到 100——性格就不是選擇而是打卡了。所以越極端的
 * 值越難再往同方向推，往回走則不打折：要變成另一種人，永遠比繼續當同一種人容易。
 */
function diminish(key, value, delta) {
  const [lo, hi] = MENTAL_RANGE[key];
  const span = (hi - lo) / 2;
  const mid = (hi + lo) / 2;
  const away = (value - mid) / span;                 // -1（谷底）～ +1（頂點）
  const pushingOut = Math.sign(delta) === Math.sign(away || delta);
  if (!pushingOut) return delta;                      // 往回拉不打折
  const factor = clamp(1 - Math.abs(away) * 1.15, 0.2, 1);
  const scaled = delta * factor;
  return Math.sign(delta) * Math.max(Math.abs(delta) >= 1 ? 1 : 0, Math.round(Math.abs(scaled)));
}

/**
 * 調整一個心理值，回傳實際變動量（夾在上下界內）。
 * @returns {number}
 */
export function adjustMental(state, key, delta) {
  if (!delta || !MENTAL_RANGE[key]) return 0;
  const [lo, hi] = MENTAL_RANGE[key];
  const before = state.mental[key];
  state.mental[key] = clamp(before + diminish(key, before, delta), lo, hi);
  return state.mental[key] - before;
}

/**
 * 心理值一律不對玩家揭露數字——只給方向與強度的箭頭。
 *
 * 這是刻意的：能力值是「訓練成果」，看得到數字才知道要投哪裡；心理值是
 * 「你把自己演成了什麼人」，攤開成數字之後玩家就會開始最佳化它，扮演就沒了。
 */
function arrow(applied) {
  const n = Math.abs(applied) >= 8 ? 3 : Math.abs(applied) >= 4 ? 2 : 1;
  const glyph = (applied > 0 ? '↑' : '↓').repeat(n);
  return `<span class="${applied > 0 ? 'up' : 'dn'}">${glyph}</span>`;
}

/** 套用一整組心理值變動，回傳給卡片用的中文說明片段（不含數字） */
export function applyMental(state, deltas) {
  const notes = [];
  for (const [k, v] of Object.entries(deltas || {})) {
    const applied = adjustMental(state, k, v);
    if (applied) notes.push(`${MENTAL_NAMES[k]} ${arrow(applied)}`);
  }
  return notes;
}

/**
 * 給 UI 的摘要：只有粗略標籤，沒有數值。
 * 面板拿不到數字，就不會有人去背門檻。
 */
export function mentalSummary(state) {
  return MENTAL_KEYS.map((k) => ({
    key: k, name: MENTAL_NAMES[k], tier: mentalTier(k, state.mental[k]),
  }));
}

/* ================= 衍生效果 ================= */

/**
 * 默契對隊伍強度的加減。50 為中性，兩端各 ±6 OVR。
 * 這是 `mateMorale` 的長期版本——士氣是單季的，默契是累積的。
 */
export function chemBonus(state) {
  const raw = (state.mental.chem - 50) * 0.12;
  if (state.epic.lockerroom) return Math.max(raw, 0) + 2;
  // 獨狼：個人數據好看，但他從隊友身上拿不到任何加成
  if (state.traits.lonewolf) return Math.min(raw, 0);
  return raw;
}

/**
 * 決勝局（BO 系列的最後一局）與國際賽淘汰賽的抗壓加成，單位是勝率百分點。
 * `心態崩盤` 會把大心臟的效果整個翻負。
 */
export function nerveBonus(state) {
  let base = (state.mental.nerve - 50) * 0.16;
  if (state.traits.bigheart) base += 5;
  if (state.epic.ultstage) base = Math.max(base, 4) + 4;
  if (state.traits.tilt) base = Math.min(base, 0) - 4;
  return clamp(base, -12, 12);
}

/**
 * 下剋上加成。
 *
 * 種子序越後面、心理素質越硬，加成越大——這是 DRX 2022（第四種子奪冠）與
 * TPA 2012（外卡出線奪冠）那種劇本能夠成立的唯一入口。第一種子拿不到任何加成，
 * 因為那不叫下剋上。
 *
 * @param {number} seed 1 為第一種子
 */
export function underdogBonus(state, seed) {
  if (!seed || seed <= 1) return 0;
  const depth = seed - 1;                       // 第 2 種子 1、第 4 種子 3
  const grit = (state.mental.nerve - 55) * 0.07 + (state.mental.chem - 55) * 0.05;
  let bonus = Math.max(0, grit) * depth * 0.35;
  if (state.traits.underdog) bonus += depth * 1.2;
  if (state.epic.miracle) bonus += depth * 2.2;
  // 上限存在的理由：下剋上要是「有機會」，不是「換個種子序就變強隊」
  return clamp(bonus, 0, 11);
}

/** 續約與報價的年薪係數加成：聲量大就得加薪留人，風評差則反過來 */
export function marketMultBonus(state) {
  const fame = (state.mental.fame - 40) * 0.004;   // 滿聲量約 +0.24
  const rep = state.mental.rep * 0.0015;           // 風評 ±0.15
  return Math.round((fame + rep) * 100) / 100;
}

/** 自然回歸：極端值每年往中間收一點，避免一次事件定終生 */
export function driftMental(state) {
  // 自我越高，默契的自然回復越差——張揚是要付代價的
  const chemDrift = state.mental.chem < 50 ? (state.mental.ego >= 65 ? 0 : 1) : -1;
  adjustMental(state, 'chem', chemDrift);
  adjustMental(state, 'fame', state.mental.fame > 12 ? -2 : 0);
  adjustMental(state, 'rep', state.mental.rep > 0 ? -1 : state.mental.rep < 0 ? 2 : 0);
}
