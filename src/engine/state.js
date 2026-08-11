/**
 * 遊戲狀態的建立與序列化。
 *
 * 狀態是一顆純 JSON 物件——沒有函式、沒有 DOM 參照、沒有 class 實例。
 * 這是存檔／讀檔與 headless 測試能成立的前提。
 */
import { ROLE_ABILITIES } from '../data/abilities.js';
import { MENTAL_START } from '../data/mental.js';
import { HEROES, TEAMS_AMATEUR, START_AGE, START_YEAR } from '../data/world.js';

export const SAVE_VERSION = 5;

export function blankSeasonStat() {
  return { years: 0, G: 0, W: 0, L: 0, K: 0, D: 0, A: 0, CS: 0, VIS: 0, DMG: 0, SOLO: 0, MVP: 0, AS: 0 };
}

/**
 * @param {{name:string, role:string, rng:import('../core/rng.js').Rng, seed:string}} opts
 */
export function createState({ name, role, rng, seed }) {
  const abilityKeys = ROLE_ABILITIES[role];

  const ability = {};
  for (const k of abilityKeys) ability[k] = rng.int(22, 34);
  for (const k of ['lane', 'op', 'tf']) if (k in ability) ability[k] += rng.int(0, 4);

  // 潛力天花板：1 頂尖 / 1 優質 / 1 中上 / 其餘平庸，隨機分派到 9 項能力
  const potential = {};
  rng.shuffle(abilityKeys).forEach((k, i) => {
    potential[k] = i === 0 ? rng.int(72, 80)
      : i === 1 ? rng.int(64, 74)
      : i === 2 ? rng.int(56, 68)
      : rng.int(46, 62);
  });

  return {
    saveVersion: SAVE_VERSION,
    seed,
    name,
    role,
    age: START_AGE,
    year: START_YEAR,

    // 生涯階段：AMATEUR（網咖盃賽）→ AM2（青訓次級）→ PRO
    stage: 'AMATEUR',
    stageYear: 1,
    am2Track: 'HOME',
    league: null,        // PRO 時的 LEAGUES 鍵
    team: rng.pick(TEAMS_AMATEUR),
    teamYears: 0,

    ability,
    potential,
    carry: {},           // 訓練點不足時的「蓄力」餘額

    // 心理／性格。永遠不對玩家顯示數字，只在面板上給粗略標籤
    mental: Object.fromEntries(
      Object.entries(MENTAL_START).map(([k, [lo, hi]]) => [k, rng.int(lo, hi)]),
    ),
    toneStreak: { bold: 0, plain: 0, humble: 0 },  // 連續同一種扮演傾向的次數

    traits: {},
    epic: {},
    fusedAway: [],       // 被合成消耗掉的基礎特質名稱（結算時劃線顯示）

    heroPool: rng.sample(HEROES[role], 3),
    mastery: {},
    patchDebt: 0,        // 版本落差：越高懲罰越重
    patchCount: 0,       // 生涯經歷過的版本大改動次數
    patchTheme: null,

    coach: null,
    mates: [],
    mateMorale: 0,
    contract: null,      // {years, mult}

    // 每季重置的旗標（reset* 系列由 engine/game.js 負責）
    seasonFactor: 1,
    skipSeason: false,
    tempInjuryRisk: 0,
    carryInjuryRisk: 0,
    rehabYears: 0,
    majorInjuries: 0,
    wonPlayoffThisYear: false,
    wonWorldsThisYear: false,
    disbandThreat: false,
    forcedFA: false,
    forcedRetire: false,

    lastDelta: 0,
    lastStat: null,
    pendingPoints: 0,

    // 賽段制：一年拆成 1～3 個賽段，各自結算與季後賽
    splitLog: [],            // 該年各賽段的 {name, stat, finish}
    champPoints: 0,          // 全年冠軍點數 → 世界賽種子
    seed: 0,                 // 本年度世界賽種子序（0 = 未晉級）
    wonSplitThisYear: false,
    splitTitles: 0,          // 生涯賽段冠軍數
    firedTimes: 0,           // 被開除／被迫轉隊的次數
    lastVerdictYear: null,   // 上次被切割／拆隊的年份（冷卻用）

    salary: 0,
    bonusSalary: 0,
    honors: [],
    seasonLog: [],
    stats: {},

    sixCount: 0,
    discStreak: 0,
    singleYears: 0,
    romance: false,
    lastIntlYear: null,
    intlAppearances: 0,
    worldsWins: 0,
    worldsFinals: 0,
    msiWins: 0,
    msiPodiums: 0,
    peakOvr: 0,
    proYears: 0,

    done: false,
    retireReason: '',
  };
}

/** 存檔：狀態 + 亂數進度。存在年度開頭，因此讀檔一定從某年年初重跑。 */
export function serialize(state, rng) {
  return JSON.stringify({ saveVersion: SAVE_VERSION, state, rngState: rng.state, seed: rng.seedString });
}

export function deserialize(raw) {
  const data = JSON.parse(raw);
  if (!data || data.saveVersion !== SAVE_VERSION) return null;
  return data;
}
