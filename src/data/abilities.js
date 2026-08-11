/** 能力值、位置與位置加權 OVR 的靜態定義。純資料，無邏輯。 */

export const ABILITY_NAMES = {
  sta: '體力', ref: '反應', op: '操作', macro: '大局觀', lane: '對線',
  tf: '團戰', roam: '遊走', vis: '視野',
  split: '單帶', jg: '節奏', assn: '刺客', dps: '輸出', eng: '開戰',
};

/** 五路共同能力 */
export const CORE_ABILITIES = ['sta', 'ref', 'op', 'macro', 'lane', 'tf', 'roam', 'vis'];

/** 位置專屬能力（每路 1 項） */
export const ROLE_SIGNATURE = { TOP: 'split', JG: 'jg', MID: 'assn', ADC: 'dps', SUP: 'eng' };

export const ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];

export const ROLE_NAMES = { TOP: '上路', JG: '打野', MID: '中路', ADC: '射手', SUP: '輔助' };

/** 每個位置實際可加點的 9 項能力 */
export const ROLE_ABILITIES = Object.fromEntries(
  ROLES.map((r) => [r, CORE_ABILITIES.concat([ROLE_SIGNATURE[r]])]),
);

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

/** 能力硬上限（`神之領域` 可突破） */
export const ABILITY_CAP = 80;
export const ABILITY_CAP_GODHAND = 85;

/** 成長成本階梯：目前值 >= 門檻 → 每 +1 需要的訓練點 */
export const GROWTH_COST = [
  { at: 66, cost: 7 },
  { at: 58, cost: 4 },
  { at: 50, cost: 2 },
  { at: 0, cost: 1 },
];

/** 超過潛力上限後的成本倍率 */
export const OVER_POTENTIAL_MULTIPLIER = 3;

/** 各路數據基線（每場平均） */
export const STAT_BASELINE = {
  TOP: { K: 0.8, D: 1.4, A: 1.6, CS: 7.2, VIS: 1.2, DMG: 22, SOLO: 1.2 },
  JG:  { K: 1.0, D: 1.2, A: 1.8, CS: 5.5, VIS: 1.6, DMG: 18, SOLO: 1.0 },
  MID: { K: 1.1, D: 1.2, A: 1.6, CS: 7.0, VIS: 1.2, DMG: 24, SOLO: 1.3 },
  ADC: { K: 1.2, D: 1.0, A: 1.5, CS: 8.0, VIS: 1.0, DMG: 28, SOLO: 0.4 },
  SUP: { K: 0.4, D: 1.3, A: 2.4, CS: 2.0, VIS: 2.2, DMG: 12, SOLO: 0.2 },
};
