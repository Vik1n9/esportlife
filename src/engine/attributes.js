/** 屬性與技能的計算：技能求值、OVR、潛力衰減與加點、年齡衰退、退役上限。純函式（會就地修改 state.attr）。 */
import { clamp } from '../core/rng.js';
import {
  AGING_GAIN_AMOUNT, AGING_GAIN_ATTRS, ATTRS, ATTR_CAP, ATTR_CAP_GODHAND,
  CEILING_FLOOR, CEILING_TAPER, DECLINE_ATTRS, DECLINE_EARLY, DECLINE_LATE_BASE,
  DECLINE_LATE_STEP, GROWTH_BASE, GROWTH_TIER_COEF, POTENTIAL_BANDS,
} from '../data/attributes.js';
import { ROLE_ATTR_WEIGHTS, ROLE_SKILLS, SKILL_WEIGHTS } from '../data/skills.js';
import { bonus, capOf, factor, flag, floorOf } from '../kernel/modifiers.js';

export function attrCap(state) {
  return flag(state, 'abilityCapUp') ? ATTR_CAP_GODHAND : ATTR_CAP;
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

/** 該位置有意義的技能（依 OVR 權重由重到輕），供面板與敘事使用 */
export function roleSkills(state) {
  return ROLE_SKILLS[state.role] || [];
}

/** 一次算好該位置所有技能，避免模擬迴圈裡逐項重算 */
export function skills(state) {
  const out = {};
  for (const key of Object.keys(SKILL_WEIGHTS)) out[key] = skillValue(state, key);
  return out;
}

/* ================= OVR ================= */

/**
 * 位置加權 OVR（不含版本落差懲罰）。
 *
 * 走的是折疊過的 `ROLE_ATTR_WEIGHTS`，數學上等同於「先算技能再加權」，但少繞一圈。
 */
export function ovr(state) {
  const w = ROLE_ATTR_WEIGHTS[state.role] || {};
  let v = 0;
  for (const [k, p] of Object.entries(w)) v += (state.attr[k] || 0) * p;
  v += bonus(state, 'ovrAdd');
  // 年齡條件無法寫進特質資料表，留在這裡
  if (state.epic.ageless && state.age >= 30) v += 1;
  return Math.round(v);
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

/** 實戰 OVR＝位置加權 OVR ＋ 版本落差懲罰 */
export function effectiveOvr(state) {
  return ovr(state) + patchPenalty(state);
}

/* ================= 成長 ================= */

/** 潛力區間裡最低的那一段的中位數，`state.potential` 缺鍵時的保底 */
const DEFAULT_POTENTIAL = Math.round((POTENTIAL_BANDS[3][0] + POTENTIAL_BANDS[3][1]) / 2);

/** 級距係數：現值落在哪一段（V4 §7.1） */
function tierCoef(current) {
  return GROWTH_TIER_COEF.find((g) => current >= g.at).coef;
}

/**
 * 天花板係數：距潛力天花板越近，同樣的訓練換到的成長越少。
 * 距離 ≥ CEILING_TAPER 不打折；貼著或已經超過天花板則掉到 CEILING_FLOOR。
 */
function ceilingCoef(current, potentialCap) {
  const headroom = Math.min(Math.max(potentialCap - current, 0), CEILING_TAPER);
  return CEILING_FLOOR + (1 - CEILING_FLOOR) * (headroom / CEILING_TAPER);
}

/** 潛力衰減係數（V4 §5.3）＝ 級距係數 × 天花板係數 */
export function decayCoef(current, potentialCap) {
  return tierCoef(current) * ceilingCoef(current, potentialCap);
}

/**
 * 買下一點要投入多少訓練成果。
 *
 * 設施制（S16）的介面是「基礎成長值 × 衰減係數 = 這次漲多少」，這一站還是舊的加點
 * 介面，所以取倒數換算回「一點要多少」——同一個模型的兩種寫法，讓 UI 與 `carry`
 * 蓄力機制原封不動。
 */
function stepCost(current, cap) {
  return 1 / decayCoef(current, cap);
}

/** 下一點需要多少訓練點（給 UI 顯示用） */
export function nextStepCost(state, key) {
  return stepCost(state.attr[key], state.potential[key] ?? DEFAULT_POTENTIAL);
}

/**
 * 成長門檻資訊（純顯示用）。
 * 回傳目前的單點成本、是否已貼上潛力天花板，以及下一個會漲價的級距門檻與屆時成本。
 *
 * 成本現在是連續的（天花板係數逐點遞減），所以 `nextAt` 只剩級距的意義：它回答
 * 「再練到哪個數字，價位會跳一階」，天花板那一段的遞減則反映在 `cost` 本身。
 */
export function growthThreshold(state, key) {
  const value = state.attr[key];
  const potentialCap = state.potential[key] ?? DEFAULT_POTENTIAL;
  const over = value >= potentialCap;
  // GROWTH_TIER_COEF 依 at 遞減排列，反轉後找「最小的、高於目前值」的級距門檻
  const next = [...GROWTH_TIER_COEF].reverse().find((g) => g.at > value) || null;
  return {
    cost: stepCost(value, potentialCap),
    over,
    nextAt: next ? next.at : null,
    nextCost: next ? stepCost(next.at, potentialCap) : null,
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

  const potentialCap = state.potential[key] ?? DEFAULT_POTENTIAL;
  let budget = points * GROWTH_BASE * factor(state, 'growthMult') + (state.carry[key] || 0);
  let current = before;

  while (current < cap) {
    const cost = stepCost(current, potentialCap);
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

/**
 * 機率性取整：`2.5` 有一半機率變 2、一半變 3。
 *
 * 0–100 刻度下的衰退量帶小數（§7.2 的 −2.5 與 +1.25），但屬性值是整數。直接
 * `Math.round(2.5)` 一律進位成 3，等於把 30–32 歲那段衰退平白加重兩成；機率性取整
 * 的期望值就是原本的小數，不必為了保留小數而讓存檔多帶一個累加欄位。
 */
function stochasticRound(rng, x) {
  const base = Math.floor(x);
  return base + (rng.next() < x - base ? 1 : 0);
}

/** 退役硬上限 */
export function retirementAge(state) {
  return floorOf(state, 'retireAge', 34);
}

/**
 * 年齡衰退。回傳 null 表示本季未衰退。
 *
 * 身體先走（靈巧／體能／技巧），腦子繼續長（意識／決斷）——「老將靠意識吃飯」是
 * 這條規則的直接後果，不需要另外寫特例。
 * @returns {{amount:number, phase:1|2, keys:string[], grown:string[]}|null}
 */
export function applyAgeDecline(state, rng) {
  const declineAge = state.age - floorOf(state, 'declineOffset', 0);
  if (declineAge < 30) return null;

  const raw = declineAge >= 33
    ? DECLINE_LATE_BASE + (declineAge - 33) * DECLINE_LATE_STEP
    : DECLINE_EARLY;
  const amount = Math.max(1, raw * capOf(state, 'declineMult', 1));

  const keys = DECLINE_ATTRS.filter((k) => k in state.attr);
  for (const k of keys) {
    // `不老傳奇` 對靈巧/技巧再減半
    const hit = state.epic.ageless && (k === 'agi' || k === 'tec') ? Math.max(1, amount / 2) : amount;
    state.attr[k] = clamp(state.attr[k] - stochasticRound(rng, hit), 1, attrCap(state));
  }

  // 經驗型屬性 30 歲後仍可能續升
  const grown = [];
  for (const k of AGING_GAIN_ATTRS) {
    if (k in state.attr && rng.next() < 0.5) {
      state.attr[k] = clamp(state.attr[k] + stochasticRound(rng, AGING_GAIN_AMOUNT), 1, attrCap(state));
      grown.push(k);
    }
  }

  return { amount: Math.round(amount * 10) / 10, phase: declineAge >= 33 ? 2 : 1, keys, grown };
}

export function attrKeys() {
  return ATTRS;
}
