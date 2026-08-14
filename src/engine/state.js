/**
 * 遊戲狀態的建立與序列化。
 *
 * 狀態是一顆純 JSON 物件——沒有函式、沒有 DOM 參照、沒有 class 實例。
 * 這是存檔／讀檔與 headless 測試能成立的前提。
 */
import { Rng } from '../core/rng.js';
import { ATTRS, POTENTIAL_BANDS, START_RATIO } from '../data/attributes.js';
import { ROLE_START_EDGE } from '../data/skills.js';
import { MENTAL_BASE, MENTAL_JITTER, MENTAL_KEYS } from '../data/mental.js';
import { FAME_START } from '../data/reputation.js';
import { STAMINA_MAX } from './stamina.js';
import { HEROES_BY_ROLE } from '../data/heroes.js';
import { TEAMS_AMATEUR } from '../data/teams.js';
import { START_AGE, START_YEAR } from '../data/eras.js';
import { ceilingCurve, drawLifecycle } from './lifecycle.js';
import { INNATE_POOL } from '../data/innate.js';

// v16：設施制訓練（V4 §5）。`state.activeEffects` 是新欄位（短期 buff/debuff，剩餘月數，
// §20.2）。訓練從「骰子加點」換成「訓練活動＋訓練事件卡」，成長結算整段改寫，舊存檔作廢
// v17：天生特質（S19d，V4 §1.4／§9.1）。出生流插進天生特質抽取（0/1/2 個，40/40/20%），
// 業餘隊伍抽到英雄池之後（§1.4 寫死的順序），`mentalBias` 對齊初始心理——所有既有種子
// 的天賦組合都會位移，舊存檔作廢
export const SAVE_VERSION = 17;

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
   * 起始屬性（V4 §7.3）＝ effective_potential(起始年齡) 的比例，不是固定區間。
   *
   * DEMO 跳過業餘期，所以起點代表的是「已經打進職業隊的新人」。潛力是先分派的，
   * 若起始值走固定區間，一個「平庸 58」的屬性會在出生時就頂到天花板，第一年完全
   * 沒有成長空間；寫成比例則天花板越高、起始值越高、剩餘空間也越大。
   *
   * v4.3（§7.3）：比例乘的底從「固定潛力」換成「effective_potential(16)」——出生
   * 當下天花板隨年齡曲線移動（16 歲的 ceiling_curve ≈ 0.5），所以實際起始值約是
   * 潛力 × 0.5 × k_i。這讓業餘期重新有了「從網咖爬到職業門檻」的空間（S09 交接
   * 筆記第二節點名的缺口）。k_i 本身經 S15b 重校（見 `data/attributes.js`）。
   *
   * 位置味道不靠額外加值，由該路權重最高的兩項吃較高的比例（0.80 對 0.70）。
   *
   * ⚠ 出生流的抽取順序寫死（§1.4）：這裡只先抽比例的 jitter，實際屬性值要等
   * 生命週期參數抽完（下面第 7 步）才組得出來——否則動到前面的取數順序會位移所有
   * 既有種子的天賦。
   */
  const edge = new Set(ROLE_START_EDGE[role]);
  const ratios = {};
  for (const k of ATTRS) {
    ratios[k] = (edge.has(k) ? START_RATIO.edge : START_RATIO.rest)
      + (birth.next() * 2 - 1) * START_RATIO.jitter;
  }

  // 業餘隊伍（§1.4 的第 7 步——v4.1 重排之後它排在英雄池後面，不是心理六維前面）
  const team = birth.pick(TEAMS_AMATEUR);
  // 天生特質（§1.4 第 4 步，插在起始屬性之後、心理六維之前）：0/1/2 個（40/40/20%），
  // 均勻無放回抽取，同種子必定同組合
  const innateRoll = birth.int(0, 99);
  const innateCount = innateRoll < 40 ? 0 : innateRoll < 80 ? 1 : 2;
  const innateKeys = birth.sample(INNATE_POOL.map((e) => e.key), innateCount);
  // §9.1 一致性：把抽到的天生特質的 mentalBias 收成「維度 → 方向」表。
  // 池內維度不重複（測試強制），所以不會有正負打架；保險起見後寫者勝
  const biasDir = new Map();
  for (const e of INNATE_POOL) {
    if (innateKeys.includes(e.key) && e.mentalBias) biasDir.set(e.mentalBias.dim, e.mentalBias.dir);
  }
  // 心理六維（§1.4 第 5 步）。被 mentalBias 指定的維度改抽有向區間（正向 +6～+10／
  // 負向 −10～−6），不再對稱 jitter——帶「天生抗壓」的種子開局 comp 不能是 41（§9.1）；
  // 0 個天生特質的種子六維全部維持原本的 ±10，行為與 v4.0 相同
  const mental = Object.fromEntries(MENTAL_KEYS.map((k) => {
    const dir = biasDir.get(k);
    if (dir > 0) return [k, MENTAL_BASE + birth.int(6, 10)];
    if (dir < 0) return [k, MENTAL_BASE + birth.int(-10, -6)];
    return [k, MENTAL_BASE + birth.int(-MENTAL_JITTER, MENTAL_JITTER)];
  }));
  // 聲量（§1.4 第 6 步）
  const fame = birth.int(FAME_START[0], FAME_START[1]);
  // 英雄池（§1.4 第 7 步）
  const heroPool = birth.sample(HEROES_BY_ROLE[role], 3);
  // 生命週期參數（§7.2，§1.4 的最後一步）——接在業餘隊伍之後抽 30 次，不准插隊
  const lifecycle = drawLifecycle(birth);

  // 起始屬性＝ potential × ceiling_curve(16) × k_i（§7.3 v4.3）
  const attr = {};
  for (const k of ATTRS) {
    attr[k] = Math.round(potential[k] * ceilingCurve(lifecycle[k], START_AGE) * ratios[k]);
  }

  return {
    saveVersion: SAVE_VERSION,
    seed,                // 出生種子（字串）。決定天賦，不決定人生
    name,
    role,
    age: START_AGE,
    year: START_YEAR,
    // 當下的月份（V4 §3.3）。存檔點固定在年初，所以它讀出來一定是 1；它存在是為了
    // 讓狀態列與面板有一個「現在走到哪」的來源，而不是靠 UI 自己數 beat
    month: 1,

    // 生涯階段：AMATEUR（網咖盃賽）→ AM2（青訓次級）→ PRO
    stage: 'AMATEUR',
    stageYear: 1,
    am2Track: 'HOME',
    league: null,        // PRO 時的 LEAGUES 鍵
    team,
    teamYears: 0,

    attr,                // 六大屬性。技能是它們的導出值，不另外存
    potential,
    lifecycle,           // 生命週期參數（六屬性 × 5 參數，§7.2 §20.2）
    carry: {},           // 訓練點不足時的「蓄力」餘額

    /*
     * 體力（V4 §6）：0–100 的消耗資源，跟隱藏心理正好相反——**它必須顯示在面板上**，
     * 因為它是玩家要主動管理的東西，藏起來就不成決策了。
     *
     * 出道時是滿的：起點的意義是「還沒有被賽季消耗過的新人」。曲線與經濟住在
     * `engine/stamina.js`，這裡只負責存。
     */
    stamina: STAMINA_MAX,
    staminaMonth: 0,     // 生涯累計的「體力月」數，休息間隔靠它算
    staminaLog: { months: 0, low: 0 },  // 累計月數與其中落進透支區的月數
    restLog: [],         // 每次休息的 {month, year}——節奏是不是 3–4 個月一休看這個

    // 短期 buff/debuff（V4 §5.4／§20.2）：訓練事件卡大成功等寫入，剩餘月數由
    // game.js 的月迴圈每月遞減。S16 只有「手感火燙」一個 buff，S18 擴充完整目錄
    activeEffects: [],

    /*
     * 競技心理六維（V4 §9.1）：50 為基準，出生種子微調 ±10。
     *
     * **永遠不對玩家顯示，連粗略標籤都沒有**——玩家只能從事件文本、結算箭頭與可見
     * 數據（陣亡數）反推。50 這個起點是刻意的：§9.2 的發揮倍率與 §10.2 的心理修正
     * 在 50 都恰好是中性值，所以任何偏離都是玩家自己選出來的，不是出生就欠下的。
     */
    mental,
    // 聲量（V4 §9.4）。跟六維相反：玩家看得到，面板上有分級標籤
    fame,
    toneStreak: { bold: 0, plain: 0, humble: 0 },  // 連續同一種扮演傾向的次數

    traits: Object.fromEntries(innateKeys.map((k) => [k, true])),  // 天生特質白拿，進通用池（§14.1）
    rare: {},            // 稀有特質
    epic: {},            // 史詩特質
    legendary: {},       // 傳說特質
    fusedAway: [],       // 被合成消耗掉的特質名稱（結算時劃線顯示）
    recentEvents: [],    // 最近出過的事件卡 id（反覆抽不重複的暫存）

    heroPool,
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

    /*
     * 失誤的可見紀錄（V4 §9.3）。兩格分開存是整個「因隱藏、果可見」循環的資料面：
     * 心理看不到，但「同一個人在例行賽死幾次、在季後賽與國際賽死幾次」看得到，
     * 玩家從這個落差反推自己的抗壓。高抗壓的人兩格幾乎持平，低抗壓的人會拉開。
     */
    deathLog: { regular: { G: 0, D: 0 }, pressure: { G: 0, D: 0 } },

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
