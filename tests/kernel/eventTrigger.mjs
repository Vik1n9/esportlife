/**
 * 事件觸發引擎（V4 §12.1 四步演算法）。
 *
 * 觸發與呈現拆開之後，這裡可以寫純函式測試，不必跑完整生涯。守的是四步演算法的
 * 每個分支：時段過濾（步驟 0）→ 條件命中取最高優先度（步驟 1–2）→ 第二張的機率
 * 與互斥（步驟 3）→ 候選空的隨機池兜底（步驟 4）。
 *
 * rng 用假的（只實作 `pick`／`chance`），分支才控制得住——`pick` 回傳傳入陣列的
 * 第一個元素、`chance` 回傳固定值，第二張要不要出、候選裡抽哪一張都是我們說了算。
 */
import { createState } from '../../src/engine/state.js';
import { Rng } from '../../src/core/rng.js';
import { EVENT_CARDS } from '../../src/data/events.js';
import {
  FLAG_TRAIT, SECOND_EVENT_CHANCE, TRAIT_FLAGS, currentSlots, eventOdds, eventTrigger,
} from '../../src/engine/eventTrigger.js';
import { SLOTS } from '../../tools/schema.js';
import { STAMINA_MAX } from '../../src/engine/stamina.js';

export const name = '事件觸發引擎（條件優先）';

/** 假 rng：`pick` 一律回傳第一個，`chance` 回傳給定的值 */
const fakeRng = (chance) => ({ pick: (arr) => arr[0], chance: () => chance });

/** 測試用事件卡：時段預設 regular（職業常規賽月） */
function card(id, opts = {}) {
  return {
    id, name: id, kind: 'normal',
    pool: opts.pool ?? ['performance'], sub: opts.sub ?? 'training',
    slot: opts.slot ?? ['regular'],
    excl: opts.excl ?? `solo_${id}`,
    ...(opts.when ? { when: opts.when } : {}),
    ...(opts.priority != null ? { priority: opts.priority } : {}),
    options: [{ id: 'a', label: 'A', odds: 50 }],
    good: { text: 'ok' }, bad: { text: 'bad' },
  };
}

const fresh = (stage = 'PRO', extra = {}) => Object.assign(
  createState({ name: 'EV', role: 'MID', seed: 'evt' }), { stage }, extra,
);

export async function run({ check, log }) {
  /* ---- 詞彙一致性（S20c）：編輯器答應得出來的，引擎要兌現得了 ---- */
  {
    // N7：`tools/schema.js` 的時段標籤清單必須是 `currentSlots()` 產得出的子集。
    // 修前工具提供 10 個、引擎只產得出 6 個——`playoffs`／`msi`／`worlds`／
    // `qualifier` 永遠取不到，只標這些的卡是永久抽不到的死卡
    const reachable = new Set();
    for (const stage of ['AMATEUR', 'AM2', 'PRO']) {
      for (const month of [1, 2, 6, 12]) {
        for (const threat of [false, true]) {
          const s = createState({ name: 'S', role: 'MID', seed: 'slot' });
          s.stage = stage; s.disbandThreat = threat;
          for (const t of currentSlots(s, { month })) reachable.add(t);
        }
      }
    }
    const unreachable = SLOTS.filter((t) => !reachable.has(t));
    check('編輯器的時段標籤全部取得到（無死卡陷阱）', unreachable.length === 0, unreachable.join('／'));
    const missing = [...reachable].filter((t) => !SLOTS.includes(t));
    check('引擎產得出的時段標籤編輯器都列得出來', missing.length === 0, missing.join('／'));

    // N8：事件卡寫得出的特質旗標，FLAG_TRAIT 必須認得——否則卡片承諾解鎖特質、
    // 實際零給予（`trashtalk`／`meta` 兩張卡就這樣掛了整個 S18）
    const written = new Set();
    for (const ev of EVENT_CARDS) {
      const collect = (flags) => { for (const k of Object.keys(flags || {})) written.add(k); };
      collect(ev.good?.flags); collect(ev.bad?.flags);
      for (const o of ev.options || []) {
        collect(o.flags);
        if (o.on) { collect(o.on.good?.flags); collect(o.on.bad?.flags); }
      }
    }
    const NON_TRAIT = new Set(['patchDebt', 'injuryRisk', 'bonusSalary', 'romance', 'mateMorale']);
    const orphan = [...written].filter((k) => !NON_TRAIT.has(k) && !FLAG_TRAIT[k]);
    check('事件卡寫的特質旗標 FLAG_TRAIT 都認得（無空頭承諾）', orphan.length === 0, orphan.join('／'));
    // 認得還不夠：安全牌（traits:false）要擋得住，否則「安全牌不推向任何極端」破功
    const unguarded = Object.keys(FLAG_TRAIT).filter((k) => !TRAIT_FLAGS.includes(k));
    check('FLAG_TRAIT 每一鍵都在 TRAIT_FLAGS 內（安全牌擋得住）', unguarded.length === 0, unguarded.join('／'));
  }

  /* ---- 步驟 1–2：條件命中 → 取最高優先度 ---- */
  {
    const s = fresh('PRO', { age: 20 });
    s.attr.tec = 80;
    const pool = [
      card('plain', {}),                                  // 隨機池成員（無條件）
      card('low', { when: ['stat', 'tec', 'gte', 70] }),   // 條件命中，優先度 0
      card('high', { when: ['stat', 'tec', 'gte', 70], priority: 5 }),
    ];
    const [ev] = eventTrigger(s, { month: 5 }, pool, fakeRng(false));
    check('條件命中 → 取最高優先度那張', ev.id === 'high', ev.id);
    check('事件一被記入 recentEvents', s.recentEvents.includes('high'));
  }

  /* ---- 步驟 1–2：多張同優先度 → 隨機抽一張（事件一只能有一張） ---- */
  {
    const s = fresh('PRO', { age: 20 });
    s.attr.dec = 80;
    const pool = [
      card('a', { when: ['stat', 'dec', 'gte', 70] }),
      card('b', { when: ['stat', 'dec', 'gte', 70] }),
    ];
    let seen = [];
    const rng = { pick: (arr) => { seen = arr; return arr[0]; }, chance: () => false };
    const [ev] = eventTrigger(s, { month: 5 }, pool, rng);
    const ids = seen.map((c) => c.id);
    check('同優先度候選整組進 pick（隨機抽一）', ids.length === 2 && ids.includes('a') && ids.includes('b'), ids.join());
    check('事件一確實是候選之一', ev.id === 'a' || ev.id === 'b');
  }

  /* ---- 步驟 4：候選為空 → 隨機池抽事件一 ---- */
  {
    const s = fresh('PRO', { age: 30 });   // 條件卡（tec 70+）不命中
    const pool = [
      card('cond', { when: ['stat', 'tec', 'gte', 70] }),
      card('poolA', {}), card('poolB', {}),
    ];
    const [ev] = eventTrigger(s, { month: 5 }, pool, fakeRng(false));
    check('候選空 → 隨機池出事件一', ev.id === 'poolA', ev.id);
    check('條件卡（不命中）不進隨機池', !['cond'].includes(ev.id));
  }

  /* ---- 步驟 3：第二張命中 → 與事件一同組的被互斥排除 ---- */
  {
    const s = fresh('PRO', { age: 20 });
    s.attr.tec = 80;
    const pool = [
      card('condA', { when: ['stat', 'tec', 'gte', 70], excl: 'g' }),
      card('condB', { when: ['stat', 'tec', 'gte', 70], excl: 'g' }),
      card('condC', { when: ['stat', 'tec', 'gte', 70], excl: 'other' }),
    ];
    const [first, second] = eventTrigger(s, { month: 5 }, pool, fakeRng(true));
    check('事件一：最高優先度候選（pick 取第一張）', first.id === 'condA', first.id);
    check('第二張命中且出卡', second && second.id === 'condC',
      second ? second.id : '無第二張');
    check('第二張與事件一不同互斥群組', first.excl !== second.excl);
  }

  /* ---- 步驟 3：第二張未命中 → 只出一張 ---- */
  {
    const s = fresh('PRO', { age: 20 });
    s.attr.tec = 80;
    const pool = [
      card('condA', { when: ['stat', 'tec', 'gte', 70] }),
      card('poolX', {}),
    ];
    const picks = eventTrigger(s, { month: 5 }, pool, fakeRng(false));
    check('第二張未命中 → 本月僅事件一', picks.length === 1, picks.length);
  }

  /* ---- 步驟 3：第二張命中但剩餘候選全被互斥排除 → 落回隨機池（仍做互斥檢查） ---- */
  {
    const s = fresh('PRO', { age: 20 });
    s.attr.tec = 80;
    const pool = [
      card('condA', { when: ['stat', 'tec', 'gte', 70], excl: 'g' }),
      card('condB', { when: ['stat', 'tec', 'gte', 70], excl: 'g' }),
      card('poolC', { excl: 'g' }),                     // 隨機池也同組 → 應被排除
      card('poolD', { excl: 'other' }),
    ];
    const [first, second] = eventTrigger(s, { month: 5 }, pool, fakeRng(true));
    check('剩餘候選同組被排除後，隨機池也做互斥檢查', second && second.id === 'poolD',
      second ? second.id : '無第二張');
  }

  /* ---- 步驟 0：時段過濾 ── */
  {
    const s = fresh('AMATEUR');
    const pool = [
      card('amCard', { slot: ['amateur'] }),
      card('proCard', { slot: ['regular'] }),
    ];
    const [ev] = eventTrigger(s, { month: 5 }, pool, fakeRng(false));
    check('業餘期抽不到職業（regular）卡', ev.id === 'amCard', ev.id);
  }
  {
    const s = fresh('PRO');
    const pool = [
      card('offCard', { slot: ['offseason'] }),
      card('regCard', { slot: ['regular'] }),
    ];
    const [ev] = eventTrigger(s, { month: 1 }, pool, fakeRng(false));
    check('休賽期（1 月）抽不到常規賽卡', ev.id === 'offCard', ev.id);
  }
  {
    const s = fresh('PRO');
    const pool = [
      card('transferCard', { slot: ['transfer'] }),
      card('offCard', { slot: ['offseason'] }),
    ];
    const [ev] = eventTrigger(s, { month: 12 }, pool, fakeRng(false));
    check('12 月同時是休賽期與轉會期，兩類卡都進得來', ['transferCard', 'offCard'].includes(ev.id), ev.id);
  }
  {
    const s = fresh('PRO', { disbandThreat: true });
    const pool = [
      card('crisisCard', { slot: ['crisis'] }),
      card('regCard', { slot: ['regular'] }),
    ];
    const [ev] = eventTrigger(s, { month: 5 }, pool, fakeRng(false));
    check('降級／解散危機時 crisis 卡進得來', ev.id === 'crisisCard', ev.id);
  }

  /* ---- 條件卡該來就來：不被 recentEvents 防重擋 ---- */
  {
    const s = fresh('PRO', { age: 20 });
    s.attr.tec = 80;
    s.recentEvents = ['condA'];
    const pool = [
      card('condA', { when: ['stat', 'tec', 'gte', 70] }),
      card('poolX', {}),
    ];
    const [ev] = eventTrigger(s, { month: 5 }, pool, fakeRng(false));
    check('條件命中卡不受防重機制擋（該來就來）', ev.id === 'condA', ev.id);
  }

  /* ---- 隨機池防重：最近出過的隨機池卡不重抽；耗盡後放回全池 ---- */
  {
    const s = fresh('PRO');
    s.recentEvents = ['poolA'];
    const pool = [card('poolA', {}), card('poolB', {})];
    const [ev] = eventTrigger(s, { month: 5 }, pool, fakeRng(false));
    check('隨機池卡最近出過 → 不重抽', ev.id === 'poolB', ev.id);
  }
  {
    const s = fresh('PRO');
    s.recentEvents = ['poolA', 'poolB'];
    const pool = [card('poolA', {}), card('poolB', {})];
    const [ev] = eventTrigger(s, { month: 5 }, pool, fakeRng(false));
    check('隨機池耗盡 → 放回全池（不會空月）', ['poolA', 'poolB'].includes(ev.id), ev.id);
  }

  /* ---- 空池 → 沒有卡可出（不崩潰） ---- */
  {
    const s = fresh('PRO');
    const picks = eventTrigger(s, { month: 5 }, [], fakeRng(true));
    check('空池回傳空陣列', picks.length === 0, picks.length);
  }

  /* ---- currentSlots：各階段的時段標籤 ---- */
  {
    check('業餘 → 只有 amateur', [...currentSlots(fresh('AMATEUR'), { month: 5 })].join() === 'amateur');
    check('青訓 → 只有 am2', [...currentSlots(fresh('AM2'), { month: 5 })].join() === 'am2');
    check('職業 1 月 → offseason', [...currentSlots(fresh('PRO'), { month: 1 })].join() === 'offseason');
    check('職業 5 月 → regular', [...currentSlots(fresh('PRO'), { month: 5 })].join() === 'regular');
    check('職業 12 月 → offseason＋transfer',
      [...currentSlots(fresh('PRO'), { month: 12 })].sort().join('+') === 'offseason+transfer');
    check('解散危機 → 多掛 crisis', [...currentSlots(fresh('PRO', { disbandThreat: true }), { month: 5 })].includes('crisis'));
  }

  /* ---- 條件求值（S20g 起事件卡吃 evalCond）：跨階特質也當得了條件 ----
   *
   * 遷移前 `whenHits` 的 trait 只讀 common 階——史詩特質（如 godhand）當不了事件卡
   * 條件（N6）。遷移後 `['has', 階, 鍵]` 四階都支援，這條路第一次走得通。
   */
  {
    const s = fresh('PRO', { age: 20 });
    s.epic = { godhand: true };
    const pool = [
      card('epicCond', { when: ['has', 'epic', 'godhand'] }),
      card('poolX', {}),
    ];
    const [ev] = eventTrigger(s, { month: 5 }, pool, fakeRng(false));
    check('事件卡條件讀得到史詩特質（跨階 has）', ev.id === 'epicCond', ev.id);

    const no = fresh('PRO', { age: 20 });
    const [ev2] = eventTrigger(no, { month: 5 }, pool, fakeRng(false));
    check('未持有史詩特質 → 條件不命中', ev2.id === 'poolX', ev2.id);
  }

  /* ---- eventOdds：成敗判定 = f(體力, 心理) ---- */
  {
    const s = fresh('PRO');
    s.stamina = STAMINA_MAX;
    s.mental.comp = 50;
    check('滿體力＋中性抗壓 → 成功率 = odds', eventOdds(s, { odds: 50 }) === 50, eventOdds(s, { odds: 50 }));
    s.stamina = 20;
    const low = eventOdds(s, { odds: 50 });
    check('低體力 → 成功率下修', low < 50, low);
    s.stamina = STAMINA_MAX;
    s.mental.comp = 90;
    check('高抗壓 → 成功率上修', eventOdds(s, { odds: 50 }) > 50);
    s.mental.comp = 50;
    check('clamp 在 5–95', eventOdds(s, { odds: 0 }) === 5 && eventOdds(s, { odds: 100 }) === 95,
      `${eventOdds(s, { odds: 0 })} / ${eventOdds(s, { odds: 100 })}`);
  }

  /* ---- 真池冒煙：用 EVENT_CARDS 跑 300 次，驗證不變式 ---- */
  {
    const s = fresh('PRO');
    const rng = new Rng('evt:smoke');
    let empty = 0; let exclHit = 0;
    for (let i = 0; i < 300; i++) {
      const picks = eventTrigger(s, { month: (i % 12) + 1 }, EVENT_CARDS, rng);
      if (!picks.length) { empty++; continue; }
      if (picks.length === 2) {
        if (picks[0].excl && picks[0].excl === picks[1].excl) exclHit++;
      }
      // 時段標籤：出得了的卡必須與當下時段相容
      const cur = currentSlots(s, { month: (i % 12) + 1 });
      for (const ev of picks) {
        if (ev.slot && ev.slot.length && !ev.slot.some((t) => cur.has(t))) {
          check(`真池冒煙：${ev.id} 與時段 ${[...cur]} 不符`, false, ev.id);
        }
      }
    }
    check('真池冒煙：300 次沒有空月', empty === 0, `空月 ${empty}`);
    check('真池冒煙：第二張從不與事件一同互斥群組', exclHit === 0, `同組 ${exclHit}`);
    log(`真池冒煙：300 次判定，第二張率 ${SECOND_EVENT_CHANCE}%，無空月、無互斥衝突`);
  }
}
