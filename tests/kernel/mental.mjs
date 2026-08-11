/** 心理值：不對玩家揭露數字，下剋上加成有門檻與上限。 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { mentalSummary, underdogBonus } from '../../src/engine/mental.js';

export const name = '心理值揭露與下剋上加成';

export async function run({ check }) {
  {
    const rng = new Rng('mental-hidden');
    const state = createState({ name: 'M', role: 'SUP', seed: 'mental-hidden' });
    const rows = mentalSummary(state);
    check('五個心理維度都有標籤', rows.length === 5 && rows.every((r) => r.tier), JSON.stringify(rows));
    check('摘要不含任何數值欄位', rows.every((r) => !('value' in r)), JSON.stringify(rows));
    check('標籤本身不含數字', rows.every((r) => !/\d/.test(r.tier)), rows.map((r) => r.tier).join('/'));
  }

  {
    const rng = new Rng('underdog');
    const state = createState({ name: 'U', role: 'MID', seed: 'underdog' });
    state.mental.nerve = 95; state.mental.chem = 90;
    check('第一種子拿不到下剋上加成', underdogBonus(state, 1) === 0);
    check('種子序越後加成越大', underdogBonus(state, 4) > underdogBonus(state, 2));
    check('加成有上限，不會讓弱隊變強隊', underdogBonus(state, 4) <= 11, underdogBonus(state, 4));

    const weak = createState({ name: 'W', role: 'MID', seed: 'underdog-w' });
    weak.mental.nerve = 20; weak.mental.chem = 20;
    check('心理素質不夠就沒有下剋上', underdogBonus(weak, 4) === 0, underdogBonus(weak, 4));
  }
}
