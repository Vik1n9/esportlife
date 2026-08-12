/** 歐洲 LEC。2023 起帶頭改三賽段，其他賽區後來才跟上。 */
export default {
  key: 'EU',
  league: 'LEC',
  name: 'LEC',

  ladder: { par: 70, min: 66, games: 66, baseSalary: 600, tier: 3, bucket: 'OVERSEAS' },

  timeline: {
    splits: [
      { from: 2012, to: 2022, names: ['春季賽', '夏季賽'], msiAfter: 1 },
      { from: 2023, to: 9999, names: ['冬季賽', '春季賽', '夏季賽'], msiAfter: 2 },
    ],
    worldsSlots: [
      { from: 2012, to: 2022, n: 3 },
      { from: 2023, to: 9999, n: 3 },
    ],
    teams: [{ names: ['G2 Esports', 'Fnatic', 'MAD Lions KOI', 'Team Vitality', 'Karmine Corp', 'Team Heretics', 'SK Gaming', 'GIANTX'] }],
  },

  importSlots: 2,
};
