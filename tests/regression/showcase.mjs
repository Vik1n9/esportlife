/** 印一段生涯的年表，讓每次測試都看得到引擎實際吐出什麼。不做斷言。 */
import { playCareer } from '../lib/harness.mjs';
import { careerTier, careerScore } from '../../src/engine/career.js';
import { TIER_NAMES } from '../../src/data/events.js';

export const name = '一段生涯的年表';
export const order = 900;

export async function run({ log }) {
  const { state } = playCareer({ seed: 'showcase', role: 'MID', name: 'Showcase', strategy: 'first' });
  log(`${state.name}｜${state.proYears} 職業季｜巔峰評價 ${state.peakRating}｜評分 ${careerScore(state)}（${TIER_NAMES[careerTier(state)]}）`);
  log(`退役：${state.retireReason}`);
  log(`榮譽 ${state.honors.length} 項，最後 3 項：${state.honors.slice(-3).join('、') || '無'}`);
}
