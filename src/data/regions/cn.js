/** 中國 LPL。 */
export default {
  key: 'CN',
  league: 'LPL',
  name: 'LPL',

  ladder: { par: 61, min: 58, games: 70, baseSalary: 900, tier: 4, bucket: 'OVERSEAS' },

  timeline: {
    splits: [
      { from: 2012, to: 2012, names: ['賽季'] },
      { from: 2013, to: 2024, names: ['春季賽', '夏季賽'], msiAfter: 1 },
      { from: 2025, to: 9999, names: ['第一賽段', '第二賽段', '第三賽段'], msiAfter: 2 },
    ],
    worldsSlots: [
      { from: 2012, to: 2022, n: 3 },
      { from: 2023, to: 9999, n: 4 },
    ],
    teams: [{ names: ['JDG', 'BLG', 'TES', 'LNG', 'WBG', 'EDG', 'Invictus Gaming', 'RNG', 'Team WE', 'Ninjas in Pyjamas'] }],
  },

  importSlots: 2,
};
