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
import { AMATEUR_START_AGE, AMATEUR_START_YEAR, DEMO_END_YEAR, START_AGE, START_YEAR } from '../data/eras.js';
import { ceilingCurve, drawLifecycle } from './lifecycle.js';
import { INNATE_POOL } from '../data/innate.js';
import { signContract } from './market.js';
import { teamsOf } from './roster.js';

// v16：設施制訓練（V4 §5）。`state.activeEffects` 是新欄位（短期 buff/debuff，剩餘月數，
// §20.2）。訓練從「骰子加點」換成「訓練活動＋訓練事件卡」，成長結算整段改寫，舊存檔作廢
// v17：天生特質（S19d，V4 §1.4／§9.1）。出生流插進天生特質抽取（0/1/2 個，40/40/20%），
// 業餘隊伍抽到英雄池之後（§1.4 寫死的順序），`mentalBias` 對齊初始心理——所有既有種子
// 的天賦組合都會位移，舊存檔作廢
// v18：生涯軌跡帳本（S17a，V4 §14.3／§15.5）。新增 intlRecord／teamHistory／
// disbandCrises／awards／milestones 五欄（§14.3 五條 route 的觸發條件與 §15.5 傳記的
// 資料來源），與既有的總數欄位並存——舊存檔缺欄位作廢
// v19：生涯任務（S17b，V4 §12.3）。新增 quests（進行中／已結算的任務卡與素材消耗
// log）與 labels（生涯標籤：任務失敗降階或 route 達成的產物，不進合成樹、不吃
// modifiers），傳說特質的唯一發放口上線——舊存檔作廢
// v20：獨有特質接線與名次鍵入帳（S20c，V4 §14.1／§14.3）。新增 unique（第五階
// 特質的存放處，由生涯條件直接授予、不進合成樹）；`milestones` 的國際賽列改帶
// `event`／`finish` 兩個機器可讀欄位（查詢層不再解析顯示文字）；死欄位 sixCount
// 移除——舊存檔缺 unique 與 finish 會讓查詢層回「沒打過」，故作廢
// v21：冠軍登記表（S20g，V4 §16.2）。新增 titleHistory（每年世界賽的冠軍，
// 玩家與 NPC 同一張表）——衛冕者身分與 `torch_bearer` 授予靠它；舊存檔缺這欄
// 會讓 `reigningChampion` 回「第一年、無衛冕者」，故作廢
// v22：三層退役事件（S20e，V4 §18.2）。新增 marketQuiet（最近一次自由市場有無
// 報價——「無聲告別」與「最後一搏」的判準）；舊存檔缺這欄會讓兩個結局條件失效，
// 故作廢
// v23：DEMO 三年期程（S21b，V4 §19）。新增 demoEndYear（DEMO 的最後一年；業餘起點
// 為 null ＝ 不設上限）與 demoEnded（36 個月跑完、沒觸發任何結局的收束旗標）——舊存檔
// 缺 demoEndYear 會被當成完整生涯永遠跑下去，DEMO 的收束畫面永遠等不到，故作廢
// v24：事件觸發旗標與計數（§12.2 增訂）。新增 eventFlags（事件一點亮、事件二的
// `when` 讀得到的連續事件記憶）與 eventCounts（逐卡出場次數＋卡片宣告的具名計數，
// 「觸發 N 次後開新事件／授予特質」的門檻讀它）——舊存檔缺這兩欄會讓所有連鎖條件
// 恆偽（連鎖卡永遠不來）、計數從中途重新起算，故作廢
// v25：隊友接 NPC 池（S28，§23.6）。`state.mates` 每項從 `{ name, rating }` 擴充為
// `{ npcId|null, name, position, rating }`——職業期隊友存 NPC 引用（`npcId` 為
// player_id），業餘期與合成隊友為 null。舊存檔缺 npcId／position 欄位，故作廢
// v26：對手實體化計數（S29，§23.4）。新增 oppFaces（對手抽選與實體化計數，
// 季後賽與國際賽各一格）——§23.4 實體化率量測的讀點。舊存檔缺這欄會讀成
// undefined 讓計數報錯，故作廢
// v27：賽區背景模擬資料池（S32，§24.2.2）。新增 leaguePool（逐年 → 賽段積分榜與
// 國際賽微觀數據容器，只存當年＋前一年）——舊存檔缺這欄會讓 `ensureSplit` 對
// undefined 寫入報錯，故作廢
// v28：玩家端六維併池（S34，§24.2.5）。`blankSeasonStat` 新增 DPM 欄位（DMG% ×
// `TEAM_DPM_TOTAL`，與 NPC 微觀池同一個常數）——舊存檔的季度統計缺這欄，`mergeSplits`／
// `accumulate` 的加權平均會對 undefined 運算，故作廢
export const SAVE_VERSION = 28;

export function blankSeasonStat() {
  return { years: 0, G: 0, W: 0, L: 0, K: 0, D: 0, A: 0, CS: 0, VIS: 0, DMG: 0, DPM: 0, SOLO: 0, MVP: 0, AS: 0 };
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
 * `stage`（S20d）：兩種起點共用同一條出生流——
 *
 *   'PRO'（預設，DEMO／完成定義起點）：19 歲、2015 年、直接從職業第一年開始，
 *     跑三個賽季＝ 36 個月（§19，S21b）。起始屬性讀**固定潛力**——出道新人已經打完業餘期，§7.3 的 k_i
 *     比例照原樣兌現。出道隊由 `${seed}:debut` 亂數流簽下，與人生流／出生流
 *     分開命名空間。
 *   'AMATEUR'：16 歲、2012 年、從網咖盃賽爬起。起始屬性讀 effective_potential(16)，
 *     業餘期保留「從網咖爬到職業門檻」的成長空間（S15b 以來 13 站的校準基線全量
 *     在這條路線上——完整生涯測試一律明確傳這個值，見 `tests/lib/harness.mjs` 的
 *     `DEFAULT_STAGE`）。
 *
 * @param {{name:string, role:string, seed:string, stage?:string}} opts
 */
export function createState({ name, role, seed, stage = 'PRO' }) {
  // 出生亂數流。與人生流分開命名空間，否則改動人生流的取數順序會連帶改變天賦
  const birth = new Rng(`${seed}:birth`);

  // 潛力天花板：1 頂尖 / 1 優質 / 1 中上 / 其餘平庸，隨機分派到 6 個屬性
  const potential = {};
  birth.shuffle([...ATTRS]).forEach((k, i) => {
    const [lo, hi] = POTENTIAL_BANDS[Math.min(i, POTENTIAL_BANDS.length - 1)];
    potential[k] = birth.int(lo, hi);
  });

  /*
   * 起始屬性（V4 §7.3）。比例寫法保留，乘的底隨起點分兩種（S20d）：
   *
   * - AMATEUR（16 歲）：effective_potential(16)——出生當下天花板約 0.5，實際起始值
   *   約潛力 × 0.5 × k_i，業餘期才有「從網咖爬到職業門檻」的空間（S15b）。
   * - PRO（19 歲出道）：固定潛力——出道新人已經打完業餘期，比例不再被 16 歲的
   *   天花板壓一次。k_i 照 §7.3 原表（0.80／0.70），實測起始評價平均 58.6、
   *   p10 55／p90 64，與業餘路線實測晉升分布（58.9、56／62）對齊。
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

  // 業餘隊伍。⚠ 實際取數位置是「潛力 → 屬性 jitter 之後」的第 3 位（歷史遺留）——
  // §1.4 明文順序把它排在英雄池後面（第 7 步），但 S19d 起註釋與規格同聲、程式碼
  // 從未移動，種子流位移會動到所有天賦輸出，移不得。TODO：S28 隊友與戰隊整合時
  // 一併重排出生流，與 §1.4 對齊
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

  // 起始屬性（§7.3）：AMATEUR 讀 effective_potential(16)，PRO 讀固定潛力（見上方說明）
  const attr = {};
  const attrBase = stage === 'PRO'
    ? (k) => potential[k]
    : (k) => potential[k] * ceilingCurve(lifecycle[k], AMATEUR_START_AGE);
  for (const k of ATTRS) {
    attr[k] = Math.min(100, Math.round(attrBase(k) * ratios[k]));
  }

  const state = {
    saveVersion: SAVE_VERSION,
    seed,                // 出生種子（字串）。決定天賦，不決定人生
    name,
    role,
    age: stage === 'PRO' ? START_AGE : AMATEUR_START_AGE,
    year: stage === 'PRO' ? START_YEAR : AMATEUR_START_YEAR,
    // 當下的月份（V4 §3.3）。存檔點固定在年初，所以它讀出來一定是 1；它存在是為了
    // 讓狀態列與面板有一個「現在走到哪」的來源，而不是靠 UI 自己數 beat
    month: 1,

    /*
     * DEMO 期程（§19，S21b）：DEMO 路線＝ PRO 起點，從 START_YEAR 起算三年
     * （36 個月）；跑滿沒觸發任何結局就以「DEMO 結束」比照退役結算。
     *
     * 業餘起點是完整生涯基線（13 站校準量在它身上），`demoEndYear` 為 null ＝
     * 不設上限——DEMO 是把生涯截短，不是把後面的系統砍掉（§19.4）。
     */
    demoEndYear: stage === 'PRO' ? DEMO_END_YEAR : null,
    demoEnded: false,        // 期滿收束（非退役）。結算畫面與傳記靠它分辨措辭

    // 生涯階段：AMATEUR（網咖盃賽）→ AM2（青訓次級）→ PRO
    stage,
    stageYear: stage === 'PRO' ? 0 : 1,
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
    unique: {},          // 獨有特質（§14.1）：不可合成、不當素材，只由生涯條件授予
    fusedAway: [],       // 被合成消耗掉的特質名稱（結算時劃線顯示）
    recentEvents: [],    // 最近出過的事件卡 id（反覆抽不重複的暫存）

    /*
     * 連續事件的記憶（V4 §12.2 增訂）。兩者都是「軌跡」不是「效果」——沒有數值
     * 作用，只被條件式讀（`['eventFlag', 鍵]`／`['eventCount', 鍵, 比較子, 值]`）：
     *
     *   eventFlags   事件一點亮 → 事件二的 when 讀得到（跨月、跨賽季都記得）。
     *                一段連鎖走完由收尾卡熄掉，不留長期亮著的旗標
     *   eventCounts  卡 id → 出場次數（引擎自動記）＋卡片宣告的具名計數，
     *                同一個命名空間（具名計數不得與卡 id 撞名，測試在守）
     *
     * 與 `recentEvents` 的差別：那是抽卡的防重暫存（只留最近 6 張），這兩格是
     * 生涯級的事實，永遠不滾動。
     */
    eventFlags: {},
    eventCounts: {},

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
    marketQuiet: false,        // 最近一次自由市場有無報價（§18.2 無聲告別／最後一搏的判準）

    lastDelta: 0,
    lastStat: null,
    pendingPoints: 0,

    /*
     * 失誤的可見紀錄（V4 §9.3）。兩格分開存是整個「因隱藏、果可見」循環的資料面：
     * 心理看不到，但「同一個人在例行賽死幾次、在季後賽與國際賽死幾次」看得到，
     * 玩家從這個落差反推自己的抗壓。高抗壓的人兩格幾乎持平，低抗壓的人會拉開。
     */
    deathLog: { regular: { G: 0, D: 0 }, pressure: { G: 0, D: 0 } },

    // 對手抽選計數（S29，§23.4）：實體化率的讀點。季後賽與國際賽分開量
    // （MSI／世界賽門檻 ≥ 90%、季後賽 ≥ 80%，量測不硬紅）
    oppFaces: { playoff: { draws: 0, materialized: 0 }, intl: { draws: 0, materialized: 0 } },

    // Bo5 高壓檢定計數（S36，§24.4.2）：四常數的重驗讀點——檢定局觸發率與雙邊
    // 衰減總量（除以 fired 得均值）。§24.4.2 寫「兩邊各衰 ~0.2 點互相抵消」是
    // S31 的估算，實測要有地方對帳；缺這欄不報錯（`runSeries` 判 null 才記）
    deciderLog: { bo5: 0, fired: 0, mineDecay: 0, oppDecay: 0 },

    // 賽區背景模擬資料池（S32，§24.2.2）：逐年 → 賽段積分榜／國際賽微觀數據。
    // 只存匯總、只存當年＋前一年（`engine/leagueSim.js` 逐月寫入時順手清舊年）
    leaguePool: {},

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

    discStreak: 0,
    singleYears: 0,
    romance: false,
    lastIntlYear: null,
    intlAppearances: 0,
    worldsWins: 0,
    worldsFinals: 0,
    msiWins: 0,
    msiPodiums: 0,

    /*
     * 生涯軌跡帳本（V4 §14.3／§15.5，S17a）。與既有的總數欄位分開：
     * 總數回答「拿了幾個」，帳本回答「怎麼走到這裡的」。§14.3 五條 route 路線
     * 的觸發條件有四格讀這裡，§15.5 傳記也只從這裡拼接事實。
     */
    intlRecord: { W: 0, L: 0 },   // 國際賽的局勝負（MSI ＋ 世界賽，小組循環與 BO5 系列都算）
    teamHistory: [],              // 職業效力紀錄 [{team, league, fromYear, toYear, firstSeasonRating, teamAvgRating}]
    titleHistory: [],             // 冠軍登記表（S20g，§16.2）：每年世界賽的冠軍，
                                  // 玩家與 NPC 同一張表 [{year, event, finish, team, region, isPlayer}]
    disbandCrises: 0,             // 生涯累計的降級危機／重建期次數（單季最多加 1）
    awards: 0,                    // 個人獎項數（MVP／最佳新人／單殺王／全明星）
    milestones: [],               // [{year, kind, text}] 給 §15.5 拼接用的事實流

    /*
     * 生涯任務（V4 §12.3，S17b）。狀態機住 engine/quests.js，這裡只存：
     * active 是進行中（開卡年／月、期限年），done 是已結算（達成／失敗＋原因），
     * log 是素材消耗帳（時間點＋來源——v4.2 失敗通知與 §15.5 傳記要回答
     * 「哪張卡吃掉哪個素材、什麼時候」）。
     */
    quests: { active: [], done: [], log: [] },
    labels: [],                   // 生涯標籤：任務失敗降階或 route 達成的產物。
                                  // 沒有 effects、不進合成樹、不吃 modifiers——只是
                                  // 給 §15.5 傳記與結算畫面讀的字串（§12.3）

    peakRating: 0,
    proYears: 0,

    done: false,
    retireReason: '',
  };

  /*
   * PRO 起點的出道簽約（S20d，§19 DEMO）：新人已經站在職業隊裡，所以跳過試訓
   * 門檻判定（那是業餘路線的窄門），直接用出道亂數流挑一支主場賽區的隊伍簽下。
   * `${seed}:debut` 與出生流／人生流分開命名空間——簽到哪支隊不屬於天賦，也不
   * 消耗人生流的取數順序。`signContract` 順帶滾出隊友／教練、開 teamHistory 第一筆
   * 與「出道於 X」的里程碑（§15.5 傳記讀它）。
   */
  if (stage === 'PRO') {
    const debut = new Rng(`${seed}:debut`);
    const pool = teamsOf(state, 'HOME');
    signContract(state, debut, { team: debut.pick(pool), league: 'HOME', years: 2, mult: 1 });
  }

  return state;
}
