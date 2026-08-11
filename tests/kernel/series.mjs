/** BO 系列賽與種子序換算。 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { runSeries, worldsSeed, splitSeed } from '../../src/engine/playoffs.js';

export const name = 'BO 系列賽與種子序';

export async function run({ check }) {
  const rng = new Rng('series');
  const state = createState({ name: 'P', role: 'TOP', seed: 'series' });
  state.league = 'HOME'; state.stage = 'PRO';

  for (const bo of [3, 5]) {
    const need = Math.ceil(bo / 2);
    for (let i = 0; i < 200; i++) {
      const res = runSeries(state, rng, { bo, oppOvr: 53, seed: 2 });
      check(`BO${bo} 勝方剛好拿到 ${need} 勝`, Math.max(res.mine, res.theirs) === need, `${res.mine}-${res.theirs}`);
      check(`BO${bo} 總局數不超過 ${bo}`, res.mine + res.theirs <= bo, `${res.mine}-${res.theirs}`);
      check(`BO${bo} 比分與勝負一致`, res.win === (res.mine > res.theirs));
    }
  }

  check('冠軍點數不足就沒有世界賽門票', worldsSeed(0) === 0 && worldsSeed(39) === 0);
  check('點數越高種子序越前', worldsSeed(160) === 1 && worldsSeed(120) === 2 && worldsSeed(80) === 3 && worldsSeed(45) === 4);
  check('例行賽越強種子序越前', splitSeed(state, { G: 100, W: 80, delta: 5 }) === 1 && splitSeed(state, { G: 100, W: 30, delta: -3 }) === 4);
}
