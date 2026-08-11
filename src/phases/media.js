/** 休賽期的媒體採訪。賽季打完之後，鏡頭前的那一段。 */
import { drawRoleplay } from './shared.js';

export const kind = 'MEDIA';

export function* run(g) {
  const { state, rng } = g;
  // 季後賽已經在各賽段內打完了，休賽期處理的是鏡頭前的事
  if (state.stage === 'PRO' && !state.skipSeason && rng.chance(38)) {
    yield* drawRoleplay(g, 'media');
  }
}
