/**
 * 連續事件：觸發旗標與觸發計數（V4 §12.2 增訂）。
 *
 * 這組測試守的是「事件一觸發後、條件滿足才觸發事件二」這條路真的走得通，而且
 * **走得完**——連鎖最容易壞的地方不是它不來，是它不走：條件卡不受防重機制擋，
 * 旗標亮著的期間那張卡月月都是事件一。所以除了機制本身，這裡還把三條不變式釘死：
 *
 *   1. 正向讀旗標的卡，一定有卡熄得掉那個旗標（不然它霸佔往後每一個月）
 *   2. 被讀的旗標一定有卡點得亮（不然是永遠不會來的死卡）
 *   3. 具名計數不得與卡 id 撞名（同一個命名空間，撞名會互相灌水而且靜默）
 *
 * 真池斷言與假卡斷言都有：假卡控得住分支，真池證明機制沒有空轉（S20f 的教訓——
 * 條件路徑全綠、生產全死，因為測試只用假卡）。
 */
import { createState } from '../../src/engine/state.js';
import { Rng } from '../../src/core/rng.js';
import { EVENT_CARDS } from '../../src/data/events.js';
import {
  ANNUAL_FLAG_PREFIX, applyEventMarks, bumpEventCounters, clearEventFlags, eventTrigger,
  rearmAnnualEventFlags, recordEventTrigger, setEventFlags,
} from '../../src/engine/eventTrigger.js';
import { eventCountOf, eventFlagOn } from '../../src/engine/ledger.js';
import { evalCond } from '../../src/engine/conditions.js';
import { drawEvent } from '../../src/phases/shared.js';
import { driveUntil } from '../lib/harness.mjs';
import { condFlagReads, validateEventCard } from '../../tools/schema.js';

export const name = '連續事件：觸發旗標與計數（§12.2）';

/** 假 rng：`pick` 一律回傳第一個，`chance` 回傳給定的值 */
const fakeRng = (chance) => ({ pick: (arr) => arr[0], chance: () => chance });

/** 測試用事件卡（形狀與 eventTrigger 測試同一套） */
function card(id, opts = {}) {
  return {
    id, name: id, kind: 'normal',
    pool: opts.pool ?? ['performance'], sub: opts.sub ?? 'training',
    slot: opts.slot ?? ['regular'],
    excl: opts.excl ?? `solo_${id}`,
    prompt: opts.prompt ?? `${id} 的處境`,
    ...(opts.when ? { when: opts.when } : {}),
    ...(opts.priority != null ? { priority: opts.priority } : {}),
    options: opts.options ?? [{ id: 'a', label: 'A', odds: 50 }],
    good: opts.good ?? { text: 'ok' }, bad: opts.bad ?? { text: 'bad' },
  };
}

const fresh = (extra = {}) => Object.assign(
  createState({ name: 'CH', role: 'MID', seed: 'chain' }), { stage: 'PRO' }, extra,
);

/** 把 drawEvent 跑完，choice 一律選 `pickId`（沒指定就選第一個） */
function playCard(state, ev, { pickId = null, seed = 'chain:play' } = {}) {
  const flow = drawEvent({ state, rng: new Rng(seed) }, ev);
  let input;
  for (;;) {
    const step = flow.next(input);
    input = undefined;
    if (step.done) return;
    if (step.value.type === 'choice') {
      input = pickId ?? step.value.options[0].id;
    }
  }
}

/** 一張卡所有結果與選項寫的某個連鎖欄位（旗標／計數） */
function marksOf(c, field) {
  const keys = [];
  const collect = (o) => { for (const k of (o && o[field]) || []) keys.push(k); };
  collect(c.good); collect(c.bad);
  for (const o of c.options || []) {
    collect(o);
    if (o.on) { collect(o.on.good); collect(o.on.bad); }
  }
  return keys;
}

export async function run({ check, log }) {
  /* ---- 寫入端：旗標點亮／熄滅、計數累加 ---- */
  {
    const s = fresh();
    check('新角色帶空的旗標與計數', !!s.eventFlags && !!s.eventCounts);

    setEventFlags(s, ['a', 'b']);
    check('setEventFlags 點亮', eventFlagOn(s, 'a') && eventFlagOn(s, 'b'));
    setEventFlags(s, ['a']);
    check('重複點亮是 no-op（旗標是布林不是計數）', s.eventFlags.a === true);
    clearEventFlags(s, ['a']);
    check('clearEventFlags 熄滅', !eventFlagOn(s, 'a') && eventFlagOn(s, 'b'));
    check('熄滅是刪鍵，不留死鍵', !('a' in s.eventFlags));
    clearEventFlags(s, ['nonexistent']);
    check('熄滅不存在的鍵不炸', true);

    bumpEventCounters(s, ['gamble', 'gamble']);
    check('bumpEventCounters 同鍵兩次 = 2', eventCountOf(s, 'gamble') === 2, eventCountOf(s, 'gamble'));
    check('沒記過的鍵回 0', eventCountOf(s, 'never') === 0);

    recordEventTrigger(s, { id: 'solo_queue' });
    recordEventTrigger(s, { id: 'solo_queue' });
    check('recordEventTrigger 以卡 id 為鍵累加', eventCountOf(s, 'solo_queue') === 2);
  }

  /* ---- applyEventMarks：先熄後亮（收尾卡同時關上一段、開下一段） ---- */
  {
    const s = fresh();
    setEventFlags(s, ['stage1']);
    applyEventMarks(s,
      { clearFlags: ['stage1'], counters: ['talks'] },   // 結果寫的
      { setFlags: ['stage2'] });                          // 選項寫的
    check('結果與選項的旗標一起結算', !eventFlagOn(s, 'stage1') && eventFlagOn(s, 'stage2'));
    check('計數同時累加', eventCountOf(s, 'talks') === 1);

    // 同一批裡同鍵兩邊都寫 → 以「亮」為準（收尾卡才不會把剛點的旗標熄掉）
    const s2 = fresh();
    applyEventMarks(s2, { clearFlags: ['k'] }, { setFlags: ['k'] });
    check('同批同鍵：亮贏熄', eventFlagOn(s2, 'k'));
  }

  /* ---- 年度閂：前綴 annual_ 的旗標年初重新上膛 ---- */
  {
    const s = fresh();
    setEventFlags(s, ['annual_slump_done', 'career_once_done', 'chain_stage1']);
    bumpEventCounters(s, ['solo_queue']);
    const cleared = rearmAnnualEventFlags(s);
    check('年度旗標被清掉', !eventFlagOn(s, 'annual_slump_done'));
    check('一次生涯一次的閂不受影響', eventFlagOn(s, 'career_once_done'));
    check('連鎖中段的旗標不受影響（跨年的連鎖不會被打斷）', eventFlagOn(s, 'chain_stage1'));
    check('回傳被清掉的鍵（呼叫端要記 log）', cleared.join() === 'annual_slump_done', cleared.join());
    check('計數不受年度重置影響（生涯累計的軌跡）', eventCountOf(s, 'solo_queue') === 1);

    const legacy = fresh();
    delete legacy.eventFlags;
    check('缺欄位的舊存檔重新上膛不炸', rearmAnnualEventFlags(legacy).length === 0);

    // 前綴是唯一的開關：`ANNUAL_FLAG_PREFIX` 變了，資料端的鍵也要跟著變
    check('真池的年度閂都用得到這個前綴',
      EVENT_CARDS.some((c) => marksOf(c, 'setFlags').some((k) => k.startsWith(ANNUAL_FLAG_PREFIX))));
  }

  /* ---- 年度閂接進年界：一年一次，不是一輩子一次 ---- */
  {
    // 走真的 careerFlow：守的是 `engine/game.js` 的 `yearOpen` 有沒有真的呼叫重新
    // 上膛。用探針旗標而不是 slump 本人——slump 要不要出得看那一局的抗壓走勢，
    // 拿它當斷言就是拿隨機當斷言
    const s = createState({ name: 'YR', role: 'MID', seed: 'chain:year', stage: 'AMATEUR' });
    setEventFlags(s, ['annual_probe_done', 'career_probe_done']);
    const startYear = s.year;
    driveUntil(s, new Rng('chain:year'), {
      stop: (st) => st.year > startYear,
      answer: (beat) => beat.options[0].id,
    });
    check('跨年後年度旗標已重新上膛（年界真的有接）', !eventFlagOn(s, 'annual_probe_done'));
    check('跨年後一次生涯一次的閂還在', eventFlagOn(s, 'career_probe_done'));
  }

  /* ---- 年度閂的效果：同年至多一次，跨年可以再來 ---- */
  {
    const s = fresh({ age: 22 });
    s.mental.comp = 30;                       // 低抗壓＝季中低潮的條件恆真
    const slump = EVENT_CARDS.find((c) => c.id === 'slump');
    const perYear = [];
    for (let year = 0; year < 3; year++) {
      rearmAnnualEventFlags(s);               // 年初（engine/game.js 的 yearOpen）
      let hits = 0;
      for (let month = 2; month <= 9; month++) {
        if (!evalCond(s, slump.when)) continue;
        playCard(s, slump, { pickId: 'reset', seed: `chain:slump:${year}:${month}` });
        hits++;
      }
      perYear.push(hits);
    }
    check('年度閂：同一年最多出一次', perYear.every((n) => n <= 1), perYear.join('／'));
    check('年度閂：每一年都上得了膛（不是一輩子一次）', perYear.every((n) => n === 1), perYear.join('／'));
    check('逐卡計數跨年累加（門檻讀得到整段生涯）', eventCountOf(s, 'slump') === 3, eventCountOf(s, 'slump'));
  }

  /* ---- 條件語言：eventFlag／eventCount 兩個節點 ---- */
  {
    const s = fresh();
    setEventFlags(s, ['poached']);
    bumpEventCounters(s, ['talks', 'talks', 'talks']);
    check('eventFlag 命中', evalCond(s, ['eventFlag', 'poached']));
    check('eventFlag 未點亮 → 假', !evalCond(s, ['eventFlag', 'nope']));
    check('not eventFlag（一次性門檻的閂）', evalCond(s, ['not', ['eventFlag', 'nope']]));
    check('eventCount gte 命中', evalCond(s, ['eventCount', 'talks', 'gte', 3]));
    check('eventCount 門檻沒到 → 假', !evalCond(s, ['eventCount', 'talks', 'gte', 4]));
    check('eventCount 沒記過的鍵當 0', evalCond(s, ['eventCount', 'never', 'eq', 0]));
    check('and 組合：旗標＋計數', evalCond(s,
      ['and', ['eventFlag', 'poached'], ['eventCount', 'talks', 'gte', 2]]));

    let threw = false;
    try { evalCond(s, ['eventCount', 'talks', 'frobnicate', 1]); } catch { threw = true; }
    check('未知比較子丟錯（不靜默）', threw);

    // 舊存檔（v23 以前）缺這兩欄：條件要能求值，不能炸
    const legacy = fresh();
    delete legacy.eventFlags;
    delete legacy.eventCounts;
    check('缺欄位的舊存檔：eventFlag 回假不炸', evalCond(legacy, ['eventFlag', 'x']) === false);
    check('缺欄位的舊存檔：eventCount 當 0 不炸', evalCond(legacy, ['eventCount', 'x', 'eq', 0]));

    // 求值仍是純函式（`conditions.js` 檔頭的硬約束）
    const before = JSON.stringify(s);
    evalCond(s, ['and', ['eventFlag', 'poached'], ['eventCount', 'talks', 'lt', 99]]);
    check('新節點求值無副作用', JSON.stringify(s) === before);
  }

  /* ---- 連鎖主線：事件一點亮 → 事件二才輪得到 → 熄掉就不再來 ---- */
  {
    const s = fresh();
    const stage1 = card('stage1', {
      options: [{ id: 'go', label: 'GO', odds: 100, setFlags: ['chain_on'] }],
    });
    const stage2 = card('stage2', { when: ['eventFlag', 'chain_on'], priority: 5 });
    const filler = card('filler');
    const pool = [stage1, stage2, filler];

    const before = eventTrigger(s, { month: 5 }, pool, fakeRng(false));
    check('旗標未亮 → 事件二不進候選', before[0].id !== 'stage2', before[0].id);

    playCard(s, stage1, { pickId: 'go' });
    check('事件一結算後旗標亮了', eventFlagOn(s, 'chain_on'));
    check('事件一同時記了一次逐卡計數', eventCountOf(s, 'stage1') === 1);

    const after = eventTrigger(s, { month: 5 }, pool, fakeRng(false));
    check('旗標亮著 → 事件二成為事件一（條件優先）', after[0].id === 'stage2', after[0].id);

    clearEventFlags(s, ['chain_on']);
    const done = eventTrigger(s, { month: 5 }, pool, fakeRng(false));
    check('旗標熄掉 → 事件二退出候選', done[0].id !== 'stage2', done[0].id);
  }

  /* ---- 計數門檻：觸發 N 次後才開的卡 ---- */
  {
    const s = fresh();
    const base = card('base');
    const gated = card('gated', { when: ['eventCount', 'base', 'gte', 3], priority: 5 });
    const pool = [base, gated];

    for (let i = 0; i < 2; i++) playCard(s, base);
    const notYet = eventTrigger(s, { month: 5 }, pool, fakeRng(false));
    check('計數未達門檻 → 門檻卡不進候選', notYet[0].id === 'base', notYet[0].id);

    playCard(s, base);
    check('第三次觸發後計數 = 3', eventCountOf(s, 'base') === 3);
    const hit = eventTrigger(s, { month: 5 }, pool, fakeRng(false));
    check('計數達門檻 → 門檻卡出場', hit[0].id === 'gated', hit[0].id);
  }

  /* ---- 連鎖的卡也數得到（chain 接演不經過抽卡） ---- */
  {
    const s = fresh();
    const next = card('chained');
    const head = card('head', {
      options: [{ id: 'a', label: 'A', odds: 100 }],
      good: { text: 'ok', chain: ['chained'] },
    });
    // `chain` 由 EVENT_CARDS 查 id，假卡查不到 → 直接演一次連鎖卡本身，
    // 驗的是「呈現端記數」這件事：抽卡端記的話這一次會漏掉
    playCard(s, head);
    playCard(s, next);
    check('連鎖接演的卡也記逐卡計數', eventCountOf(s, 'chained') === 1);
  }

  /* ---- 安全牌（traits:false）不擋劇情推進 ---- */
  {
    const s = fresh();
    const safe = card('safe', {
      options: [{ id: 'safe', label: '安全牌', odds: 100, traits: false, setFlags: ['seen'], counters: ['seen_count'] }],
    });
    playCard(s, safe, { pickId: 'safe' });
    check('安全牌照樣點亮旗標（擋的是極端，不是劇情）', eventFlagOn(s, 'seen'));
    check('安全牌照樣推進計數', eventCountOf(s, 'seen_count') === 1);
  }

  /* ---- 真池：挖角三部曲逐段走得完（機制不空轉） ---- */
  {
    const s = fresh({ age: 22 });
    const rumor = EVENT_CARDS.find((c) => c.id === 'transfer_rumor');
    const meeting = EVENT_CARDS.find((c) => c.id === 'tampering_meeting');
    const leak = EVENT_CARDS.find((c) => c.id === 'tampering_leak');
    check('真池有挖角三部曲的三張卡', !!rumor && !!meeting && !!leak);

    // 第一段：探風 → 點亮接觸旗標、談話計數 +1
    playCard(s, rumor, { pickId: 'leave' });
    check('第一段：探風點亮 tampering_contact', eventFlagOn(s, 'tampering_contact'));
    const m1 = eventTrigger(s, { month: 12 }, EVENT_CARDS, fakeRng(false));
    check('第一段之後，密會成為事件一', m1[0].id === 'tampering_meeting', m1[0].id);

    // 第二段：簽意向書 → 熄接觸旗標、點亮密約旗標
    playCard(s, meeting, { pickId: 'sign' });
    check('第二段：接觸旗標熄了（不霸佔往後每個月）', !eventFlagOn(s, 'tampering_contact'));
    check('第二段：密約旗標亮了', eventFlagOn(s, 'tampering_deal'));
    check('第二段：談話計數累到 2', eventCountOf(s, 'poach_talk') === 2, eventCountOf(s, 'poach_talk'));
    const m2 = eventTrigger(s, { month: 12 }, EVENT_CARDS, fakeRng(false));
    check('第三段（旗標＋計數都滿足）：曝光成為事件一', m2[0].id === 'tampering_leak', m2[0].id);

    // 第三段：收尾熄掉密約旗標，連鎖收束
    playCard(s, leak, { pickId: 'team' });
    check('第三段收尾：密約旗標熄了', !eventFlagOn(s, 'tampering_deal'));
    const after = eventTrigger(s, { month: 12 }, EVENT_CARDS, fakeRng(false));
    check('連鎖收束後不再霸佔事件一',
      !['tampering_meeting', 'tampering_leak'].includes(after[0].id), after[0].id);

    // 計數門檻擋得住：只談過一次（<2）時，曝光卡不該進候選
    const single = fresh({ age: 22 });
    setEventFlags(single, ['tampering_deal']);
    bumpEventCounters(single, ['poach_talk']);
    check('計數門檻擋得住：只談過一次不曝光', !evalCond(single, leak.when));
  }

  /* ---- 真池：一次性門檻卡（排位傳說）出過就熄火 ---- */
  {
    const s = fresh({ age: 20 });
    const soloq = EVENT_CARDS.find((c) => c.id === 'solo_queue');
    const legend = EVENT_CARDS.find((c) => c.id === 'soloq_legend');
    check('真池有排位傳說（計數門檻卡）', !!legend);
    check('4 次還不到門檻', !evalCond(Object.assign(fresh(), { eventCounts: { solo_queue: 4 } }), legend.when));

    for (let i = 0; i < 5; i++) playCard(s, soloq, { pickId: 'balanced' });
    check('排位衝分出過 5 次', eventCountOf(s, 'solo_queue') === 5, eventCountOf(s, 'solo_queue'));
    const hit = eventTrigger(s, { month: 5 }, EVENT_CARDS, fakeRng(false));
    check('第 5 次之後排位傳說出場', hit[0].id === 'soloq_legend', hit[0].id);

    playCard(s, legend, { pickId: 'keep' });
    check('出過一次就上閂（soloq_legend_done）', eventFlagOn(s, 'soloq_legend_done'));
    check('上閂後條件不再命中（不會月月霸佔）', !evalCond(s, legend.when));
  }

  /* ---- 真池不變式：連鎖寫得完整（死卡／霸佔／撞名三種壞法都擋掉） ---- */
  {
    const setKeys = new Set(EVENT_CARDS.flatMap((c) => marksOf(c, 'setFlags')));
    const clearKeys = new Set(EVENT_CARDS.flatMap((c) => marksOf(c, 'clearFlags')));
    const counterKeys = new Set(EVENT_CARDS.flatMap((c) => marksOf(c, 'counters')));
    const cardIds = new Set(EVENT_CARDS.map((c) => c.id));

    const reads = EVENT_CARDS.map((c) => condFlagReads(c.when));
    const positive = [...new Set(reads.flatMap((r) => r.positive))];
    const negative = [...new Set(reads.flatMap((r) => r.negative))];

    const noSetter = [...positive, ...negative].filter((k) => !setKeys.has(k));
    check('被讀的旗標都有卡點得亮（無死卡）', noSetter.length === 0, noSetter.join('／'));

    // 正向讀的旗標必須熄得掉：條件卡不受防重擋，亮著就月月霸佔事件一
    const noClearer = positive.filter((k) => !clearKeys.has(k));
    check('正向讀的旗標都有卡熄得掉（不霸佔事件一）', noClearer.length === 0, noClearer.join('／'));

    const deadWrites = [...setKeys].filter((k) => !positive.includes(k) && !negative.includes(k));
    check('點亮的旗標都有條件讀得到（無死寫）', deadWrites.length === 0, deadWrites.join('／'));

    const orphanClears = [...clearKeys].filter((k) => !setKeys.has(k));
    check('熄滅的旗標都有卡點得亮', orphanClears.length === 0, orphanClears.join('／'));

    // 具名計數與卡 id 共用命名空間（條件式只有一種計數節點），撞名會互相灌水
    const collide = [...counterKeys].filter((k) => cardIds.has(k));
    check('具名計數不與卡 id 撞名', collide.length === 0, collide.join('／'));

    // 讀得到的計數鍵一定存在（不是卡 id 也沒有卡宣告 ＝ 永遠 0）
    const readCounts = new Set();
    const walkCounts = (n) => {
      if (!Array.isArray(n)) return;
      if (n[0] === 'eventCount') { readCounts.add(n[1]); return; }
      for (const child of n.slice(1)) walkCounts(child);
    };
    for (const c of EVENT_CARDS) walkCounts(c.when);
    const phantom = [...readCounts].filter((k) => !cardIds.has(k) && !counterKeys.has(k));
    check('被讀的計數鍵都數得到（不是永遠 0）', phantom.length === 0, phantom.join('／'));

    /* 特質條件卡一定要上閂。`['has', 階, 鍵]` 一旦成立就**永遠**成立（特質不會失去），
     * 而條件卡不受防重擋——沒有閂的卡從玩家拿到那個特質的月份起月月都是事件一
     * （上閂前實測：`clip_meme` 144/240，帶三特質的局 `enemy_taunt` 199/240）。
     * 閂＝`when` 裡有一個反向旗標讀（`not eventFlag`），選項負責點亮它。 */
    const hasNode = (n) => (Array.isArray(n)
      ? (n[0] === 'has' || n.slice(1).some(hasNode))
      : false);
    const unlatched = EVENT_CARDS
      .filter((c) => hasNode(c.when) && !condFlagReads(c.when).negative.length)
      .map((c) => c.id);
    check('特質條件卡都上了閂（不會月月霸佔事件一）', unlatched.length === 0, unlatched.join('／'));

    // 編輯器的單卡驗證跟引擎同一套規則：真池每一張都要過
    const failed = [];
    for (const c of EVENT_CARDS) {
      const errors = [];
      validateEventCard(c, errors, EVENT_CARDS);
      if (errors.length) failed.push(`${c.id}：${errors[0]}`);
    }
    check('真池每張卡都通得過編輯器驗證', failed.length === 0, failed.slice(0, 3).join('｜'));

    log(`連鎖規模：旗標 ${setKeys.size} 個（正向讀 ${positive.length}／閂 ${negative.length}）、`
      + `具名計數 ${counterKeys.size} 個、連鎖條件卡 ${reads.filter((r) => r.positive.length || r.negative.length).length} 張`);
  }

  /* ---- 冒煙：連鎖不會讓某張卡霸佔整段生涯 ---- */
  {
    const s = fresh({ age: 21 });
    const rng = new Rng('chain:smoke');
    const seen = new Map();
    for (let i = 0; i < 240; i++) {
      const picks = eventTrigger(s, { month: (i % 12) + 1 }, EVENT_CARDS, rng);
      for (const ev of picks) {
        playCard(s, ev, { seed: `chain:smoke:${i}` });
        seen.set(ev.id, (seen.get(ev.id) ?? 0) + 1);
      }
    }
    const [topId, topCount] = [...seen.entries()].sort((a, b) => b[1] - a[1])[0];
    // 連鎖卡自己收束得掉：每一張出場都遠低於月份數（旗標熄得掉、閂上得了）
    const CHAIN_CARDS = ['tampering_meeting', 'tampering_leak', 'soloq_legend'];
    const hogging = CHAIN_CARDS.filter((id) => (seen.get(id) ?? 0) > 24);
    check('連鎖卡收束得掉（各自 ≤ 10% 的月份）', hogging.length === 0,
      hogging.map((id) => `${id} ${seen.get(id)}/240`).join('／'));
    /* 條件卡全數上閂之後，出卡分布是平的：最常出的卡也只佔 6%（上閂前
     * `clip_meme` 144/240、`slump` 129/240、帶三特質的局 `enemy_taunt` 199/240）。
     * 門檻放在 15% 而不是貼著實測值——它守的是「沒有卡霸佔」這件事，不是某個種子
     * 的確切數字，內容增減不該讓它假紅。 */
    check('沒有任何一張卡霸佔月份（≤ 15%）', topCount <= 36, `${topId} ${topCount}/240`);
    check('逐卡計數與實際出場次數一致',
      [...seen.entries()].every(([id, n]) => eventCountOf(s, id) === n),
      [...seen.entries()].filter(([id, n]) => eventCountOf(s, id) !== n).map(([id]) => id).join('／'));
    log(`連鎖冒煙：240 個月出 ${seen.size} 種卡，最常出的是 ${topId}（${topCount} 次）`);
  }
}
