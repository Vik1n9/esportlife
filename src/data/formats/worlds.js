/**
 * 世界賽的種子序來源與賽制。純資料。
 *
 * 三段史實，舊版一段都沒有：
 *
 * 1. **種子序怎麼決定**。2013–2022 是冠軍點數制（全年各賽段季後賽名次累積），
 *    2023 年廢止，改看最後一個賽段的季後賽名次。舊版把冠軍點數套用到 2025 年。
 * 2. **席位數**。寫在 `data/regions/*.js` 的 `worldsSlots`，隨時代變。舊版寫死
 *    「主場賽區 2、其餘 4」，而且 2012–2014 的主場賽區其實只有一張外卡門票。
 * 3. **賽制**。2012–2022 小組賽，2017 起低種子要先打入圍賽，2023 改 Swiss。
 *
 * 而且門票本身不該是擲骰。舊版算好了種子序卻還要 `rng.chance(96/88/74/30)`——
 * 第一種子有 4% 機率拿不到門票，最後一張門票變成一個 30% 的數字而不是一場比賽。
 */

/** 賽段季後賽名次 → 種子序（2023 起的制度） */
export const FINISH_TO_SEED = { champion: 1, final: 2, semi: 3, quarter: 4, none: 0 };

/**
 * `until` 為該列適用的最後一年。
 *
 * - `seedFrom` 種子序來源
 *     `REGIONAL_QUALIFIER` 2012：沒有點數制，只有冠軍去得了
 *     `CHAMP_POINTS`       2013–2022：全年冠軍點數換算
 *     `FINAL_SPLIT_PLAYOFF` 2023–：最後一個賽段的季後賽名次
 * - `stage` 主賽事的第一階段：`GROUP_KO` 四隊小組雙循環／`SWISS` 三勝晉級三敗淘汰
 * - `playIn` 誰要先打入圍賽；null 代表當年沒有入圍賽
 *     `minorAlways`   非頂級賽區的隊伍一律先打入圍
 *     `majorLastSeed` 頂級賽區的最後一個種子也要打入圍
 * - `gauntlet` 該賽區最後一張門票要打地區資格賽（LCK Regional Finals／LCS Gauntlet）
 */
export const WORLDS_RULES = [
  {
    until: 2012,
    seedFrom: 'REGIONAL_QUALIFIER',
    stage: 'GROUP_KO',
    playIn: null,
    gauntlet: false,
  },
  {
    // 2013 冠軍點數制上路，「第四種子」這個身分從此存在
    until: 2016,
    seedFrom: 'CHAMP_POINTS',
    stage: 'GROUP_KO',
    playIn: null,
    gauntlet: true,
  },
  {
    // 2017 起賽制擴編，低種子先打入圍賽才進得了主賽事
    until: 2022,
    seedFrom: 'CHAMP_POINTS',
    stage: 'GROUP_KO',
    playIn: { minorAlways: true, majorLastSeed: true },
    gauntlet: true,
  },
  {
    // 2023 冠軍點數制廢止，小組賽改 Swiss
    until: 9999,
    seedFrom: 'FINAL_SPLIT_PLAYOFF',
    stage: 'SWISS',
    playIn: { minorAlways: true, majorLastSeed: false },
    gauntlet: false,
  },
];

export function worldsRuleOf(year) {
  return WORLDS_RULES.find((r) => year <= r.until) || WORLDS_RULES[WORLDS_RULES.length - 1];
}

/**
 * 名次與獎勵。
 *
 * 心理值的幅度刻意大於 MSI——世界賽是這個項目一年一度的最大舞台，走到哪一輪都會
 * 在人身上留下東西。走得越遠留得越多，止步也給。
 */
// V4 §9.4 的維度對映：`nerve` → `comp` 抗壓、`chem` → `trust` 信任（默契併進去了），
// `rep` 風評整條拿掉。一起打過世界賽會長信任，這一條是原樣搬過來的
export const WORLDS_RESULTS = {
  champion: { rank: '世界賽冠軍', points: 10, comp: 10, fame: 25, trust: 6 },
  final: { rank: '世界賽亞軍', points: 6, comp: 7, fame: 16, trust: 3 },
  semi: { rank: '四強止步', points: 3, comp: 5, fame: 10, trust: 2 },
  quarter: { rank: '八強止步', points: 2, comp: 3, fame: 7, trust: 1 },
  stage: { rank: '小組止步', points: 1, comp: 2, fame: 4, trust: 0 },
  playin: { rank: '入圍賽出局', points: 1, comp: 1, fame: 2, trust: 0 },
};
