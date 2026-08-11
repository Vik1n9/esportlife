/**
 * 基礎特質（可被合成消耗）。純資料。
 *
 * `effects` 是特質對遊戲數值的全部影響，由 `kernel/modifiers.js` 統一查詢。
 * 這樣新增或調整一個特質只需要改這個檔——舊版把效果寫成散在十個引擎檔裡的
 * `if (state.traits.xxx)`，改一個特質要先把它找出來。
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
    name: '老將', desc: '衰退減緩、退役上限 36',
    effects: { retireAge: { floor: 36 }, declineOffset: { floor: 2 }, declineMult: { cap: 0.7 } },
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
    effects: {},   // 分段效果：把抗壓加成整個翻負，寫在 engine/mental.js
  },

  /* ---- 心理／性格系。全部只能靠「扮演」取得，訓練點碰不到 ---- */
  bigheart: {
    name: '大心臟', desc: 'BO 決勝局勝率再 +5%',
    effects: { nerveAdd: 5 },
  },
  trashtalk: {
    name: '嘴砲王', desc: '放話效果加倍——聲量與負評都是',
    effects: {},   // 分段效果：只在 bold 語氣的扮演卡上生效，寫在 game.js
  },
  glue: {
    name: '休息室黏著劑', desc: '隊友默契成長加倍，衝突不易惡化',
    effects: { verdictChemRisk: -20 },
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
    name: '全民偶像', desc: '知名度與風評雙高，續約談判優勢',
    effects: { contractFloor: { floor: 1.25 } },
  },
  pariah: {
    name: '圈內毒瘤', desc: '（負面）報價變少、續約困難',
    effects: {
      contractCap: { cap: 0.9 }, contractCapShort: { cap: 0.95 },
      verdictRepRisk: 15, offerPenalty: true,
    },
  },
};
