/**
 * 轉會窗口與外援名額。
 *
 * 舊版是棒球的 FA 模型：合約到期才進市場，沒到期的年份休賽期什麼都不會發生；
 * 而且完全沒有外援名額的概念——只要數值夠就簽得進 LCK。
 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { importChance, importSlotOpen, occupiesImportSlot } from '../../src/engine/imports.js';
import { generateOffers } from '../../src/engine/market.js';
import { importSlotsOf } from '../../src/data/regions/index.js';

export const name = '轉會窗口與外援名額';

function pro(seed, ovrValue, fame = 40) {
  const state = createState({ name: 'T', role: 'MID', seed });
  state.stage = 'PRO'; state.league = 'HOME'; state.team = 'PSG Talon';
  for (const k of Object.keys(state.attr)) state.attr[k] = ovrValue;
  state.fame = fame;
  state.lastDelta = 2;
  return state;
}

export async function run({ check }) {
  const rng = new Rng('transfer');

  /* ---- 名額表 ---- */
  check('海外賽區每隊 2 名外援', [2, 2, 2, 2].every((n, i) => importSlotsOf(['KR', 'CN', 'EU', 'NA'][i]) === n));
  check('母區不佔名額（Infinity）', !Number.isFinite(importSlotsOf('HOME')), importSlotsOf('HOME'));

  /* ---- 誰會佔用名額 ---- */
  {
    const state = pro('occupy', 78);
    check('簽 LCK 會佔外援名額', occupiesImportSlot(state, 'LCK'));
    check('簽 LPL 會佔外援名額', occupiesImportSlot(state, 'LPL'));
    check('留在主場賽區不佔名額', !occupiesImportSlot(state, 'HOME'));
    check('業餘與青訓沒有這回事', !occupiesImportSlot(state, 'AM2') && !occupiesImportSlot(state, 'AMATEUR'));
  }

  /* ---- 名額本來就是滿的：要擠進去得夠強 ---- */
  {
    const weak = pro('imp-weak', 65, 30);
    const mid = pro('imp-mid', 78, 55);
    const star = pro('imp-star', 93, 90);
    check('剛達門檻的選手很難擠進 LCK', importChance(weak, 'LCK') < 15, importChance(weak, 'LCK').toFixed(0));
    check('越強越容易讓對方空出名額',
      importChance(star, 'LCK') > importChance(mid, 'LCK') && importChance(mid, 'LCK') > importChance(weak, 'LCK'),
      [weak, mid, star].map((s) => importChance(s, 'LCK').toFixed(0)).join(' < '));
    check('頂尖選手仍不是必然（名額有人佔著）', importChance(star, 'LCK') <= 90, importChance(star, 'LCK').toFixed(0));
    check('留在母區永遠通得過', importChance(star, 'HOME') === 100);

    let open = 0;
    for (let i = 0; i < 2000; i++) if (importSlotOpen(weak, rng, 'LCK')) open++;
    check('弱勢選手實測擠進率偏低', open / 2000 < 0.2, (open / 2000).toFixed(2));
    for (let i = 0; i < 500; i++) check('母區一律通過', importSlotOpen(weak, rng, 'HOME'));
  }

  /* ---- 報價會回報被名額擋掉的賽區 ---- */
  {
    const state = pro('blocked', 75, 35);
    let sawBlocked = false;
    for (let i = 0; i < 200; i++) {
      const offers = generateOffers(state, rng, { excludeCurrentTeam: false });
      check('報價一定帶著名額回報欄位', Array.isArray(offers.blockedByImports));
      if (offers.blockedByImports.length) {
        sawBlocked = true;
        check('被擋掉的一定是會佔名額的賽區',
          offers.blockedByImports.every((k) => occupiesImportSlot(state, k)),
          offers.blockedByImports.join(','));
        check('被擋掉的賽區不會同時出現在報價裡',
          !offers.some((o) => offers.blockedByImports.includes(o.league)));
      }
    }
    check('中等實力的選手會遇到名額被擋', sawBlocked);
  }

  /* ---- 頂尖選手不該被名額鎖死在母區 ---- */
  {
    const star = pro('star-abroad', 76, 88);
    let abroad = 0;
    for (let i = 0; i < 200; i++) {
      const offers = generateOffers(star, rng, { excludeCurrentTeam: false });
      if (offers.some((o) => ['LCK', 'LPL', 'LEC', 'LCS'].includes(o.league))) abroad++;
    }
    check('頂尖選手多數時候仍收得到海外報價', abroad / 200 > 0.7, (abroad / 200).toFixed(2));
  }
}
