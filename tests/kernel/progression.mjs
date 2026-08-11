/** 版本落差的方向：改版讓落差變重，補習讓落差變輕。 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { applyPatch, adjustPatchDebt } from '../../src/engine/progression.js';
import { patchPenalty } from '../../src/engine/attributes.js';

export const name = '版本落差方向';

export async function run({ check }) {
  const rng = new Rng('patch');
  const state = createState({ name: 'P', role: 'ADC', seed: 'patch' });
  for (let i = 0; i < 6; i++) applyPatch(state, rng);
  const worse = patchPenalty(state);
  adjustPatchDebt(state, -4);
  const better = patchPenalty(state);
  check('改版讓落差變重', worse < 0, `penalty=${worse}`);
  check('版本補習讓落差變輕（舊版方向寫反）', better > worse, `${worse} → ${better}`);
}
