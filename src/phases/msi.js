/**
 * MSI。
 *
 * 目前仍是承襲自棒球模型的版本：當成「國家隊徵召」，玩家可以婉拒，打完還會累積
 * 傷病風險，資格看個人 OVR。這些全部是錯的——MSI 是俱樂部賽事，門票發給戰隊。
 * 下一步會整檔改寫，年曆那一列的 order 也會從年末移到第一賽段之後。
 */
import { msiEligible, msiForced, runMsi } from '../engine/international.js';
import { unlockTrait } from '../engine/progression.js';
import { card, fusionBeats } from './shared.js';

export const kind = 'MSI';

export function* run(g) {
  const { state, rng } = g;
  if (!msiEligible(state)) return;

  const forced = msiForced(state);
  const picked = yield {
    type: 'choice',
    title: `國家隊徵召 · 出征 MSI ${state.year}`,
    options: forced
      ? [{ id: 'go', label: '⋯⋯只能報到（列管徵召）', note: '依成績獲能力點｜下季受傷風險 +10%', main: true }]
      : [
          { id: 'go', label: '披上國家隊戰袍', note: '依成績獲能力點｜下季受傷風險 +10%', main: true },
          { id: 'skip', label: '以調整為由婉拒', note: '下季狀態優先' },
        ],
  };
  if (picked !== 'go') return;

  const res = runMsi(state, rng);
  yield card(res.index === 0 ? 'gold' : 'info', 'MSI 結算',
    `<b class="hl">${res.rank}</b>。獲得能力點 <b class="hl">${res.points}</b> 點。` +
    (state.epic.soloking ? '賽區之光不受國際賽消耗影響。' : '國際賽消耗讓你下季受傷風險上升。'));

  if (res.index <= 1 && state.intlAppearances >= 2 && unlockTrait(state, 'intlghost')) {
    yield card('gold', '隱藏素質解鎖：國際賽之鬼', '國際舞台上，你是另一個人。');
    yield* fusionBeats(g);
  }
}
