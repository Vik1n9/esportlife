/** 屬性與技能的計算：技能求值、教練評價與位置戰力、潛力衰減與加點、年齡衰退、退役上限。純函式（會就地修改 state.attr）。 */
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
 * TODO(S12)：六維心理（V4 §9）還沒實作，下面兩個接口先各自回傳中性值。
 *
 * 心理有兩條互不相干的出口，S12 要各接各的，不要合成一條：
 *   §10.2 隱藏心理修正（加法，±3）→ 只吃 drive/disc/comp，進的是**教練評價**，
 *         影響薪資／續約／FA。教練評的是「這個人可不可靠」，不是他的全部心理狀態。
 *   §11.2 心理穩定修正（乘法）→ 進的是**位置戰力**，影響比賽發揮與失誤。
 *
 * 兩條分開的理由就是 §10.2 寫的那句：信任與韌性是隊內的事、自信是場上的事，都不該
 * 由教練的報價來表達。合成一條的話，一次崩盤會同時砍掉戰力與身價，那是兩次懲罰。
 */

/** 隱藏心理修正（V4 §10.2）＝ `(drive×0.40 + disc×0.35 + comp×0.25 − 50) × 0.06`，上下界 ±3 */
function mentalRating() { return 0; }

/** 心理穩定修正（V4 §11.1）：位置戰力的乘法項 */
function mentalStability() { return 1; }

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
 * 特質調整只保留 §10.2 明文允許的兩項（神之領域 +2、不老傳奇 30 歲後 +1）。
 * **新特質不得再用「直接加評價」這種形式**：平白加分會讓「隨便練」的打法也越過
 * 傳奇門檻，頂端加成一律走成長倍率與突破上限。
 */
export function coachRating(state) {
  return Math.round(
    roleWeighted(state)
    + mentalRating(state)
    + bonus(state, 'ratingAdd')
    // 年齡條件無法寫進特質資料表，留在這裡
    + (state.epic.ageless && state.age >= 30 ? 1 : 0),
  );
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
 * 不取整：它只進 `teamStrength`，而明星效應吃的是 `(P − par)^1.35`，留小數才平滑。
 */
export function positionPower(state) {
  return roleWeighted(state) * mentalStability(state) + patchPenalty(state);
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
