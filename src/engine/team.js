/** 隊友、教練、隊伍強度。 */
import { COACHES, DISBAND_YEAR, LEAGUES, MATE_NAMES, TEAMS_HOME, TEAMS_OVERSEAS, eraOf } from '../data/world.js';
import { effectiveOvr } from './abilities.js';

export function homeLeagueName(state) {
  return eraOf(state.year).home;
}

/**
 * 該年度某聯賽「還能簽約」的隊伍清單。
 *
 * 簽約發生在第 N 年的休賽期，實際效力的是第 N+1 季，所以當年就解散的戰隊
 * 必須排除。舊版沒有這道過濾，於是可以在 2019 年休賽期加入剛倒閉的閃電狼，
 * 之後那支隊伍就永遠不會觸發解散事件——史實解散被一個時序漏洞繞過去了。
 */
/**
 * 二隊／青訓的隊名。
 *
 * 舊版寫死成 ['閃電狼二隊', 'ahq Academy', 'PSG Talon Academy', '峽谷次級聯隊']，
 * 於是 2013 年就會冒出 PSG Talon Academy——PSG Talon 2020 才成立。改為直接掛在
 * 「當年真實存在的一隊」底下推導，時代自動正確，也不必再維護第二份名單。
 */
export function academyTeamsOf(state, leagueKey) {
  const suffix = LEAGUES[leagueKey].region === 'HOME' ? ' 二隊' : ' Academy';
  return teamsOf(state, leagueKey).map((t) => t + suffix);
}

export function teamsOf(state, leagueKey) {
  const league = LEAGUES[leagueKey];
  if (!league) return [];
  const pool = league.region === 'HOME'
    ? TEAMS_HOME[homeLeagueName(state)]
    : TEAMS_OVERSEAS[league.region] || [];
  return pool.filter((t) => !(DISBAND_YEAR[t] <= state.year));
}

export function rollRoster(state, rng, leagueKey) {
  const par = LEAGUES[leagueKey].par;
  state.mates = rng.sample(MATE_NAMES, 4).map((name) => ({ name, ovr: rng.int(par - 6, par + 6) }));
  state.coach = rng.pick(Object.keys(COACHES));
  state.mateMorale = 0;
}

export function coachBonus(state) {
  const base = COACHES[state.coach] || 0;
  return state.epic.lockerroom ? base * 1.3 : base;
}

export function matesAverage(state) {
  if (!state.mates || !state.mates.length) return 0;
  const sum = state.mates.reduce((t, m) => t + m.ovr, 0);
  const lead = state.epic.lockerroom ? 6 : state.traits.leader ? 5 : 0;
  return sum / state.mates.length + lead + (state.mateMorale || 0);
}

/**
 * 隊伍整體強度。用於勝率計算。
 * 權重：本人 0.55 ／隊友 0.35 ／教練＋體力 0.10，與設計文件一致。
 */
export function teamStrength(state) {
  return effectiveOvr(state) * 0.55
    + matesAverage(state) * 0.35
    + coachBonus(state)
    + state.ability.sta * 0.05;
}
