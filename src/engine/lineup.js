/**
 * 先發／輪替／板凳。
 *
 * 舊版用 `staminaFactor` 讓體力決定出賽場次——體力 35 以下只打 30% 的比賽。那是
 * 棒球的輪值與休養模型。LoL 是五個固定先發，隊伍打幾場你就打幾場；體力低表現成
 * 手感下滑、後期崩盤，不是「不出賽」。
 *
 * 真正會讓你少打的只有兩件事：
 *   1. 被下放板凳／二隊（表現差、默契見底、隊伍簽了同位置的人）
 *   2. 傷勢缺席幾週，替補頂上——而且回來之後位子可能就沒了
 *
 * 兩件都是 LoL 選手真實會遇到的，而且都有敘事重量：坐板凳不是數字變小，是你的
 * 位子被別人拿走了。
 *
 * 手感係數 `formFactor` 原本住在這裡（它是「體力低會怎樣」的另一半）。S13 把體力
 * 升格成資源之後它搬去 `engine/stamina.js`——那個檔才是它讀的東西的家。
 */
import { clamp } from '../core/rng.js';
import { effectiveCoachRating } from './attributes.js';
import { factor } from '../kernel/modifiers.js';
import { parOf } from '../kernel/strength.js';

/** 一個賽段約略的週數，用來把「缺席幾週」換算成出賽比例 */
export const SPLIT_WEEKS = 12;

/**
 * 被下放板凳的機率（百分比）。
 *
 * 全部是狀態推出來的，不是憑空擲骰：打不好、休息室關係崩了、剛從傷病回來位子被
 * 頂走、年紀大了隊伍想換血。
 */
export function benchRisk(state) {
  if (state.stage !== 'PRO') return 0;
  const delta = effectiveCoachRating(state) - parOf(state);

  let risk = 2;
  if (delta < 0) risk += -delta * 2.56;             // 打不到隊伍平均就會被檢討（3.2 ÷ 1.25）
  if (state.mental.trust <= 30) risk += (30 - state.mental.trust) * 0.7;
  if (state.returningFromInjury) risk += 14;        // 替補頂了幾週，位子不一定還在
  if (state.benchedStreak > 0) risk += 10;          // 已經坐過一次，教練更容易再讓你坐
  if (state.age >= 30) risk += (state.age - 29) * 2;

  return clamp(risk * factor(state, 'benchRisk'), 0, 75);
}

/**
 * 這個賽段你打不打得到。
 *
 * @returns {{status:'starter'|'rotation'|'benched'|'injured', share:number, missedWeeks:number}}
 *   `share` 是實際出賽比例，`missedWeeks` 供敘事使用
 */
export function lineupFor(state, rng) {
  // 業餘與青訓沒有板凳這回事——那個階段本來就是一群人湊在一起打
  if (state.stage !== 'PRO') return { status: 'starter', share: 1, missedWeeks: 0 };

  // 先扣掉傷勢缺席的週數
  let missedWeeks = 0;
  if (state.injuryWeeks > 0) {
    missedWeeks = Math.min(state.injuryWeeks, SPLIT_WEEKS);
    state.injuryWeeks -= missedWeeks;
  }
  const healthyShare = (SPLIT_WEEKS - missedWeeks) / SPLIT_WEEKS;

  // 整段都在養傷就不必再判板凳了
  if (healthyShare <= 0) return { status: 'injured', share: 0, missedWeeks };

  const risk = benchRisk(state);
  const roll = rng.next() * 100;
  if (roll < risk) return { status: 'benched', share: 0, missedWeeks };
  // 輪替：沒被完全下放，但位子開始被分掉
  if (roll < risk * 2.2) return { status: 'rotation', share: healthyShare * 0.55, missedWeeks };

  return {
    status: missedWeeks > 0 ? 'injured' : 'starter',
    share: healthyShare,
    missedWeeks,
  };
}
