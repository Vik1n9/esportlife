/**
 * 設施制訓練（V4 §5）：訓練活動 ＋ 兩階段判定 ＋ 成長公式。
 *
 * V4 §5 的核心改變：訓練＝選擇一個「訓練活動」，不是選擇單一屬性。每個活動同時牽動
 * 多個屬性（依權重），加上體力消耗、特質修正與心理修正——選擇變少但份量變重。
 * v4.3 又加了第二層：結果由**訓練事件卡抽取**決定，不再是一條成功率公式。
 *
 * 這個檔是訓練唯一的結算位置。體力扣多少、成敗怎麼判、檔位抽哪張卡、屬性漲多少，
 * 全部在這裡——`phases/month.js` 只負責「把選單攤開、把結果講成敘事」。引擎層不
 * yield beat，所以這裡回傳**結果物件**，敘事由 month.js 組裝（跟 `rollInjury` 回傳
 * `{kind, weeks}`、由 `seasonEnd.js` 組卡的界線一致）。
 *
 * ── 兩階段判定（§5.4） ──
 *
 *   階段一（成敗）：依當前體力算「預期成功率」，擲骰定成功／失敗。玩家看得到預期
 *     成功率（成功＋大成功合併），看不到大成功／大失敗的細分。
 *   階段二（檔位）：成功進成功池抽（普通成功／大成功），失敗進失敗池抽（普通失敗／
 *     大失敗）。大失敗佔比隨體力區間上升（§5.4 體力掛鉤表，實作在 greatFailureMul）。
 *
 * ── 成長公式（§5.3） ──
 *
 *     屬性成長_i = 基礎成長值 × 權重_i × 成功係數 × 特質修正 × 心理修正 × 潛力衰減係數
 *
 *   復用 `attributes.js` 的 `investAttr`：它已經包好「× GROWTH_BASE × growthRateWindow
 *   × decayCoef ＋ carry 蓄力」。所以這裡只把「每月訓練成果量 × 權重 × 成功係數 × 心理
 *   修正」當 points 餵進去，GROWTH_BASE（S15b 定案的 3.9）與潛力衰減係數一格不動。
 *   TRAIN_YIELD 是本站新增的旋鈕（§21.2 的「訓練基礎成長值」）——舊骰子每月一顆 1d6
 *   期望 3.5，設施制多了成功係數（期望約 0.95）會把總量往下壓，所以初值取 3.7 補回，
 *   再以 160 段「平均巔峰 ÷ 上限 ≈ 0.755」校準。
 */
import { clamp } from '../core/rng.js';
import { coachFactors } from '../kernel/modifiers.js';
import { ATTR_NAMES } from '../data/attributes.js';
import { TRAINING_CARDS } from '../data/trainingCards.js';
import { investAttr } from './attributes.js';
import { applyMental } from './mental.js';
import { rollInjury, trainHeroes } from './progression.js';
import {
  REHAB_RECOVER, REHAB_RISK_RELIEF, REST_RECOVER, consume, recover, restYieldMul, staminaOf,
  successMul, trainCost, vitCoef,
} from './stamina.js';

/* ================= 訓練活動菜單（V4 §5.2，S46 六選一） ================= */

/**
 * 六項訓練活動（玩家選單）＋ 一項隱藏活動（復健預防，`menu: false`）。
 *
 * `weights` 是屬性權重（主 .7／副 .3，和為 1），`cost` 是體力消耗（負＝恢復），
 * `kind` 決定結算走哪條路（train 漲屬性／rest／rehab），`pool` 是卡片池傾向
 * （兩階段判定的檔位佔比），`heroGames` 是附帶的等效出賽場次（只有 SOLO RANK 有）。
 *
 * ── 錯位輪替（S46） ──
 *
 * 六個選單活動的**主屬性集合 == 副屬性集合 == `ATTRS`**，且每個活動主 ≠ 副。
 * 六屬性因此曝光完全均等，沒有屬性被結構性餓死，取捨純粹來自「這個月選哪兩個」。
 * 這條是設計骨架，有一條不變式在守（`tests/kernel/training.mjs`）。
 *
 * ⚠ **`vod` 這個 id 現在指「戰術覆盤」，「VOD 研究」的 id 是 `study`。** 兩者是刻意的
 * 鏡像對：覆盤＝跟隊友看自己的比賽、練決策與共識（dec→syn）；VOD 研究＝一個人研究
 * 別隊錄影、練地圖節奏與英雄細節（awr→tec）。id 沿用舊值是為了讓 60 張訓練卡的
 * activity 標籤大多不必動，代價就是這個對不上的名字——所以寫在這裡，不要靠讀者自己對。
 *
 * ⚠ 沒有「減量訓練」（light）——那是 §6.3 賽事期的選項，而賽事月不排養成回合
 * （S14 交接筆記：`inEvent` 這條路走不到）。賽事期的恢復選項仍由
 * `stamina.js` 的 `recoveryOptions({ inEvent: true })` 提供（S15 用）。
 *
 * ⚠ `rehab` 不在玩家選單裡（`menu: false`），但留在表上——復健年的自動流程
 * （`phases/month.js` 的 `skipSeason`）靠它跑。
 */
export const TRAINING_ACTIVITIES = [
  { id: 'fitness', name: '健身房', weights: { vit: 0.7, agi: 0.3 }, cost: 30, kind: 'train', pool: { successBias: 1.00, greatSuccess: 0.15, greatFailure: 0.30 } },
  { id: 'scrim', name: '團隊訓練賽', weights: { syn: 0.7, dec: 0.3 }, cost: 30, kind: 'train', pool: { successBias: 0.95, greatSuccess: 0.30, greatFailure: 1.00 } },
  { id: 'vod', name: '戰術覆盤', weights: { dec: 0.7, syn: 0.3 }, cost: 22, kind: 'train', pool: { successBias: 1.00, greatSuccess: 0.15, greatFailure: 0.30 } },
  { id: 'soloq', name: 'SOLO RANK', weights: { tec: 0.7, awr: 0.3 }, cost: 26, kind: 'train', heroGames: 8, pool: { successBias: 0.80, greatSuccess: 0.10, greatFailure: 1.50 } },
  { id: 'study', name: 'VOD 研究', weights: { awr: 0.7, tec: 0.3 }, cost: 20, kind: 'train', pool: { successBias: 1.00, greatSuccess: 0.12, greatFailure: 0.25 } },
  { id: 'rest', name: '休息', weights: { agi: 0.7, vit: 0.3 }, cost: -REST_RECOVER, kind: 'rest', pool: null },
  { id: 'rehab', name: '復健預防', weights: {}, cost: -REHAB_RECOVER, kind: 'rehab', pool: null, menu: false },
];

/** 成功係數對照（§5.4）：大成功 ×1.5／成功 ×1.0／失敗 ×0.3／大失敗 ×0 */
export const SUCCESS_COEF = { great_success: 1.5, success: 1.0, failure: 0.3, great_failure: 0 };

/**
 * 基礎成功率（§5.4：「≥70 高，85%+」）。
 *
 * `successMul`（§6.2 定案曲線）是「體力係數」不是「機率本身」，滿體力時它是 1.0。
 * 乘上這個 0.85 才是玩家看得到的預期成功率——滿體力約 85%，留 15% 給失敗與大失敗，
 * 才符合 §6.2「受傷由大失敗承擔」要有發生空間的設計。
 */
export const BASE_SUCCESS = 0.85;

/** 每月訓練成果量（等效舊骰子 pips）。§21.2 的「訓練基礎成長值」旋鈕，初值見檔頭 */
export const TRAIN_YIELD = 6.5;

/* ================= 讀數 ================= */

/** 動機 drive 的訓練效率倍率（§5.3 心理修正，六維中唯一進訓練結算的維度，§9.4） */
function driveMul(state) {
  return clamp(1 + ((state.mental?.drive ?? 50) - 50) * 0.004, 0.8, 1.2);
}

/** 短期 buff（activeEffects 裡的 trainBoost）累加進預期成功率 */
function activeTrainBoost(state) {
  return (state.activeEffects || [])
    .filter((e) => e.trainBoost)
    .reduce((t, e) => t + e.trainBoost, 0);
}

/** 預期成功率（成功＋大成功合併）。§5.4：玩家只看得到這個，看不到細分 */
export function expectedSuccess(state, activity) {
  const bias = activity.pool?.successBias ?? 1;
  return clamp(BASE_SUCCESS * successMul(staminaOf(state)) * bias + activeTrainBoost(state), 0, 1);
}

/**
 * 失敗池裡大失敗的相對佔比，隨體力區間上升（§5.4 體力掛鉤表）。
 * 這是「硬撐更危險」的一半：體力越低，失敗時踩中大失敗（受傷）的機率越高；
 * 另一半是 injuryProbability 的體力乘子（§6.2），兩者相乘，見 §6.2 說明。
 */
function greatFailureMul(stamina) {
  if (stamina >= 70) return 0.1;   // 極低
  if (stamina >= 40) return 0.3;   // 低
  if (stamina >= 15) return 0.6;   // 中
  return 1.0;                       // 高
}

/* ================= 選單 ================= */

/**
 * 一個活動選項的三段資訊，只算一次（§22.2.1，S39）。
 *
 * `note` 字串與結構化欄位（UI 的三欄可掃讀與屬性條高亮）都從這裡導出——
 * 同一份計算結果兩種呈現，不出現第二份手抄本（單一來源規則）。
 *
 * ⚠ **休息現在也有 `attrs`**（S46：它也漲屬性），所以屬性條高亮對它照樣會亮；
 * 但它仍**不分成敗**，`successRate` 是 `null` 不是 100——§5.4 只准顯示預期成功率，
 * 給休息填一個 100 等於在畫面上多出一個不存在的判定。
 *
 * @returns {{staminaDelta:number, attrs:string[], effectText:string, successRate:number|null}}
 *   staminaDelta 正＝恢復、負＝消耗；attrs 是影響的屬性鍵（復健為空）；
 *   successRate 是預期成功率整數百分位（休息／復健不分成敗，為 null）
 */
function activityInfo(state, activity) {
  // ⚠ 顯示與效果同源（S47）：消耗活動的 `staminaDelta` 走 `trainCost`，與
  // `resolveTraining` 實扣的是同一個數（round 做在 `trainCost` 裡，不是顯示端）。
  // ⚠ 恢復活動（cost 為負）不能套鏡像 `vitCostCoef`——負數乘上去會讓顯示方向顛倒
  // （高 vit 顯示恢復更少、實際恢復更多）。改讀 `recover` 的實際算式：
  // `cost × vitCoef × recoverMul`（S49 起含教練恢復加成），round 後顯示
  // （誤差 ≤0.5 點，整數刻度上同源）。
  const staminaDelta = activity.cost < 0
    ? Math.round(-activity.cost * vitCoef(state) * coachFactors(state).recoverMul)
    : -trainCost(state, activity.cost);
  if (activity.kind === 'rehab') return { staminaDelta, attrs: [], effectText: '降低受傷風險', successRate: null };
  const attrs = Object.keys(activity.weights);
  const attrText = attrs.map((k) => ATTR_NAMES[k]).join('·');
  if (activity.kind === 'rest') {
    return { staminaDelta, attrs, effectText: `恢復體力・${attrText}`, successRate: null };
  }
  const successRate = Math.round(expectedSuccess(state, activity) * 100);
  const effectText = activity.heroGames ? `${attrText}·英雄池` : attrText;
  return { staminaDelta, attrs, effectText, successRate };
}

/** 結構化欄位壓回的單行說明（保留欄位：既有呼叫端與測試讀它） */
function noteFromInfo({ staminaDelta, effectText, successRate }) {
  const price = staminaDelta >= 0 ? `體力 +${staminaDelta}` : `體力 −${-staminaDelta}`;
  return successRate == null ? `${price}　${effectText}` : `${price}　${effectText}　成功率 ${successRate}%`;
}

/**
 * 養成回合的活動選單（§4 第 2 步）。month.js 據此組 choice。
 *
 * 只攤 `menu !== false` 的活動——玩家看到的就是 §5.2 的六個選項，`rehab` 不在其中
 * （它只走復健年的自動流程）。
 */
export function trainingMenu(state) {
  return TRAINING_ACTIVITIES.filter((a) => a.menu !== false).map((a) => {
    const info = activityInfo(state, a);
    return {
      id: a.id,
      label: a.name,
      main: a.kind === 'train',
      note: noteFromInfo(info),
      staminaDelta: info.staminaDelta,
      attrs: info.attrs,
      effectText: info.effectText,
      successRate: info.successRate,
    };
  });
}

/* ================= 結算 ================= */

/** 階段二：成功進成功池、失敗進失敗池，抽一個檔位（§5.4） */
function drawTier(state, rng, activity, success) {
  const pool = activity.pool;
  if (success) return rng.next() < pool.greatSuccess ? 'great_success' : 'success';
  const gfW = pool.greatFailure * greatFailureMul(staminaOf(state));
  return rng.next() < gfW / (1 + gfW) ? 'great_failure' : 'failure';
}

/**
 * 抽訓練事件卡（S18 定案，§5.4）：
 * 1. 過濾：tier 匹配 ＋ `activity` 包含該活動（沒標＝全活動）＋ `stage` 命中
 *    `state.stage`（沒標＝全階段）＋ `stamina` 閉區間命中（沒標＝全體力）
 * 2. `weight` 加權抽一張
 * 3. 空池防呆：退回「同檔位＋同活動、無 stage／stamina 條件的卡」（兜底 20 只標
 *    activity，保證每活動 × 檔位 × 階段永不空池）；再空就退回同檔位第一張——
 *    正常永遠走不到第二層
 */
export function drawTrainingCard(state, rng, activityId, tier) {
  const stage = state.stage;
  const stamina = staminaOf(state);
  const hit = (c) => c.tier === tier
    && (!c.activity || c.activity.includes(activityId))
    && (!c.stage || c.stage.includes(stage))
    && (!c.stamina || (stamina >= c.stamina[0] && stamina <= c.stamina[1]));

  const pool = TRAINING_CARDS.filter(hit);
  const fallback = pool.length
    ? pool
    : TRAINING_CARDS.filter((c) => c.tier === tier
      && (!c.activity || c.activity.includes(activityId)) && !c.stage && !c.stamina);
  return rng.weighted(fallback, (c) => c.weight) || TRAINING_CARDS.find((c) => c.tier === tier) || null;
}

/**
 * 結算一次訓練活動。回傳結果物件，敘事由 month.js 組裝。
 *
 * 順序照 §4 第 3 步：扣體力 → 兩階段判定 → 成長／英雄池 → 卡片效果（心理／受傷／buff）。
 */
export function resolveTraining(state, rng, activityId) {
  const activity = TRAINING_ACTIVITIES.find((a) => a.id === activityId) || TRAINING_ACTIVITIES[0];

  // 當月選了什麼（S48）：唯一真相來源，存檔帶著走。月度事件卡的隨機池抽選讀它
  // 決定 sub 傾向（`engine/eventTrigger.js` 的 `ACTIVITY_EVENT_BIAS`），條件語言
  // 的 `['lastAct', 活動id]` 也讀它。休息與復健照寫——休息是玩家的選項，復健不
  // 是（但寫了也無害，傾向表沒有 rehab 鍵就退回 1.0）
  state.lastActivity = activity.id;

  /*
   * 休息（S46）：也漲屬性，但**不分成敗、不抽卡、不受傷、不動心理**——成長是決定性的，
   * 倍率讀 `restYieldMul(休息前的體力)`：越透支，休息學到的越多。
   * ⚠ 體力要**先讀再回**：recover 之後讀到的是休息後的值，倍率會整條倒過來。
   */
  if (activity.kind === 'rest') {
    const before = staminaOf(state);
    const mul = restYieldMul(before);
    const drive = driveMul(state);
    const gains = [];
    for (const [attr, w] of Object.entries(activity.weights)) {
      const gained = investAttr(state, attr, TRAIN_YIELD * w * mul * drive);
      if (gained > 0) gains.push({ attr, points: gained });
    }
    recover(state, REST_RECOVER);
    return { activity, kind: 'rest', recovered: staminaOf(state) - before, gains };
  }
  if (activity.kind === 'rehab') {
    const before = staminaOf(state);
    recover(state, REHAB_RECOVER);
    state.tempInjuryRisk = Math.max(0, (state.tempInjuryRisk || 0) - REHAB_RISK_RELIEF);
    return { activity, kind: 'rehab', recovered: staminaOf(state) - before };
  }

  // 消耗：體能折扣只在這裡（S47）——比賽消耗（`MATCH_MONTH_COST`／`SERIES_GAME_COST`）
  // 不走 `trainCost`，賽季的體力經濟是另一條線
  consume(state, trainCost(state, activity.cost));

  // 階段一：成敗
  const success = rng.chance(expectedSuccess(state, activity) * 100);
  // 階段二：檔位
  const tier = drawTier(state, rng, activity, success);
  const successCoef = SUCCESS_COEF[tier];

  // 成長（§5.3）：基礎成長值 × 權重 × 成功係數 × 心理修正，餵進 investAttr。
  // 教練的 `trainYield`（S49，訓練狂 ×1.15）只掛在訓練上——休息的成長是另一條
  // 曲線（`restYieldMul`），休息不是訓練
  const gains = [];
  if (activity.kind === 'train') {
    const drive = driveMul(state);
    const coachYield = coachFactors(state).trainYield;
    for (const [attr, w] of Object.entries(activity.weights)) {
      const gained = investAttr(state, attr, TRAIN_YIELD * w * successCoef * drive * coachYield);
      if (gained > 0) gains.push({ attr, points: gained });
    }
  }

  // 附帶的英雄專精（S46：SOLO RANK 掛 heroGames，不再是獨立活動）。成功係數直接
  // 縮放等效出賽場次——大失敗 successCoef = 0 → 0 場 → 不練，不必特判
  let heroes = [];
  if (activity.heroGames) {
    const games = Math.round(activity.heroGames * successCoef);
    if (games > 0) heroes = trainHeroes(state, rng, games);
  }

  // 訓練事件卡效果：心理（僅大成功／大失敗）、受傷（大失敗）、短期 buff、永久屬性
  const card = drawTrainingCard(state, rng, activity.id, tier);
  const mentalNotes = card?.effects?.mental ? applyMental(state, card.effects.mental) : [];
  let injury = null;
  if (card?.effects?.injury) injury = rollInjury(state, rng);
  let buff = null;
  if (card?.effects?.buff) {
    buff = { ...card.effects.buff };
    state.activeEffects = (state.activeEffects || []).concat(buff);
  }
  const attrNotes = [];
  if (card?.effects?.attr) {
    for (const [attr, points] of Object.entries(card.effects.attr)) {
      const applied = investAttr(state, attr, points);
      if (applied) attrNotes.push({ attr, points: applied });
    }
  }

  return { activity, kind: activity.kind, tier, successCoef, gains, heroes, mentalNotes, injury, buff, attrNotes, card };
}

/** 每月推進時遞減 activeEffects 的剩餘月數（由 game.js 的月迴圈呼叫） */
export function tickActiveEffects(state) {
  if (!state.activeEffects || !state.activeEffects.length) return;
  state.activeEffects = state.activeEffects
    .map((e) => ({ ...e, months: e.months - 1 }))
    .filter((e) => e.months > 0);
}
