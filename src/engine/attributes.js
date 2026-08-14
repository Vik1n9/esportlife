/** 屬性與技能的計算：技能求值、教練評價與位置戰力、潛力衰減與加點（讀生命週期有效天花板）。純函式（會就地修改 state.attr）。 */
import { clamp } from '../core/rng.js';
import {
  ATTRS, ATTR_CAP, CEILING_FLOOR, CEILING_TAPER, GROWTH_BASE, TIER_FLOOR, TIER_POWER,
} from '../data/attributes.js';
import { ROLE_ATTR_WEIGHTS, ROLE_SKILLS, SKILL_WEIGHTS } from '../data/skills.js';
import { factor, flag } from '../kernel/modifiers.js';
import { stability } from './psych.js';
import { effectivePotential, growthRateWindow } from './lifecycle.js';

/**
 * §10.2 的隱藏心理修正上下界（±3）。
 *
 * 由來寫在 §10.2：約等於半年的評價成長量（§7.3 實測第一年 +5.5）。教練看得出態度，
 * 但態度不該讓一個 60 的選手變成 70 的選手——上界要小於「多練半年」。
 *
 * 匯出是給 `tests/regression/invariants.mjs` 的「巔峰上界」當母數用：教練評價可以
 * 合法高過屬性硬上限的量 ＝ §10.2 允許的加法特質修正 ＋ 這一項。**不要在測試裡
 * 手填 3**，這樣有人改了這裡，上界會跟著鬆，而那是 review 該看到的訊號。
 */
export const RATING_MENTAL_SPAN = 3;

export function attrCap() {
  return ATTR_CAP;
}

/* ================= 技能（導出值） ================= */

/**
 * 單項技能的實際值＝六屬性的加權平均（權重和為 1，所以值域與屬性相同）。
 * 玩家不能直接動這個數字——要動就得去動它背後的屬性。
 */
export function skillValue(state, key) {
  const w = SKILL_WEIGHTS[key];
  if (!w) return 0;
  let v = 0;
  for (const [attr, p] of Object.entries(w)) v += (state.attr[attr] || 0) * p;
  return Math.round(v);
}

/** 該位置有意義的技能（依位置權重由重到輕），供面板與敘事使用 */
export function roleSkills(state) {
  return ROLE_SKILLS[state.role] || [];
}

/** 一次算好該位置所有技能，避免模擬迴圈裡逐項重算 */
export function skills(state) {
  const out = {};
  for (const key of Object.keys(SKILL_WEIGHTS)) out[key] = skillValue(state, key);
  return out;
}

/* ================= 教練評價與位置戰力（V4 §10.2 §11.1） ================= */

/**
 * 位置加權技能值：Σ(位置相關技能 × 位置權重)。
 *
 * 走的是折疊過的 `ROLE_ATTR_WEIGHTS`，數學上等同於「先算技能再加權」，但少繞一圈。
 *
 * 這是「教練評價」與「位置戰力」共用的底：兩者的差別不在技能，在技能之外掛了什麼
 * ——教練加的是他看得出來的態度與名聲，比賽吃的是當下發揮得出來多少。
 */
function roleWeighted(state) {
  const w = ROLE_ATTR_WEIGHTS[state.role] || {};
  let v = 0;
  for (const [k, p] of Object.entries(w)) v += (state.attr[k] || 0) * p;
  return v;
}

/*
 * 心理有兩條互不相干的出口，**各接各的，不要合成一條**：
 *   §10.2 隱藏心理修正（加法，±3）→ 只吃 drive/disc/comp，進的是**教練評價**，
 *         影響薪資／續約／FA。教練評的是「這個人可不可靠」，不是他的全部心理狀態。
 *   §11.1 心理穩定修正（乘法，±15%）→ 進的是**位置戰力**，影響比賽發揮。
 *
 * 兩條分開的理由就是 §10.2 寫的那句：信任與韌性是隊內的事、自信是場上的事，都不該
 * 由教練的報價來表達。合成一條的話，一次崩盤會同時砍掉戰力與身價，那是兩次懲罰。
 *
 * 兩者的量級也刻意差很多：評價那條是 ±3（§10.2 明寫「上界要小於多練半年」），戰力
 * 那條是 ±15%（在 0–100 刻度上約 ±11 點）。教練看得出態度，但看不出你在龍坑前手抖。
 */

/**
 * 隱藏心理修正（V4 §10.2）＝ `(drive×0.40 + disc×0.35 + comp×0.25 − 50) × 0.06`。
 *
 * 三維全 50 → 0；全 100 → +3.0；全 0 → −3.0。只吃動機／紀律／抗壓——那是教練在
 * 訓練室與大場面上看得出來的三件事，信任、韌性、自信都不該由報價來表達。
 */
function mentalRating(state) {
  const m = state.mental || {};
  const seen = (m.drive ?? 50) * 0.40 + (m.disc ?? 50) * 0.35 + (m.comp ?? 50) * 0.25;
  return clamp((seen - 50) * 0.06, -RATING_MENTAL_SPAN, RATING_MENTAL_SPAN);
}

/**
 * 教練評價（V4 §10.2）＝ 位置加權技能 ＋ 隱藏心理修正 ＋ 特質調整。
 *
 * **這是內部值，不顯示給玩家**（§10.1）：玩家看的是十二項技能，教練評價只在需要
 * 單一數字的場合出現——薪資、試訓、續約、FA 報價、板凳判定、獎項門檻。
 *
 * 舊版這裡叫 `ovr()`，而 OVR 同時被拿去當「玩家的儀表板」與「市場的估價」。
 * 兩者分家之後，「看不見的心理素質間接影響薪資與續約」才做得出來——教練看得出
 * 態度與大賽心態，玩家卻沒有一個可以最佳化的總評數字。
 *
 * ⚠ v4.3（決策 #44）廢止 §10.2「不得直接加評價」的掛載禁令與舊有的直接加值
 * （神之領域 +2、不老傳奇 30 歲後 +1）。新特質怎麼影響評價，由 S19a 依新的窗口
 * 機制重定義——這裡不再有任何「年齡條件特判」或「平白加分」。
 */
export function coachRating(state) {
  return Math.round(roleWeighted(state) + mentalRating(state));
}

/**
 * 版本落差懲罰。英雄池越廣越能吸收版本變動。
 * 舊版把「版本補習成功」也算成 metaCount，好結果反而變懲罰——已修正。
 */
export function patchPenalty(state) {
  if (flag(state, 'patchImmune')) return 0;
  const absorbed = Math.max(0, state.heroPool.length - 3);
  const debt = Math.max(0, state.patchDebt - absorbed) * factor(state, 'patchDebt');
  return -Math.round(debt * 1.5);
}

/** 市場看到的教練評價＝教練評價 ＋ 版本落差懲罰（跟不上版本，估價就會掉） */
export function effectiveCoachRating(state) {
  return coachRating(state) + patchPenalty(state);
}

/**
 * 位置戰力 P（V4 §11.1）＝ 位置加權技能 × 心理穩定修正 × 版本適應修正。
 *
 * 跟教練評價共用同一個底，但**不吃 §10.2 的加法特質調整**：那兩項是「教練怎麼看你」，
 * 不是「你在場上打得出多少」。特質要影響比賽強度有自己的入口（隊友加成、教練係數、
 * 系列賽加成…），不必也不該再從評價那條路進來一次。
 *
 * 版本適應目前沿用既有的加法懲罰（`patchPenalty`），沒有改成 §11.1 寫的乘法——
 * 換算式不是這一站的工作，而加法在 0–100 刻度下的量級（每點落差 −1.5）已經校過。
 *
 * 心理穩定修正走 `psych.stability()`（§9.2 的發揮倍率依位置權重加權），恆在
 * 0.85–1.15。**它乘在技能上，不乘在版本落差上**：版本跟不上是知識問題，抗壓再好
 * 也不會讓你突然會玩新版本的英雄。
 *
 * 不取整：它只進 `teamStrength`，而明星效應吃的是 `(P − par)^1.35`，留小數才平滑。
 */
export function positionPower(state) {
  return roleWeighted(state) * stability(state) + patchPenalty(state);
}

/* ================= 成長 ================= */

/** 級距係數：連續冪函數 `max(TIER_FLOOR, (1 − v/100)^TIER_POWER)`（V4 §7.1，決策 #41） */
function tierCoef(current) {
  return Math.max(TIER_FLOOR, Math.pow(1 - current / 100, TIER_POWER));
}

/**
 * 天花板係數：距有效潛力天花板越近，同樣的訓練換到的成長越少。
 * 距離 ≥ CEILING_TAPER 不打折；貼著或已經超過天花板則掉到 CEILING_FLOOR。
 *
 * §7.1 只把讀取的潛力換成 `effective_potential(attr, age)`——天花板隨年齡移動，
 * 不再是固定值。0.34／12 兩個常數的推導不變（見 `data/attributes.js`）。
 */
function ceilingCoef(current, effPot) {
  const headroom = Math.min(Math.max(effPot - current, 0), CEILING_TAPER);
  return CEILING_FLOOR + (1 - CEILING_FLOOR) * (headroom / CEILING_TAPER);
}

/** 潛力衰減係數（V4 §5.3）＝ 級距係數 × 天花板係數。天花板讀有效潛力，隨年齡起伏 */
export function decayCoef(current, effPot) {
  return tierCoef(current) * ceilingCoef(current, effPot);
}

/**
 * 買下一點要投入多少訓練成果。
 *
 * 設施制（S16）的介面是「基礎成長值 × 衰減係數 = 這次漲多少」，這一站還是舊的加點
 * 介面，所以取倒數換算回「一點要多少」——同一個模型的兩種寫法，讓 UI 與 `carry`
 * 蓄力機制原封不動。
 */
function stepCost(current, effPot) {
  return 1 / decayCoef(current, effPot);
}

/** 下一點需要多少訓練點（給 UI 顯示用） */
export function nextStepCost(state, key) {
  return stepCost(state.attr[key], effectivePotential(state, key));
}

/**
 * 成長門檻資訊（純顯示用）。回傳目前的單點成本、是否已貼上有效天花板。
 *
 * 級距改成連續冪函數之後不再有「下一個會漲價的門檻」——`nextAt`／`nextCost` 恆為
 * null，保留欄位只是讓 UI 不用改形狀。
 */
export function growthThreshold(state, key) {
  const value = state.attr[key];
  const effPot = effectivePotential(state, key);
  return {
    cost: stepCost(value, effPot),
    over: value >= effPot,
    nextAt: null,
    nextCost: null,
  };
}

/** 距離下一點 +1，還需要投入多少訓練點（已扣除蓄力）。 */
export function needForNextGain(state, key) {
  const carry = state.carry[key] || 0;
  return Math.max(0, growthThreshold(state, key).cost - carry);
}

/**
 * 投入 `points` 點訓練成果到某個屬性。
 * 不足以買下一階時會存進 `carry` 蓄力，下次接續——避免小骰子完全浪費。
 * @returns {number} 實際提升的點數
 */
export function investAttr(state, key, points) {
  if (!(key in state.attr)) return 0;
  const before = state.attr[key];
  const cap = attrCap(state);

  if (points < 0) {
    state.attr[key] = clamp(before + points, 1, cap);
    return state.attr[key] - before;
  }

  const effPot = effectivePotential(state, key);
  let budget = points * GROWTH_BASE * factor(state, 'growthMult') * growthRateWindow(state)
    + (state.carry[key] || 0);
  let current = before;

  while (current < cap) {
    const cost = stepCost(current, effPot);
    if (budget < cost) break;
    budget -= cost;
    current++;
  }

  state.carry[key] = current >= cap ? 0 : budget;
  state.attr[key] = current;
  return current - before;
}

/** 直接加減（事件卡用），不走蓄力機制 */
export function adjustAttr(state, key, delta) {
  if (!(key in state.attr)) return 0;
  if (delta > 0) return investAttr(state, key, delta);
  const before = state.attr[key];
  state.attr[key] = clamp(before + delta, 1, attrCap(state));
  return state.attr[key] - before;
}

export function attrKeys() {
  return ATTRS;
}
