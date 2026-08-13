/**
 * 合約、薪資、自由市場、試訓、歷史解散。
 *
 * 這一檔管「錢與位子」：年薪怎麼算、誰會打電話來、報價開多少、簽下去會發生什麼。
 * 特質效果一律透過 `kernel/modifiers.js` 的四個查詢入口（bonus／factor／floorOf／
 * capOf／flag）進來，本檔不直接讀 `state.traits`。
 */
import { clamp } from '../core/rng.js';
import { DISBANDS } from '../data/disband.js';
import { LEAGUES, OVERSEAS_LEAGUES } from '../data/leagues.js';
import { eraOf } from '../data/eras.js';
import { effectiveCoachRating } from './attributes.js';
import { marketMultBonus } from './mental.js';
import { academyTeamsOf, rollRoster, teamsOf } from './roster.js';
import { bonus, capOf, factor, flag, floorOf } from '../kernel/modifiers.js';
import { importSlotOpen, occupiesImportSlot } from './imports.js';

/** 台幣的顯示：億／千萬／萬三級，萬元以下四捨五入 */
export function formatMoney(n) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}億`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}千萬`;
  return `${Math.round(n)}萬`;
}

/**
 * 每 1 點上季表現差額，年薪多加 4%——但只加不減，表現差時不扣錢。
 *
 * ⚠ 這一類「每高一點評價換多少東西」的 per-point 係數，在 0–100 重校時要**除以**
 * 1.25 而不是乘（V4 §17.2）：刻度放大之後，同一個相對差距會產出 1.25 倍的點數，
 * 係數不除就等於把全部靈敏度上調兩成。舊值 0.05 ÷ 1.25 = 0.04。
 */
const DELTA_SALARY_PCT = 0.04;

/**
 * 年薪＝聯賽基準 × 合約係數 × 時代係數 × 表現係數 × 特質因子。
 * 特質因子是乘法不是加法：代言類特質（品牌價碼）跟合約談判是兩件事。
 */
export function annualSalary(state, leagueKey, mult) {
  const league = LEAGUES[leagueKey];
  if (!league || !league.baseSalary) return 0;
  const era = eraOf(state.year);
  const perf = 1 + Math.max(0, state.lastDelta || 0) * DELTA_SALARY_PCT;
  return Math.round(league.baseSalary * mult * era.salary * perf * factor(state, 'endorsement'));
}

/* ---------------- 解散 ---------------- */

/** 今年（或指定年）這支隊有沒有解散事件。沒有就回 null，不是空字串 */
export function disbandNoteFor(state, year = state.year) {
  if (!state.team) return null;
  return DISBANDS.find((d) => d.year === year && d.team === state.team)?.reason ?? null;
}

/* ---------------- 報價 ---------------- */

/**
 * 依現在的實力決定哪些聯賽會打電話來。
 *
 * 海外兩級是「高門檻、看近況」：LCK/LPL 要求上季高於該聯賽 par（delta ≥ 1.25），
 * LEC/LCS 只要持平。主場賽區門檻最低，是所有人的退路。
 *
 * ⚠ `delta` 是「高於所在聯賽 par 幾點」（水準量），不是「今年成長了幾點」。它吃
 * 刻度，所以門檻跟著 ×1.25（1 → 1.25）；零不必縮放。偏移量同理（§17.2 三）。
 */
function candidateLeagues(state) {
  const o = effectiveCoachRating(state);
  const delta = state.lastDelta || 0;
  const gates = [
    { ready: () => o >= LEAGUES.LCK.min && delta >= 1.25, keys: ['LCK', 'LPL'] },
    { ready: () => o >= LEAGUES.LEC.min && delta >= 0, keys: ['LEC', 'LCS'] },
    { ready: () => o >= LEAGUES.HOME.min - 2.5, keys: ['HOME'] },
  ];
  const out = [];
  for (const gate of gates) if (gate.ready()) out.push(...gate.keys);
  // 連主場一隊都摸不到，才輪得到青訓次級來找人
  if (!out.length && o >= LEAGUES.AM2.min - 5) out.push('AM2');
  return out;
}

/**
 * 合約係數。
 *
 * 固定三段順序：先加（特質加成＋聲量折價），再保底，最後封頂。舊版是一連串 if，
 * 保底與加項交錯——`神主牌` 的 1.2 在 `人氣選手` 的 +0.05 之前、`全民偶像` 的 1.25
 * 卻在之後，同一個「保底 1.2」會因為身上還有什麼特質而給出不同結果。三段固定之後，
 * 保底就真的是保底。
 */
function contractMult(state, raw, { capKey = 'contractCap' } = {}) {
  // 聲量大就得加薪留人（V4 §9.4：風評那一條已隨維度一起拿掉）
  const added = raw + bonus(state, 'contractAdd') + marketMultBonus(state);
  return capOf(state, capKey, floorOf(state, 'contractFloor', added));
}

/** 單筆報價的合約係數：底價隨聯賽等級、再骰一段談判空間 */
function multFor(rng, leagueKey, state) {
  const base = LEAGUES[leagueKey].tier >= 3 ? 1.05 : 0.9;
  const m = contractMult(state, base + rng.next() * 0.35);
  return Math.round(clamp(m, 0.6, 2.2) * 100) / 100;
}

/* ---------------- 隊內衝突與戰隊切割 ---------------- */

/**
 * 落後所在聯賽先發平均幾點才進入「切割」的判定範圍。
 *
 * 8 點是查出來的、不是猜的：`benchRisk` 在 `delta < 0` 時每點加 2.56%，落後 8 點
 * 已經是 22% 的板凳風險——先發位置都保不住的人，合約才真的擋不住。門檻再低就會
 * 變成「打不好就被開除」，那是常態不是事件。
 */
const FIRE_SHORTFALL = 8;

/**
 * 戰隊在休賽期對你的處置。
 *
 * 兩條真實存在的路：信任崩到底會被迫轉隊（吵到不能同隊了），競技價值撐不住
 * 又帶著負面名聲會被直接切割。兩者都作廢合約、丟進自由市場，差別是切割還會
 * 讓市場對你的報價縮水。
 *
 * ⚠ **切割那條在 S12 換了判準**（V4 §9.4）。舊版讀 `rep` 風評 ≤ −60，而 V4 把風評
 * 整條維度拿掉了：「圈內怎麼說你」不再是一個獨立數值。§9.4 指名改讀**教練評價 ＋
 * 特質副作用**，所以現在的門檻是「打不到所在聯賽的水準」，再由 `verdictFireRisk`
 * 那類特質（圈內毒瘤 +15）加碼。
 *
 * 兩項都要有份量是刻意的：光是打得差不會被切割（那是板凳與續約的事，`benchRisk`
 * 已經在管），光是嘴壞也不會（只要還打得動，戰隊會忍）。**兩件事疊在一起**才是
 * 真的會被切割的那種人——舊版的 rep ≤ −60 表達的其實也是這個，只是當時用一個
 * 「圈內風評」的數值代勞。
 *
 * @returns {{kind:'none'|'rift'|'fired', note?:string}}
 */
export function clubVerdict(state, rng) {
  if (state.stage !== 'PRO' || !state.contract) return { kind: 'none' };
  // 剛換過隊就再鬧一次太廉價了——留兩年冷卻，這才像一次真的事件而不是常態
  if (state.lastVerdictYear != null && state.year - state.lastVerdictYear < 3) return { kind: 'none' };
  const { trust } = state.mental;
  const par = LEAGUES[state.league]?.par ?? 66;
  const shortfall = par - effectiveCoachRating(state);

  if (shortfall >= FIRE_SHORTFALL && !flag(state, 'verdictShield')) {
    const risk = clamp(6 + (shortfall - FIRE_SHORTFALL) * 1.6 + bonus(state, 'verdictFireRisk'), 0, 70);
    if (risk > 0 && rng.chance(risk)) {
      state.lastVerdictYear = state.year;
      return { kind: 'fired', note: '競技價值撐不住合約，戰隊決定與你切割' };
    }
  }
  if (trust <= 21 && !flag(state, 'verdictRiftShield')) {
    const risk = clamp(25 + (21 - trust) * 2 + bonus(state, 'verdictRiftRisk'), 8, 72);
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
  const fame = state.fame ?? 0;
  if (fame >= 78) return 0.25;
  if (fame >= 60) return 0.15;
  if (fame >= 45) return 0.08;
  return 0;
}

/** 一次市場最多開幾張報價 */
const MAX_OFFERS = 4;
/** 上季高出所在聯賽 par ≥ 3.75 的選手，每支隊願意多談一個名額（舊 3 × 1.25） */
const HOT_DELTA = 3.75;
/** 報價最少留一張，不會歸零到「明明還很強卻沒人要」 */
const MIN_OFFERS = 1;

/**
 * 產生自由市場報價。
 *
 * 舊版的兩個 bug：海外選手一進 FA 只會收到主場報價（被迫降級），
 * 以及解散後的報價完全不看目前實力。這裡統一由 `candidateLeagues` 決定。
 *
 * 報價會附一個非標準欄位 `blockedByImports`：被外援名額擋掉的賽區清單，
 * UI 用它解釋「有隊伍問過，但位子沒了」，而不是讓報價默默消失。
 *
 * @param {object} opts
 * @param {boolean} opts.excludeCurrentTeam 解散／強制 FA 時不能回原隊
 * @returns {Array<{team:string, league:string, years:number, mult:number, salary:number}>}
 */
export function generateOffers(state, rng, { excludeCurrentTeam = false } = {}) {
  const delta = state.lastDelta || 0;
  const offers = [];
  const blockedByImports = [];

  for (const leagueKey of rng.shuffle(candidateLeagues(state))) {
    if (offers.length >= MAX_OFFERS) break;
    // 外援名額：主場賽區出身的選手簽進任何海外賽區都會佔掉一個名額，而名額本來
    // 就是滿的。這不是數值不夠，是位子沒了
    if (!importSlotOpen(state, rng, leagueKey)) {
      if (occupiesImportSlot(state, leagueKey)) blockedByImports.push(leagueKey);
      continue;
    }
    let pool = teamsOf(state, leagueKey);
    if (leagueKey === 'AM2') pool = academyTeamsOf(state, state.am2Track === 'OVERSEAS' ? rng.pick(OVERSEAS_LEAGUES) : 'HOME');
    pool = pool.filter((t) => t !== state.team || !excludeCurrentTeam);
    pool = pool.filter((t) => !offers.some((o) => o.team === t));
    if (!pool.length) continue;

    // 表現越好，願意開口的隊伍越多
    const slots = delta >= HOT_DELTA ? 2 : 1;
    for (const team of rng.sample(pool, Math.min(slots, pool.length))) {
      const mult = multFor(rng, leagueKey, state);
      const years = LEAGUES[leagueKey].tier >= 3 ? rng.int(2, 3) : rng.int(1, 3);
      offers.push({ team, league: leagueKey, years, mult, salary: annualSalary(state, leagueKey, mult) });
    }
  }

  // 表現差時砍掉部分報價；名聲爛到見底，就算數值還在也沒幾支隊敢碰。
  // V4 §9.4 把 `rep` 風評整條拿掉之後，「沒幾支隊敢碰」只剩特質副作用這一個來源
  // （`offerPenalty`：圈內毒瘤）——這正是 §9.4 說的「改由特質副作用承擔」
  if (delta < 0 && offers.length > MIN_OFFERS) offers.length = Math.max(MIN_OFFERS, offers.length - 1);
  if (flag(state, 'offerPenalty') && offers.length > MIN_OFFERS) {
    offers.length = Math.max(MIN_OFFERS, offers.length - 1);
  }
  offers.blockedByImports = blockedByImports;
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
  const o = effectiveCoachRating(state);
  const league = track === 'OVERSEAS' ? rng.pick(OVERSEAS_LEAGUES) : 'HOME';
  const threshold = track === 'OVERSEAS' ? LEAGUES[league].min - 7.5 : LEAGUES.HOME.par - 10;
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
 *
 * 偏移量是 0–100 刻度（§17.2 三）：一隊晉級／板凳 `par − 10`、海外試訓 `min − 7.5`。
 * §7.3 的起始評價 58 就是靠 `HOME.par − 10 = 56` 這條過關——「青訓打得很好、剛被
 * 一隊撿上來、還沒站穩」。
 */
export const SCOUT_BAR = {
  AM2: LEAGUES.AM2.par - 10,
  HOME: LEAGUES.HOME.par - 10,
  OVERSEAS: Math.min(...OVERSEAS_LEAGUES.map((l) => LEAGUES[l].min - 7.5)),
};

/** 不消耗亂數的純查詢，供流程判斷這一年有哪些層級會來敲門 */
export function scoutInterest(state) {
  const o = effectiveCoachRating(state);
  return {
    rating: o,
    am2: o >= SCOUT_BAR.AM2,
    home: o >= SCOUT_BAR.HOME,
    overseas: o >= SCOUT_BAR.OVERSEAS,
  };
}

/**
 * 球探評語：把教練評價換成一句話。
 *
 * V4 §10.1 不給玩家單一總評數字，但業餘期的「要不要現在簽」是真的需要一個判斷依據
 * ——那個依據本來就該長成球探的說法，而不是一個可以拿來最佳化的分數。門檻是同一組
 * `SCOUT_BAR`，所以敘述永遠跟實際會不會有人來敲門一致。
 */
export function scoutVerdict(state) {
  const interest = scoutInterest(state);
  if (interest.overseas) return '海外賽區的球探也來看過你了';
  if (interest.home) return '一隊教練組認為你現在就上得去';
  if (interest.am2) return '二隊願意收，一隊還差一截';
  return '還沒有人把你列進名單';
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
  const maxYears = d >= HOT_DELTA ? 4 : d >= 0 ? 3 : 1;
  // 續約走的是同一套三段順序，只是短約的封頂寬一點（留人的價碼砍不了那麼狠）
  // 0.024 是舊的 per-point 係數 0.03 ÷ 1.25（§17.2 二）
  const premium = retentionPremium(state);
  const long = {
    years: maxYears,
    mult: Math.round(clamp(contractMult(state, 0.95 + d * 0.024 + premium), 0.7, 1.6) * 100) / 100,
  };
  const short = {
    years: Math.min(2, maxYears),
    mult: Math.round(clamp(contractMult(state, 1.12 + d * 0.024 + premium, { capKey: 'contractCapShort' }), 0.8, 1.9) * 100) / 100,
  };
  return { long, short };
}
