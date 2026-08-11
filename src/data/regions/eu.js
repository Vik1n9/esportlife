/** 歐洲 LEC。2023 起帶頭改三賽段，其他賽區後來才跟上。 */
export default {
  key: 'EU',
  league: 'LEC',
  name: 'LEC',

  par: 56, min: 53, games: 66, baseSalary: 600, tier: 3, bucket: 'OVERSEAS',

  teams: ['G2 Esports', 'Fnatic', 'MAD Lions KOI', 'Team Vitality', 'Karmine Corp', 'Team Heretics', 'SK Gaming', 'GIANTX'],

  splits: [
    { until: 2022, names: ['春季賽', '夏季賽'] },
    { until: 9999, names: ['冬季賽', '春季賽', '夏季賽'] },
  ],

  worldsSlots: [{ until: 2022, n: 3 }, { until: 9999, n: 3 }],

  importSlots: 2,
};
