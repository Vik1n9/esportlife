/**
 * 史實解散。
 *
 * 舊版簽約名單沒有過濾當年解散的戰隊，於是可以在 2019 年休賽期加入剛倒閉的閃電狼，
 * 之後那支隊伍就永遠不會觸發解散事件——史實解散被一個時序漏洞繞過去。
 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { teamsOf } from '../../src/engine/team.js';
import { disbandNoteFor } from '../../src/engine/market.js';
import { DISBAND_YEAR } from '../../src/data/disband.js';

export const name = '史實解散與簽約名單';

export async function run({ check }) {
  const rng = new Rng('disband');
  const state = createState({ name: 'D', role: 'JG', seed: 'disband' });

  for (const year of [2016, 2019, 2020, 2023, 2026]) {
    state.year = year;
    for (const league of ['HOME', 'LCK', 'LPL', 'LEC', 'LCS']) {
      const pool = teamsOf(state, league);
      const dead = pool.filter((t) => DISBAND_YEAR[t] <= year);
      check(`${year} 年 ${league} 名單不含已解散戰隊`, dead.length === 0, dead.join(','));
      check(`${year} 年 ${league} 名單非空`, pool.length > 0);
    }
  }

  state.year = 2018;
  check('2018 年閃電狼仍可簽', teamsOf(state, 'HOME').includes('閃電狼'));
  state.year = 2019;
  check('2019 年閃電狼不可再簽（舊版可以，導致史實解散被繞過）', !teamsOf(state, 'HOME').includes('閃電狼'));

  // 在解散年身處該隊 → 強制自由市場
  const victim = createState({ name: 'X', role: 'ADC', seed: 'forced-fa' });
  victim.year = 2019; victim.team = '閃電狼'; victim.stage = 'PRO'; victim.league = 'HOME';
  check('解散事件查得到', !!disbandNoteFor(victim));
  victim.team = 'J Team';
  check('同年其他隊不受影響', !disbandNoteFor(victim));
}
