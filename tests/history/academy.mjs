/**
 * 青訓隊名的時代正確性。
 *
 * 舊版把二隊名單寫死成 ['閃電狼二隊', 'ahq Academy', 'PSG Talon Academy', ...]，
 * 於是 2013 年就會冒出 PSG Talon Academy——PSG Talon 2020 才成立。
 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { academyTeamsOf } from '../../src/engine/team.js';
import { DISBAND_YEAR } from '../../src/data/disband.js';
import { teamNamesOf } from '../../src/data/regions/index.js';
import { eraOf } from '../../src/data/eras.js';

export const name = '青訓隊名不得時代錯置';

export async function run({ check }) {
  const rng = new Rng('academy-era');
  const state = createState({ name: 'E', role: 'MID', seed: 'academy-era' });

  for (const year of [2013, 2017, 2022, 2027]) {
    state.year = year;
    const pool = academyTeamsOf(state, 'HOME');
    check(`${year} 年二隊名單非空`, pool.length > 0);
    const parents = pool.map((t) => t.replace(/ 二隊$/, ''));
    const era = eraOf(year).home;
    for (const p of parents) {
      check(`${year} 年的二隊母隊當年存在（${p}）`, teamNamesOf('HOME', era).includes(p) && !(DISBAND_YEAR[p] <= year));
    }
  }

  state.year = 2013;
  check('2013 年不會出現 PSG Talon 二隊（PSG Talon 2020 才成立）',
    !academyTeamsOf(state, 'HOME').some((t) => t.includes('PSG Talon')),
    academyTeamsOf(state, 'HOME').join(' / '));
}
