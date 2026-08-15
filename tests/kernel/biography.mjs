/**
 * 生涯傳記生成（V4 §15.5，S21a）。
 *
 * 四條驗收線：
 *   1. 確定性——同一顆 state 兩次生成，字串完全相同
 *   2. 無佔位符——全部生涯掃過去，不出現 `{`／`?`／undefined／空段落
 *   3. 後段局覆蓋率——生涯評分後 50% 的 run 每一段都寫得出來
 *   4. 不讀六維——原始碼掃過去不該有 `mental`
 *
 * 另用手工拼的 state 錨定各段模板（世界冠軍、沒打過國際賽、任務失敗、route 達成、
 * 沒打進職業），防止模板被改壞。
 */
import { readFileSync } from 'node:fs';
import { createState } from '../../src/engine/state.js';
import { buildBiography } from '../../src/engine/biography.js';
import { careerScore } from '../../src/engine/career.js';
import { playCareer } from '../lib/harness.mjs';
import { recordIntlFinish } from '../../src/phases/shared.js';

export const name = '生涯傳記（S21a）';
export const order = 2;   // 冒煙測試（order 1）之後跑，直接吃 shared.runs

const MARKER = /[{\?]|undefined/;
const EMPTY = '';

/** 一篇傳記長度與佔位符檢驗（所有生涯共用） */
function validate(check, label, bio) {
  check(`${label}：五段齊全`, bio.length === 5, `只有 ${bio.length} 段`);
  bio.forEach((p, i) => {
    check(`${label}：第 ${i + 1} 段非空`, typeof p === 'string' && p.length > 0);
    check(`${label}：第 ${i + 1} 段無佔位符`, !MARKER.test(p), p.slice(0, 40));
  });
}

export async function run({ check, log, shared }) {
  /* ---- 事實錨點：手工拼的 state ---- */
  {
    const s = createState({ name: 'CHAMP', role: 'MID', seed: 'bio-anchor' });
    s.milestones = [{ year: 2016, kind: 'debut', text: '出道於 AAA' }];
    // 國際賽名次過寫入端（S20c／N17）：傳記讀的是 `finish` 鍵，不是文字
    s.year = 2019;
    recordIntlFinish(s, 'worlds', 'champion');
    s.worldsWins = 2;
    s.quests = { active: [], done: [], log: [] };
    const bio = buildBiography(s);
    validate(check, '世界冠軍', bio);
    check('世界冠軍：巔峰段寫出奪冠年與次數', /2019 年世界賽/.test(bio[1]) && /2 座世界賽冠軍/.test(bio[1]), bio[1]);
    check('世界冠軍：歷史定位寫世界冠軍', bio[4] === '作為世界冠軍，他的名字長留在台灣電競的歷史裡。', bio[4]);
    check('確定性：同一顆 state 兩次生成相同', bio.join('\n') === buildBiography(s).join('\n'));
  }

  {
    const s = createState({ name: 'SIDE', role: 'SUP', seed: 'bio-anchor2' });
    s.milestones = [{ year: 2015, kind: 'debut', text: '出道於 BBB' }];
    s.teamHistory = [{ team: 'BBB', fromYear: 2015, toYear: null }];
    s.seasonLog = [{ year: 2015, stat: { W: 20, L: 10 } }];
    s.splitTitles = 0;
    s.intlAppearances = 0;
    s.quests = { active: [], done: [], log: [] };
    const bio = buildBiography(s);
    validate(check, '沒打過國際賽', bio);
    check('沒打過國際賽：巔峰段把這件事寫出來', bio[1].includes('國際賽的舞台始終沒有向他敞開'), bio[1]);
  }

  {
    const s = createState({ name: 'NEAR', role: 'TOP', seed: 'bio-anchor3' });
    s.milestones = [{ year: 2017, kind: 'debut', text: '出道於 CCC' }];
    s.quests = {
      active: [],
      done: [{ id: 'legend-immortal', result: 'failed', year: 2020, reason: { kind: 'deadline' } }],
      log: [],
    };
    const bio = buildBiography(s);
    validate(check, '任務失敗', bio);
    check('任務失敗：轉折段寫出功虧一簣與任務名', bio[2].includes('不死魔王') && bio[2].includes('功虧一簣'), bio[2]);
  }

  {
    const s = createState({ name: 'SOUL', role: 'JG', seed: 'bio-anchor4' });
    s.milestones = [{ year: 2016, kind: 'debut', text: '出道於 DDD' }];
    s.quests = {
      active: [],
      done: [{ id: 'route-team-soul', result: 'achieved', year: 2025 }],
      log: [],
    };
    const bio = buildBiography(s);
    validate(check, 'route 達成', bio);
    check('route 達成：歷史定位寫出標籤', bio[4].includes('不滅隊魂'), bio[4]);
  }

  {
    const s = createState({ name: 'NOOB', role: 'ADC', seed: 'bio-anchor5' });
    s.quests = { active: [], done: [], log: [] };
    const bio = buildBiography(s);
    validate(check, '沒打進職業', bio);
    check('沒打進職業：出道段退化', bio[0].includes('從未登上職業聯賽'), bio[0]);
    check('沒打進職業：結局段退化', bio[3].includes('未曾以職業選手身分登板'), bio[3]);
  }

  /* ---- 不讀六維：原始碼掃描 ---- */
  {
    const src = readFileSync(new URL('../../src/engine/biography.js', import.meta.url), 'utf8');
    check('不讀六維：原始碼沒有 mental', !src.includes('mental'), 'grep 到 mental');
  }

  /* ---- 160 段生涯（冒煙測試的共享樣本；單獨跑這支 suite 時補跑一小批） ---- */
  const runs = shared.runs ?? Array.from({ length: 8 }, (_, i) =>
    playCareer({ seed: `bio-${i}`, role: i % 2 ? 'MID' : 'TOP', name: 'BIO', strategy: 'first', style: i % 2 ? 'spread' : 'focus' }));

  let allValid = true;
  for (const { state, seed, role, style } of runs) {
    const bio = buildBiography(state);
    const label = `seed ${seed}/${role}/${style}`;
    validate(check, label, bio);
    allValid &&= bio.length === 5 && bio.every((p) => typeof p === 'string' && p.length > 0 && !MARKER.test(p));
  }
  check('全部生涯：確定性（兩次生成逐段相同）',
    runs.every(({ state }) => {
      const a = buildBiography(state);
      const b = buildBiography(state);
      return a.every((p, i) => p === b[i]);
    }));
  check('全部生涯：每篇都五段且無佔位符', allValid);

  /* ---- 後段局覆蓋率：評分後 50% 每段都寫得出來（§15.5 平庸局優先驗收） ---- */
  const ranked = [...runs].sort((a, b) => careerScore(a.state) - careerScore(b.state));
  const half = ranked.slice(0, Math.ceil(ranked.length / 2));
  const bottomCovered = half.every(({ state }) =>
    buildBiography(state).every((p) => p.length > 0));
  check(`後段局覆蓋率：評分後 50%（${half.length} 段）每段都寫得出`, bottomCovered);

  /* ---- 完成定義：最低 5 段與最高 2 段的傳記全文（交接筆記要貼） ---- */
  const lowest = ranked.slice(0, 5);
  const highest = ranked.slice(-2);
  log('— 生涯傳記驗收樣本（最低分 5 段） —');
  for (const r of lowest) {
    log(`▸ ${r.seed ?? r.state.seed}/${r.role ?? r.state.role}/${r.style ?? ''} 生涯評分 ${careerScore(r.state)}`);
    for (const p of buildBiography(r.state)) log(`  ${p}`);
  }
  log('— 生涯傳記驗收樣本（最高分 2 段） —');
  for (const r of highest) {
    log(`▸ ${r.seed ?? r.state.seed}/${r.role ?? r.state.role}/${r.style ?? ''} 生涯評分 ${careerScore(r.state)}`);
    for (const p of buildBiography(r.state)) log(`  ${p}`);
  }
}
