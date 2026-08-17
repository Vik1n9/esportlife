/**
 * 玩家可加入隊（`data/regions/*`）與 NPC 池 team_id 的對映（S29 建）。
 *
 * 選隊池排除「玩家自己的隊」需要這個橋（§23.4：聯賽內賽事不自己打自己）——
 * regions 的隊名是顯示字串（主場賽區還是中文），NPC 池用 team_id，兩邊沒有別的
 * 連接點。這是兩套資料之間唯一的橋：regions 隊名有變動時同步這裡，測試守住
 * 每個 id 都在 `teamHistory.js` 裡。
 *
 * 沒進表的隊名（Shopify Rebellion：NPC 池沒有這隊）排除自然落空——選隊池照抽，
 * 風險是極罕見地「打到自己隊伍的史實陣容」，不影響強度數學。
 *
 * ⚠ `'MAD Lions KOI'` 映射到 `MAD`（MAD Lions）是組織前身對映（2024 合併改名）——
 * 目的只是「別抽到自己的隊」，寧可多排一年份對不上的舊身，不能漏排。
 */
export const REGION_TEAM_IDS = {
  // 主場賽區（隊名隨時代換，每個時代的隊都列）
  '台北暗殺星': 'TPA',
  'ahq 電子競技俱樂部': 'ahq',
  '橘子熊 Yoe Flash Wolves': 'FW',
  '華義 SPIDER': 'WS',
  'TPS 台北狙擊者': 'TPS',
  '閃電狼': 'FW',
  'J Team': 'JT',
  'MAD Team': 'MAD',
  '香港態度 HKA': 'HKA',
  'G-Rex': 'GRX',
  'PSG Talon': 'PSG',
  'Machi Esports': 'MCX',
  'Beyond Gaming': 'BYG',
  'Impunity': 'IMPU',
  'CTBC Flying Oyster': 'CFO',
  'GAM Esports': 'GAM',
  'DetonatioN FocusMe': 'DFM',
  'SoftBank HAWKS gaming': 'FSH',
  'Team Secret Whales': 'SW',
  // LCK
  T1: 'T1',
  'Gen.G': 'GEN',
  'Hanwha Life Esports': 'HLE',
  'Dplus KIA': 'DK',
  'KT Rolster': 'KT',
  DRX: 'DRX',
  'BNK FearX': 'BRO',
  // LPL
  JDG: 'JDG',
  BLG: 'BLG',
  TES: 'TES',
  LNG: 'LNG',
  WBG: 'WBG',
  EDG: 'EDG',
  'Invictus Gaming': 'IG',
  RNG: 'RNG',
  'Team WE': 'WE',
  'Ninjas in Pyjamas': 'NIP',
  // LEC
  'G2 Esports': 'G2',
  Fnatic: 'FNC',
  'MAD Lions KOI': 'MAD',
  'Team Vitality': 'VIT',
  'Karmine Corp': 'KC',
  'Team Heretics': 'HERE',
  'SK Gaming': 'SK',
  GIANTX: 'GIAN',
  // LCS
  Cloud9: 'C9',
  'Team Liquid': 'TL',
  '100 Thieves': '100T',
  FlyQuest: 'FLY',
  NRG: 'NRG',
  Dignitas: 'DIG',
  Immortals: 'IMT',
};
