/**
 * 隊伍強度。
 *
 * 三個函式住在一起是因為它們永遠一起被改——調權重時三個都要看。
 */
import { COACHES } from '../data/coaches.js';
import { effectiveOvr } from '../engine/abilities.js';
import { chemBonus } from '../engine/mental.js';
import { factor, floorOf } from './modifiers.js';

export function coachBonus(state) {
  return (COACHES[state.coach] || 0) * factor(state, 'coachMult');
}

export function matesAverage(state) {
  if (!state.mates || !state.mates.length) return 0;
  const sum = state.mates.reduce((t, m) => t + m.ovr, 0);
  // mateMorale 是單季的士氣，chem 是跨季累積的默契——兩者相加
  return sum / state.mates.length + floorOf(state, 'teamLead', 0) + (state.mateMorale || 0) + chemBonus(state);
}

/**
 * 隊伍整體強度。用於勝率計算。
 * 權重：本人 0.55 ／隊友 0.35 ／教練＋體力 0.10，與設計文件一致。
 *
 * 玩家只是五分之一——這是 LoL 與棒球最不一樣的地方之一：個人數據再漂亮，隊伍進不了
 * 季後賽就是進不了。
 */
export function teamStrength(state) {
  return effectiveOvr(state) * 0.55
    + matesAverage(state) * 0.35
    + coachBonus(state)
    + state.ability.sta * 0.05;
}
