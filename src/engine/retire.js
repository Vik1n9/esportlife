/**
 * 退役訊號與三層退役判定（V4 §18.2，S20e）。
 *
 * 退役可能發生在年度流程的任何深處（訓練期年齡到頂、業餘三年沒人要、自由市場
 * 沒人開價、被解散後無人接手）。用例外往上拋，比讓每一層都回傳「我要不要繼續」
 * 乾淨——階段模組只要 `retire(reason)`，主迴圈負責接。
 *
 * 三層結構的判定這裡只做「選」：第一層特殊結局（條件式命中即定，依表序優先）、
 * 第二層可選的退役選項（條件式過濾）。真正把選擇 yield 出去、把結局講成故事的
 * 是 engine/game.js 的 `retirement()`——資料表在 data/retireCards.js。
 */
import { evalCond } from './conditions.js';
import { RETIRE_ENDINGS, RETIRE_OPTIONS } from '../data/retireCards.js';

export class RetireSignal extends Error {
  constructor(reason) { super(reason); this.reason = reason; }
}

export const retire = (reason) => { throw new RetireSignal(reason); };

/**
 * 第一層：特殊結局。依表序檢查，第一個命中的就是結局（§18.2 的優先語意——
 * 多條件同時成立時，表序在前的結局贏，例如王朝基石與冠軍謝幕並存時選王朝基石）。
 * 回 null 表示未命中，進入第二層。
 */
export function pickEnding(state) {
  return RETIRE_ENDINGS.find((e) => evalCond(state, e.cond)) ?? null;
}

/**
 * 第二層：退役選項。條件式回 false 的選項不出現；「宣布退役」的條件是 true，
 * 永遠在場（§18.2 明文）。純函式——choice 的組裝在 game.js。
 */
export function retireOptions(state) {
  return RETIRE_OPTIONS.filter((o) => evalCond(state, o.cond));
}