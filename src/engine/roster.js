/**
 * 隊友名單與隊名。
 *
 * 隊伍強度的計算已經搬到 `kernel/strength.js`——那是三個階段共用的東西，
 * 這裡只負責「這一年這個聯賽有哪些隊、你的隊友是誰」。
 */
import { COACHES } from '../data/coaches.js';
import { DISBAND_YEAR } from '../data/disband.js';
import { LEAGUES } from '../data/leagues.js';
import { MATE_NAMES } from '../data/teams.js';
import { teamNamesOf } from '../data/regions/index.js';
import { eraOf } from '../data/eras.js';

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
  // 主場賽區隨時代改名換隊，所以要把當年的時代鍵（GPL/LMS/PCS/LCP）帶進去
  const pool = teamNamesOf(league.region, homeLeagueName(state));
  return pool.filter((t) => !(DISBAND_YEAR[t] <= state.year));
}

export function rollRoster(state, rng, leagueKey) {
  const par = LEAGUES[leagueKey].par;
  // 隊友分布 par ± 7（舊 ±6 × 1.25 = 7.5，**刻意向下取整**：這個區間只貢獻變異數
  // 不貢獻平均，而 S07「頂端才兌現」靠的是訊號不是雜訊）
  state.mates = rng.sample(MATE_NAMES, 4).map((name) => ({ name, rating: rng.int(par - 7, par + 7) }));
  state.coach = rng.pick(COACHES).name;
  state.mateMorale = 0;
  // 換了一批隊友，默契要重新建立：往中性拉回一半，但你是什麼樣的人會跟著你走
  if (state.mental) state.mental.chem = Math.round((state.mental.chem + 50) / 2);
}


/* ---------------- 顯示名 ---------------- */

/** 目前所在階段的顯示名 */
export function stageLabel(state) {
  if (state.stage === 'AMATEUR') return '網咖盃賽';
  if (state.stage === 'AM2') return state.am2Track === 'OVERSEAS' ? '海外青訓' : '青訓次級';
  return LEAGUES[state.league]?.region === 'HOME' ? homeLeagueName(state) : LEAGUES[state.league]?.name || '';
}

/** 目前所在階段對應的 LEAGUES 鍵 */
export function currentLeagueKey(state) {
  if (state.stage === 'PRO') return state.league;
  return state.stage === 'AM2' ? 'AM2' : 'AMATEUR';
}

/** 聯賽的顯示名（主場賽區依時代改名） */
export function leagueLabel(state, leagueKey) {
  return LEAGUES[leagueKey].region === 'HOME' ? homeLeagueName(state) : LEAGUES[leagueKey].name;
}
