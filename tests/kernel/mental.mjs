/** 心理六維與聲量：六維一個標籤都不給，聲量才有；下剋上加成有門檻與上限。 */
import { createState } from '../../src/engine/state.js';
import { adjustMental, reputeSummary, underdogBonus } from '../../src/engine/mental.js';
import { MENTAL_BASE, MENTAL_JITTER, MENTAL_KEYS } from '../../src/data/mental.js';
import { fameTier } from '../../src/data/reputation.js';

export const name = '心理六維揭露界線與下剋上加成';

export async function run({ check }) {
  /* ---- V4 §9.1／§9.4：六維不可見，只有聲量有標籤 ---- */
  {
    const state = createState({ name: 'M', role: 'SUP', seed: 'mental-hidden' });
    const rows = reputeSummary(state);
    check('對外摘要只剩聲量一項', rows.length === 1 && rows[0].key === 'fame', JSON.stringify(rows));
    check('聲量有分級標籤', !!rows[0].tier, JSON.stringify(rows));
    check('標籤本身不含數字', !/\d/.test(rows[0].tier), rows[0].tier);

    // §9.1「玩家不可見」——六維連個標籤機制都不該存在，不是「有標籤但沒顯示」
    const noTierApi = MENTAL_KEYS.every((k) => fameTier(50) !== k);
    check('六維沒有任何分級標籤 API', noTierApi && rows.every((r) => r.key === 'fame'));
  }

  /* ---- §9.1：起始值 50，出生種子微調 ±10 ---- */
  {
    const seeds = Array.from({ length: 40 }, (_, i) => `birth-${i}`);
    const all = seeds.flatMap((seed) => {
      const s = createState({ name: 'B', role: 'MID', seed });
      return MENTAL_KEYS.map((k) => s.mental[k]);
    });
    const lo = Math.min(...all); const hi = Math.max(...all);
    check('起始六維落在 50 ± 10',
      lo >= MENTAL_BASE - MENTAL_JITTER && hi <= MENTAL_BASE + MENTAL_JITTER, `${lo}–${hi}`);
    // 真的有骰，不是六格都寫死 50
    check('出生天賦確實有差異', hi - lo >= 8, `${lo}–${hi}`);

    const fames = seeds.map((seed) => createState({ name: 'B', role: 'MID', seed }).fame);
    check('聲量從零開始，不吃 50 的基準', Math.max(...fames) <= 5, `最高 ${Math.max(...fames)}`);
  }

  /* ---- 下剋上：吃抗壓與信任（舊的大心臟與默契） ---- */
  {
    const state = createState({ name: 'U', role: 'MID', seed: 'underdog' });
    state.mental.comp = 95; state.mental.trust = 90;
    check('第一種子拿不到下剋上加成', underdogBonus(state, 1) === 0);
    check('種子序越後加成越大', underdogBonus(state, 4) > underdogBonus(state, 2));
    check('加成有上限，不會讓弱隊變強隊', underdogBonus(state, 4) <= 11, underdogBonus(state, 4));

    const weak = createState({ name: 'W', role: 'MID', seed: 'underdog-w' });
    weak.mental.comp = 20; weak.mental.trust = 20;
    check('心理素質不夠就沒有下剋上', underdogBonus(weak, 4) === 0, underdogBonus(weak, 4));
  }

  /* ---- 邊際遞減在極端值必須真的擋得住 ---- */
  {
    // 舊版的 diminish 一律 Math.max(1, ...)，於是任何 ≥1 的變動永遠至少推 +1，
    // 邊際遞減在極端值等於失效。國際賽開始逐次累積心理值之後這個缺陷就浮出來：
    // 打過六次以上國際賽的人，抗壓清一色剛好 100。
    const state = createState({ name: 'D', role: 'MID', seed: 'diminish' });

    state.mental.comp = 50;
    const mid = adjustMental(state, 'comp', 10);
    check('中間值不打折', mid === 10, String(mid));

    state.mental.comp = 95;
    const high = adjustMental(state, 'comp', 10);
    check('接近頂點時大幅打折', high < 3, `+10 只推得動 +${high}`);

    // 反覆推同一個方向，不該一路走到天花板
    state.mental.comp = 88;
    for (let i = 0; i < 40; i++) adjustMental(state, 'comp', 5);
    check('連推 40 次 +5 仍推不到滿值', state.mental.comp < 100, String(state.mental.comp));
    check('但確實有往上推', state.mental.comp > 88, String(state.mental.comp));

    // 往回拉不打折——要變成另一種人，永遠比繼續當同一種人容易
    const back = adjustMental(state, 'comp', -10);
    check('往回拉不打折', back === -10, String(back));
  }

  /* ---- 聲量跟六維走同一套讀寫，但存在不同的地方 ---- */
  {
    const state = createState({ name: 'F', role: 'ADC', seed: 'fame-route' });
    state.fame = 30;
    const got = adjustMental(state, 'fame', 12);
    check('聲量寫進 state.fame 而不是 state.mental', state.fame === 30 + got && !('fame' in state.mental),
      `fame=${state.fame} mental=${JSON.stringify(state.mental)}`);
    check('聲量也吃邊際遞減', got <= 12 && got > 0, String(got));
  }
}
