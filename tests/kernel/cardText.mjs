/**
 * 卡片文本變數（V4 §12.2，S20h）。
 *
 * 四條驗收線：
 *   1. 未填的 `{`／`?`／undefined 不得出現在任何卡片 body——160 段生涯掃過去
 *      零命中（與傳記的 MARKER 同一把尺，範圍從傳記擴到所有卡片）
 *   2. `{lastTitle}` 只在「上屆同賽事站上四強以上」時給；缺時採訪卡走 `promptAlt`
 *      降級版，絕不印出「作為 ，你有什麼話想說？」
 *   3. `{oppTitle}` 有標記才給（presser_callout 具體化「他們」）
 *   4. `{name}` 在卡片 body 裡已轉義（`renderCard` 走 innerHTML 不轉義）
 *
 * 另外守資料形狀：會缺變數的卡必須帶 `promptAlt` 降級兄弟，缺了測試就紅。
 */
import { createState } from '../../src/engine/state.js';
import { recordIntlFinish } from '../../src/phases/shared.js';
import { ROLEPLAY_CARDS } from '../../src/data/roleplay.js';
import { EVENT_CARDS } from '../../src/data/events.js';
import { cardText, cardVars } from '../../src/phases/shared.js';
import { playCareer } from '../lib/harness.mjs';

export const name = '卡片文本變數（S20h）';
export const order = 3;   // 冒煙（1）與傳記（2）之後，直接吃 shared.runs 的 cards

const MARKER = /[{\?]|undefined/;

/** 一張卡如果有 promptAlt，主版與降級版的變數需求必須都填得滿 */
function varNeeds(template) {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

export async function run({ check, log, shared }) {
  /* ---- 變數集：有頭銜／無頭銜兩態 ---- */
  {
    // 上屆（2019）世界賽四強：{lastTitle} = 世界賽四強止步。先記去年、再把年份推進，
    // 才對得上「上屆」語意（扮演卡在世界賽期間抽，今年尚未入帳）
    const s = createState({ name: 'CHAMP', role: 'MID', seed: 'card-anchor' });
    s.year = 2019;
    recordIntlFinish(s, 'worlds', 'semi');
    s.year = 2020;
    const vars = cardVars(s, { event: 'worlds' });
    check('四強：{lastTitle} 有值', vars.lastTitle === '世界賽四強止步', vars.lastTitle);

    // 上屆沒打過：{lastTitle} 缺 → 走降級版
    const s2 = createState({ name: 'NOOB', role: 'MID', seed: 'card-anchor2' });
    s2.year = 2020;
    const vars2 = cardVars(s2, { event: 'worlds' });
    check('沒打過：{lastTitle} 缺', vars2.lastTitle == null);

    const press = ROLEPLAY_CARDS.find((c) => c.id === 'presser_pressure');
    const withTitle = cardText(press, cardVars(s, { event: 'worlds' }));
    const without = cardText(press, cardVars(s2, { event: 'worlds' }));
    check('有頭銜：採訪卡主版', withTitle.startsWith('作為世界賽四強止步'), withTitle);
    check('無頭銜：採訪卡降級版', without.startsWith('論壇已經在賭你們幾比零被掃'), without);
  }

  /* ---- 八強以下不給 lastTitle（「作為 MSI 止步」不成句子） ---- */
  {
    const s = createState({ name: 'EARLY', role: 'MID', seed: 'card-anchor3' });
    s.year = 2020;
    recordIntlFinish(s, 'worlds', 'quarter');
    const vars = cardVars(s, { event: 'worlds' });
    check('八強：{lastTitle} 缺（要四強以上）', vars.lastTitle == null, vars.lastTitle);
  }

  /* ---- {oppTitle}：有標記才給，presser_callout 具體化 ---- */
  {
    const s = createState({ name: 'PLAYER', role: 'TOP', seed: 'card-anchor4' });
    const withOpp = cardVars(s, { event: 'worlds', oppTitle: '衛冕者 EDG' });
    check('{oppTitle} 有標記就有值', withOpp.oppTitle === '衛冕者 EDG');
    const callout = ROLEPLAY_CARDS.find((c) => c.id === 'presser_callout');
    check('對上衛冕者：主版指名', cardText(callout, withOpp).includes('這輪對上衛冕者 EDG'));
    check('無標記：降級版仍說他們', cardText(callout, cardVars(s, { event: 'worlds' })).includes('這輪對上他們'));
  }

  /* ---- {name} 轉義（renderCard 走 innerHTML） ---- */
  {
    const s = createState({ name: '<b onclick="x">駭</b>', role: 'JG', seed: 'card-anchor5' });
    const vars = cardVars(s);
    check('{name} 已轉義', vars.name === '&lt;b onclick=&quot;x&quot;&gt;駭&lt;/b&gt;', vars.name);
  }

  /* ---- 資料形狀：會缺變數的卡都要有降級兄弟 ---- */
  {
    const requireAlt = (cards, pool) => {
      const missing = [];
      for (const c of cards) {
        const needs = varNeeds(c.prompt).filter((k) => ['lastTitle', 'oppTitle'].includes(k));
        if (needs.length && !c.promptAlt) missing.push(c.id);
      }
      return missing;
    };
    const badRoleplay = requireAlt(ROLEPLAY_CARDS);
    const badEvent = requireAlt(EVENT_CARDS);
    check('扮演卡：用 lastTitle/oppTitle 就有 promptAlt', badRoleplay.length === 0, badRoleplay.join(','));
    check('事件卡：用 lastTitle/oppTitle 就有 promptAlt', badEvent.length === 0, badEvent.join(','));
  }

  /* ---- 160 段生涯：所有卡片 body 零未填佔位符 ---- */
  // 冒煙測試（order 1）已收集 160 段的卡片；單獨跑這支 suite 時補跑一小批
  const runs = shared.runs ?? Array.from({ length: 8 }, (_, i) =>
    playCareer({ seed: `cardText-${i}`, role: i % 2 ? 'MID' : 'TOP', style: i % 2 ? 'spread' : 'focus', collectCards: true }));
  let checked = 0;
  let hit = null;
  for (const run of runs) {
    for (const c of run.cards ?? []) {
      checked += 1;
      if (MARKER.test(c.body)) { hit = { seed: run.seed, role: run.role, style: run.style, card: c }; break; }
    }
    if (hit) break;
  }
  check(`全部生涯卡片 body 無未填佔位符（掃 ${checked} 張）`, !hit,
    hit ? `${hit.seed}/${hit.role}/${hit.style}「${hit.card.title}」：${hit.card.body.slice(0, 50)}` : '');

  log(`卡片文本：${checked} 張 body 掃描，未填佔位符 0 命中`);
}
