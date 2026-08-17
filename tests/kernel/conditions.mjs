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
import { COND_NODES, PREDICATES } from '../../tools/schema.js';

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
    };
    const unevaluable = COND_KINDS.filter((k) => {
      try { evalCond(s, SAMPLE[k]); return false; } catch { return true; }
    });
    check('宣告的每一種節點都求值得動', unevaluable.length === 0, unevaluable.join('／'));
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