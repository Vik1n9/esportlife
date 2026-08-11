/**
 * 賽段結構的史實演進。
 *
 * LoL 的一年不是永遠都長一樣：2012 多數賽區打完一季就結束，之後穩定成春／夏兩賽段，
 * 2023 LEC 帶頭改三賽段，2025 全面三段式。韓國反而最早三段——2012–2014 的
 * OGN Champions 本來就分冬／春／夏。
 */
import { splitsOf } from '../../src/data/world.js';

export const name = '賽段結構隨史實演進';

export async function run({ check }) {
  const names = (y, r) => splitsOf(y, r).map((s) => s.name).join('/');

  check('2012 主場賽區只有單季', splitsOf(2012, 'HOME').length === 1, names(2012, 'HOME'));
  check('2016 主場賽區為春／夏兩賽段', splitsOf(2016, 'HOME').length === 2, names(2016, 'HOME'));
  check('2025 主場賽區為三賽段', splitsOf(2025, 'HOME').length === 3, names(2025, 'HOME'));
  check('2013 韓國是冬／春／夏三季（OGN Champions）', splitsOf(2013, 'KR').length === 3, names(2013, 'KR'));
  check('2018 韓國回到兩賽段', splitsOf(2018, 'KR').length === 2, names(2018, 'KR'));
  check('2023 歐洲已改三賽段', splitsOf(2023, 'EU').length === 3, names(2023, 'EU'));

  for (const region of ['HOME', 'KR', 'CN', 'EU', 'NA']) {
    for (const year of [2012, 2016, 2021, 2025, 2031]) {
      const w = splitsOf(year, region).reduce((t, s) => t + s.weight, 0);
      check(`${year} ${region} 賽段場次權重總和為 1`, Math.abs(w - 1) < 1e-9, w);
    }
  }
}
