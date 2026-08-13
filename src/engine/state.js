/**
 * 遊戲狀態的建立與序列化。
 *
 * 狀態是一顆純 JSON 物件——沒有函式、沒有 DOM 參照、沒有 class 實例。
 * 這是存檔／讀檔與 headless 測試能成立的前提。
 */
import { Rng } from '../core/rng.js';
import { ATTRS, POTENTIAL_BANDS, START_RATIO } from '../data/attributes.js';
import { ROLE_START_EDGE } from '../data/skills.js';
import { MENTAL_START } from '../data/mental.js';
import { HEROES_BY_ROLE } from '../data/heroes.js';
import { TEAMS_AMATEUR } from '../data/teams.js';
import { START_AGE, START_YEAR } from '../data/eras.js';

// v11：OVR 換成教練評價，巔峰值與隊友強度的欄位跟著改名（`peakRating`／`mates[].rating`）。
// 存檔的欄位名變了，舊存檔一律作廢重開
export const SAVE_VERSION = 11;

export function blankSeasonStat() {
  return { years: 0, G: 0, W: 0, L: 0, K: 0, D: 0, A: 0, CS: 0, VIS: 0, DMG: 0, SOLO: 0, MVP: 0, AS: 0 };
}

/**
 * 開一個新角色。
 *
 * 種子只決定「你生下來是什麼樣的人」——起始能力、潛力天花板、性格底色、最早會的
 * 三隻英雄、一開始混在哪個網咖隊。**人生本身不吃這個種子**：事件、擲骰、勝負走的是
 * 另一條亂數流，由呼叫端決定怎麼開。所以同一個種子可以反覆玩，每次都是不同的人生。
 *
 * 這條界線是刻意的：天賦是給定的，選擇與際遇不是。
 *
 * @param {{name:string, role:string, seed:string}} opts
 */
export function createState({ name, role, seed }) {
  // 出生亂數流。與人生流分開命名空間，否則改動人生流的取數順序會連帶改變天賦
  const birth = new Rng(`${seed}:birth`);

  // 潛力天花板：1 頂尖 / 1 優質 / 1 中上 / 其餘平庸，隨機分派到 6 個屬性
  const potential = {};
  birth.shuffle([...ATTRS]).forEach((k, i) => {
    const [lo, hi] = POTENTIAL_BANDS[Math.min(i, POTENTIAL_BANDS.length - 1)];
    potential[k] = birth.int(lo, hi);
  });

  /*
   * 起始屬性（V4 §7.3）＝ 潛力的固定比例，不是固定區間。
   *
   * DEMO 跳過業餘期，所以起點代表的是「已經打進職業隊的新人」。潛力是先分派的，
   * 若起始值走固定區間，一個「平庸 58」的屬性會在出生時就頂到天花板，第一年完全
   * 沒有成長空間；寫成比例則天花板越高、起始值越高、剩餘空間也越大。
   *
   * 所以這裡的順序與舊版相反：**先骰潛力，再由潛力推起始值**。位置味道也不再靠
   * 額外加值，改由該路權重最高的兩項吃比較高的比例（0.80 對 0.70）。
   */
  const edge = new Set(ROLE_START_EDGE[role]);
  const attr = {};
  for (const k of ATTRS) {
    const ratio = (edge.has(k) ? START_RATIO.edge : START_RATIO.rest)
      + (birth.next() * 2 - 1) * START_RATIO.jitter;
    attr[k] = Math.round(potential[k] * ratio);
  }

  return {
    saveVersion: SAVE_VERSION,
    seed,                // 出生種子（字串）。決定天賦，不決定人生
    name,
    role,
    age: START_AGE,
    year: START_YEAR,

    // 生涯階段：AMATEUR（網咖盃賽）→ AM2（青訓次級）→ PRO
    stage: 'AMATEUR',
    stageYear: 1,
    am2Track: 'HOME',
    league: null,        // PRO 時的 LEAGUES 鍵
    team: birth.pick(TEAMS_AMATEUR),
    teamYears: 0,

    attr,                // 六大屬性。技能是它們的導出值，不另外存
    potential,
    carry: {},           // 訓練點不足時的「蓄力」餘額

    // 心理／性格。永遠不對玩家顯示數字，只在面板上給粗略標籤
    mental: Object.fromEntries(
      Object.entries(MENTAL_START).map(([k, [lo, hi]]) => [k, birth.int(lo, hi)]),
    ),
    toneStreak: { bold: 0, plain: 0, humble: 0 },  // 連續同一種扮演傾向的次數

    traits: {},          // 通用特質
    rare: {},            // 稀有特質
    epic: {},            // 史詩特質
    legendary: {},       // 傳說特質
    fusedAway: [],       // 被合成消耗掉的特質名稱（結算時劃線顯示）
    recentEvents: [],    // 最近出過的事件卡 id（反覆抽不重複的暫存）

    heroPool: birth.sample(HEROES_BY_ROLE[role], 3),
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
    rehabYears: 0,
    majorInjuries: 0,
    injuryWeeks: 0,          // 尚未消化的缺席週數，由 engine/lineup.js 逐賽段扣掉
    returningFromInjury: false,
    benchedStreak: 0,        // 連續被下放的賽段數
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
    seedRank: 0,             // 本年度種子序（0 = 未晉級）。舊版叫 seed，與出生種子撞名
    worldsSlotBonus: 0,      // MSI 冠軍為賽區多掙的世界賽席位（2023 起的真實制度）
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
    peakRating: 0,
    proYears: 0,

    done: false,
    retireReason: '',
  };
}

/**
 * 存檔：狀態 + 人生亂數流的進度。存在年度開頭，因此讀檔一定從某年年初重跑。
 * 出生種子存在 `state.seed`，這裡存的是人生流——兩條都要，續玩才會接回同一段人生。
 */
export function serialize(state, rng) {
  return JSON.stringify({ saveVersion: SAVE_VERSION, state, rngState: rng.state, lifeSeed: rng.seedString });
}

export function deserialize(raw) {
  const data = JSON.parse(raw);
  if (!data || data.saveVersion !== SAVE_VERSION) return null;
  return data;
}
