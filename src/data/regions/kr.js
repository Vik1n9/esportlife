/**
 * 韓國 LCK。
 *
 * 賽段史比其他賽區反直覺：韓國反而是最早三賽段的——2012–2014 的 OGN Champions
 * 本來就分冬／春／夏，之後才收斂成春／夏兩段，2025 又變成 LCK Cup ＋ 兩輪。
 */
export default {
  key: 'KR',
  league: 'LCK',
  name: 'LCK',

  ladder: { par: 61, min: 58, games: 70, baseSalary: 900, tier: 4, bucket: 'OVERSEAS' },

  timeline: {
    splits: [
      { from: 2012, to: 2014, names: ['冬季賽', '春季賽', '夏季賽'] },
      { from: 2015, to: 2024, names: ['春季賽', '夏季賽'], msiAfter: 1 },
      { from: 2025, to: 9999, names: ['LCK Cup', '第一輪', '第二輪'], msiAfter: 2 },
    ],
    worldsSlots: [
      { from: 2012, to: 2022, n: 3 },
      { from: 2023, to: 9999, n: 4 },
    ],
    // 沒有時代更替：單一名單蓋住整個遊戲年份範圍
    teams: [{ names: ['T1', 'Gen.G', 'Hanwha Life Esports', 'Dplus KIA', 'KT Rolster', 'DRX', 'BNK FearX'] }],
  },

  importSlots: 2,
};
