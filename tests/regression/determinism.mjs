/** 種子決定論：同種子＋同策略＝逐字相同的狀態。黃金種子快照的前提。 */
import { playCareer } from '../lib/harness.mjs';

export const name = '種子決定論';
export const order = 2;

export async function run({ check }) {
  for (const role of ['MID', 'SUP']) {
    const a = playCareer({ seed: 'determinism', role, strategy: 'first' });
    const b = playCareer({ seed: 'determinism', role, strategy: 'first' });
    check(`同種子同策略結果一致（${role}）`, JSON.stringify(a.state) === JSON.stringify(b.state));
    check(`同種子亂數進度一致（${role}）`, a.rng.state === b.rng.state);
  }
  const diff = playCareer({ seed: 'determinism-x', role: 'MID', strategy: 'first' });
  const same = playCareer({ seed: 'determinism', role: 'MID', strategy: 'first' });
  check('不同種子產生不同人生', JSON.stringify(diff.state) !== JSON.stringify(same.state));
}
