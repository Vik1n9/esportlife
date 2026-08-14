/**
 * 通用特質（合成系統的最底層「小件」）與稀有特質（由通用合成）。
 * 純資料。
 *
 * `effects` 是特質對遊戲數值的全部影響，由 `kernel/modifiers.js` 統一查詢。
 * 這樣新增或調整一個特質只需要改這個檔——舊版把效果寫成散在十個引擎檔裡的
 * `if (state.traits.xxx)`，改一個特質要先把它找出來。
 *
 * 合成分四階，概念取自 LoL 的道具合成：通用（小件）→ 稀有 → 史詩 → 傳說（終極裝）。
 * 通用與稀有住在 traits.js，史詩與傳說住在 epics.js，配方表見 epics.js 的 `FUSIONS`。
 *
 * 效果的四種寫法：
 *   key: 5                → 加法，累加所有來源
 *   key: { mul: 0.5 }     → 乘法，連乘所有來源
 *   key: { floor: 1.2 }   → 保底，取所有來源與基準值的最大值
 *   key: { cap: 0.9 }     → 封頂，取所有來源與基準值的最小值
 *   key: true             → 旗標，任一來源為真即成立
 *
 * 少數特質的效果是分段的（例如 `心態崩盤` 會把大心臟的加成整個翻負），無法用上面
 * 五種寫法表達，那些留在各自的引擎檔裡並標註原因。
 */
export const BASE_TRAITS = {
  genius: {
    name: '天才操作', desc: '訓練骰固定 4 點以上',
    effects: { giftedDice: true },
  },
  iron: {
    name: '鐵人', desc: '受傷機率大幅降低',
    effects: { injuryRate: { cap: 10 }, injuryMinorChance: { mul: 0.5 } },
  },
  meta: {
    name: '版本適應者', desc: '版本落差懲罰減半',
    effects: { patchDebt: { mul: 0.5 } },
  },
  macroG: {
    name: '營運鬼才', desc: '大局觀成長與勝率加成',
    effects: {},
  },
  clutch: {
    name: '大賽選手', desc: '季後賽與國際賽發揮加成',
    effects: { seriesGame: 4, intlRoll: 10 },
  },
  composure: {
    name: '心態沉穩', desc: '低潮與逆風不易崩盤',
    effects: { tiltImmune: true },
  },
  intlghost: {
    name: '國際賽之鬼', desc: '國際賽保底能力點',
    effects: { intlFloor: { floor: 3 } },
  },
  laneking: {
    name: '單殺王', desc: '單殺產出提升',
    effects: { soloRate: { mul: 1.15 } },
  },
  leader: {
    name: '團隊領袖', desc: '隊友戰力 +5',
    effects: { teamLead: { floor: 5 } },
  },
  franchise: {
    name: '神主牌', desc: '續約優先、年薪係數保底',
    effects: { contractFloor: { floor: 1.2 } },
  },
  popular: {
    name: '人氣選手', desc: '代言收入與續約意願提升',
    effects: { endorsement: { mul: 1.12 }, contractAdd: 0.05 },
  },
  veteran: {
    // v4.3：退役上限／衰退偏移／衰退倍率三個效果鍵已隨生命週期曲線（§7.2）作廢，
    // 變成死鍵。特質的實際效果由 S19a 依新的「窗口」機制重定義。
    name: '老將', desc: '（效果待 S19a 重定義）',
    effects: {},
  },
  disc: {
    name: '自律', desc: '訓練骰有機率額外 +1',
    effects: {},   // 擲骰時機在 game.js：只有帶著這個特質才會消耗一次亂數
  },
  single: {
    name: '單身', desc: '可參與多條合成配方',
    effects: {},
  },
  tilt: {
    name: '心態崩盤', desc: '（負面）逆風時表現下滑',
    effects: {},   // 分段效果：把抗壓加成整個翻負（clutchBonus），寫在 engine/mental.js
  },

  /* ---- 心理／性格系。全部只能靠「扮演」取得，訓練點碰不到 ---- */
  bigheart: {
    name: '大心臟', desc: 'BO 決勝局勝率再 +5%',
    effects: { clutchAdd: 5 },
  },
  trashtalk: {
    name: '嘴砲王', desc: '放話效果加倍——聲量與負評都是',
    effects: {},   // 分段效果：只在 bold 語氣的扮演卡上生效，寫在 game.js
  },
  glue: {
    name: '休息室黏著劑', desc: '隊友默契成長加倍，衝突不易惡化',
    effects: { verdictRiftRisk: -20 },
  },
  lonewolf: {
    name: '獨狼', desc: '個人數據提升，默契上限受限',
    effects: { soloRate: { mul: 1.2 }, killRate: { mul: 1.1 } },
  },
  underdog: {
    name: '逆風翻盤', desc: '種子序越後面，全隊發揮越強',
    effects: { underdogDepth: 1.2 },
  },
  idol: {
    name: '全民偶像', desc: '聲量高又沒有黑歷史，續約談判優勢',
    effects: { contractFloor: { floor: 1.25 } },
  },
  pariah: {
    name: '圈內毒瘤', desc: '（負面）報價變少、續約困難',
    effects: {
      contractCap: { cap: 0.9 }, contractCapShort: { cap: 0.95 },
      verdictFireRisk: 15, offerPenalty: true,
    },
  },
  grinder: {
    name: '肝帝', desc: '訓練狂魔，成長 ×1.15，但更容易操到受傷',
    effects: { growthMult: { mul: 1.15 }, injuryAdder: 6 },
  },
  meme: {
    name: '梗王', desc: '自帶流量，梗圖常客，代言收入提升',
    effects: { endorsement: { mul: 1.1 } },
  },
  camera: {
    name: '鏡頭感', desc: '鏡頭前從不怯場，直播與代言兩相宜',
    effects: { endorsement: { mul: 1.15 } },
  },
  guardian: {
    name: '守護者', desc: '願意為隊友扛，隊友戰力小幅提升',
    effects: { teamLead: { floor: 3 }, verdictRiftRisk: -10 },
  },
};

/**
 * 稀有特質（合成產物，可再被合成）。由 2 個「人格／媒體」類通用特質合成。
 *
 * 這裡刻意只用不佔用史詩素材的通用特質（人氣、膠水、獨狼、神主牌，以及新增的
 * 肝帝／梗王／鏡頭感／守護者）——史詩配方吃的都是「競技表現」類通用特質，兩池
 * 不重疊，稀有與史詩才能同時成立，不會互相搶素材（合成樹見 `epics.js` 的 FUSIONS）。
 */
export const RARE_TRAITS = {
  machine: {
    name: '練功機器', desc: '成長 ×1.2，免疫享樂類誘惑',
    effects: { growthMult: { mul: 1.2 }, indulgentImmune: true },
  },
  traffic: {
    name: '流量密碼', desc: '自帶話題，代言收入提升',
    effects: { endorsement: { mul: 1.15 }, contractAdd: 0.03 },
  },
  star: {
    name: '明星選手', desc: '代言與續約都吃香',
    effects: { endorsement: { mul: 1.2 }, contractFloor: { floor: 1.15 } },
  },
  pillar: {
    name: '定海神針', desc: '隊友大幅提升，默契不會崩',
    effects: { teamLead: { floor: 4 }, verdictRiftShield: true },
  },
  og: {
    name: '元老', desc: '隊友小幅提升，續約更有本錢',
    effects: { teamLead: { floor: 4 }, contractFloor: { floor: 1.1 } },
  },
  icon: {
    name: '傳奇偶像', desc: '代言收入提升，戰隊不會切割你',
    effects: { endorsement: { mul: 1.15 }, verdictShield: true },
  },
  joker: {
    name: '諧星', desc: '自帶流量，代言收入提升',
    effects: { endorsement: { mul: 1.15 } },
  },
  watchdog: {
    name: '高冷守護', desc: '我行我素但罩得住隊友',
    effects: { teamLead: { floor: 3 }, verdictRiftRisk: -10 },
  },
};
