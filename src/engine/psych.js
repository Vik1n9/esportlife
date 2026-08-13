/**
 * 心理如何進到場上：發揮公式（V4 §9.2）與失誤系統（V4 §9.3）。
 *
 * V4 §2 的核心分離——**屬性決定技能「數值」，心理決定技能「發揮穩定度」**。
 * 同一個 72 的會戰技能，抗壓高的人大賽發揮得出來，抗壓低的人會失常。這個檔就是
 * 那句話唯一的實作位置。
 *
 * 三條出口，各走各的，不要合成一條：
 *
 * | 出口 | 公式 | 進到哪裡 | 什麼時候看得出來 |
 * | --- | --- | --- | --- |
 * | §9.2 發揮 | `× (0.85 + 0.30 × 修正)` | `positionPower`（乘法） | 每一場，恆常 |
 * | §9.3 失誤 | 失誤係數 × 壓力係數 | 可見數據（陣亡數） | **大賽被放大** |
 * | §10.2 態度 | `(…− 50) × 0.06` | `coachRating`（加法 ±3） | 薪資／續約 |
 *
 * §9.2 是恆常的，§9.3 才是「大賽現形」的那一份——這是刻意的分工。若把壓力也塞進
 * §9.2，抗壓就變成第二個 OVR（越高越全面強）；分開之後，抗壓低的人平常看不太出來，
 * 一到季後賽陣亡數就跳起來，玩家得從數據反推那個看不見的數字。**因隱藏、果可見**
 * （§9.3）是隱藏心理探索循環的全部來源。
 */
import { clamp } from '../core/rng.js';
import { OVR_WEIGHTS, SKILL_WEIGHTS } from '../data/skills.js';

/* ================= §9.2 技能發揮 ================= */

/**
 * 十二技能各自的主導心理維度（V4 §9.2）。每一列的權重和為 1.00，所以
 * `Σ(維度 × 權重) ÷ 100` 自然落在 0–1，不必再正規化。
 *
 * ⚠ **這張表照抄 §9.2，一個數字都不要改。** 它的份量分布是設計過的：
 * 紀律 3.15（最廣，因為它同時是 §9.3 非受迫性失誤的主導維度）、抗壓 2.60（集中在
 * 壓力場景）、信任 2.55（全部是團隊動作）、自信 2.10（全部是「敢不敢」）、
 * 韌性 1.10（只當第三項，主戰場在 §9.3）、動機 0.50（**刻意最輕**——drive 的主戰場
 * 是訓練收益與退役意圖，不是場上發揮）。
 */
export const SKILL_MENTAL = {
  lane:   { comp: 0.45, disc: 0.35, resl: 0.20 },   // 對線是「被壓不崩」＋重複細節不出錯
  op:     { conf: 0.60, comp: 0.40 },               // 敢不敢做那一個極限操作
  vis:    { disc: 0.55, trust: 0.25, comp: 0.20 },  // 插眼是紀律活，被壓制時才吃抗壓
  jg:     { conf: 0.40, disc: 0.35, drive: 0.25 },  // 敢賭 ＋ 規劃 ＋ 願意多跑
  gank:   { trust: 0.50, conf: 0.30, disc: 0.20 },  // 支援先要相信隊友會跟上
  obj:    { comp: 0.40, trust: 0.35, disc: 0.25 },  // 龍坑前的手不抖，加上五個人同一個決定
  tf:     { trust: 0.40, comp: 0.35, resl: 0.25 },  // 會戰是集體行為，站位錯了要還能收
  eng:    { conf: 0.45, comp: 0.30, trust: 0.25 },  // 先手是自信的極致表現
  peel:   { trust: 0.50, disc: 0.30, resl: 0.20 },  // 拆火與保排都是替別人做的事
  split:  { disc: 0.40, conf: 0.35, resl: 0.25 },   // 一個人在邊線，沒人管得到你
  rotate: { disc: 0.45, trust: 0.30, drive: 0.25 }, // 轉線是節奏紀律，不是靈光一閃
  pos:    { comp: 0.50, disc: 0.30, resl: 0.20 },   // 走位失誤幾乎都發生在壓力下
};

/**
 * §9.2 的兩個係數。**不准改**（說明書與規格書都明令）。
 *
 * 它們不是隨手選的：心理全 50 時 `0.85 + 0.30 × 0.5 = 1.000` 恰好中性，全 0 → 0.850、
 * 全 100 → 1.150。**極端心理只造成 ±15% 的發揮差距**，這就是「心理是放大器不是
 * 決定器」的定量邊界。動它等於重新定義整個心理系統的份量。
 */
export const PERFORM_FLOOR = 0.85;
export const PERFORM_SPAN = 0.30;

/** 單項技能的心理修正值（0–1）＝ `Σ(主導維度 × 權重) ÷ 100` */
export function mentalMod(state, skillKey) {
  const row = SKILL_MENTAL[skillKey];
  if (!row) return 0.5;
  let v = 0;
  for (const [dim, w] of Object.entries(row)) v += (state.mental?.[dim] ?? 50) * w;
  return v / 100;
}

/** 單項技能的發揮倍率（V4 §9.2），恆在 0.85–1.15 */
export function performCoef(state, skillKey) {
  return PERFORM_FLOOR + PERFORM_SPAN * mentalMod(state, skillKey);
}

/** 技能發揮 ＝ 技能值 × 發揮倍率（§9.2） */
export function skillPerformance(state, skillKey, value) {
  return value * performCoef(state, skillKey);
}

/**
 * 心理穩定修正（V4 §11.1 進 `positionPower` 的那個乘法項）。
 *
 * ＝ 位置權重加權過的發揮倍率。§11.1 把它寫成掛在整個加權和外面的單一乘數，而
 * `Σ(位置權重 × 技能值 × 該技能的發揮倍率)` 展開後正是「加權和 × 加權平均倍率」——
 * 兩種寫法同一件事，這裡取後者，因為 `positionPower` 已經走折疊過的屬性權重，
 * 不必為了乘一個係數而把十二技能重算一遍。
 *
 * 位置權重和為 1.00，所以回傳值必然落在 0.85–1.15：**位置不同，吃的心理維度不同**
 * （輔助吃信任與自信，射手吃抗壓與紀律），但帶寬對五路一致。
 */
export function stability(state) {
  const w = OVR_WEIGHTS[state.role];
  if (!w) return 1;
  let v = 0;
  for (const [skill, p] of Object.entries(w)) v += performCoef(state, skill) * p;
  return v;
}

/* ================= §9.3 失誤系統 ================= */

/**
 * 場合的壓力係數。**只放大受迫項**（見 `mistakeFactor`）。
 *
 * 這張表就是「大賽現形」的旋鈕：常規賽 1.0 是基準，抗壓低的人在這裡幾乎看不出來；
 * 生死戰 2.2 是單場定生死（§11.1 把它的對手門檻抓在四強與決賽之間，壓力係數同理）。
 */
export const PRESSURE = {
  regular: 1.0,      // 例行賽
  playoff: 1.6,      // 季後賽八強／四強
  final: 1.9,        // 季後賽決賽
  intl: 2.0,         // MSI／世界賽
  elimination: 2.2,  // 生死戰（區域資格賽）
};

/** 決勝局的額外放大：系列賽被拖到最後一局，壓力不是線性疊加的 */
export const DECIDER_PRESSURE = 1.25;

/**
 * 三項的權重。單位是「失誤係數的變動量」——1.0 是中性心理在常規賽的基準。
 *
 * 受迫項給得比非受迫項重，因為只有它吃壓力係數：紀律爛的人到哪裡都爛（穩定性問題），
 * 抗壓爛的人平常看不出來、大賽才炸（§9.3 的「湧現表現」欄寫的正是這個差別）。
 */
const FORCED_W = 0.70;
const CARE_W = 0.40;
const GREED_W = 0.55;

/** 自信超過這條線才開始「貪」。不是 50——有自信本來就是好事，過頭才是問題 */
const CONF_GREEDY = 68;

/** 受迫性失誤的守門員（§9.3：主導心理為抗壓、韌性） */
function guardOf(state) {
  const m = state.mental || {};
  return (m.comp ?? 50) * 0.65 + (m.resl ?? 50) * 0.35;
}

/**
 * 失誤係數（V4 §9.3）。1.0 ＝ 心理全中性在常規賽，直接當可見數據的乘數用。
 *
 * ```
 * 失誤率 = 基礎 + 受迫項：f(抗壓低) × 壓力係數 + 非受迫項：f(紀律低) + f(自信過高)
 * ```
 *
 * ⚠ **壓力係數只乘在「短缺」那一半，不乘在「餘裕」那一半。** 抗壓 90 的人在生死戰
 * 得到的減免跟常規賽一樣多，抗壓 10 的人卻會被放大到兩倍多——§9.3 寫的是「被對手
 * 施壓而失誤，大賽時激增」，那是一種懲罰而不是一種獎勵。對稱地放大會變成「抗壓高
 * 在大賽反而更不會死」，等於再發一次獎金給已經吃到 §9.2 與決勝局加成的人。
 *
 * ⚠ **自信是雙向的**：`conf` 高會讓 §9.2 的操作／開團發揮更好，但超過 68 之後開始
 * 往這裡繳稅（過自信→貪）。這是六維裡唯一一個「越高越好」不成立的維度，也是
 * 玩家從數據推測心理時最容易誤判的一個。
 *
 * @param {number} [pressure] 見 `PRESSURE`
 */
export function mistakeFactor(state, pressure = PRESSURE.regular) {
  const m = state.mental || {};
  const guard = guardOf(state);
  const care = m.disc ?? 50;

  const forced = (Math.max(0, 50 - guard) * pressure - Math.max(0, guard - 50)) / 100 * FORCED_W;
  const sloppy = (Math.max(0, 50 - care) - Math.max(0, care - 50)) / 100 * CARE_W;
  const greed = Math.max(0, (m.conf ?? 50) - CONF_GREEDY) / 100 * GREED_W;

  // 上下界的用意跟 §9.2 一樣：心理是放大器。再爛的心態也不會讓陣亡數翻倍，
  // 再穩的心態也還是會死——夾住之後這個係數乘進任何可見數據都不會失控
  return clamp(1 + forced + sloppy + greed, 0.60, 1.90);
}
