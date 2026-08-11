/** 心理值：不對玩家揭露數字，下剋上加成有門檻與上限。 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { adjustMental, mentalSummary, underdogBonus } from '../../src/engine/mental.js';

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

  /* ---- 邊際遞減在極端值必須真的擋得住 ---- */
  {
    // 舊版的 diminish 一律 Math.max(1, ...)，於是任何 ≥1 的變動永遠至少推 +1，
    // 邊際遞減在極端值等於失效。國際賽開始逐次累積心理值之後這個缺陷就浮出來：
    // 打過六次以上國際賽的人，大心臟清一色剛好 100。
    const state = createState({ name: 'D', role: 'MID', seed: 'diminish' });

    state.mental.nerve = 50;
    const mid = adjustMental(state, 'nerve', 10);
    check('中間值不打折', mid === 10, String(mid));

    state.mental.nerve = 95;
    const high = adjustMental(state, 'nerve', 10);
    check('接近頂點時大幅打折', high < 3, `+10 只推得動 +${high}`);

    // 反覆推同一個方向，不該一路走到天花板
    state.mental.nerve = 88;
    for (let i = 0; i < 40; i++) adjustMental(state, 'nerve', 5);
    check('連推 40 次 +5 仍推不到滿值', state.mental.nerve < 100, String(state.mental.nerve));
    check('但確實有往上推', state.mental.nerve > 88, String(state.mental.nerve));

    // 往回拉不打折——要變成另一種人，永遠比繼續當同一種人容易
    const back = adjustMental(state, 'nerve', -10);
    check('往回拉不打折', back === -10, String(back));
  }
}
