/**
 * 技能層：位置、技能定義、技能←屬性權重、位置加權 OVR。純資料，無邏輯。
 *
 * 技能是**導出值**，玩家不能直接加點（見 `attributes.js` 的說明）。每一項技能是六個
 * 屬性的加權平均，權重列和固定為 1.00——所以技能值與屬性同量級（1～80），OVR 的
 * 尺度也就跟舊版一致，賽區 par 值、勝率公式、薪資曲線全部不必重算。
 *
 * 位置身分保留在兩個地方：`ROLE_SIGNATURE`（每路一項專屬技能）與 `OVR_WEIGHTS`
 * （同一套屬性，五路換算成 OVR 的路徑完全不同）。所以上路和輔助練同樣六個屬性，
 * 但把點投在哪裡的最佳解不一樣。
 */
import { ATTRS } from './attributes.js';

export const SKILL_NAMES = {
  sta: '體力', ref: '反應', op: '操作', macro: '大局觀', lane: '對線',
  tf: '團戰', roam: '遊走', vis: '視野',
  split: '單帶', jg: '節奏', assn: '刺客', dps: '輸出', eng: '開戰',
};

/**
 * 技能 ← 屬性的權重表。每列和為 1.00。
 *
 * 讀法：`開戰` 是 決斷 .45 ＋ 意識 .30 ＋ 默契 .25——會開團的輔助靠的是敢開（DEC）
 * 跟看得到時機（AWR），手速再快也開不出來。同理 `輸出` 吃 TEC/AGI、`視野` 幾乎純
 * AWR、`體力` 幾乎純 VIT。
 *
 * 每項技能刻意只掛 2～4 個屬性。第一版讓幾乎每項技能都沾到五、六個屬性，結果是
 * 折疊後五路的屬性權重長得差不多（最扁的中路最高／最低只差 2.8 倍），位置身分被
 * 平均掉了。寫純之後輔助的 AGI 權重掉到 0.028——靈巧對輔助幾乎沒有意義，這正是
 * 位置該有的樣子。
 */
export const SKILL_WEIGHTS = {
  sta:   { vit: 0.85, agi: 0.15 },
  ref:   { agi: 0.75, awr: 0.25 },
  op:    { tec: 0.70, agi: 0.30 },
  macro: { awr: 0.55, dec: 0.35, syn: 0.10 },
  lane:  { tec: 0.45, awr: 0.25, vit: 0.20, agi: 0.10 },
  tf:    { syn: 0.40, dec: 0.30, tec: 0.20, agi: 0.10 },
  roam:  { syn: 0.40, awr: 0.35, dec: 0.25 },
  vis:   { awr: 0.70, syn: 0.30 },
  split: { dec: 0.45, tec: 0.30, awr: 0.15, vit: 0.10 },
  jg:    { awr: 0.40, dec: 0.35, syn: 0.25 },
  assn:  { agi: 0.45, tec: 0.35, dec: 0.20 },
  dps:   { tec: 0.50, agi: 0.35, dec: 0.15 },
  eng:   { dec: 0.45, awr: 0.30, syn: 0.25 },
};

/** 位置專屬技能（每路 1 項） */
export const ROLE_SIGNATURE = { TOP: 'split', JG: 'jg', MID: 'assn', ADC: 'dps', SUP: 'eng' };

export const ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];

export const ROLE_NAMES = { TOP: '上路', JG: '打野', MID: '中路', ADC: '射手', SUP: '輔助' };

/**
 * 位置加權 OVR。權重總和皆為 1.00，讓五路 OVR 可直接互相比較
 * （舊版 TOP 合計 1.00 但 MID 只有 1.00 卻漏掉 assn，導致中路永遠偏低）。
 */
export const OVR_WEIGHTS = {
  TOP: { split: 0.28, lane: 0.20, tf: 0.16, op: 0.12, macro: 0.10, sta: 0.08, roam: 0.03, vis: 0.03 },
  JG:  { jg: 0.26, roam: 0.20, macro: 0.17, op: 0.12, tf: 0.12, sta: 0.07, vis: 0.06 },
  MID: { assn: 0.20, lane: 0.20, op: 0.18, roam: 0.13, macro: 0.12, tf: 0.12, sta: 0.05 },
  ADC: { dps: 0.26, tf: 0.19, op: 0.16, lane: 0.14, vis: 0.10, sta: 0.09, macro: 0.06 },
  SUP: { eng: 0.24, vis: 0.21, macro: 0.17, roam: 0.14, tf: 0.12, sta: 0.07, lane: 0.05 },
};

/** 該位置有 OVR 權重的技能，由重到輕。面板只顯示這些——其餘技能對這路沒有意義 */
export const ROLE_SKILLS = Object.fromEntries(
  ROLES.map((r) => [r, Object.keys(OVR_WEIGHTS[r]).sort((a, b) => OVR_WEIGHTS[r][b] - OVR_WEIGHTS[r][a])]),
);

/**
 * 位置 → 屬性的合成權重（兩層權重相乘攤平）。
 *
 * OVR 每季要算上百次（勝率、板凳判定、簽約報價、對手強度），沒必要每次都繞技能一圈。
 * 這裡在載入時把 `OVR_WEIGHTS × SKILL_WEIGHTS` 折疊成一張 5×6 的表，OVR 就是一次
 * 六項的內積。技能值本身仍然照算，但只在需要顯示或做數據模擬時才求值。
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
