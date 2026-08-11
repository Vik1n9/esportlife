/**
 * 歷史解散事件（代表性子集）。純資料。
 *
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
