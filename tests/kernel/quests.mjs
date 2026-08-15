/**
 * 生涯任務狀態機（V4 §12.3，S17b）。
 *
 * 守的是引擎的判斷成本所在：開卡 → 達成、開卡 → 逾期、素材在達成時才消耗、
 * 同結算點按開卡時間排序（先開先吃）、素材失效即失敗（v4.2）、legend 的底線
 * 門檻（§14.2）在引擎層 AND、同一張卡生涯內最多觸發一次、退役收束。
 *
 * ⚠ 注意：觸發與達成在同一結算點都成立時，開卡當下就瞬間達成（引擎允許，卡的
 * 達成目標比觸發門檻高是卡表設計的責任）。所以這些測試的目標一律設成「開卡當下
 * 還沒達成、由測試在下一個結算點補上」，才量得到跨回合的狀態機。
 */
import { createState } from '../../src/engine/state.js';
import { recordIntlFinish } from '../../src/phases/shared.js';
import { LEGEND_BASELINE, settleQuests } from '../../src/engine/quests.js';

export const name = '生涯任務引擎（S17b）';

/** 測試用卡：route 走無底線門檻，測 legend 時另外給國際賽里程碑 */
function q(id, opts = {}) {
  return {
    id,
    type: opts.type ?? 'route',
    name: opts.name ?? id,
    text: '測試敘事',
    trigger: opts.trigger ?? ['has', 'epic', 'a'],
    goal: opts.goal ?? ['has', 'epic', 'b'],
    deadline: opts.deadline === undefined ? 2 : opts.deadline,
    result: opts.result ?? { tier: 'epic', key: 'out', label: 'LABEL' },
    failLabel: opts.failLabel ?? 'FAIL',
    goalText: '目標',
    materialText: null,
  };
}

const fresh = (extra = {}) => Object.assign(
  createState({ name: 'Q', role: 'MID', seed: 'quest' }),
  { year: 2020, month: 3 }, extra,
);

/**
 * 給一個 state 掛上「打過國際賽四強」的帳本事實（legend 底線門檻用）。
 * ⚠ 過寫入端（`recordIntlFinish`）而不是手抄一份里程碑——手抄就守不住跨檔的
 * 名次鍵（S20c／N17）。
 */
const withSemis = (s) => {
  const year = s.year;
  s.year = 2016;
  recordIntlFinish(s, 'worlds', 'semi');
  s.year = year;
  return s;
};

export async function run({ check }) {
  /* ---- 開卡 → 達成：素材在達成時才消耗 ---- */
  {
    const s = fresh();
    s.epic = { a: true, b: true };
    const cards = [q('x', { trigger: ['has', 'epic', 'a'], goal: ['has', 'epic', 'c'] })];
    const r1 = settleQuests(s, cards);
    check('觸發條件命中 → 開卡', r1.opened.length === 1 && s.quests.active.length === 1);
    check('開卡不消耗素材', s.epic.a === true);
    check('目標未達成不結算', r1.achieved.length === 0);

    s.epic.c = true;
    const r2 = settleQuests(s, cards);
    check('達成目標命中 → 結算達成', r2.achieved.length === 1);
    check('達成時才消耗素材（a 被吃掉、b 不是素材所以還在）', !s.epic.a && s.epic.b === true);
    check('達成結果掛進 done', s.quests.done.some((d) => d.id === 'x' && d.result === 'achieved'));
    check('達成後不再開卡', settleQuests(s, cards).opened.length === 0);

    const log = s.quests.log;
    check('素材消耗帳有記（時間點＋來源）', log.length === 1
      && log[0].year === 2020 && log[0].month === 3 && log[0].questId === 'x' && log[0].by === 'x'
      && log[0].tier === 'epic' && log[0].key === 'a', JSON.stringify(log));
  }

  /* ---- 開卡 → 逾期：永久失敗，素材保留，不再觸發 ---- */
  {
    const s = fresh();
    s.epic = { a: true, b: true };
    const cards = [q('late', { trigger: ['has', 'epic', 'a'], goal: ['has', 'epic', 'c'], deadline: 2 })];
    settleQuests(s, cards);   // 開卡（deadlineYear = 2020 + 2 - 1 = 2021）
    s.year = 2022;            // 超過 2021：開卡年＋下一年共兩季已用完
    const r = settleQuests(s, cards);
    check('期限到未達成 → 失敗', r.failed.length === 1 && r.failed[0].reason.kind === 'deadline');
    check('逾期失敗素材未被消耗', s.epic.a === true && s.epic.b === true);
    check('失敗也記 done', s.quests.done.some((d) => d.id === 'late' && d.result === 'failed'));
    check('同一張卡生涯內最多觸發一次（失敗後不再開）', settleQuests(s, cards).opened.length === 0);
  }

  /* ---- deadline = null：生涯結束前都還有機會 ---- */
  {
    const s = fresh({ year: 2030 });
    s.epic = { a: true };
    const cards = [q('forever', { trigger: ['has', 'epic', 'a'], goal: ['stat', 'age', 'gte', 99], deadline: null })];
    settleQuests(s, cards);
    s.year = 2050;
    const r = settleQuests(s, cards);
    check('生涯結束前：過了再久也不會逾期失敗', r.failed.length === 0 && r.achieved.length === 0);
    s.age = 99;
    check('目標達成一照常結算', settleQuests(s, cards).achieved.length === 1);
  }

  /* ---- 素材失效即失敗（v4.2）：先開先吃，後開的卡被指名 ---- */
  {
    const s = fresh();
    s.epic = { a: true };
    const cards = [
      q('first', { trigger: ['has', 'epic', 'a'], goal: ['has', 'epic', 'c'] }),
      q('second', { trigger: ['has', 'epic', 'a'], goal: ['stat', 'age', 'gte', 99] }),
    ];
    settleQuests(s, cards);                       // 兩張同時開卡
    s.epic.c = true;                              // 下一結算點：first 達成吃掉 a
    const r = settleQuests(s, cards);
    check('同結算點先開先吃：first 達成', r.achieved.map((x) => x.id).includes('first'));
    check('素材被吃掉的 second 立即判失敗', r.failed.length === 1 && r.failed[0].id === 'second');
    check('失敗通知指名是哪張卡吃的', r.failed[0].reason.eater === 'first', `${r.failed[0].reason.eater}`);
    check('second 也降階為生涯標籤', s.labels.includes('FAIL'));
    check('second 從進行中移除', !s.quests.active.some((x) => x.id === 'second'));
  }

  /* ---- 素材失效是永久的：素材回來也不復活 ---- */
  {
    const s = fresh();
    s.epic = { a: true };
    const cards = [
      q('early', { trigger: ['has', 'epic', 'a'], goal: ['has', 'epic', 'c'] }),
      q('later', { trigger: ['has', 'epic', 'a'], goal: ['stat', 'age', 'gte', 99] }),
    ];
    settleQuests(s, cards);   // 兩張都開
    s.epic.c = true;          // early 達成吃 a → later 素材失效
    settleQuests(s, cards);
    check('素材被吃掉後 later 判失敗', s.quests.done.some((d) => d.id === 'later' && d.result === 'failed'));
    s.epic.a = true;          // 素材再取得
    const r = settleQuests(s, cards);
    check('永久失敗的卡不因素材回來而復活', r.opened.length === 0 && r.achieved.length === 0
      && !s.quests.active.some((x) => x.id === 'later'));
  }

  /* ---- legend：底線門檻在引擎層 AND，不逐卡複製 ---- */
  {
    const s = fresh();
    s.epic = { a: true };
    const card = q('leg', { type: 'legend', trigger: ['has', 'epic', 'a'], goal: ['has', 'epic', 'c'] });
    check('底線門檻不是設計自由度（export 供檢驗）', LEGEND_BASELINE[0] === 'stat' && LEGEND_BASELINE[1] === 'intlSemis');
    check('沒打過國際賽四強 → legend 卡不開', settleQuests(s, [card]).opened.length === 0);
    withSemis(s);
    check('打過國際賽四強 → legend 卡才開', settleQuests(s, [card]).opened.length === 1);
    check('route 卡不受底線門檻擋', settleQuests(s, [q('rt', { trigger: ['has', 'epic', 'a'], goal: ['has', 'epic', 'c'] })]).opened.length === 1);
  }

  /* ---- legend 達成 → 傳說特質；route 達成 → 史詩＋標籤 ---- */
  {
    const s = withSemis(fresh());
    s.epic = { a: true };
    const leg = q('leg2', {
      type: 'legend', trigger: ['has', 'epic', 'a'], goal: ['has', 'epic', 'c'],
      result: { tier: 'legendary', key: 'immortal' },
    });
    settleQuests(s, [leg]);
    s.epic.c = true;
    settleQuests(s, [leg]);
    check('legend 達成 → 傳說特質（無標籤）', s.legendary.immortal === true && s.labels.length === 0);

    const rt = q('rt2', {
      trigger: ['has', 'epic', 'c'], goal: ['has', 'epic', 'c'],
      result: { tier: 'epic', key: 'soloking', label: '賽區統治者' },
    });
    settleQuests(s, [rt]);   // 觸發與達成同結算點成立 → 瞬間達成（引擎允許）
    check('route 達成 → 史詩特質＋生涯標籤', s.epic.soloking === true && s.labels.includes('賽區統治者'));
  }

  /* ---- 失敗降階：legend 失敗 → 標籤，不掉成史詩（§12.3 表） ---- */
  {
    const s = withSemis(fresh());
    s.epic = { a: true };
    const leg = q('leg3', {
      type: 'legend', trigger: ['has', 'epic', 'a'], goal: ['stat', 'age', 'gte', 99],
      result: { tier: 'legendary', key: 'immortal' }, failLabel: '殘響',
    });
    settleQuests(s, [leg]);
    s.year = 2030;
    const r = settleQuests(s, [leg]);
    check('legend 逾期失敗 → 生涯標籤', r.failed.length === 1 && s.labels.includes('殘響'));
    check('legend 失敗不發史詩', !s.epic.immortal && !s.legendary.immortal);
  }

  /* ---- 互斥擋路時獎賞不發但任務照算達成（素材已消耗） ---- */
  {
    const s = fresh();
    s.epic = { a: true, showman: true };   // ascetic 與 showman 互斥
    const cards = [q('ex', {
      trigger: ['has', 'epic', 'a'], goal: ['has', 'epic', 'a'],
      result: { tier: 'epic', key: 'ascetic', label: 'L' },
    })];
    const r = settleQuests(s, cards);
    check('互斥擋住 → 任務照算達成但不發特質', r.achieved.length === 1 && !s.epic.ascetic);
    check('標籤照發', s.labels.includes('L'));
  }

  /* ---- 退役收束（forced）：目標已滿足的先發，其餘以退役失敗 ---- */
  {
    const s = fresh();
    s.epic = { a: true };
    const cards = [
      q('done', { trigger: ['has', 'epic', 'a'], goal: ['has', 'epic', 'c'] }),
      q('open', { trigger: ['has', 'epic', 'a'], goal: ['stat', 'age', 'gte', 99] }),
    ];
    settleQuests(s, cards);
    s.epic.c = true;
    const r = settleQuests(s, cards, { forced: true });
    check('退役：目標已滿足的照發', r.achieved.map((x) => x.id).includes('done'));
    check('退役：其餘全部失敗（reason = retirement）',
      r.failed.length === 1 && r.failed[0].id === 'open' && r.failed[0].reason.kind === 'retirement');
    check('退役收束後沒有進行中的卡', s.quests.active.length === 0);
    check('退役不開新卡', r.opened.length === 0);
  }

  /* ---- 單元：同時開多張、素材不足不開卡 ---- */
  {
    const s = fresh();
    s.epic = { a: true };
    const cards = [
      q('m1', { trigger: ['has', 'epic', 'a'], goal: ['has', 'epic', 'c'] }),
      q('m2', { trigger: ['has', 'epic', 'a'], goal: ['has', 'epic', 'c'] }),
      q('m3', { trigger: ['has', 'epic', 'zzz'], goal: ['has', 'epic', 'zzz'] }),
    ];
    const r = settleQuests(s, cards);
    check('單局可同時持有多張進行中的卡（不靠機制互斥）', r.opened.length === 2 && s.quests.active.length === 2);
    check('素材不足的卡不開', r.opened.every((o) => o.id !== 'm3'));
  }
}