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

/*
 * 存檔 namespace（S45，alpha 內測）：demo 與 alpha 是兩個語意不同的起點
 * （PRO 三年期程 vs AMATEUR 完整生涯），若共用同一把 key，在 alpha 頁開
 * 「繼續上次的生涯」會讀到 demo 的存檔、反之亦然。namespace 由進入點
 * （main.js）在摸任何存檔前設定一次。
 */
let NS = 'demo';
export function setSaveNamespace(ns) { NS = ns || 'demo'; }
const key = () => `esportlife.save.v4.${NS}`;

export function saveGame(state, rng) {
  try {
    localStorage.setItem(key(), JSON.stringify({
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
    const raw = localStorage.getItem(key());
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.saveVersion !== SAVE_VERSION || !data.state) return null;
    return data;
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(key()); } catch { /* 無痕模式等情況，忽略 */ }
}

