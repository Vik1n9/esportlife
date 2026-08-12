/** 四階特質合成：通用→史詩、通用→稀有、史詩+稀有→傳說；消耗、紀錄、不重複解鎖。 */
import { createState } from '../../src/engine/state.js';
import { checkFusions, unlockTrait } from '../../src/engine/progression.js';

function fresh() {
  return createState({ name: 'F', role: 'MID', seed: 'fusion' });
}

export const name = '四階特質合成';

export async function run({ check }) {
  // 通用 → 史詩：天才操作＋自律 → 神之領域
  const a = fresh();
  unlockTrait(a, 'genius'); unlockTrait(a, 'disc');
  checkFusions(a);
  check('通用 → 史詩：天才操作＋自律 → 神之領域', a.epic.godhand === true);
  check('史詩配方的通用被消耗', !a.traits.genius && !a.traits.disc);

  // 通用 → 稀有：人氣選手＋鏡頭感 → 明星選手
  const b = fresh();
  unlockTrait(b, 'popular'); unlockTrait(b, 'camera');
  checkFusions(b);
  check('通用 → 稀有：人氣選手＋鏡頭感 → 明星選手', b.rare.star === true);
  check('稀有配方的通用被消耗', !b.traits.popular && !b.traits.camera);

  // 史詩＋稀有 → 傳說：神之領域＋明星選手 → 弒神者
  const c = fresh();
  c.epic.godhand = true; c.rare.star = true;
  checkFusions(c);
  check('史詩＋稀有 → 傳說：神之領域＋明星選手 → 弒神者', c.legendary.godslayer === true);
  check('傳說消耗史詩與稀有', !c.epic.godhand && !c.rare.star);

  check('被消耗的特質不會重新解鎖', unlockTrait(a, 'genius') === false);
  check('消耗紀錄留下', a.fusedAway.includes('天才操作') && b.fusedAway.includes('人氣選手'));
}
