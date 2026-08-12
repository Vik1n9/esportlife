/**
 * 主場賽區（台港澳）。
 *
 * 這是玩家的母區，也是唯一會隨時代改名換制的賽區：
 * GPL（2012–2014）→ LMS（2015–2019）→ PCS（2020–2024）→ LCP（2025–）。
 * 隊名跟著換，所以 `timeline.teams` 每個時代各佔一列，而不是像其他賽區只有單一
 * 名單。時代名（GPL／LMS／PCS／LCP）由 `data/eras.js` 的 `eraOf(year).home` 給出，
 * `teamNamesOf` 用它當鍵。
 */
export default {
  key: 'HOME',
  league: 'HOME',
  name: '主場賽區',        // 實際顯示名由 eraOf(year).home 決定

  // 聯賽靜態屬性：不隨時代變動的門檻與價碼
  ladder: { par: 53, min: 50, games: 60, baseSalary: 300, tier: 2, bucket: 'HOME' },

  // 史實時間軸：每一列都是 [from, to] 閉區間，年份落在哪一列就套哪一列
  timeline: {
    splits: [
      { from: 2012, to: 2012, names: ['賽季'] },
      { from: 2013, to: 2024, names: ['春季賽', '夏季賽'], msiAfter: 1 },
      { from: 2025, to: 9999, names: ['開季盃', '第一賽段', '第二賽段'], msiAfter: 2 },
    ],
    // 世界賽席位。GPL 時期只有一張外卡門票，LMS 起才穩定兩席
    worldsSlots: [
      { from: 2012, to: 2014, n: 1 },
      { from: 2015, to: 9999, n: 2 },
    ],
    // 隊名隨時代更替；era 標記對應 eraOf(year).home
    teams: [
      { era: 'GPL', from: 2012, to: 2014, names: ['台北暗殺星', 'ahq 電子競技俱樂部', '橘子熊 Yoe Flash Wolves', '華義 SPIDER', 'TPS 台北狙擊者'] },
      { era: 'LMS', from: 2015, to: 2019, names: ['閃電狼', 'ahq 電子競技俱樂部', 'J Team', 'MAD Team', '香港態度 HKA', 'G-Rex'] },
      { era: 'PCS', from: 2020, to: 2024, names: ['PSG Talon', 'Machi Esports', 'J Team', 'ahq 電子競技俱樂部', 'Beyond Gaming', 'Impunity'] },
      { era: 'LCP', from: 2025, to: 9999, names: ['PSG Talon', 'CTBC Flying Oyster', 'GAM Esports', 'DetonatioN FocusMe', 'SoftBank HAWKS gaming', 'Team Secret Whales'] },
    ],
  },

  // 母區不佔外援名額
  importSlots: Infinity,
};
