/**
 * 休賽期的媒體採訪。
 *
 * 季後賽已經在各賽段內打完了，休賽期處理的是鏡頭前的事——職業選手才會被記者
 * 堵到，青訓與業餘選手沒有這個路口。38% 是刻意壓低的：媒體日應該是偶發事件，
 * 每兩年一次左右，太頻繁會讓扮演卡變成例行公事。
 */
import { drawRoleplay } from './shared.js';

export const kind = 'MEDIA';

export function* run(g) {
  const { state, rng } = g;
  if (state.stage === 'PRO' && !state.skipSeason && rng.chance(38)) {
    yield* drawRoleplay(g, 'media');
  }
}
