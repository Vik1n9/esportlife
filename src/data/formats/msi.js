/**
 * MSI 的參賽資格與賽制。純資料。
 *
 * MSI 是**俱樂部賽事**，不是國家隊賽事。門票發給戰隊——賽段冠軍（2023 起前兩名）
 * 直接帶著整隊去，選手沒有報名、沒有徵召、也沒有婉拒的餘地。舊版把它寫成「國家隊
 * 徵召」，資格看個人 OVR、可以「以調整為由婉拒」、打完還會累積傷病風險，那整套是
 * 從棒球的 WBC 模型搬過來的。
 *
 * 「MSI 接在第幾個賽段之後」不在這裡，在 `data/regions/*.js` 的 `msiAfter`——那是
 * 賽區的年曆屬性。2023 年 LEC 改三賽段時，MSI 仍然接在它的春季賽（第二段）之後，
 * 同年其他賽區只有兩段、接在第一段之後。寫成全球規則會讓 LEC 抓到冬季賽冠軍。
 */

/** 賽段季後賽名次 → 是否拿得到 MSI 門票 */
export const MSI_QUALIFY = {
  CHAMPION: ['champion'],
  TOP2: ['champion', 'final'],
};

/**
 * `until` 為該列適用的最後一年。
 *
 * - `accepts` 該年度哪些名次拿得到門票
 * - `majorSlots` 主流賽區出幾隊（純敘事用，說明為什麼亞軍也去得了）
 * - `format` GROUP_KO 小組賽＋淘汰賽；DOUBLE_ELIM 雙敗淘汰
 * - `skip` 該年停辦
 */
export const MSI_RULES = [
  { until: 2014, none: true },                       // MSI 2015 才創辦
  {
    until: 2022,
    accepts: MSI_QUALIFY.CHAMPION,
    majorSlots: 1,
    format: 'GROUP_KO',
    skip: [2020],                                    // COVID-19 停辦
  },
  {
    // 2023 賽制大改：主流賽區出兩隊，所以春季賽亞軍也去得了
    until: 2024,
    accepts: MSI_QUALIFY.TOP2,
    majorSlots: 2,
    format: 'DOUBLE_ELIM',
  },
  {
    // 2025 起賽季重編（賽區的 msiAfter 跟著改成 2）
    until: 9999,
    accepts: MSI_QUALIFY.TOP2,
    majorSlots: 2,
    format: 'DOUBLE_ELIM',
  },
];

/** 該年度的 MSI 規則；回傳 null 代表當年沒有 MSI */
export function msiRuleOf(year) {
  const row = MSI_RULES.find((r) => year <= r.until) || MSI_RULES[MSI_RULES.length - 1];
  if (row.none || row.skip?.includes(year)) return null;
  return row;
}

/**
 * MSI 名次與獎勵。
 * `slotBonus` 是 2023 起的真實制度：MSI 冠軍為自己的賽區多掙一張世界賽門票。
 */
// V4 §9.4 的維度對映：`nerve` → `comp` 抗壓（同一件事，換成競技語彙），
// `rep` 風評整條拿掉（切割判定改讀教練評價），`fame` 聲量搬去 `state.fame` 但鍵名不變
export const MSI_RESULTS = {
  champion: { rank: 'MSI 冠軍', points: 6, comp: 7, fame: 16, slotBonus: 1 },
  final: { rank: 'MSI 亞軍', points: 4, comp: 5, fame: 10 },
  semi: { rank: 'MSI 四強', points: 3, comp: 3, fame: 6 },
  out: { rank: 'MSI 止步', points: 1, comp: 2, fame: 3 },
};
