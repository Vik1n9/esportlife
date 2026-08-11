/** 合約、薪資、自由市場、試訓、歷史解散。 */
import { clamp } from '../core/rng.js';
import { DISBAND_HISTORY, LEAGUES, OVERSEAS_LEAGUES, TEAMS_AM2_HOME, TEAMS_AM2_OVERSEAS, eraOf } from '../data/world.js';
import { effectiveOvr } from './abilities.js';
import { rollRoster, teamsOf } from './team.js';

export function formatMoney(n) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}億`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}千萬`;
  return `${Math.round(n)}萬`;
}

/** 年薪＝聯賽基準 × 合約係數 × 時代係數 × 表現係數（表現只加不減，避免負薪） */
export function annualSalary(state, leagueKey, mult) {
  const league = LEAGUES[leagueKey];
  if (!league || !league.baseSalary) return 0;
  const era = eraOf(state.year);
  const perf = 1 + Math.max(0, state.lastDelta || 0) * 0.05;
  const fame = state.traits.popular ? 1.12 : 1;
  return Math.round(league.baseSalary * mult * era.salary * perf * fame);
}

/* ---------------- 解散 ---------------- */

export function disbandNoteFor(state, year = state.year) {
  const table = DISBAND_HISTORY[year];
  return table && state.team ? table[state.team] || null : null;
}

/* ---------------- 報價 ---------------- */

/** 依現在的實力決定哪些聯賽會打電話來 */
function candidateLeagues(state) {
  const o = effectiveOvr(state);
  const delta = state.lastDelta || 0;
  const out = [];
  if (o >= LEAGUES.LCK.min && delta >= 1) out.push('LCK', 'LPL');
  if (o >= LEAGUES.LEC.min && delta >= 0) out.push('LEC', 'LCS');
  if (o >= LEAGUES.HOME.min - 2) out.push('HOME');
  if (!out.length && o >= LEAGUES.AM2.min - 4) out.push('AM2');
  return out;
}

function multFor(rng, leagueKey, state) {
  const base = LEAGUES[leagueKey].tier >= 3 ? 1.05 : 0.9;
  let m = base + rng.next() * 0.35;
  if (state.traits.franchise) m = Math.max(m, 1.2);
  if (state.epic.lockerroom) m = Math.max(m, 1.15);
  if (state.traits.popular) m += 0.05;
  return Math.round(m * 100) / 100;
}

/**
 * 產生自由市場報價。
 *
 * 舊版的兩個 bug：海外選手一進 FA 只會收到主場報價（被迫降級），
 * 以及解散後的報價完全不看目前實力。這裡統一由 `candidateLeagues` 決定。
 *
 * @param {object} opts
 * @param {boolean} opts.excludeCurrentTeam 解散／強制 FA 時不能回原隊
 * @returns {Array<{team:string, league:string, years:number, mult:number, salary:number}>}
 */
export function generateOffers(state, rng, { excludeCurrentTeam = false } = {}) {
  const delta = state.lastDelta || 0;
  const leagues = candidateLeagues(state);
  const offers = [];

  for (const leagueKey of rng.shuffle(leagues)) {
    if (offers.length >= 4) break;
    let pool = teamsOf(state, leagueKey);
    if (leagueKey === 'AM2') pool = state.am2Track === 'OVERSEAS' ? TEAMS_AM2_OVERSEAS : TEAMS_AM2_HOME;
    pool = pool.filter((t) => t !== state.team || !excludeCurrentTeam);
    pool = pool.filter((t) => !offers.some((o) => o.team === t));
    if (!pool.length) continue;

    // 表現越好，願意開口的隊伍越多
    const slots = delta >= 3 ? 2 : 1;
    for (const team of rng.sample(pool, Math.min(slots, pool.length))) {
      const mult = multFor(rng, leagueKey, state);
      const years = LEAGUES[leagueKey].tier >= 3 ? rng.int(2, 3) : rng.int(1, 3);
      offers.push({ team, league: leagueKey, years, mult, salary: annualSalary(state, leagueKey, mult) });
    }
  }

  // 表現差時砍掉部分報價，但不會歸零到「明明還很強卻沒人要」
  if (delta < 0 && offers.length > 1) offers.length = Math.max(1, offers.length - 1);
  return offers;
}

/** 簽約。切換隊伍時重置隊友、教練與「本隊奪冠」旗標。 */
export function signContract(state, rng, { team, league, years, mult }) {
  const changedTeam = team !== state.team || league !== state.league;
  state.league = league;
  state.team = team;
  state.contract = { years, mult };
  if (changedTeam) {
    state.teamYears = 0;
    rollRoster(state, rng, league);
  } else {
    state.teamYears += 1;
  }
  state.forcedFA = false;
}

/* ---------------- 試訓 ---------------- */

/**
 * 主場／海外試訓。
 * @returns {{ok:boolean, team?:string, league?:string, years?:number, mult?:number}}
 */
export function tryout(state, rng, track = 'HOME') {
  const o = effectiveOvr(state);
  const league = track === 'OVERSEAS' ? rng.pick(OVERSEAS_LEAGUES) : 'HOME';
  const threshold = track === 'OVERSEAS' ? LEAGUES[league].min - 6 : LEAGUES.HOME.par - 8;
  if (o < threshold) return { ok: false };
  const pool = teamsOf(state, league);
  if (!pool.length) return { ok: false };
  return { ok: true, league, team: rng.pick(pool), years: 2, mult: 1 };
}

/** 青訓次級隊伍（不佔正式合約，薪水很低） */
export function assignAcademyTeam(state, rng, track) {
  state.am2Track = track;
  state.stage = 'AM2';
  state.stageYear = 0;
  state.league = 'AM2';
  state.team = rng.pick(track === 'OVERSEAS' ? TEAMS_AM2_OVERSEAS : TEAMS_AM2_HOME);
  state.contract = { years: 1, mult: 1 };
  rollRoster(state, rng, 'AM2');
}

/** 續約時可選的合約長度 */
export function renewalTerms(state) {
  const d = state.lastDelta || 0;
  const maxYears = d >= 3 ? 4 : d >= 0 ? 3 : 1;
  const long = { years: maxYears, mult: Math.round(clamp(0.95 + d * 0.03, 0.75, 1.25) * 100) / 100 };
  const short = { years: Math.min(2, maxYears), mult: Math.round(clamp(1.12 + d * 0.03, 0.85, 1.5) * 100) / 100 };
  if (state.traits.franchise) { long.mult = Math.max(long.mult, 1.2); short.mult = Math.max(short.mult, 1.2); }
  if (state.epic.lockerroom) { long.mult = Math.max(long.mult, 1.15); short.mult = Math.max(short.mult, 1.15); }
  return { long, short };
}
