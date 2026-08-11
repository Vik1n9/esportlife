/**
 * 主場賽區（台港澳）。
 *
 * 這是玩家的母區，也是唯一會隨時代改名換制的賽區：
 * GPL（2012–2014）→ LMS（2015–2019）→ PCS（2020–2024）→ LCP（2025–）。
 * 隊名跟著換，所以用 `teamsByEra` 而不是單一清單。
 */
export default {
  key: 'HOME',
  league: 'HOME',
  name: '主場賽區',        // 實際顯示名由 eraOf(year).home 決定

  par: 53, min: 50, games: 60, baseSalary: 300, tier: 2, bucket: 'HOME',

  teamsByEra: {
    GPL: ['台北暗殺星', 'ahq 電子競技俱樂部', '橘子熊 Yoe Flash Wolves', '華義 SPIDER', 'TPS 台北狙擊者'],
    LMS: ['閃電狼', 'ahq 電子競技俱樂部', 'J Team', 'MAD Team', '香港態度 HKA', 'G-Rex'],
    PCS: ['PSG Talon', 'Machi Esports', 'J Team', 'ahq 電子競技俱樂部', 'Beyond Gaming', 'Impunity'],
    LCP: ['PSG Talon', 'CTBC Flying Oyster', 'GAM Esports', 'DetonatioN FocusMe', 'SoftBank HAWKS gaming', 'Team Secret Whales'],
  },

  splits: [
    { until: 2012, names: ['賽季'] },
    { until: 2024, names: ['春季賽', '夏季賽'], msiAfter: 1 },
    { until: 9999, names: ['開季盃', '第一賽段', '第二賽段'], msiAfter: 2 },
  ],

  // 世界賽席位。GPL 時期只有一張外卡門票，LMS 起才穩定兩席
  worldsSlots: [{ until: 2014, n: 1 }, { until: 9999, n: 2 }],

  // 母區不佔外援名額
  importSlots: Infinity,
};
