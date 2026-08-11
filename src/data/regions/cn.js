/** 中國 LPL。 */
export default {
  key: 'CN',
  league: 'LPL',
  name: 'LPL',

  par: 61, min: 58, games: 70, baseSalary: 900, tier: 4, bucket: 'OVERSEAS',

  teams: ['JDG', 'BLG', 'TES', 'LNG', 'WBG', 'EDG', 'Invictus Gaming', 'RNG', 'Team WE', 'Ninjas in Pyjamas'],

  splits: [
    { until: 2012, names: ['賽季'] },
    { until: 2024, names: ['春季賽', '夏季賽'], msiAfter: 1 },
    { until: 9999, names: ['第一賽段', '第二賽段', '第三賽段'], msiAfter: 2 },
  ],

  worldsSlots: [{ until: 2022, n: 3 }, { until: 9999, n: 4 }],

  importSlots: 2,
};
