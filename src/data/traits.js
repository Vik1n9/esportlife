/**
 * 通用特質（合成系統的最底層「小件」）與稀有特質（由通用合成）。純資料。
 *
 * v4.3 特質 schema（S19a 定案，S18a 編輯器照這套驗證）：
 *
 *   tier            common / rare / epic / legend / unique
 *   pool            persona（人格／媒體，稀有素材）／performance（競技表現，史詩素材）
 *                   ／psych（心理層，不入合成）／career（生涯，不入合成）。§14.2
 *   effects         益處。`kernel/modifiers.js` 的四種寫法（加法／`mul`／`floor`／`cap`／
 *                   旗標）＋ §7.2 六個窗口（`peak_age_shift` 加法、其餘五個乘法）
 *   sideEffects     副作用。同一套寫法，方向相反。§13.2 的分級由 `sideEffectLevel` 標
 *   sideEffectLevel light（輕度：小數值扣減）／medium（中度：明顯扣減）／
 *                   heavy（重度：大幅扣減、改變玩法——只給史詩與傳說）
 *   exclusiveWith   互斥特質鍵清單（§13.3 第二層）。取得任一則同組其他不可取得；
 *                   對稱性由測試強制（A 排他則 B 也要排他）
 *   maintain        `(state) => boolean` 維持條件（§14.2）。不成立時年度邊界失去
 *                   該特質（`engine/progression.js`）。不寫＝恆真
 *
 * 心理層效果（§14.4 C 層）：鍵 `mental_comp`／`mental_conf`／`mental_drive`／
 * `mental_disc`／`mental_trust`／`mental_resl`，加法，消費端在 `engine/psych.js` 的
 * `mentalMod`——特質的心理增減直接進 §9.2 的發揮公式，這就是「掛載在遊戲機制上」
 * （§14.5 第 5 條）。玩家看不見心理值，只能從場上表現推測，符合 §9.1 的揭露界線。
 *
 * 合成分四階，概念取自 LoL 的道具合成：通用（小件）→ 稀有 → 史詩 → 傳說（終極裝）。
 * 通用與稀有住在 traits.js，史詩與傳說住在 epics.js，配方表見 epics.js 的 `FUSIONS`。
 *
 * 池歸屬跟著配方走（§14.2 兩池不重疊）：被稀有配方吃的 8 個通用是 persona 池，
 * 被史詩配方吃的通用是 performance 池——這樣稀有與史詩才不會搶同一批素材。
 * `tilt`／`pariah` 是 v4.2 重寫的雙面特質，不入合成樹，歸 psych 池。
 */
export const BASE_TRAITS = {
  genius: {
    name: '天才操作', tier: 'common', pool: 'performance',
    desc: '操作天才，訓練成效 ×1.2；恃才傲物，紀律 −6',
    effects: { growth_rate_mul: { mul: 1.2 } },
    sideEffects: { mental_disc: -6 }, sideEffectLevel: 'light',
  },
  iron: {
    // §14.1：鐵人收進天生特質池（`innate: true`，S19d）——它原本完全沒有來源，
    // 是 §14.2 死配方規則點名的死素材；收進天生池就活了，效果不動。
    // 體質類不宣告 mentalBias（§9.1）：動的是受傷率，不是心理
    name: '鐵人', tier: 'common', pool: 'performance', innate: true,
    desc: '受傷率大降、小傷少轉大傷、韌性 +4；倔強硬撐不聽隊醫勸，紀律 −4',
    effects: { injuryRate: { cap: 10 }, injuryMinorChance: { mul: 0.5 }, mental_resl: 4 },
    sideEffects: { mental_disc: -4 }, sideEffectLevel: 'light',
  },
  meta: {
    name: '版本適應者', tier: 'common', pool: 'performance',
    desc: '版本落差懲罰減半；太隨版本走，少了固執的熱情，動機 −4',
    effects: { patchDebt: { mul: 0.5 } },
    sideEffects: { mental_drive: -4 }, sideEffectLevel: 'light',
  },
  macroG: {
    name: '營運鬼才', tier: 'common', pool: 'performance',
    desc: '大局觀在國際賽最重要——國際賽發揮加成；算無遺策，把隊友當棋子，信任 −6',
    effects: { intlRoll: 6 },
    sideEffects: { mental_trust: -6 }, sideEffectLevel: 'light',
  },
  clutch: {
    name: '大賽選手', tier: 'common', pool: 'performance',
    desc: '季後賽與國際賽發揮加成；只想打大賽，平常練習不投入，紀律 −6',
    effects: { seriesGame: 4, intlRoll: 10 },
    sideEffects: { mental_disc: -6 }, sideEffectLevel: 'medium',
  },
  composure: {
    name: '心態沉穩', tier: 'common', pool: 'performance',
    desc: '低潮與逆風不易崩盤；過於平穩，少了衝勁，動機 −4',
    effects: { tiltImmune: true },
    sideEffects: { mental_drive: -4 }, sideEffectLevel: 'light',
  },
  intlghost: {
    name: '國際賽之鬼', tier: 'common', pool: 'performance',
    desc: '國際賽保底發揮；平常訓練散漫，只為大賽而活，紀律 −6',
    effects: { intlFloor: { floor: 3 } },
    sideEffects: { mental_disc: -6 }, sideEffectLevel: 'medium',
  },
  laneking: {
    name: '單殺王', tier: 'common', pool: 'performance',
    desc: '單殺產出提升；自己就能贏，不需要隊友，信任 −6',
    effects: { soloRate: { mul: 1.15 } },
    sideEffects: { mental_trust: -6 }, sideEffectLevel: 'medium',
  },
  leader: {
    name: '團隊領袖', tier: 'common', pool: 'performance',
    desc: '隊友戰力 +5；揹著全隊期待，不敢冒險操作，自信 −6',
    effects: { teamLead: { floor: 5 } },
    sideEffects: { mental_conf: -6 }, sideEffectLevel: 'medium',
    exclusiveWith: ['lonewolf'],
  },
  franchise: {
    name: '神主牌', tier: 'common', pool: 'persona',
    desc: '續約優先、年薪係數保底、俱樂部不敢動你；地位太穩，缺乏危機感，動機 −4',
    effects: { contractFloor: { floor: 1.2 }, verdictFireRisk: -10 },
    sideEffects: { mental_drive: -4 }, sideEffectLevel: 'light',
  },
  popular: {
    name: '人氣選手', tier: 'common', pool: 'persona',
    desc: '代言收入與續約意願提升；萬眾矚目，關鍵時刻怕輸，抗壓 −4',
    effects: { endorsement: { mul: 1.12 }, contractAdd: 0.05 },
    sideEffects: { mental_comp: -4 }, sideEffectLevel: 'light',
  },
  veteran: {
    name: '老將', tier: 'common', pool: 'performance',
    // v4.3：退役上限／衰退偏移／衰退倍率三個效果鍵已隨生命週期曲線（§7.2）作廢，
    // 改由 §7.2 的窗口表達——衰退減緩（fall_k_mul）＋ 巔峰延後（peak_age_shift）。
    desc: '衰退大幅減緩、巔峰延後一年；征戰多年，職業倦怠，動機 −6',
    effects: { fall_k_mul: { mul: 0.7 }, peak_age_shift: 1 },
    sideEffects: { mental_drive: -6 }, sideEffectLevel: 'medium',
  },
  disc: {
    name: '自律', tier: 'common', pool: 'performance',
    desc: '紀律 +10、訓練成效小幅提升；看不慣散漫隊友，休息室摩擦 +6',
    effects: { mental_disc: 10, growth_rate_mul: { mul: 1.05 } },
    sideEffects: { verdictRiftRisk: 6 }, sideEffectLevel: 'light',
  },
  single: {
    name: '單身', tier: 'common', pool: 'performance',
    // 維持條件範例（§14.2）：一旦交往就失去——單身的價值就是「心無旁騖」
    desc: '心無旁騖，訓練成效 ×1.1；情緒無人分擔，抗壓 −4。一旦交往即失去',
    effects: { growth_rate_mul: { mul: 1.1 } },
    sideEffects: { mental_comp: -4 }, sideEffectLevel: 'light',
    maintain: (s) => !s.romance,
  },
  tilt: {
    // v4.2 重寫：不再純負面——「心態崩盤」是情緒型選手，會崩也會爆。
    // 益處＝敢打（單殺率提升）；副作用＝崩盤（分段效果寫在 engine/mental.js 的
    // clutchBonus，把抗壓加成整個翻負）＋ 抗壓／韌性扣減 ＋ 隊友受不了
    name: '心態崩盤', tier: 'common', pool: 'psych',
    desc: '情緒型選手，手感來了一波流，單殺率 +15%；一崩全崩——逆風時發揮翻負、抗壓 −8、韌性 −6、隊友受不了',
    effects: { soloRate: { mul: 1.15 } },
    sideEffects: { mental_comp: -8, mental_resl: -6, verdictRiftRisk: 10 }, sideEffectLevel: 'heavy',
  },
  bigheart: {
    name: '大心臟', tier: 'common', pool: 'performance',
    desc: 'BO 決勝局勝率加成；平時提不起勁，只在關鍵時刻認真，動機 −4',
    effects: { clutchAdd: 5 },
    sideEffects: { mental_drive: -4 }, sideEffectLevel: 'light',
  },
  trashtalk: {
    name: '嘴砲王', tier: 'common', pool: 'performance',
    // 分段效果：放話在 bold 語氣的扮演卡上聲量 ×1.6（engine/mental.js 的 driftMental 也
    // 靠它讓信任收不回來），留在 shared.js 標註
    desc: '放話製造話題，合約加分、聲量加倍；太嗆得罪高層，切割風險 +10、信任 −4',
    effects: { contractAdd: 0.05 },
    sideEffects: { verdictFireRisk: 10, mental_trust: -4 }, sideEffectLevel: 'medium',
  },
  glue: {
    name: '休息室黏著劑', tier: 'common', pool: 'persona',
    desc: '隊友摩擦大減；太在意和諧，不敢要求隊友，紀律 −6',
    effects: { verdictRiftRisk: -20 },
    sideEffects: { mental_disc: -6 }, sideEffectLevel: 'light',
    exclusiveWith: ['lonewolf'],
  },
  lonewolf: {
    name: '獨狼', tier: 'common', pool: 'persona',
    desc: '個人數據大幅提升；獨來獨往，信任 −8、休息室摩擦 +8',
    effects: { soloRate: { mul: 1.2 }, killRate: { mul: 1.1 } },
    sideEffects: { mental_trust: -8, verdictRiftRisk: 8 }, sideEffectLevel: 'medium',
    exclusiveWith: ['glue', 'leader'],
  },
  underdog: {
    name: '逆風翻盤', tier: 'common', pool: 'performance',
    desc: '種子序越後面，全隊發揮越強、韌性 +4；沒有壓力就沒有動力，動機 −4',
    effects: { underdogDepth: 1.2, mental_resl: 4 },
    sideEffects: { mental_drive: -4 }, sideEffectLevel: 'light',
  },
  idol: {
    name: '全民偶像', tier: 'common', pool: 'performance',
    desc: '聲量高又沒有黑歷史，續約談判優勢；偶像包袱，怕掉粉怕輸，抗壓 −6',
    effects: { contractFloor: { floor: 1.25 } },
    sideEffects: { mental_comp: -6 }, sideEffectLevel: 'medium',
    exclusiveWith: ['meme'],
  },
  pariah: {
    // v4.2 重寫：圈內毒瘤＝黑紅也是紅。極端標籤檢驗的答案：簽他＝簽話題，
    // 代言照接（endorsement）；代價是報價縮水與切割風險（保留舊效果鍵）。
    // 維持條件：聲量退潮就不再是毒瘤——失去特質（洗白）。
    name: '圈內毒瘤', tier: 'common', pool: 'psych',
    desc: '黑紅也是紅，代言收入提升；但報價縮水、切割風險大增——聲量退潮就不再是毒瘤（失去此特質）',
    effects: { endorsement: { mul: 1.2 } },
    sideEffects: {
      contractCap: { cap: 0.9 }, contractCapShort: { cap: 0.95 },
      verdictFireRisk: 15, offerPenalty: true,
    }, sideEffectLevel: 'heavy',
    maintain: (s) => (s.fame ?? 0) >= 30,
  },
  grinder: {
    name: '肝帝', tier: 'common', pool: 'persona',
    // v4.3：骰子加點已退場，成長 ×N 改走 growth_rate_mul 窗口；「操到受傷」改由
    // 訓練事件卡的大失敗承擔（§5.4），這裡用 injuryMinorChance 放大「小傷轉大傷」
    desc: '訓練狂魔，成效 ×1.15；操到受傷（小傷易轉大傷）、泡訓練室不社交，摩擦 +8',
    effects: { growth_rate_mul: { mul: 1.15 } },
    sideEffects: { injuryMinorChance: { mul: 1.4 }, verdictRiftRisk: 8 }, sideEffectLevel: 'medium',
  },
  meme: {
    name: '梗王', tier: 'common', pool: 'persona',
    desc: '自帶流量，梗圖常客，代言收入提升；玩心重，動力分散，動機 −5',
    effects: { endorsement: { mul: 1.1 } },
    sideEffects: { mental_drive: -5 }, sideEffectLevel: 'light',
    exclusiveWith: ['idol'],
  },
  camera: {
    name: '鏡頭感', tier: 'common', pool: 'persona',
    desc: '鏡頭前從不怯場，直播與代言兩相宜；活在鏡頭下，對人防備，信任 −4',
    effects: { endorsement: { mul: 1.15 } },
    sideEffects: { mental_trust: -4 }, sideEffectLevel: 'light',
  },
  guardian: {
    name: '守護者', tier: 'common', pool: 'persona',
    desc: '願意為隊友扛，隊友戰力小幅提升、摩擦減少；自己關鍵時刻容易緊張，抗壓 −4',
    effects: { teamLead: { floor: 3 }, verdictRiftRisk: -10 },
    sideEffects: { mental_comp: -4 }, sideEffectLevel: 'light',
  },

  /*
   * 天生特質（S19d，§14.1）。只收基礎人格／體質類，不收競技表現類；池內 ≤ 5 條
   * （0.8 ÷ N ≥ 15%）。條目本體住在這裡（合成／UI 要認識），誰是天生的由
   * `data/innate.js` 的 INNATE_POOL 宣告。v4.3 之後具體內容由特質編輯器重定義，
   * 這 5 條是機制先行用的初始內容。
   *
   * 天生特質是白拿的，所以副作用不能省——玻璃體質是**刻意**的純副作用條目
   * （v4.2「無純負面特質」管的是合成池裡要玩家付出代價的那些，不擋白拿的出生
   * 天賦，§14.1 明列）。
   */
  innateCalm: {
    name: '天生抗壓', tier: 'common', pool: 'persona', innate: true,
    desc: '大賽不怯場，國際賽保底發揮；穩到沒有衝勁，動機 −4',
    effects: { intlFloor: { floor: 2 } },
    sideEffects: { mental_drive: -4 }, sideEffectLevel: 'light',
  },
  glass: {
    name: '玻璃體質', tier: 'common', pool: 'performance', innate: true,
    desc: '身體不耐操，小傷容易轉成大傷',
    effects: {},
    sideEffects: { injuryMinorChance: { mul: 1.6 } }, sideEffectLevel: 'medium',
  },
  innateLeader: {
    name: '天生領袖', tier: 'common', pool: 'persona', innate: true,
    desc: '隊友願意跟，隊友戰力小幅提升；太有主見，聽不進別人的紀律，紀律 −4',
    effects: { teamLead: { floor: 3 } },
    sideEffects: { mental_disc: -4 }, sideEffectLevel: 'light',
  },
  nightOwl: {
    name: '夜貓子', tier: 'common', pool: 'persona', innate: true,
    desc: '深夜訓練效率高，成長小幅提升；作息爛，紀律 −6',
    effects: { growth_rate_mul: { mul: 1.1 } },
    sideEffects: { mental_disc: -6 }, sideEffectLevel: 'light',
  },
};

/**
 * 稀有特質（合成產物，可再被傳說配方當素材）。由 2 個「人格／媒體」類通用特質合成，
 * 所以它們的池歸屬一律 persona（§14.2：史詩＋稀有 → 傳說時，素材分屬兩池才不會搶）。
 */
export const RARE_TRAITS = {
  machine: {
    name: '練功機器', tier: 'rare', pool: 'persona',
    desc: '成長 ×1.2、免疫享樂類誘惑；練功狂與人疏離，信任 −6、摩擦 +8',
    effects: { growth_rate_mul: { mul: 1.2 }, indulgentImmune: true },
    sideEffects: { mental_trust: -6, verdictRiftRisk: 8 }, sideEffectLevel: 'medium',
  },
  traffic: {
    name: '流量密碼', tier: 'rare', pool: 'persona',
    desc: '自帶話題，代言收入提升、合約加分；流量至上，紀律 −6',
    effects: { endorsement: { mul: 1.15 }, contractAdd: 0.03 },
    sideEffects: { mental_disc: -6 }, sideEffectLevel: 'medium',
  },
  star: {
    name: '明星選手', tier: 'rare', pool: 'persona',
    desc: '代言與續約都吃香；明星包袱，關鍵時刻怕輸，抗壓 −8',
    effects: { endorsement: { mul: 1.2 }, contractFloor: { floor: 1.15 } },
    sideEffects: { mental_comp: -8 }, sideEffectLevel: 'medium',
  },
  pillar: {
    name: '定海神針', tier: 'rare', pool: 'persona',
    desc: '隊友大幅提升，默契不會崩；太穩了，不敢冒險操作，自信 −4',
    effects: { teamLead: { floor: 4 }, verdictRiftShield: true },
    sideEffects: { mental_conf: -4 }, sideEffectLevel: 'medium',
  },
  og: {
    name: '元老', tier: 'rare', pool: 'persona',
    desc: '隊友小幅提升，續約更有本錢；待退心態，動機 −6',
    effects: { teamLead: { floor: 4 }, contractFloor: { floor: 1.1 } },
    sideEffects: { mental_drive: -6 }, sideEffectLevel: 'medium',
  },
  icon: {
    name: '傳奇偶像', tier: 'rare', pool: 'persona',
    desc: '代言收入提升，戰隊不會切割你；偶像包袱，抗壓 −6',
    effects: { endorsement: { mul: 1.15 }, verdictShield: true, verdictFireRisk: -15 },
    sideEffects: { mental_comp: -6 }, sideEffectLevel: 'medium',
  },
  joker: {
    name: '諧星', tier: 'rare', pool: 'persona',
    desc: '自帶流量，代言收入提升；不正經，紀律 −8',
    effects: { endorsement: { mul: 1.15 } },
    sideEffects: { mental_disc: -8 }, sideEffectLevel: 'medium',
  },
  watchdog: {
    name: '高冷守護', tier: 'rare', pool: 'persona',
    desc: '我行我素但罩得住隊友；把情緒藏起來，動機 −4',
    effects: { teamLead: { floor: 3 }, verdictRiftRisk: -10 },
    sideEffects: { mental_drive: -4 }, sideEffectLevel: 'light',
  },
};
