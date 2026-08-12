/**
 * 技能層：位置、十二技能定義、技能←屬性權重、位置加權 OVR。純資料，無邏輯。
 *
 * 技能是**導出值**，玩家不能直接加點（見 `attributes.js` 的說明）。每一項技能是六個
 * 屬性的加權平均，權重列和固定為 1.00——所以技能值與屬性同量級（0–100），OVR 就是
 * 同一個刻度，賽區 par 值、勝率公式、薪資曲線讀的都是這一個尺度。
 *
 * S10 把舊的十三項換成 V4 §8.1／§8.2 的十二項。舊表是從棒球版的「素質」演化來的
 * （體力／反應／操作／大局觀…），跟教練覆盤時真的會講的話對不上；新表每一項都是
 * 一句覆盤語彙（「對線被壓」「小龍沒控好」「開團時機」），玩家看得懂輸在哪。
 *
 * 兩個結構性差異，不是改名：
 * - **體力不再是技能。** V4 §6 把它升格成會消耗、會恢復的資源（S13），所以 `vit`
 *   在五路的 OVR 權重全部歸零——這是刻意的，不是漏掉。
 * - **沒有位置專屬技能。** 舊表每路掛一項只有自己有的技能（`split`/`jg`/`assn`/
 *   `dps`/`eng`），位置身分靠「別人沒有這一項」撐著。V4 §8.2 讓十二項全體共用，
 *   身分完全由權重表達：輔助的走位權重是 0、射手的走位是 .26。
 */
import { ATTRS } from './attributes.js';

/** V4 §8.1 的十二技能。順序即面板與文件的權威順序 */
export const SKILL_NAMES = {
  lane: '對線', op: '操作', vis: '視野', jg: '節奏', gank: '支援', obj: '資源控制',
  tf: '會戰', eng: '開團', peel: '保護', split: '邊線處理', rotate: '轉線運營', pos: '走位',
};

/**
 * 技能 ← 屬性的權重表（V4 §8.1）。每列和為 1.00。
 *
 * 讀法：`開團` 是 決斷 .45 ＋ 意識 .30 ＋ 默契 .25——會開團的輔助靠的是敢開（DEC）
 * 跟看得到時機（AWR），手速再快也開不出來。同理 `走位` 吃 AGI/AWR、`視野` 是
 * AWR/SYN、`操作` 是唯一的純手上功夫（TEC/AGI）。
 *
 * 每項技能刻意只掛 2～3 個屬性。第一版讓幾乎每項技能都沾到五、六個屬性，結果是
 * 折疊後五路的屬性權重長得差不多（最扁的中路最高／最低只差 2.8 倍），位置身分被
 * 平均掉了。寫純之後輔助的 AGI 權重掉到 0（見下面的 `OVR_WEIGHTS`）——靈巧對輔助
 * 幾乎沒有意義，這正是位置該有的樣子。
 */
export const SKILL_WEIGHTS = {
  lane:   { tec: 0.40, awr: 0.35, agi: 0.25 },
  op:     { tec: 0.60, agi: 0.40 },
  vis:    { awr: 0.60, syn: 0.40 },
  jg:     { awr: 0.50, dec: 0.30, syn: 0.20 },
  gank:   { awr: 0.40, syn: 0.30, dec: 0.30 },
  obj:    { dec: 0.40, awr: 0.35, syn: 0.25 },
  tf:     { syn: 0.35, dec: 0.35, tec: 0.30 },
  eng:    { dec: 0.45, awr: 0.30, syn: 0.25 },
  peel:   { awr: 0.40, syn: 0.35, dec: 0.25 },
  split:  { dec: 0.40, tec: 0.30, awr: 0.30 },
  rotate: { awr: 0.50, dec: 0.35, syn: 0.15 },
  pos:    { agi: 0.45, awr: 0.30, tec: 0.25 },
};

export const ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];

export const ROLE_NAMES = { TOP: '上路', JG: '打野', MID: '中路', ADC: '射手', SUP: '輔助' };

/**
 * 位置加權 OVR（V4 §8.2）。每路核心 4 項＋次要 2 項，權重總和皆為 1.00，讓五路 OVR
 * 可直接互相比較。
 *
 * 舊表每路掛 7～8 項，其中一半權重在 .03～.06——那種尾巴既不影響 OVR 也不構成身分，
 * 只是讓面板多幾行。V4 收成六項，每一項都推得動位置身分：上路的邊線 .24、打野的
 * 節奏 .24、中路的對線 .22、射手的走位 .26、輔助的開團 .24。
 */
export const OVR_WEIGHTS = {
  TOP: { split: 0.24, lane: 0.20, tf: 0.18, eng: 0.15, rotate: 0.13, op: 0.10 },
  JG:  { jg: 0.24, gank: 0.20, obj: 0.20, rotate: 0.13, vis: 0.12, tf: 0.11 },
  MID: { lane: 0.22, op: 0.20, gank: 0.18, tf: 0.16, pos: 0.14, rotate: 0.10 },
  ADC: { pos: 0.26, op: 0.22, tf: 0.20, lane: 0.14, vis: 0.10, rotate: 0.08 },
  SUP: { eng: 0.24, peel: 0.22, vis: 0.20, gank: 0.14, tf: 0.10, obj: 0.10 },
};

/** 該位置有 OVR 權重的技能，由重到輕（前四項為核心）。面板只顯示這些——其餘技能對這路沒有意義 */
export const ROLE_SKILLS = Object.fromEntries(
  ROLES.map((r) => [r, Object.keys(OVR_WEIGHTS[r]).sort((a, b) => OVR_WEIGHTS[r][b] - OVR_WEIGHTS[r][a])]),
);

/**
 * 位置 → 屬性的合成權重（兩層權重相乘攤平）。
 *
 * OVR 每季要算上百次（勝率、板凳判定、簽約報價、對手強度），沒必要每次都繞技能一圈。
 * 這裡在載入時把 `OVR_WEIGHTS × SKILL_WEIGHTS` 折疊成一張 5×6 的表，OVR 就是一次
 * 六項的內積。技能值本身仍然照算，但只在需要顯示或做數據模擬時才求值。
 *
 * 十二技能表折疊後的實際數字（S10 實測，`vit` 全為 0）：
 *   TOP  awr .252 tec .266 dec .272 syn .120 agi .090
 *   JG   awr .407 dec .296 syn .264 tec .033 agi 0
 *   MID  tec .291 awr .241 agi .198 dec .145 syn .125
 *   ADC  tec .313 agi .240 awr .227 syn .122 dec .098
 *   SUP  awr .371 syn .319 dec .280 tec .030 agi 0
 * 五路的重心各不相同（打野吃意識、射手吃技巧與靈巧、輔助吃意識與默契），而靈巧對
 * 兩個後排位置完全沒有意義——鐵則二要守的就是這個形狀，`invariants` 有三條在量它。
 */
export const ROLE_ATTR_WEIGHTS = Object.fromEntries(ROLES.map((role) => {
  const acc = Object.fromEntries(ATTRS.map((a) => [a, 0]));
  for (const [skill, sw] of Object.entries(OVR_WEIGHTS[role])) {
    for (const [attr, aw] of Object.entries(SKILL_WEIGHTS[skill])) acc[attr] += sw * aw;
  }
  return [role, acc];
}));

/**
 * 每路開局時特別突出的兩個屬性。
 *
 * 由 `ROLE_ATTR_WEIGHTS` 取前二——不寫死，改權重表時自動跟著走。天賦一生下來就
 * 有位置味道：打野的意識／決斷比別人高一截，射手的技巧比別人高一截。
 */
export const ROLE_START_EDGE = Object.fromEntries(ROLES.map((role) => {
  const w = ROLE_ATTR_WEIGHTS[role];
  return [role, [...ATTRS].sort((a, b) => w[b] - w[a]).slice(0, 2)];
}));

/** 各路數據基線（每場平均） */
export const STAT_BASELINE = {
  TOP: { K: 0.8, D: 1.4, A: 1.6, CS: 7.2, VIS: 1.2, DMG: 22, SOLO: 1.2 },
  JG:  { K: 1.0, D: 1.2, A: 1.8, CS: 5.5, VIS: 1.6, DMG: 18, SOLO: 1.0 },
  MID: { K: 1.1, D: 1.2, A: 1.6, CS: 7.0, VIS: 1.2, DMG: 24, SOLO: 1.3 },
  ADC: { K: 1.2, D: 1.0, A: 1.5, CS: 8.0, VIS: 1.0, DMG: 28, SOLO: 0.4 },
  SUP: { K: 0.4, D: 1.3, A: 2.4, CS: 2.0, VIS: 2.2, DMG: 12, SOLO: 0.2 },
};
