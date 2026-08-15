/**
 * DEMO 起點小矩陣（S20d，§19）。
 *
 * 遊戲預設起點＝PRO 第一年（2015、19 歲）。13 站的校準基線全部量在業餘路線上
 * （`smoke.mjs`／`invariants.mjs` 的樣本是 AMATEUR 起點），這個 suite 只負責
 * DEMO 路線自己的兩件事：
 *
 *   1. 起點狀態齊備——出道簽約走完晉升管線，league／contract／coach／mates／
 *      teamHistory／debut 里程碑一次填好（20b 的 D2 缺欄位清單）。
 *   2. 第一年存活率 ≥ 90/100——修前出生值起點（OVR≈29）只有 30/100，
 *      57 段踩 FLOOR_RATING 38 被迫退役；起始屬性對齊實測晉升分布（OVR≈58）
 *      之後這條才站得住。
 *
 * 起點的評價分布量法與實測數字寫在 `docs/v4/20d-DEMO起點校準.md` 交接筆記。
 */
import { createState } from '../../src/engine/state.js';
import { coachRating } from '../../src/engine/attributes.js';
import { playMatrix } from '../lib/harness.mjs';
import { ROLES } from '../../src/data/skills.js';

const mean = (a) => (a.length ? a.reduce((t, v) => t + v, 0) / a.length : 0);
const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

export const name = 'DEMO 起點小矩陣';
export const order = 50;

export async function run({ check, log }) {
  /* ---- 起點狀態齊備 ---- */
  const s = createState({ name: 'DEMO', role: 'MID', seed: 'demo-origin' });
  check('起點是 PRO 第一年', s.stage === 'PRO', s.stage);
  check('起點年份 2015（MSI 開辦年）', s.year === 2015, `${s.year}`);
  check('起點年齡 19（職業新秀）', s.age === 19, `${s.age}`);
  check('簽在主場賽區', s.league === 'HOME', `${s.league}`);
  check('出道即有合約', !!s.contract && s.contract.years >= 1, JSON.stringify(s.contract));
  check('出道即有教練', typeof s.coach === 'string' && s.coach.length > 0, `${s.coach}`);
  check('出道即有隊友', s.mates.length > 0, `${s.mates.length}`);
  check('teamHistory 第一筆就是出道', s.teamHistory.length === 1 && s.teamHistory[0].fromYear === 2015,
    JSON.stringify(s.teamHistory[0]));
  check('debut 里程碑入帳', s.milestones.length === 1 && s.milestones[0].kind === 'debut',
    JSON.stringify(s.milestones[0]));
  const o0 = coachRating(s);
  check('起始評價落在 50–70（對齊實測晉升分布）', o0 >= 50 && o0 <= 70, `${o0}`);

  /* ---- 100 段 PRO 起點生涯 ---- */
  const seeds = Array.from({ length: 10 }, (_, i) => `demo-${i}`);
  const runs = playMatrix({ seeds, roles: ROLES, stage: 'PRO' });
  check('DEMO 矩陣 100 段', runs.length === 100, `${runs.length}`);

  const starts = [];
  let survived = 0;
  let doneCount = 0;
  for (const { state, seed, role } of runs) {
    // 起點評價（出生流決定，與人生流無關——重生量）
    starts.push(coachRating(createState({ name: 'D', role, seed })));
    check('生涯必須結束', state.done, `${seed}/${role}`);
    if (state.done) doneCount++;
    // 撐過第一年＝退役年不在出道年（出道當年退役＝第一年沒活下來）
    if (state.year > 2015) survived++;
  }
  log(`起始評價：平均 ${mean(starts).toFixed(1)}（p10 ${quant(starts, 0.1)}、p90 ${quant(starts, 0.9)}）`);
  log(`100 段 PRO 起點：第一年存活 ${survived}/100`);
  check('PRO 起點第一年存活率 ≥ 90/100', survived >= 90, `${survived}/100`);
  check('100 段全部跑完', doneCount === 100, `${doneCount}/100`);

  const startMean = mean(starts);
  check('起始評價平均在 56–62（§7.3 實測晉升分布 58.9）', startMean >= 56 && startMean <= 62,
    startMean.toFixed(1));
}
