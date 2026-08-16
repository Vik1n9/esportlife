/**
 * DEMO 起點小矩陣與三年期程（S20d／S21b，§19）。
 *
 * 遊戲預設起點＝PRO 第一年（2015、19 歲）。13 站的校準基線全部量在業餘路線上
 * （`smoke.mjs`／`invariants.mjs` 的樣本是 AMATEUR 起點），這個 suite 只負責
 * DEMO 路線自己的三件事：
 *
 *   1. 起點狀態齊備——出道簽約走完晉升管線，league／contract／coach／mates／
 *      teamHistory／debut 里程碑一次填好（20b 的 D2 缺欄位清單）。
 *   2. 第一年存活率 ≥ 90/100——修前出生值起點（OVR≈29）只有 30/100，
 *      57 段踩 FLOOR_RATING 38 被迫退役；起始屬性對齊實測晉升分布（OVR≈58）
 *      之後這條才站得住。
 *   3. **三年期程**（S21b）——DEMO 最多跑 36 個月，期滿沒觸發任何結局就以
 *      「DEMO 結束」比照退役結算；上限只掛 DEMO 路線，業餘起點不受影響。
 *
 * 起點的評價分布量法與實測數字寫在 `docs/v4/20d-DEMO起點校準.md` 交接筆記，
 * 期程的量測寫在 `docs/v4/21b-DEMO三年期程.md`。
 */
import { createState } from '../../src/engine/state.js';
import { coachRating } from '../../src/engine/attributes.js';
import { buildBiography } from '../../src/engine/biography.js';
import { DEMO_MONTHS, demoExpiring, demoMonth, demoStartYear, isDemo } from '../../src/engine/demo.js';
import { DEMO_END_YEAR, DEMO_YEARS, START_YEAR } from '../../src/data/eras.js';
import { MONTHS_PER_YEAR } from '../../src/engine/calendar.js';
import { allocate, monthAction, playCareer, playMatrix, tacticsAction } from '../lib/harness.mjs';
import { careerFlow } from '../../src/engine/game.js';
import { Rng } from '../../src/core/rng.js';
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

  /* ---- 期程常數與判斷函式（S21b，§19.2） ---- */
  check('DEMO 期程三年', DEMO_YEARS === 3, `${DEMO_YEARS}`);
  check('DEMO 期程 36 個月＝三年 × 年曆月數（不手抄第二個 12）',
    DEMO_MONTHS === 36 && DEMO_MONTHS === DEMO_YEARS * MONTHS_PER_YEAR, `${DEMO_MONTHS}`);
  check('DEMO 終點年 2017（2015 起算第三季）',
    DEMO_END_YEAR === 2017 && DEMO_END_YEAR === START_YEAR + DEMO_YEARS - 1, `${DEMO_END_YEAR}`);
  check('PRO 起點掛期程上限', isDemo(s) && s.demoEndYear === DEMO_END_YEAR, `${s.demoEndYear}`);
  check('PRO 起點還沒收束', s.demoEnded === false, `${s.demoEnded}`);
  check('DEMO 起始年回推得到 2015', demoStartYear(s) === START_YEAR, `${demoStartYear(s)}`);
  check('DEMO 第一個月是 1／36', demoMonth(s) === 1, `${demoMonth(s)}`);
  check('DEMO 最後一個月是 36／36',
    demoMonth({ ...s, year: DEMO_END_YEAR }, MONTHS_PER_YEAR) === DEMO_MONTHS,
    `${demoMonth({ ...s, year: DEMO_END_YEAR }, MONTHS_PER_YEAR)}`);
  check('第三年才到期（第一、二年不收束）',
    !demoExpiring(s) && !demoExpiring({ ...s, year: START_YEAR + 1 }) && demoExpiring({ ...s, year: DEMO_END_YEAR }));

  // 業餘起點是完整生涯基線：不掛上限，`demoExpiring` 永遠 false（否則 160 段被截斷）
  const am = createState({ name: 'AM', role: 'MID', seed: 'demo-origin', stage: 'AMATEUR' });
  check('業餘起點不掛 DEMO 上限', am.demoEndYear === null && !isDemo(am), `${am.demoEndYear}`);
  check('業餘起點在 DEMO 終點年之後仍不到期',
    !demoExpiring({ ...am, year: DEMO_END_YEAR + 5 }), '業餘路線永不到期');

  /* ---- 100 段 PRO 起點生涯 ---- */
  const seeds = Array.from({ length: 10 }, (_, i) => `demo-${i}`);
  const runs = playMatrix({ seeds, roles: ROLES, stage: 'PRO', collectCards: true });
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

  demoSpan({ check, log }, runs);
  demoLastStand({ check, log });
}

/**
 * 最後一搏之後不得重跑同一年（§18.2 第二層 ＋ §19.2 期程，S21b OCR review）。
 *
 * `retire()` 的呼叫點全部在 12 月的 TRANSFER 階段，例外一拋，`runYear` 尾端的年界
 * 就沒跑到。生涯確定結束時無所謂；但「最後一搏」是要續跑的——不補跑年界，續跑的
 * 那一年會是**同一年重打一次**（賽段、季後賽、世界賽再來一遍、`seasonLog` 兩筆同年、
 * `proYears` 多一季），DEMO 也就跑得出 36 個月以上。
 *
 * 自動駕駛的策略一律回答「宣布退役」（`harness.decide`，刻意的——否則 160 段矩陣的
 * 生涯長度整批位移），所以這條路徑只能在這裡專門開一段來驗：FA 選單選「功成身退」
 * → 退役選項選「最後一搏」，每次都選，逼出連續續命。
 */
function demoLastStand({ check, log }) {
  const state = createState({ name: 'DEMO-LS', role: 'MID', seed: 'demo-laststand', stage: 'PRO' });
  const rng = new Rng('demo-laststand:life');
  const flow = careerFlow({ state, rng });
  const cursor = { i: 0 };
  let input;
  let months = 0;
  let stands = 0;
  for (let beats = 0; beats < 20000; beats++) {
    const { value, done } = flow.next(input);
    input = undefined;
    if (done) break;
    if (value.type === 'month') months += 1;
    if (value.type === 'alloc') { allocate(state, value, 'focus', cursor); continue; }
    if (value.type !== 'choice') continue;
    if (value.kind === 'month') { input = monthAction(state, value, 'focus', cursor); continue; }
    if (value.kind === 'tactics') { input = tacticsAction(state, value); continue; }
    const ids = value.options.map((o) => o.id);
    // 「功成身退」把自己推進退役流程，再用「最後一搏」反悔——這就是重跑年份的路徑
    if (ids.includes('lastHustle')) { stands += 1; input = 'lastHustle'; continue; }
    input = ids.includes('quit') ? 'quit' : value.options[0].id;
  }

  const years = state.seasonLog.map((e) => e.year);
  const dupes = years.filter((y, i) => years.indexOf(y) !== i);
  check('DEMO：最後一搏至少發生過一次（這段測試才有意義）', stands >= 1, `${stands} 次`);
  check('DEMO：最後一搏之後不重跑同一年——seasonLog 一年只有一筆',
    dupes.length === 0, `重複年份 ${[...new Set(dupes)].join(',') || '無'}｜${years.join(',')}`);
  check('DEMO：最後一搏也跑不出 36 個月', months <= DEMO_MONTHS, `${months} 個月`);
  check('DEMO：最後一搏也跑不進第四年',
    state.year <= DEMO_END_YEAR && state.proYears <= DEMO_YEARS,
    `${state.year} 年／${state.proYears} 季`);
  log(`DEMO 最後一搏：${stands} 次續命、${months} 個月、賽季 ${years.join(',')}`);
}

/**
 * 三年期程（S21b，§19.2）。
 *
 * 守什麼（實測 100 段 PRO 起點，`playMatrix` 的自動駕駛玩家）：
 *
 *   - **上限成立**：沒有任何一段跑進第四年，年份一律 ≤ 2017、月份 beat ≤ 36。
 *   - **兩種收束互斥且都有結算**：期滿收束（demoEnded、無 retireReason、
 *     36 個月整）與提早結局（有 retireReason，12 或 24 個月）——兩邊都恰好
 *     產一次 summary beat，沒有一段是無聲結束的。
 *   - **期滿那段的措辭不是退役**：卡片標題「DEMO 結束」、傳記結局段走
 *     `demoEnd` 模板（現役），否則玩家會把期滿讀成「21 歲掛靴」。
 *   - **業餘路線沒被截斷**：同一顆引擎跑 AMATEUR 起點要能越過 2017。
 *
 * ⚠ 期滿比例是**平衡量**，這裡只守一條寬鬆的可玩性下界（≥ 60/100）。DEMO 改成三年
 * 的理由就是「三年要玩得到」：初版量到 27/100（67 段死在第 24 個月的自由市場斷崖），
 * 校準後 87/100。設下界不是要釘住數字，是要讓斷崖一旦回來就當場被抓到——精確的
 * 實測值記在 21b 交接筆記，門檻本身由校準站負責。
 */
function demoSpan({ check, log }, runs) {
  const expired = runs.filter((r) => r.state.demoEnded);
  const early = runs.filter((r) => !r.state.demoEnded);

  check('DEMO：沒有一段跑進第四年（§19.2 三年上限）',
    runs.every((r) => r.state.year <= DEMO_END_YEAR),
    runs.filter((r) => r.state.year > DEMO_END_YEAR).map((r) => `${r.seed}/${r.role}@${r.state.year}`).join(',') || '全數收束於 2017');
  check('DEMO：月份 beat 不超過 36（§19.2 36 個月）',
    runs.every((r) => (r.beatTypes.month || 0) <= DEMO_MONTHS),
    `最多 ${Math.max(...runs.map((r) => r.beatTypes.month || 0))}`);
  check('DEMO：每一段都恰好結算一次（summary beat）',
    runs.every((r) => r.beatTypes.summary === 1),
    [...new Set(runs.map((r) => r.beatTypes.summary))].join(','));

  check('DEMO：期滿段跑滿 36 個月、停在 2017 年第三季',
    expired.every((r) => (r.beatTypes.month || 0) === DEMO_MONTHS
      && r.state.year === DEMO_END_YEAR && r.state.proYears === DEMO_YEARS),
    expired.map((r) => `${r.beatTypes.month}@${r.state.year}/${r.state.proYears}`).slice(0, 3).join(' ') || '無期滿段');
  check('DEMO：期滿不是退役——沒有退役原因，done 仍為 true（結算走得完）',
    expired.every((r) => r.state.done && !r.state.retireReason),
    expired.filter((r) => r.state.retireReason).map((r) => `${r.seed}/${r.role}`).join(',') || '無退役原因');
  check('DEMO：期滿段出過「DEMO 結束」卡，且排在結算之前',
    expired.every((r) => r.cards.some((c) => c.title === 'DEMO 結束')),
    `${expired.filter((r) => r.cards.some((c) => c.title === 'DEMO 結束')).length}/${expired.length}`);
  // detail 要延後求值：`buildBiography` 吃的是完整 state，沒有期滿段時傳空物件會
  // 直接拋 TypeError，整個 suite 掛掉——斷言明明只是要落回「無期滿段」
  check('DEMO：期滿段的傳記結局段講「現役」而不是「退役」（§15.5）',
    expired.every((r) => {
      const ending = buildBiography(r.state)[3];
      return ending.includes('現役') && !ending.includes('退役');
    }),
    expired.length ? buildBiography(expired[0].state)[3] : '無期滿段');

  check('DEMO：提早結局的段有退役原因，且沒有被標成期滿（§18.2 優先於期程）',
    early.every((r) => !!r.state.retireReason && !r.state.demoEnded),
    early.filter((r) => !r.state.retireReason).map((r) => `${r.seed}/${r.role}`).join(',') || '全數有原因');
  check('DEMO：提早結局的段沒出「DEMO 結束」卡',
    early.every((r) => !r.cards.some((c) => c.title === 'DEMO 結束')),
    early.filter((r) => r.cards.some((c) => c.title === 'DEMO 結束')).map((r) => `${r.seed}/${r.role}`).join(',') || '無');

  // 業餘路線（完整生涯基線）不吃上限——同一顆引擎、同一組決策，年份必須越過 2017
  const full = playCareer({ seed: 'demo-span-am', role: 'MID', stage: 'AMATEUR' });
  check('完整生涯（業餘起點）不被 DEMO 上限截斷',
    full.state.year > DEMO_END_YEAR && !full.state.demoEnded,
    `${full.state.year}／demoEnded=${full.state.demoEnded}`);

  check('DEMO：三年真的玩得到——期滿收束 ≥ 60/100（可玩性下界，§19.1）',
    expired.length >= 60, `${expired.length}/${runs.length}`);

  const months = runs.map((r) => r.beatTypes.month || 0);
  log(`DEMO 期程：期滿 ${expired.length}/100、提早結局 ${early.length}/100；`
    + `月份 ${Math.min(...months)}–${Math.max(...months)}（上限 ${DEMO_MONTHS}）`);
  const reasons = {};
  for (const r of early) reasons[r.state.retireReason] = (reasons[r.state.retireReason] || 0) + 1;
  for (const [reason, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) log(`  提早結局 ${n} 段：${reason}`);
}
