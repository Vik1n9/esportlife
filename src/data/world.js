/** 時代、賽區階梯、戰隊名單、歷史解散表。純資料。 */

export const START_YEAR = 2012;
export const START_AGE = 16;

/**
 * 中度史實演進。回傳該年度的世界設定。
 * @param {number} year
 */
export function eraOf(year) {
  if (year <= 2014) return { key: 'DAWN', label: '草創', home: 'GPL', salary: 0.35, msi: false, worlds: 'GROUP' };
  if (year <= 2019) return { key: 'GROWTH', label: '成熟', home: 'LMS', salary: 0.7, msi: true, worlds: 'GROUP' };
  if (year <= 2024) return { key: 'GLOBAL', label: '全球化', home: 'PCS', salary: 1.0, msi: true, worlds: year >= 2023 ? 'SWISS' : 'GROUP' };
  return { key: 'MODERN', label: '現代', home: 'LCP', salary: 1.2, msi: true, worlds: 'SWISS' };
}

/**
 * 聯賽階梯。
 * - `par` 為該聯賽先發平均 OVR；`min` 為簽約門檻；`games` 為單季場次上限。
 * - `bucket` 是生涯數據分區的鍵。
 * - `baseSalary` 單位為「萬台幣」，會再乘上時代係數與合約係數。
 */
export const LEAGUES = {
  AMATEUR: { name: '網咖盃賽', par: 34, min: 30, games: 36, bucket: 'AMATEUR', tier: 0, baseSalary: 0 },
  AM2:  { name: '青訓次級', par: 44, min: 41, games: 48, bucket: 'AM2', tier: 1, baseSalary: 60 },
  HOME: { name: '主場賽區', par: 53, min: 50, games: 60, bucket: 'HOME', tier: 2, baseSalary: 300, region: 'HOME' },
  LEC:  { name: 'LEC', par: 56, min: 53, games: 66, bucket: 'OVERSEAS', tier: 3, baseSalary: 600, region: 'EU' },
  LCS:  { name: 'LCS', par: 57, min: 54, games: 66, bucket: 'OVERSEAS', tier: 3, baseSalary: 600, region: 'NA' },
  LCK:  { name: 'LCK', par: 61, min: 58, games: 70, bucket: 'OVERSEAS', tier: 4, baseSalary: 900, region: 'KR' },
  LPL:  { name: 'LPL', par: 61, min: 58, games: 70, bucket: 'OVERSEAS', tier: 4, baseSalary: 900, region: 'CN' },
};

export const OVERSEAS_LEAGUES = ['LCK', 'LPL', 'LEC', 'LCS'];

export const BUCKET_NAMES = { AMATEUR: '業餘', AM2: '青訓', HOME: '主場賽區', OVERSEAS: '海外賽區' };

/** 主場賽區各時代的真實隊名 */
export const TEAMS_HOME = {
  GPL: ['台北暗殺星', 'ahq 電子競技俱樂部', '橘子熊 Yoe Flash Wolves', '華義 SPIDER', 'TPS 台北狙擊者'],
  LMS: ['閃電狼', 'ahq 電子競技俱樂部', 'J Team', 'MAD Team', '香港態度 HKA', 'G-Rex'],
  PCS: ['PSG Talon', 'Machi Esports', 'J Team', 'ahq 電子競技俱樂部', 'Beyond Gaming', 'Impunity'],
  LCP: ['PSG Talon', 'CTBC Flying Oyster', 'GAM Esports', 'DetonatioN FocusMe', 'SoftBank HAWKS gaming', 'Team Secret Whales'],
};

/** 海外頂級賽區戰隊 */
export const TEAMS_OVERSEAS = {
  KR: ['T1', 'Gen.G', 'Hanwha Life Esports', 'Dplus KIA', 'KT Rolster', 'DRX', 'BNK FearX'],
  CN: ['JDG', 'BLG', 'TES', 'LNG', 'WBG', 'EDG', 'Invictus Gaming', 'RNG', 'Team WE', 'Ninjas in Pyjamas'],
  EU: ['G2 Esports', 'Fnatic', 'MAD Lions KOI', 'Team Vitality', 'Karmine Corp', 'Team Heretics', 'SK Gaming', 'GIANTX'],
  NA: ['Cloud9', 'Team Liquid', '100 Thieves', 'FlyQuest', 'NRG', 'Shopify Rebellion', 'Dignitas', 'Immortals'],
};

/**
 * 業餘起點的隊伍名。
 *
 * S2（2012）的台灣還沒有校隊或校際聯賽這種東西——當年的業餘場景是網咖包台、
 * 網咖自辦的盃賽，還有在排位上打出名號的路人王。隊伍多半是一群朋友臨時湊的，
 * 隊名也就跟著隨便取。
 */
export const TEAMS_AMATEUR = [
  '戰略高手網咖聯隊',
  '夜貓網咖五連坐',
  '巨獸網咖 A 隊',
  '影武者網咖代表隊',
  '學生街網咖雜牌軍',
  '峽谷路人王小隊',
];

/** 業餘階段的賽事名稱，純敘事用 */
export const AMATEUR_CUPS = [
  '網咖店內盃',
  '連鎖網咖城市盃',
  '週末 5v5 業餘聯賽',
  '飲料店贊助盃',
  '巴哈網友自辦盃',
  '排位路人王擂台',
];

export const MATE_NAMES = ['幻影', '蒼狼', '飛隼', '剃刀', '颶風', '岩壁', '霜星', '疾風', '雷鳴', '夜梟', '赤鴉', '銀牙'];

/** 教練風格與其提供的隊伍強度加成（單位：OVR 點） */
export const COACHES = {
  戰術大師: 2.5,
  營運鬼才: 2.5,
  訓練狂: 2.0,
  心理調適: 1.5,
  溝通大師: 1.5,
};

/**
 * 歷史解散事件（代表性子集）。
 * 玩家在該年身處名單中的隊伍 → 季初出現財務流言，季末強制解散，
 * 除非該季拿下世界賽冠軍（改寫史實）。
 */
export const DISBAND_HISTORY = {
  2016: { 台北暗殺星: '母公司改制，LoL 分部解散' },
  2019: { 閃電狼: '母公司宣布退出聯賽', 'MAD Team': '經營權轉移，戰隊解散' },
  2021: { 'ahq 電子競技俱樂部': 'LoL 分部正式解散' },
  2023: { 'Machi Esports': '戰隊解散退出 PCS' },
  2024: { 'Invictus Gaming': '席位出售，退出 LPL' },
  2025: { 'MAD Lions KOI': '母公司整併，退出 LEC' },
};

/** 隊名 → 解散年份。用來把已經倒閉的戰隊從簽約名單中移除。 */
export const DISBAND_YEAR = Object.fromEntries(
  Object.entries(DISBAND_HISTORY).flatMap(([year, teams]) => Object.keys(teams).map((t) => [t, Number(year)])),
);

/** 每路 8 隻英雄（同人引用） */
export const HEROES = {
  TOP: ['賈克斯', '菲歐拉', '鄂爾', '卡蜜兒', '雷尼克頓', '克雷德', '賽恩', '慎'],
  JG:  ['李星', '卡力斯', '維爾戈', '趙信', '悟空', '菲艾', '歐拉夫', '黛安娜'],
  MID: ['阿祈爾', '勒布朗', '劫', '星朵拉', '阿璃', '維克特', '庫奇', '崔絲塔娜'],
  ADC: ['凱特琳', '伊澤瑞爾', '汎', '婕莉', '亞菲利歐', '路西恩', '法洛士', '希維爾'],
  SUP: ['瑟雷西', '雷歐娜', '銳空', '娜米', '布郎姆', '悠咪', '巴德', '拉克絲'],
};

export const PATCH_THEMES = ['野核版本', '坦克版本', '法師版本', '對線版本', '下路版本', '換線運營版本', '大龍加速版本'];
