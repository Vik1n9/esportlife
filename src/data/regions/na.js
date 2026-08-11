/** 北美 LCS。 */
export default {
  key: 'NA',
  league: 'LCS',
  name: 'LCS',

  par: 57, min: 54, games: 66, baseSalary: 600, tier: 3, bucket: 'OVERSEAS',

  teams: ['Cloud9', 'Team Liquid', '100 Thieves', 'FlyQuest', 'NRG', 'Shopify Rebellion', 'Dignitas', 'Immortals'],

  splits: [
    { until: 2024, names: ['春季賽', '夏季賽'], msiAfter: 1 },
    { until: 9999, names: ['第一賽段', '第二賽段', '第三賽段'], msiAfter: 2 },
  ],

  worldsSlots: [{ until: 2022, n: 3 }, { until: 9999, n: 3 }],

  importSlots: 2,
};
