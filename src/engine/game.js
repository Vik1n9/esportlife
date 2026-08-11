/**
 * 生涯流程機（引擎核心）。
 *
 * 這個檔現在只做三件事：跑年度迴圈、處理季初訓練、接住退役訊號。一年裡有哪些賽事、
 * 照什麼順序跑，由 `data/formats/calendar.js` 那張表決定；每個賽事自己的邏輯與敘事
 * 住在 `phases/*.js`。
 *
 * 這樣切的理由是改動成本：舊版 1033 行把賽段、季後賽、獎項、MSI、世界賽、轉會、
 * 業餘出路全部寫在一起，於是改一個 MSI 要在 international.js（邏輯）、game.js
 * （敘事與選擇）、world.js（史實）三個檔之間來回。現在改 MSI 只開 `phases/msi.js`；
 * 搬動它在年曆上的位置只改 `data/formats/calendar.js` 的一列。
 *
 * Beat 協定（yield 出去的東西）：
 *   {type:'card', tone, title, body}      純敘事，不等待
 *   {type:'divider', text}                年度分隔線
 *   {type:'phase', index}                 0=訓練 1=賽季 2=休賽期
 *   {type:'checkpoint'}                   建議存檔點（年初）
 *   {type:'choice', title, options[]}     → resume 以 option.id
 *   {type:'alloc', mode, dice|points}     → resume 以 undefined（UI 直接改 state）
 *   {type:'end'}                          生涯結束
 */
import { ATTR_NAMES } from '../data/attributes.js';
import { START_YEAR } from '../data/eras.js';
import { applyAgeDecline, retirementAge } from './attributes.js';
import { calendarFor } from './calendar.js';
import { careerTier, tierName } from './career.js';
import { disbandNoteFor } from './market.js';
import { driftMental } from './mental.js';
import { unlockTrait } from './progression.js';
import { RetireSignal, retire } from './retire.js';
import { currentLeagueKey, stageLabel } from './roster.js';
import { bonus, flag } from '../kernel/modifiers.js';
import { PHASES } from '../phases/index.js';
import { card, drawRoleplay, fusionBeats } from '../phases/shared.js';

// 舊入口：UI 與測試都從這裡拿階段顯示名
export { stageLabel };

/* ================= 主流程 ================= */

/**
 * @param {{state:object, rng:import('../core/rng.js').Rng}} g
 */
export function* careerFlow(g) {
  const { state } = g;

  if (state.year === START_YEAR && state.age === 16 && !state.seasonLog.length) {
    yield card('info', '選手誕生',
      `${state.year} 年春天，這座島上還沒有「職業選手」這種身分。有的是網咖包台、` +
      `店家自己辦的盃賽，和一整排在排位上想證明自己的人。<br>` +
      `16 歲的 <b class="hl">${state.name}</b> 在 <b class="hl">${state.team}</b> 卡到一個位子。三年後的路，要自己選。`);
  }

  try {
    while (!state.done) {
      yield { type: 'checkpoint' };
      yield* runYear(g);
    }
  } catch (err) {
    if (!(err instanceof RetireSignal)) throw err;
    state.done = true;
    state.retireReason = err.reason;
  }

  yield* retirement(g);
  yield { type: 'end' };
}

/**
 * 一年。
 *
 * 訓練期之後就完全交給年曆——主迴圈不知道 MSI 或世界賽存在，只知道「照 order 跑
 * 這些階段」。
 */
function* runYear(g) {
  const { state } = g;
  yield { type: 'divider', text: `${state.year} 年 · ${state.age} 歲 · ${stageLabel(state)}` };
  yield* phaseTraining(g);

  yield { type: 'phase', index: 1 };
  // 各賽段的原始數據放在執行脈絡而不是 state：它只活一年，存檔點又固定在年初，
  // 寫進 state 只會讓存檔多背一份永遠是空陣列的欄位
  g.splits = [];
  // 賽段累計只在真的有打的年份重置——復健年沿用去年的紀錄，面板才不會整排空白
  if (!state.skipSeason) {
    state.splitLog = [];
    state.champPoints = 0;
    state.seedRank = 0;
    state.worldsSlotBonus = 0;
    state.wonSplitThisYear = false;
  }

  for (const phase of calendarFor(state, currentLeagueKey(state))) {
    if (phase.phaseIndex !== undefined) yield { type: 'phase', index: phase.phaseIndex };
    const mod = PHASES[phase.kind];
    if (mod) yield* mod.run(g, phase);
  }

  driftMental(state);
  state.age += 1;
  state.year += 1;
  state.stageYear += 1;
}

/* ================= 季初：訓練 ================= */

function* phaseTraining(g) {
  const { state, rng } = g;
  yield { type: 'phase', index: 0 };

  // 每季重置——集中在一個地方，這是舊版最大的漏洞來源
  state.seasonFactor = 1;
  state.skipSeason = false;
  state.tempInjuryRisk = 0;
  state.wonPlayoffThisYear = false;
  state.wonWorldsThisYear = false;
  state.lastDelta = state.lastDelta || 0;

  const cap = retirementAge(state);
  if (state.age >= cap) {
    retire(state.age >= 34
      ? `身體與版本都追不上了，${state.year} 年宣布退役。`
      : `你已年至 ${state.age} 歲，各隊評估後無人願簽，無奈退役。`);
  }

  const decline = applyAgeDecline(state, rng);
  if (decline) {
    const softener = state.epic.ageless ? '（不老傳奇：衰退大幅減緩）'
      : state.traits.veteran ? '（老將：衰退減緩）' : '';
    const grown = decline.grown.length
      ? `　經驗仍在累積：${decline.grown.map((k) => ATTR_NAMES[k]).join('、')} <b class="up">+1</b>。` : '';
    yield card('bad', '歲月與版本',
      `${decline.phase === 2 ? '第二階段（逐年加劇）' : '第一階段'}衰退：${decline.keys.map((k) => ATTR_NAMES[k]).join('／')} <b class="dn">−${decline.amount}</b>${softener}。${grown}`);
  }

  // 解散流言
  const note = state.stage === 'PRO' ? disbandNoteFor(state) : null;
  state.disbandThreat = !!note;
  if (note) {
    yield card('bad', '休息室流言',
      `圈內開始傳 <b class="hl">${state.team}</b> 的財務狀況。「${note}」——如果是真的，這會是你在這裡的最後一季。` +
      `<br><span class="muted">除非……你們今年拿下世界賽冠軍。</span>`);
  }

  if (state.rehabYears > 0) {
    state.rehabYears -= 1;
    state.skipSeason = true;
    state.seasonFactor = 0;
    yield card('bad', '復健年', '手腕／背傷尚未痊癒，本季確定<b class="dn">報銷</b>。（訓練骰減為 2 顆）');
    state.seasonLog.push({ year: state.year, age: state.age, team: state.team || stageLabel(state), line: '復健年 · 整季報銷', injured: true });
    yield* rollTrainingDice(g, 2);
    return;
  }

  yield* rollTrainingDice(g, null);

  // 訓練期的人際路口。刻意只抽一張——扮演卡多到每回合都在選，就變成噪音了
  if (state.stage !== 'AMATEUR') {
    if (rng.chance(45)) yield* drawRoleplay(g, rng.chance(50) ? 'coach' : 'daily');
  } else if (rng.chance(25)) {
    yield* drawRoleplay(g, 'daily');
  }
}

function* rollTrainingDice(g, forced) {
  const { state, rng } = g;
  let dice;

  if (forced) {
    dice = Array.from({ length: forced }, () => rng.int(1, 6));
  } else {
    const r = rng.next();
    let count = r < 0.35 ? 4 : r < 0.75 ? 5 : r < 0.97 ? 6 : 7;
    count += bonus(state, 'diceBonus');
    // `自律` 是機率性的，只有帶著它才會消耗這次亂數——所以不能收進 diceBonus
    if (state.traits.disc && rng.chance(30)) count += 1;
    dice = Array.from({ length: count }, () => (flag(state, 'giftedDice') ? rng.int(4, 6) : rng.int(1, 6)));
  }

  const gifted = flag(state, 'giftedDice');
  if (!gifted && state.age < 22) {
    state.sixCount += dice.filter((v) => v === 6).length;
  }

  let msg = `訓練期擲出 <b class="hl">${dice.length}</b> 顆骰。`;
  if (!gifted && state.age < 22) msg += ` 高標值「6」累計 <b class="hl">${Math.min(5, state.sixCount)}/5</b> 次。`;
  yield card('', '季初訓練', msg);

  if (!gifted && state.age < 22 && state.sixCount >= 5) {
    unlockTrait(state, 'genius');
    yield card('gold', '隱藏素質覺醒：天才操作',
      '22 歲前五度擲出高標值！從今以後訓練骰<b class="hl">固定 4 點以上</b>。');
    yield* fusionBeats(g);
  }

  yield { type: 'alloc', mode: 'dice', dice, title: `分配訓練成果（${dice.length} 顆骰）` };
}

/* ================= 生涯結算 ================= */

function* retirement(g) {
  const { state } = g;
  yield { type: 'phase', index: -1 };
  yield card('bad', '職業生涯結束', state.retireReason);
  if (state.forcedRetire) yield card('bad', '被迫退役', '功勳老將在解散後無人接手，黯然退役。');

  if (state.pendingPoints > 0) {
    const points = state.pendingPoints;
    state.pendingPoints = 0;
    yield { type: 'alloc', mode: 'points', points, title: `最後的能力點分配（${points} 點）` };
  }

  const tier = careerTier(state);
  if (tier <= 1) {
    yield card('gold', '榮譽殿堂', `生涯評價 <b class="hl">${tierName(tier)}</b>，入選電競榮譽殿堂！`);
  } else {
    yield card('info', '生涯總結', `生涯評價：<b class="hl">${tierName(tier)}</b>。`);
  }

  yield { type: 'summary', tier };
}
