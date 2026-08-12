/**
 * 歷史解散事件（代表性子集）。純資料。
 *
 * 玩家在該年身處名單中的隊伍 → 季初出現財務流言，季末強制解散，
 * 除非該季拿下世界賽冠軍（改寫史實）。
 *
 * 以「一隊一列」的陣列表達（年 → 隊 → 因的巢狀物件是承袭排法），
 * 查詢與派生都比巢狀直白：`DISBAND_YEAR` 直接從同一張表映射出來。
 */
export const DISBANDS = [
  { year: 2016, team: '台北暗殺星', reason: '母公司改制，LoL 分部解散' },
  { year: 2019, team: '閃電狼', reason: '母公司宣布退出聯賽' },
  { year: 2019, team: 'MAD Team', reason: '經營權轉移，戰隊解散' },
  { year: 2021, team: 'ahq 電子競技俱樂部', reason: 'LoL 分部正式解散' },
  { year: 2023, team: 'Machi Esports', reason: '戰隊解散退出 PCS' },
  { year: 2024, team: 'Invictus Gaming', reason: '席位出售，退出 LPL' },
  { year: 2025, team: 'MAD Lions KOI', reason: '母公司整併，退出 LEC' },
];

/** 隊名 → 解散年份。用來把已經倒閉的戰隊從簽約名單中移除。 */
export const DISBAND_YEAR = Object.fromEntries(DISBANDS.map((d) => [d.team, d.year]));
