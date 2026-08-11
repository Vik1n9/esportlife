/**
 * 世界賽。
 *
 * 目前的門票仍是一次 `rng.chance()`，賽程也只擲一次骰決定走到哪一輪——種子序明明
 * 已經算好了卻沒有用上，`kernel/groups.js` 的小組賽與 Swiss 也還沒接。下一步整檔改寫。
 */
import { BASE_TRAITS } from '../data/traits.js';
import { runWorlds, worldsEligible, worldsQualifyChance } from '../engine/international.js';
import { applyMental } from '../engine/mental.js';
import { unlockTrait } from '../engine/progression.js';
import { card, drawRoleplay, fusionBeats } from './shared.js';

export const kind = 'WORLDS';

export function* run(g) {
  const { state, rng } = g;
  if (!worldsEligible(state) || !rng.chance(worldsQualifyChance(state))) return;

  yield card('info', '世界賽',
    `你隨 <b class="hl">${state.team}</b> 以<b class="hl">第 ${state.seedRank} 種子</b>晉級 ${state.year} 世界大賽！` +
    (state.seedRank >= 3 ? '<br><span class="muted">賽前預測沒有一份把你們排進四強。</span>' : ''));

  yield* drawRoleplay(g, 'presser');
  const res = runWorlds(state, rng);

  yield card(res.champion ? 'gold' : 'info', '世界賽結算',
    `<b class="hl">${res.stage}</b>。${res.champion ? '你捧起召喚師獎盃，成為全世界的英雄！' : ''}` +
    (res.underdog ? '<br><b class="hl">最後一張門票進來的隊伍，把冠軍帶走了。</b>' : ''));

  if (res.champion) {
    applyMental(state, { fame: 25, rep: 12, nerve: 8, chem: 6 });
    if (res.underdog && unlockTrait(state, 'bigheart')) {
      yield card('gold', '性格成形：大心臟', BASE_TRAITS.bigheart.desc);
      yield* fusionBeats(g);
    }
  }
  if (res.champion && !state.traits.franchise && unlockTrait(state, 'franchise')) {
    yield card('gold', '隱藏素質解鎖：神主牌', '你就是這支隊伍的門面，續約時沒有人敢先開口砍價。');
    yield* fusionBeats(g);
  }
}
