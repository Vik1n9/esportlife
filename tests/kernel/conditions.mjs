/**
 * 條件式求值器（V4 §12.3，S17b）。
 *
 * 這組測試存在的理由就是防止有人把觸發條件寫回固定欄位（`needEpic`／`needRare`
 * 那種）：三種形狀——「一史詩＋一稀有」「兩個稀有」「賽事成績＋一個稀有」——
 * 都必須通得過，形狀被鎖死的話第二與第三個會紅。
 */
import { createState } from '../../src/engine/state.js';
import { recordIntlFinish } from '../../src/phases/shared.js';
import {
  COND_KINDS, collectMaterials, consumeMaterial, evalCond, materialHeld, QUERIES,
} from '../../src/engine/conditions.js';
import { COND_NODES, PREDICATES, ACTIVITY_ALL, validateCond } from '../../tools/schema.js';

export const name = '條件式求值器（S17b）';

const fresh = (extra = {}) => Object.assign(
  createState({ name: 'C', role: 'MID', seed: 'cond' }), extra,
);

export async function run({ check }) {
  /* ---- 布林組合與比較子 ---- */
  {
    const s = fresh({ age: 30, splitTitles: 3, awards: 2, role: 'MID' });
    check('and 全部命中才真', evalCond(s, ['and', ['stat', 'age', 'gte', 30], ['stat', 'splitTitles', 'gte', 3]]));
    check('and 一項沒過就假', !evalCond(s, ['and', ['stat', 'age', 'gte', 31], ['stat', 'splitTitles', 'gte', 3]]));
    check('or 任一命中即真', evalCond(s, ['or', ['stat', 'age', 'gte', 99], ['stat', 'splitTitles', 'gte', 3]]));
    check('not 反轉', evalCond(s, ['not', ['stat', 'age', 'gte', 99]]));
    check('比較子：lt／lte／eq／gte／gt／ne 全數可用', Object.entries({
      lt: [3, 4], lte: [3, 4], eq: [3, 3], gte: [3, 3], gt: [3, 2], ne: [3, 2],
    }).every(([op, [a, b]]) => evalCond(Object.assign({}, s, { awards: a }), ['stat', 'awards', op, b])), '');
    check('null 節點＝永遠真', evalCond(s, true));
  }

  /* ---- 特質持有謂詞：has／hasCount ---- */
  {
    const s = fresh();
    s.epic = { godhand: true, ultstage: true };
    s.rare = { star: true };
    check('has 命中', evalCond(s, ['has', 'epic', 'godhand']));
    check('has 未持有', !evalCond(s, ['has', 'epic', 'soloking']));
    check('has 跨階（rare 不跟 epic 混）', !evalCond(s, ['has', 'rare', 'godhand']));
    check('hasCount 數目夠', evalCond(s, ['hasCount', 'epic', 2]));
    check('hasCount 數目不足', !evalCond(s, ['hasCount', 'epic', 3]));
  }

  /* ---- 三種形狀都通得過（防寫回固定欄位的守門員） ---- */
  {
    const s = fresh();
    s.epic = { godhand: true };
    s.rare = { star: true, machine: true };
    s.splitTitles = 2;
    // 過寫入端而不是手抄里程碑：名次鍵是跨檔的，手抄就守不住（S20c／N17）
    s.milestones = [];
    recordIntlFinish(s, 'worlds', 'semi');

    const shape1 = ['and', ['has', 'epic', 'godhand'], ['has', 'rare', 'star']];
    const shape2 = ['and', ['hasCount', 'rare', 2], ['stat', 'splitTitles', 'gte', 1]];
    const shape3 = ['and', ['stat', 'worldsBest', 'lte', 4], ['has', 'rare', 'machine']];
    check('形狀 1：一史詩＋一稀有', evalCond(s, shape1));
    check('形狀 2：兩個稀有（hasCount）', evalCond(s, shape2));
    check('形狀 3：賽事成績＋一個稀有', evalCond(s, shape3));

    s.rare = { star: true };
    check('形狀 2：少一個稀有就不過', !evalCond(s, shape2));
    check('形狀 3：成績沒到就不過', !evalCond(s, ['and', ['stat', 'worldsBest', 'lte', 2], ['has', 'rare', 'machine']]));
  }

  /* ---- 純函式性：同一顆 state 求值兩次結果相同、state 不被改動 ---- */
  {
    const s = fresh({ age: 33 });
    const before = JSON.stringify(s);
    const node = ['and', ['stat', 'age', 'gte', 30], ['or', ['has', 'epic', 'godhand'], ['stat', 'awards', 'eq', 0]]];
    const r1 = evalCond(s, node);
    const r2 = evalCond(s, node);
    check('重複求值結果一致（純函式）', r1 === r2);
    check('求值沒有副作用（state 原封不動）', JSON.stringify(s) === before);
  }

  /* ---- 心理六維可當條件（v4.3 第三條約束廢止） ---- */
  {
    const s = fresh({ mental: { comp: 35 } });
    check('心理謂詞：comp 跌破某值', evalCond(s, ['stat', 'comp', 'lt', 40]));
    check('心理謂詞：comp 沒跌破', !evalCond(s, ['stat', 'comp', 'gte', 40]));
  }

  /* ---- intlGames 謂詞（S35，§24.4.4「國際賽老將」）：讀帳本查詢層 ---- */
  {
    const s = fresh();
    s.intlRecord = { W: 31, L: 19 };   // 過寫入面的帳本形狀（recordIntlSeries 以局入帳）
    check('intlGames＝intlRecord 的 W＋L', evalCond(s, ['stat', 'intlGames', 'gte', 50])
      && evalCond(s, ['stat', 'intlGames', 'eq', 50]));
    check('intlGames 不足不過門檻', !evalCond(s, ['stat', 'intlGames', 'gte', 51]));
  }

  /* ---- 素材收集（§14.1「被條件式讀到的素材」） ---- */
  {
    const s = fresh();
    s.epic = { godhand: true, ultstage: true, soloking: true };
    s.rare = { star: true, machine: true };

    const mixed = ['and', ['has', 'epic', 'godhand'], ['hasCount', 'rare', 2], ['not', ['has', 'epic', 'soloking']]];
    const mats = collectMaterials(mixed);
    check('collectMaterials 收正向 has 與 hasCount，不收 not has',
      mats.length === 2 && mats.some((m) => m.tier === 'epic' && m.key === 'godhand')
      && mats.some((m) => m.tier === 'rare' && m.count === 2), JSON.stringify(mats));

    check('materialHeld：指名鍵在', materialHeld(s, { tier: 'epic', key: 'godhand' }));
    check('materialHeld：數目夠', materialHeld(s, { tier: 'rare', count: 2 }));
    check('materialHeld：數目不足', !materialHeld(s, { tier: 'epic', count: 4 }));

    const eaten = consumeMaterial(s, { tier: 'rare', count: 2 });
    check('consumeMaterial 吃任意 n 個（hasCount 沒有指名鍵）', eaten.length === 2, JSON.stringify(eaten));
    check('hasCount 消耗後持有數下降', Object.values(s.rare).filter(Boolean).length === 0);
    const eaten2 = consumeMaterial(s, { tier: 'epic', key: 'godhand' });
    check('consumeMaterial 指名鍵吃那一個', eaten2.length === 1 && eaten2[0].key === 'godhand');
    check('指名鍵消耗後已不在身上', !s.epic.godhand);
  }

  /* ---- 未知節點要爆，不要靜默當真 ---- */
  {
    const s = fresh();
    let threw = false;
    try { evalCond(s, ['frobnicate', 1]); } catch { threw = true; }
    check('未知節點丟錯（不靜默）', threw);
    let threw2 = false;
    try { evalCond(s, ['stat', 'nonexistentQuery', 'gte', 1]); } catch { threw2 = true; }
    check('未知謂詞丟錯（不靜默）', threw2);
  }

  /* ---- 兩張註冊表鍵集合相同（S20g） ----
   *
   * `AGENTS.md` 條件語言規則：加謂詞＝同時加進 `conditions.js` 的 `QUERIES` 與
   * `tools/schema.js` 的 `PREDICATES`。少一邊，編輯器與引擎就脫節——`careerGames`／
   * `awardsThisYear`（S20c 加進 QUERIES）就曾經漏在 PREDICATES 外面，本站補回並鎖死。
   */
  {
    const q = Object.keys(QUERIES).sort();
    const p = [...PREDICATES].sort();
    const onlyInQueries = q.filter((k) => !p.includes(k));
    const onlyInPredicates = p.filter((k) => !q.includes(k));
    check('QUERIES 每一鍵都在 PREDICATES 內', onlyInQueries.length === 0, onlyInQueries.join('／'));
    check('PREDICATES 每一鍵都在 QUERIES 內', onlyInPredicates.length === 0, onlyInPredicates.join('／'));
  }

  /* ---- 節點型別也是兩張註冊表（§12.2 連續事件加了兩種節點） ----
   *
   * `COND_KINDS`（引擎）與 `tools/schema.js` 的 `COND_NODES`（編輯器積木的下拉）
   * 少一邊就脫節：編輯器畫得出引擎不認得的條件，或引擎認得的條件編輯器畫不出來。
   * 宣告的每一種節點還要真的求值得動——手抄一份清單只是把 bug 抄第二遍。
   */
  {
    const engineOnly = COND_KINDS.filter((k) => !COND_NODES.includes(k));
    const toolOnly = COND_NODES.filter((k) => !COND_KINDS.includes(k));
    check('COND_KINDS 每一種節點編輯器都畫得出來', engineOnly.length === 0, engineOnly.join('／'));
    check('編輯器的 COND_NODES 引擎都認得', toolOnly.length === 0, toolOnly.join('／'));

    const s = fresh();
    const SAMPLE = {
      and: ['and', true], or: ['or', true], not: ['not', false],
      has: ['has', 'common', 'grinder'], hasCount: ['hasCount', 'rare', 0],
      stat: ['stat', 'age', 'gte', 0],
      eventFlag: ['eventFlag', 'anything'],
      eventCount: ['eventCount', 'anything', 'gte', 0],
      lastAct: ['lastAct', 'soloq'],
      percentile: ['percentile', 'assist', 'gte', 90],
      leaguePct: ['leaguePct', 'kda', 'gte', 80],
    };
    const unevaluable = COND_KINDS.filter((k) => {
      try { evalCond(s, SAMPLE[k]); return false; } catch { return true; }
    });
    check('宣告的每一種節點都求值得動', unevaluable.length === 0, unevaluable.join('／'));
  }

  /* ---- lastAct 節點（S48，§12.1 隨機池傾向） ----
   *
   * 「上個月選了什麼訓練活動」當條件——卡片作者可以寫死劇情連鎖（例如只在打完
   * SOLO RANK 之後才命中的開台事件）。讀 `ledger.js` 的 `lastActivityOf` 查詢層，
   * 缺欄位（舊存檔沒寫過）恆 false。
   */
  {
    const s = fresh();
    check('lastAct：沒練過（缺欄位）恆 false', !evalCond(s, ['lastAct', 'soloq']));
    s.lastActivity = 'soloq';
    check('lastAct：命中', evalCond(s, ['lastAct', 'soloq']));
    check('lastAct：不同活動不命中', !evalCond(s, ['lastAct', 'rest']));
    check('lastAct：休息也算一種行動', evalCond(Object.assign(fresh(), { lastActivity: 'rest' }),
      ['lastAct', 'rest']));
    check('lastAct：六項選單活動編輯器都寫得出來（含 rest）',
      ACTIVITY_ALL.length === 6 && ACTIVITY_ALL.includes('rest'),
      ACTIVITY_ALL.join('／'));
    const errs = (node) => { const e = []; validateCond(node, e, 'x'); return e; };
    check('validateCond 認得 lastAct（合法活動）', errs(['lastAct', 'soloq']).length === 0,
      errs(['lastAct', 'soloq']).join('；'));
    check('validateCond 認得 lastAct 的 rest', errs(['lastAct', 'rest']).length === 0);
    check('validateCond 擋掉不存在的活動（heroes 已消失）',
      errs(['lastAct', 'heroes']).length > 0, errs(['lastAct', 'heroes']).join('；'));
    check('validateCond 擋掉多參數', errs(['lastAct', 'soloq', 'x']).length > 0);
  }

  /* ---- percentile 節點（S26，§14.3 百分位回歸） ----
   *
   * 門檻值讀生成器產出的 `data/npc/percentiles.js`（單一來源）——手抄一份數字
   * 只是把生成器的輸出抄第二遍。這裡驗的是「節點把玩家值拿來跟門檻比」的語意，
   * 不是門檻本身是多少。
   */
  {
    const { ASSIST_P90, PEAK_RATING_P50 } = await import('../../src/data/npc/percentiles.js');
    const s = fresh({ role: 'MID', peakRating: 70 });
    const midP90 = ASSIST_P90.MID.p90;
    s.stats = { HOME: { G: 100, A: Math.ceil(midP90 * 100) } };  // 略高於該位置 P90
    check('助攻 ≥ 同位置 P90（assistsPerGame 過門檻）',
      evalCond(s, ['percentile', 'assist', 'gte', 90]));
    s.stats = { HOME: { G: 100, A: 0 } };
    check('助攻未達 P90 不過',
      !evalCond(s, ['percentile', 'assist', 'gte', 90]));
    check('peakRating 高於歷史中位數不過',
      !evalCond(s, ['percentile', 'peakRating', 'lte', 50]));
    s.peakRating = PEAK_RATING_P50.p50;
    check('peakRating 恰為中位數通過',
      evalCond(s, ['percentile', 'peakRating', 'lte', 50]));
    // 未知指標要爆
    let threw = false;
    try { evalCond(s, ['percentile', 'bogus', 'gte', 90]); } catch { threw = true; }
    check('未知百分位指標丟錯（不靜默）', threw);
  }

  /* ---- leaguePct 節點（S34，§24.3.2）：讀當季模擬母體，與 percentile 物理隔離 ----
   *
   * 母體直接手搭 `state.leaguePool`（與 `tests/kernel/leagueSim.mjs`／`microStats.mjs`
   * 同款寫法），不跑真的月結算——這裡只驗「節點把玩家值拿來跟同位置母體比」的語意，
   * 不是母體怎麼生成的（那是 `engine/leagueSim.js`／`microStats.js` 的事）。
   */
  {
    const s = fresh({ role: 'MID' });
    s.month = 3;   // 落在 S1 賽段內（見 `data/formats/calendar.js` 展開）
    const splitKey = 'S1';

    const stats = { player: { role: 'MID', G: 10, K: 40, D: 10, A: 60, DPM: 5000, CSM: 80, VSPM: 15 } };
    for (let i = 0; i < 19; i++) {
      // 全部比玩家弱（KDA 更低），玩家應該是母體頂端
      stats[`npc-${i}`] = { role: 'MID', G: 10, K: 10, D: 20, A: 10, DPM: 2000, CSM: 60, VSPM: 10 };
    }
    s.leaguePool = { [s.year]: { splits: { [splitKey]: { standings: [], stats } }, intl: { stats: {} } } };

    check('母體 ≥20 時，KDA 全場最高 → 百分位 100（前 20% 內）',
      evalCond(s, ['leaguePct', 'kda', 'gte', 80]));
    check('DPM 全場最高同樣過門檻', evalCond(s, ['leaguePct', 'dpm', 'gte', 80]));

    // 母體不足 20（§23.5 精神）：判 false，不勉強切分
    const thin = { [s.year]: { splits: { [splitKey]: { standings: [], stats: { player: stats.player } } }, intl: { stats: {} } } };
    const sThin = fresh({ role: 'MID' });
    sThin.month = 3;
    sThin.leaguePool = thin;
    check('母體 < 20 時 leaguePct 判 false（樣本不足不勉強切分）',
      !evalCond(sThin, ['leaguePct', 'kda', 'gte', 1]));

    // 不在賽段內（例如轉會月）：查無當下賽段，同樣判 false
    const sOff = fresh({ role: 'MID' });
    sOff.month = 1;
    sOff.leaguePool = s.leaguePool;
    check('不在賽段內（查無當下賽段）leaguePct 判 false',
      !evalCond(sOff, ['leaguePct', 'kda', 'gte', 1]));

    // 未知指標要爆
    let threwLeague = false;
    try { evalCond(s, ['leaguePct', 'bogus', 'gte', 80]); } catch { threwLeague = true; }
    check('未知聯賽百分位指標丟錯（不靜默）', threwLeague);
  }

  /* ---- 上屆同賽事名次與衛冕者謂詞（S20g） ---- */
  {
    const s = fresh({ year: 2020 });
    check('沒打過世界賽 lastWorlds = 沒打過', evalCond(s, ['stat', 'lastWorlds', 'eq', 99]));
    s.milestones = [];
    recordIntlFinish(s, 'worlds', 'champion');
    check('上一屆世界賽奪冠 → lastWorlds = 1', evalCond(s, ['stat', 'lastWorlds', 'eq', 1]));
    check('不是衛冕者 → isReigningChampion = 0', evalCond(s, ['stat', 'isReigningChampion', 'eq', 0]));

    const defending = fresh({ year: 2021 });
    defending.titleHistory = [{ year: 2020, event: 'worlds', finish: 'champion', team: 'T1', region: 'KR', isPlayer: true }];
    check('玩家是上屆世界冠軍 → isReigningChampion = 1',
      evalCond(defending, ['stat', 'isReigningChampion', 'eq', 1]));
  }
}