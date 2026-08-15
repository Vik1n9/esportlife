/**
 * 存檔。
 *
 * 存檔點固定在「年初」，因此存的只有 state ＋ 人生亂數流的進度，不需要序列化流程
 * 位置——讀檔就是從那一年年初重新進入 careerFlow。
 *
 * 出生種子存在 `state.seed`，人生種子存在 `lifeSeed`：兩條都要，續玩才會接回
 * 同一個人的同一段人生，而不是拿同樣的天賦重開一段新的。
 */
import { SAVE_VERSION } from '../engine/state.js';

const KEY = 'esportlife.save.v4';

export function saveGame(state, rng) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      saveVersion: SAVE_VERSION,
      savedAt: Date.now(),
      lifeSeed: rng.seedString,
      rngState: rng.state,
      state,
    }));
    return true;
  } catch { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.saveVersion !== SAVE_VERSION || !data.state) return null;
    return data;
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* 無痕模式等情況，忽略 */ }
}

