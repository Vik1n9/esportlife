/**
 * 三層退役事件（V4 §18.2，S20e）。
 *
 * 驗收線（照說明書）：
 *   1. 五種特殊結局每一種都可達——構造 state 直接驗，不靠 160 段碰運氣
 *   2. 條件互斥——多條件同時成立時，依表序只命中一個（§18.2 優先語意）
 *   3. 第二層——「宣布退役」永遠出現；其餘選項的出現條件逐項驗
 *   4. 最後一搏——選了之後生涯續跑（retirement 回 false、簽一年短約、careerFlow
 *      繼續下一季），第二次退役才真正落幕
 *   5. 敘事無佔位符——五結局＋四選項文案掃 `MARKER`（與 biography.mjs 同一形狀）
 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { careerFlow, retirement } from '../../src/engine/game.js';
import { pickEnding, retireOptions, RetireSignal } from '../../src/engine/retire.js';
import { evalCond } from '../../src/engine/conditions.js';
import { RETIRE_ENDINGS, RETIRE_OPTIONS } from '../../src/data/retireCards.js';
import { cardText, cardVars } from '../../src/phases/shared.js';
import { run as transferRun } from '../../src/phases/transfer.js';
import { monthAction, tacticsAction } from '../lib/harness.mjs';

export const name = '三層退役事件（S20e）';

const MARKER = /[{\?]|undefined/;

/** 一塊「已退役、準備結算」的 state——retirement() 不檢查 done，構造直接驅動 */
const fresh = (extra = {}) => {
  const s = createState({ name: 'RET', role: 'MID', seed: 'retire-anchor', stage: 'PRO' });
  s.done = true;
  s.retireReason = '測試';
  return Object.assign(s, extra);
};

/** 驅動 retirement() 的 generator 到結束，回 {beats, result}（result = 是否確定退役） */
function driveRetire(state, answer = () => undefined) {
  const flow = retirement({ state, rng: new Rng('retire:life') });
  const beats = [];
  let input;
  let result = null;
  for (;;) {
    const { value, done } = flow.next(input);
    input = undefined;
    if (done) { result = value; break; }
    beats.push(value);
    if (value.type === 'choice') input = answer(value);
  }
  return { beats, result };
}

/** 八年同隊：longestTenure 讀 teamHistory 的 toYear（null = 至今），state.year 2015 */
const eightYearTenure = () => [{ team: 'TT', league: 'HOME', fromYear: 2008, toYear: null }];

const highAttr = (v) => Object.fromEntries(['vit', 'agi', 'awr', 'tec', 'syn', 'dec'].map((k) => [k, v]));
const ATTRS = ['vit', 'agi', 'awr', 'tec', 'syn', 'dec'];

export async function run({ check }) {
  /* ---- 五種特殊結局各自可達（第一層） ---- */
  {
    const s = fresh({ teamHistory: eightYearTenure(), splitTitles: 3 });
    const e = pickEnding(s);
    check('王朝基石：同隊 ≥ 8 年且賽段冠軍 ≥ 3 可達', e?.id === 'dynasty', JSON.stringify(e));
  }
  {
    const s = fresh({ wonWorldsThisYear: true });
    const e = pickEnding(s);
    check('冠軍謝幕：最後一季世界賽奪冠可達', e?.id === 'curtain', JSON.stringify(e));
  }
  {
    const s = fresh({ age: 34, benchedStreak: 0, attr: highAttr(72), proYears: 12 });
    const e = pickEnding(s);
    check('不屈老將：32 歲仍先發且教練評價 ≥ 62 可達', e?.id === 'veteran', `${JSON.stringify(e)} rating=${evalCond(s, ['stat', 'coachRating', 'gte', 62])}`);
  }
  {
    const s = fresh({ proYears: 2, peakRating: 78 });
    const e = pickEnding(s);
    check('流星劃過：生涯 ≤ 3 年且巔峰評價 ≥ 75 可達', e?.id === 'shootingStar', JSON.stringify(e));
  }
  {
    const s = fresh({ marketQuiet: true, intlAppearances: 0 });
    const e = pickEnding(s);
    check('無聲告別：無報價且生涯無國際賽出場可達', e?.id === 'quietExit', JSON.stringify(e));
  }

  /* ---- 條件互斥：多條件同時成立，依表序只命中一個 ---- */
  {
    const s = fresh({ teamHistory: eightYearTenure(), splitTitles: 3, wonWorldsThisYear: true });
    check('互斥：王朝基石＋冠軍謝幕並存時，表序在前的王朝基石勝出', pickEnding(s)?.id === 'dynasty');
  }
  {
    const s = fresh({ proYears: 2, peakRating: 78, wonWorldsThisYear: true });
    check('互斥：流星劃過＋冠軍謝幕並存時，表序在前的冠軍謝幕勝出', pickEnding(s)?.id === 'curtain');
  }

  /* ---- 新謂詞的行為（S20e 加進 QUERIES 的七個） ---- */
  {
    const s = fresh({ age: 24, stage: 'PRO', wonWorldsThisYear: true, benchedStreak: 2, peakRating: 81, intlAppearances: 3, marketQuiet: true });
    check('謂詞：wonWorldsThisYear／benchedStreak／peakRating／intlAppearances／marketQuiet／stage', [
      ['stat', 'wonWorldsThisYear', 'eq', 1], ['stat', 'benchedStreak', 'eq', 2],
      ['stat', 'peakRating', 'gte', 80], ['stat', 'intlAppearances', 'gte', 1],
      ['stat', 'marketQuiet', 'eq', 1], ['stat', 'stage', 'eq', 'PRO'],
    ].every((n) => evalCond(s, n)));
    check('謂詞：atPeak 依位置加權峰值年（1 歲必在、99 歲必過）',
      evalCond(fresh({ age: 1 }), ['stat', 'atPeak', 'eq', 1])
      && evalCond(fresh({ age: 99 }), ['stat', 'atPeak', 'eq', 0]));
  }

  /* ---- 第二層：選項出現條件 ---- */
  {
    const s = fresh();
    const ids = retireOptions(s).map((o) => o.id);
    check('第二層：宣布退役永遠出現', ids.includes('announce'));
    check('第二層：19 歲職業選手＝宣布退役＋最後一搏（還年輕且有市場）', ids.join('／') === 'announce／lastHustle', ids.join('／'));
  }
  {
    const has = (extra, id) => retireOptions(fresh(extra)).some((o) => o.id === id);
    check('最後一搏：有報價且年齡 < 35 時出現', has({ age: 24, marketQuiet: false, stage: 'PRO' }, 'lastHustle'));
    check('最後一搏：無報價不出現（沒人要你，搏不起）', !has({ age: 24, marketQuiet: true }, 'lastHustle'));
    check('最後一搏：年齡 ≥ 35 不出現', !has({ age: 35, marketQuiet: false }, 'lastHustle'));
    check('最後一搏：業餘選手不出現（網咖沒有短約可簽）', !has({ age: 24, marketQuiet: false, stage: 'AMATEUR' }, 'lastHustle'));
  }
  {
    const has = (extra, id) => retireOptions(fresh(extra)).some((o) => o.id === id);
    check('轉身離開：教練評價 ≥ 75 且巔峰期內時出現', has({ age: 20, attr: highAttr(82) }, 'walkAway'));
    check('轉身離開：評價不夠不出現', !has({ age: 20, attr: highAttr(60) }, 'walkAway'));
    check('轉型教練：年資 ≥ 8 且 awr／dec ≥ 70 時出現',
      has({ proYears: 9, attr: { vit: 50, agi: 50, awr: 75, tec: 50, syn: 50, dec: 75 } }, 'coach'));
    check('轉型教練：年資不足不出現', !has({ proYears: 7, attr: { awr: 75, dec: 75 } }, 'coach'));
    check('轉型教練：awr／dec 不足不出現', !has({ proYears: 9, attr: { awr: 60, dec: 60 } }, 'coach'));
  }

  /* ---- 第一層流程：命中特殊結局直接結算，不給選項 ---- */
  {
    const s = fresh({ teamHistory: eightYearTenure(), splitTitles: 3, pendingPoints: 4 });
    const { beats, result } = driveRetire(s);
    const first = beats[0];
    check('王朝基石：第一張卡就是結局卡', first?.type === 'card' && first.title === '王朝基石', JSON.stringify(first));
    check('王朝基石：tone 是 gold', first?.tone === 'gold');
    check('王朝基石：不再給第二層選項', !beats.some((b) => b.type === 'choice'));
    check('王朝基石：確定退役（回 true）', result === true);
    check('王朝基石：第三層照結算（能力點分配＋生涯總結＋summary）', beats.some((b) => b.type === 'alloc') && beats.some((b) => b.type === 'summary'));
    check('王朝基石：文案沒有佔位符', !MARKER.test(first.body), first.body);
  }
  {
    const s = fresh({ marketQuiet: true, intlAppearances: 0 });
    const { beats, result } = driveRetire(s);
    check('無聲告別：bad 卡且確定退役', beats[0]?.title === '無聲告別' && beats[0]?.tone === 'bad' && result === true);
  }

  /* ---- 第二層流程：最後一搏簽一年短約、生涯續跑 ---- */
  {
    const s = fresh({
      age: 24, stage: 'PRO', marketQuiet: false, proYears: 4, splitTitles: 0,
      team: 'GG', contract: { years: 0, mult: 1 },
    });
    const { beats, result } = driveRetire(s, () => 'lastHustle');
    const card = beats.find((b) => b.type === 'card' && b.title === '最後一搏');
    check('最後一搏：選了之後回 false（不退役）', result === false);
    check('最後一搏：出敘事卡', !!card, JSON.stringify(beats[0]));
    check('最後一搏：簽下一年合約', s.contract?.years === 1, JSON.stringify(s.contract));
    check('最後一搏：留在原隊', s.team === 'GG', s.team);
    check('最後一搏：合約係數在市場合理範圍（0.6–2.2）', s.contract?.mult >= 0.6 && s.contract?.mult <= 2.2, JSON.stringify(s.contract));
    check('最後一搏：文案沒有佔位符', !MARKER.test(card?.body ?? ''), card?.body);
  }
  {
    const s = fresh({ age: 40, marketQuiet: false, proYears: 20, team: 'GG' });
    const ids = retireOptions(s).map((o) => o.id);
    check('第二層：40 歲老將選項收斂（最後一搏消失）', !ids.includes('lastHustle'), ids.join('／'));
  }

  /* ---- 第二層流程：宣布退役走完整結算 ---- */
  {
    const s = fresh({ proYears: 6, pendingPoints: 3 });
    const { beats, result } = driveRetire(s, () => 'announce');
    check('宣布退役：確定退役（回 true）', result === true);
    check('宣布退役：出敘事卡且第三層照結算',
      beats.some((b) => b.type === 'card' && b.title === '宣布退役')
      && beats.some((b) => b.type === 'alloc')
      && beats.some((b) => b.type === 'summary'));
    check('宣布退役：任務收束在退役後（無 choice 殘留）', beats.at(-1)?.type === 'summary', JSON.stringify(beats.at(-1)));
  }
  {
    const s = fresh({ proYears: 6, retireReason: '能力已跌破青訓最低水準，遭釋出，被迫退役。' });
    const { beats } = driveRetire(s, () => 'announce');
    const card = beats.find((b) => b.type === 'card' && b.title === '宣布退役');
    check('宣布退役：敘事卡保留退役原因（強制退役的 reason 不能被三層吃掉）',
      card?.body?.includes('能力已跌破青訓最低水準'), card?.body);
    check('宣布退役：原因附加無佔位符', !MARKER.test(card?.body ?? ''), card?.body);
  }

  /* ---- marketQuiet：自由市場每次重開都要重置（最後一搏續跑後第二年有報價） ---- */
  {
    const driveFA = (s) => {
      const flow = transferRun({ state: s, rng: new Rng('retire:market') }, { kind: 'TRANSFER' });
      let input;
      for (;;) {
        let out;
        try { out = flow.next(input); } catch (err) { if (err instanceof RetireSignal) return; throw err; }
        input = undefined;
        if (out.done) return;
        if (out.value.type === 'choice') input = out.value.options[0].id;
      }
    };
    const s = fresh({ age: 19, attr: highAttr(52), contract: null });
    driveFA(s);
    check('marketQuiet：低評價 FA 無報價記下靜默', s.marketQuiet === true, String(s.marketQuiet));
    s.attr = highAttr(85);
    driveFA(s);
    check('marketQuiet：第二次 FA 有報價時重置回 false（「最近一次」語意）', s.marketQuiet === false, String(s.marketQuiet));
  }

  /* ---- 敘事衛生：五結局＋四選項文案全數無佔位符 ---- */
  {
    const s = fresh();
    const vars = { ...cardVars(s), n: 8 };
    const bad = [];
    for (const e of [...RETIRE_ENDINGS, ...RETIRE_OPTIONS]) {
      let text = '';
      try { text = cardText(e, vars); } catch (err) { bad.push(`${e.name}：${err.message}`); continue; }
      if (MARKER.test(text)) bad.push(`${e.name}：${text}`);
    }
    check('退役文案（9 張）：全部可填且無佔位符', bad.length === 0, bad.join('｜'));
  }

  /* ---- 最後一搏的完整生涯整合：選了一次，第二次退役才落幕 ---- */
  {
    const state = createState({ name: 'HUSTLE', role: 'MID', seed: 'retire-hustle', stage: 'PRO' });
    // 峰值年齡壓在 19：不衰退、評價有餘裕，但峰值（含 ±3 心理修正）仍卡在 75 以下，
    // 流星劃過（≤3 年且峰值 ≥ 75）不能命中，退役選擇才測得到；FA 才會有報價
    for (const k of ATTRS) state.lifecycle[k] = { peak_age: 19, rise_k: 1, fall_k: 0.01, fall_accel: 1, decline_pull: 0.1 };
    state.potential = highAttr(70);
    state.attr = highAttr(68);
    state.contract = { years: 1, mult: 1 };
    // 出過國際賽：第二年 FA 即使無報價（marketQuiet）也不會命中「無聲告別」，
    // 第二次退役必然走第二層選擇——否則第二年無聲落幕，測不到「第二次才落幕」
    state.intlAppearances = 2;
    // ⚠ 不能用 driveUntil 的 stop-on-done：退役 choice 出現時 state.done 已是 true
    // （catch 設的），answer 選了最後一搏，選擇還沒執行就被 stop 中斷。直接驅動
    // careerFlow，月回合／戰術照 harness 的策略走
    let retireChoices = 0;
    const titles = [];
    const flow = careerFlow({ state, rng: new Rng('retire-hustle:life') });
    const cursor = { i: 0 };
    let input;
    for (let i = 0; i < 4000; i++) {
      const { value, done } = flow.next(input);
      input = undefined;
      if (done) break;
      if (value.type === 'choice') {
        if (value.kind === 'month') { input = monthAction(state, value, 'focus', cursor); continue; }
        if (value.kind === 'tactics') { input = tacticsAction(state, value); continue; }
        titles.push(value.title);
        if (value.title === '職業生涯的最後一頁') {
          retireChoices += 1;
          input = retireChoices === 1 ? 'lastHustle' : 'announce';
        } else if (value.title === '合約到期 · 取得自由球員資格') input = 'quit';
        else if (value.title.startsWith('買斷報價')) input = 'stay';
        else input = value.options[0].id;
      }
    }
    check('最後一搏整合：第一次退役選最後一搏、第二次才落幕（退役選擇出現 ≥ 2 次）', retireChoices >= 2, `退役選擇出現 ${retireChoices} 次`);
    check('最後一搏整合：生涯最終結束', state.done, `age=${state.age}`);
    // throw 跳出 runYear 時 year+1 不會執行，year 標記不可靠——用賽季結算筆數證明真的續打了一季
    check('最後一搏整合：最後一搏後續打了一季（賽季結算 ≥ 2 次）', state.seasonLog.length >= 2, `seasonLog=${state.seasonLog.length}`);
    check('最後一搏整合：退役選擇流程走過（最後一頁出現）',
      titles.some((c) => c === '職業生涯的最後一頁'), JSON.stringify(titles.slice(-3)));
  }
}