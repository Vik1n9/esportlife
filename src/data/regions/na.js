/** 北美 LCS。 */
export default {
  key: 'NA',
  league: 'LCS',
  name: 'LCS',

  ladder: { par: 57, min: 54, games: 66, baseSalary: 600, tier: 3, bucket: 'OVERSEAS' },

  timeline: {
    splits: [
      { from: 2012, to: 2024, names: ['春季賽', '夏季賽'], msiAfter: 1 },
      { from: 2025, to: 9999, names: ['第一賽段', '第二賽段', '第三賽段'], msiAfter: 2 },
    ],
    worldsSlots: [
      { from: 2012, to: 2022, n: 3 },
      { from: 2023, to: 9999, n: 3 },
    ],
    teams: [{ names: ['Cloud9', 'Team Liquid', '100 Thieves', 'FlyQuest', 'NRG', 'Shopify Rebellion', 'Dignitas', 'Immortals'] }],
  },

  importSlots: 2,
};
