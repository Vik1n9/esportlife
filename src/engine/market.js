/** 合約、薪資、自由市場、試訓、歷史解散。 */
import { clamp } from '../core/rng.js';
import { DISBAND_HISTORY, LEAGUES, OVERSEAS_LEAGUES, eraOf } from '../data/world.js';
import { effectiveOvr } from './abilities.js';
import { marketMultBonus } from './mental.js';
import { academyTeamsOf, rollRoster, teamsOf } from './team.js';

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
  // 聲量大就得加薪留人，風評差則反過來被砍價
  m += marketMultBonus(state);
  if (state.traits.idol) m = Math.max(m, 1.25);
  if (state.traits.pariah) m = Math.min(m, 0.9);
  return Math.round(clamp(m, 0.6, 2.2) * 100) / 100;
}

/* ---------------- 隊內衝突與戰隊切割 ---------------- */

/**
 * 戰隊在休賽期對你的處置。
 *
 * 兩條真實存在的路：默契崩到底會被迫轉隊（吵到不能同隊了），風評爛到底
 * 會被直接切割（贊助商壓力大過競技價值）。兩者都作廢合約、丟進自由市場，
 * 差別是切割還會讓市場對你的報價縮水。
 *
 * @returns {{kind:'none'|'rift'|'fired', note?:string}}
 */
export function clubVerdict(state, rng) {
  if (state.stage !== 'PRO' || !state.contract) return { kind: 'none' };
  // 剛換過隊就再鬧一次太廉價了——留兩年冷卻，這才像一次真的事件而不是常態
  if (state.lastVerdictYear != null && state.year - state.lastVerdictYear < 3) return { kind: 'none' };
  const { chem, rep } = state.mental;

  if (rep <= -60 && !state.epic.showman) {
    const risk = clamp(22 + (-rep - 60) * 1.4 + (state.traits.pariah ? 15 : 0), 8, 70);
    if (rng.chance(risk)) {
      state.lastVerdictYear = state.year;
      return { kind: 'fired', note: '贊助商施壓，戰隊決定與你切割' };
    }
  }
  if (chem <= 21 && !state.epic.lockerroom) {
    const risk = clamp(25 + (21 - chem) * 2 - (state.traits.glue ? 20 : 0), 8, 72);
    if (rng.chance(risk)) {
      state.lastVerdictYear = state.year;
      return { kind: 'rift', note: '休息室已經修不回來了，管理層決定拆開' };
    }
  }
  return { kind: 'none' };
}

/**
 * 續約時戰隊的挽留意願。知名度高到一定程度，就算戰績普通也留得住。
 * @returns {number} 額外的年薪係數
 */
export function retentionPremium(state) {
  const fame = state.mental?.fame ?? 0;
  if (fame >= 78) return 0.25;
  if (fame >= 60) return 0.15;
  if (fame >= 45) return 0.08;
  return 0;
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
    if (leagueKey === 'AM2') pool = academyTeamsOf(state, state.am2Track === 'OVERSEAS' ? rng.pick(OVERSEAS_LEAGUES) : 'HOME');
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
  // 風評爛到見底，就算數值還在也沒幾支隊敢碰
  const rep = state.mental?.rep ?? 0;
  if ((rep <= -40 || state.traits.pariah) && offers.length > 1) {
    offers.length = Math.max(1, offers.length - (rep <= -70 ? 2 : 1));
  }
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

/**
 * 各層級注意到你的實力門檻。
 *
 * 業餘階段不再強制熬滿三年——只要數值達標，就會有隊伍找上門。
 *
 * 重點是「職業隊」不只有一隊。實測過舊設定：三年期滿時 OVR 中位數只有 37，
 * 而主場一隊的試訓門檻是 45，所以那個「投入主場賽區試訓」的選項成功率是 0%，
 * 每個人最後都被丟進青訓。這既不好玩，也不符合 2012 年的實況——在網咖打出
 * 名號的人，現實中是被戰隊的二隊／青訓收走，再一路往上爬，不是直接進一隊。
 *
 * 所以門檻分成三層：青訓二隊（最常見的出路）、主場一隊（少年天才）、
 * 海外賽區（極罕見）。
 */
export const SCOUT_BAR = {
  AM2: LEAGUES.AM2.par - 8,
  HOME: LEAGUES.HOME.par - 8,
  OVERSEAS: Math.min(...OVERSEAS_LEAGUES.map((l) => LEAGUES[l].min - 6)),
};

/** 不消耗亂數的純查詢，供流程判斷這一年有哪些層級會來敲門 */
export function scoutInterest(state) {
  const o = effectiveOvr(state);
  return {
    ovr: o,
    am2: o >= SCOUT_BAR.AM2,
    home: o >= SCOUT_BAR.HOME,
    overseas: o >= SCOUT_BAR.OVERSEAS,
  };
}

/** 青訓次級的一紙合約（不佔正式一隊名額，薪水很低） */
export function academyOffer(state, rng, track = 'HOME') {
  const parent = track === 'OVERSEAS' ? rng.pick(OVERSEAS_LEAGUES) : 'HOME';
  const pool = academyTeamsOf(state, parent);
  if (!pool.length) return null;
  return { ok: true, league: 'AM2', team: rng.pick(pool), years: 1, mult: 1 };
}

/** 續約時可選的合約長度 */
export function renewalTerms(state) {
  const d = state.lastDelta || 0;
  const maxYears = d >= 3 ? 4 : d >= 0 ? 3 : 1;
  const premium = retentionPremium(state) + marketMultBonus(state);
  const long = { years: maxYears, mult: Math.round(clamp(0.95 + d * 0.03 + premium, 0.7, 1.6) * 100) / 100 };
  const short = { years: Math.min(2, maxYears), mult: Math.round(clamp(1.12 + d * 0.03 + premium, 0.8, 1.9) * 100) / 100 };
  if (state.traits.franchise) { long.mult = Math.max(long.mult, 1.2); short.mult = Math.max(short.mult, 1.2); }
  if (state.epic.lockerroom) { long.mult = Math.max(long.mult, 1.15); short.mult = Math.max(short.mult, 1.15); }
  if (state.traits.pariah) { long.mult = Math.min(long.mult, 0.9); short.mult = Math.min(short.mult, 0.95); }
  return { long, short };
}
