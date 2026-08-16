/**
 * choice beat 的 `slot` 分流（§22.2 卡牌覆寫，S39）。
 *
 * §22.2 把選項分成兩處呈現：卡牌內的即時反應（月度事件卡／扮演卡）就地出在卡片
 * 下緣（`'inline'`）；規劃型決策（訓練菜單／備賽戰術／轉會退役）回底部決策槽
 * （`'act'`）。slot 由發射端指定，不由 UI 猜——猜錯的那天沒有測試會紅，所以
 * 這裡把兩件事釘死：
 *
 *   1. 每個發射點都**顯式**宣告 slot，UI 永遠不必兜底
 *   2. 1–3 類走 `'inline'`（且前一個 beat 必是 card——UI 需要那張卡當錨點），
 *      第 4 條（賽事五拍第 2 拍）與規劃型決策一律 `'act'`
 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { careerFlow } from '../../src/engine/game.js';
import { MAX_BEATS, allocate, decide } from '../lib/harness.mjs';
import { drawEvent, drawRoleplay } from '../../src/phases/shared.js';
import { runSeriesEvent } from '../../src/phases/seriesEvent.js';
import { run as runMonth } from '../../src/phases/month.js';
import { EVENT_CARDS } from '../../src/data/events.js';

export const name = 'choice beat 決策槽分流';

const SLOTS = ['act', 'inline'];

/** 推到第一個 choice beat 為止，回傳沿途 beat */
function beatsUntilChoice(flow) {
  const beats = [];
  let input;
  for (;;) {
    const step = flow.next(input);
    input = undefined;
    if (step.done) return beats;
    beats.push(step.value);
    if (step.value.type === 'choice') {
      input = step.value.options[0].id;   // 餵一個合法選項讓 generator 收尾
    }
  }
}

export async function run({ check }) {
  /* ---- 事件卡與扮演卡：卡牌內的即時反應，走 inline（§22.2 的 1–3） ---- */
  {
    const state = createState({ name: 'S', role: 'MID', seed: 'slot-ev' });
    state.stage = 'PRO';
    const ev = EVENT_CARDS.find((c) => (c.options || []).length >= 2);
    const beats = beatsUntilChoice(drawEvent({ state, rng: new Rng('slot-ev') }, ev));
    const choice = beats.find((b) => b.type === 'choice');
    check('月度事件卡的選項走 inline', choice?.slot === 'inline', JSON.stringify(choice?.slot));
    check('inline 選項的前一個 beat 是卡片（UI 的錨點）',
      beats[beats.indexOf(choice) - 1]?.type === 'card');
  }
  {
    const state = createState({ name: 'S', role: 'MID', seed: 'slot-rp' });
    state.stage = 'PRO';
    const beats = beatsUntilChoice(drawRoleplay({ state, rng: new Rng('slot-rp') }, 'daily'));
    const choice = beats.find((b) => b.type === 'choice');
    check('扮演卡的選項走 inline', choice?.slot === 'inline', JSON.stringify(choice?.slot));
    check('扮演卡的 inline 選項前一個 beat 是卡片',
      beats[beats.indexOf(choice) - 1]?.type === 'card');
  }

  /* ---- 賽事五拍第 2 拍：§22.2 第 4 條明訂回底部決策槽 ---- */
  {
    const state = createState({ name: 'S', role: 'MID', seed: 'slot-tac' });
    state.stage = 'PRO'; state.league = 'LCK'; state.team = 'T1'; state.stamina = 70;
    const flow = runSeriesEvent({ state, rng: new Rng('slot-tac') },
      { title: '八強 · BO5', bo: 5, oppRating: 50, seed: 1, stakes: 'playoff' });
    const beats = beatsUntilChoice(flow);
    const choice = beats.find((b) => b.type === 'choice');
    check('備賽戰術走 act（與訓練菜單同性質：規劃型決策）', choice?.slot === 'act', JSON.stringify(choice?.slot));
    check('備賽戰術標題帶模式名「備賽戰術」', /備賽戰術/.test(choice?.title || ''), choice?.title);
  }

  /* ---- 養成回合：訓練菜單是決策槽本體；標題照三模式（§22.2 表格） ---- */
  {
    const freshFor = (seed) => {
      const state = createState({ name: 'S', role: 'MID', seed });
      return { state, rng: new Rng(seed) };
    };
    const jan = runMonth(freshFor('slot-jan'), { month: 1, matchWeight: 0, devMonths: 8 }).next().value;
    check('一月是休賽期模式標題', jan.title.startsWith('休賽期行動'), jan.title);
    check('訓練菜單走 act', jan.slot === 'act', JSON.stringify(jan.slot));

    const may = runMonth(freshFor('slot-may'), { month: 5, matchWeight: 0, devMonths: 8 }).next().value;
    check('常規月是「本月訓練」標題', may.title.startsWith('本月訓練'), may.title);

    const dec = runMonth(freshFor('slot-dec'), { month: 12, matchWeight: 0, devMonths: 8 }).next().value;
    check('十二月是休賽期模式標題', dec.title.startsWith('休賽期行動'), dec.title);
  }

  /* ---- 全生涯掃一次：每個 choice 都顯式帶 slot，沒有漏網的發射點 ---- */
  for (const spec of [{ seed: 'slot-pro', stage: 'PRO' }, { seed: 'slot-am', stage: 'AMATEUR' }]) {
    const state = createState({ name: 'S', role: 'MID', seed: spec.seed, stage: spec.stage });
    const rng = new Rng(`${spec.seed}:life`);
    const decisionRng = new Rng(`${spec.seed}:decisions`);
    const flow = careerFlow({ state, rng });
    const cursor = { i: 0 };
    const choices = [];
    let prev = null;
    let input;
    let n = 0;
    for (;;) {
      const { value, done } = flow.next(input);
      input = undefined;
      if (done) break;
      if (++n > MAX_BEATS) throw new Error(`beat 數超過 ${MAX_BEATS}（seed=${spec.seed}）`);
      if (value.type === 'choice') {
        choices.push({ beat: value, prev });
        input = decide(value, 'first', decisionRng, state, 'focus', cursor);
      } else if (value.type === 'alloc') {
        allocate(state, value, 'focus', cursor);
      }
      prev = value;
    }

    check(`${spec.stage}：每個 choice 都顯式宣告 slot（發射端指定，不由 UI 猜）`,
      choices.every((c) => SLOTS.includes(c.beat.slot)),
      choices.filter((c) => !SLOTS.includes(c.beat.slot)).map((c) => c.beat.title).join('、') || '全數通過');
    check(`${spec.stage}：月回合金錢決策與備賽戰術一律 act`,
      choices.filter((c) => c.beat.kind === 'month' || c.beat.kind === 'tactics')
        .every((c) => c.beat.slot === 'act'));
    check(`${spec.stage}：inline 選項的前一個 beat 一律是卡片`,
      choices.filter((c) => c.beat.slot === 'inline').every((c) => c.prev?.type === 'card'),
      choices.filter((c) => c.beat.slot === 'inline' && c.prev?.type !== 'card')
        .map((c) => c.beat.title).join('、') || '全數通過');
    check(`${spec.stage}：事件卡／扮演卡的 inline 選項真的出現了`,
      choices.some((c) => c.beat.slot === 'inline'),
      `inline ${choices.filter((c) => c.beat.slot === 'inline').length}／act ${choices.filter((c) => c.beat.slot === 'act').length}`);
    const retired = choices.filter((c) => c.beat.title === '職業生涯的最後一頁');
    check(`${spec.stage}：退役選項走 act`, retired.every((c) => c.beat.slot === 'act'), String(retired.length));
  }
}
