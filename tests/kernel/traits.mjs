/** 特質合成：基礎特質被消耗、消耗紀錄留下、不會重新解鎖。 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { checkFusions, unlockTrait } from '../../src/engine/progression.js';

export const name = '特質合成';

export async function run({ check }) {
  const rng = new Rng('fusion');
  const state = createState({ name: 'F', role: 'MID', seed: 'fusion' });
  unlockTrait(state, 'veteran'); unlockTrait(state, 'disc'); unlockTrait(state, 'single');
  const gained = checkFusions(state);
  check('老將＋自律＋單身 → 不老傳奇', gained.includes('ageless'), gained.join(','));
  check('基礎特質被消耗', !state.traits.veteran && !state.traits.disc && !state.traits.single);
  check('消耗紀錄留下', state.fusedAway.length === 3);
  check('被消耗的特質不會重新解鎖', unlockTrait(state, 'veteran') === false);
}
