/**
 * 生涯流程機（引擎核心）。
 *
 * 這裡是整份重構的重點：舊版用 `done()` 回呼一層層往下傳，
 * 流程被切碎在十幾個函式裡，「每季要重置哪些旗標」沒有單一位置可看，
 * 於是 `champThisTeam`、`injNext`、`disbandAverted` 全都忘了清掉。
 *
 * 現在流程是一個 generator：程式碼由上而下就是一年的時間順序，
 * 需要玩家決策時 `yield` 一個 beat，runner 把答案 `next()` 回來。
 * 引擎完全不碰 DOM，因此可以在 Node 裡 headless 跑完整段生涯做回歸測試。
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
import { clamp } from '../core/rng.js';
import { ABILITY_NAMES, STAT_BASELINE } from '../data/abilities.js';
import { EVENT_CARDS } from '../data/events.js';
import { CROWD_REACTIONS, ROLEPLAY_CARDS } from '../data/roleplay.js';
import { BASE_TRAITS } from '../data/traits.js';
import { EPIC_TRAITS } from '../data/epics.js';
import { bonus, flag } from '../kernel/modifiers.js';
import { AMATEUR_CUPS } from '../data/teams.js';
import { LEAGUES } from '../data/leagues.js';
import { START_YEAR } from '../data/eras.js';
import { splitsOf } from '../data/regions/index.js';
import {
  abilityKeys, adjustAbility, applyAgeDecline, effectiveOvr,
  investAbility, ovr, patchPenalty, retirementAge,
} from './abilities.js';
import { careerTier, tierName } from './career.js';
import { msiEligible, msiForced, runMsi, runWorlds, worldsEligible, worldsQualifyChance } from './international.js';
import { applyMental, driftMental } from './mental.js';
import {
  SCOUT_BAR, academyOffer, annualSalary, clubVerdict, disbandNoteFor, formatMoney,
  generateOffers, renewalTerms, scoutInterest, signContract, tryout,
} from './market.js';
import {
  entryRound, opponentOvr, playoffBerth, pointsFor, roundsFrom, runSeries, splitSeed, worldsSeed,
} from '../kernel/series.js';
import { accumulate, formatStatLine, mergeSplits, simulateSeason } from './season.js';
import { adjustPatchDebt, applyPatch, checkFusions, rollInjury, trainHeroes, unlockTrait } from './progression.js';
import { homeLeagueName } from './roster.js';

class RetireSignal extends Error {
  constructor(reason) { super(reason); this.reason = reason; }
}
const retire = (reason) => { throw new RetireSignal(reason); };

/* ================= 小工具 ================= */

export function stageLabel(state) {
  if (state.stage === 'AMATEUR') return '網咖盃賽';
  if (state.stage === 'AM2') return state.am2Track === 'OVERSEAS' ? '海外青訓' : '青訓次級';
  return LEAGUES[state.league]?.region === 'HOME' ? homeLeagueName(state) : LEAGUES[state.league]?.name || '';
}

function currentLeagueKey(state) {
  if (state.stage === 'PRO') return state.league;
  return state.stage === 'AM2' ? 'AM2' : 'AMATEUR';
}

const card = (tone, title, body) => ({ type: 'card', tone, title, body });

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
      `16 歲的 <b class="hl">${state.name}</b> 在 <b class="hl">${state.team}</b> 卡到一個位子。三年後的路，要自己選。` +
      `<br><span class="muted">提示：22 歲前累積擲出 5 次「6」可覺醒隱藏素質。</span>`);
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

function* runYear(g) {
  const { state } = g;
  yield { type: 'divider', text: `${state.year} 年 · ${state.age} 歲 · ${stageLabel(state)}` };
  yield* phaseTraining(g);
  yield* phaseSeason(g);
  yield* phaseOffseason(g);

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
      ? `　經驗仍在累積：${decline.grown.map((k) => ABILITY_NAMES[k]).join('、')} <b class="up">+1</b>。` : '';
    yield card('bad', '歲月與版本',
      `${decline.phase === 2 ? '第二階段（逐年加劇）' : '第一階段'}衰退：反應／操作／體力 <b class="dn">−${decline.amount}</b>${softener}。${grown}`);
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

/* ================= 季中：賽季 ================= */

/**
 * 一年的賽季。
 *
 * 賽段制：一年不再是一次結算。依當年該賽區的真實賽制（2012 單季 →
 * 春／夏兩賽段 → 2025 起的三賽段；韓國 2012–2014 本來就是冬／春／夏三季）
 * 跑 1～3 個賽段，每個賽段各自有例行賽、季後賽與冠軍點數，全年累積的
 * 點數決定世界賽種子序——第四種子這個身分要能存在，下剋上才有起點。
 */
function* phaseSeason(g) {
  const { state, rng } = g;
  yield { type: 'phase', index: 1 };
  if (state.skipSeason) return;

  const leagueKey = currentLeagueKey(state);
  const splits = splitsOf(state.year, LEAGUES[leagueKey].region);
  const bucket = LEAGUES[leagueKey].bucket;

  state.splitLog = [];
  state.champPoints = 0;
  state.seedRank = 0;
  state.wonSplitThisYear = false;

  const collected = [];
  for (const split of splits) {
    const stat = simulateSeason(state, rng, leagueKey, split.weight);
    collected.push(stat);
    accumulate(state, bucket, stat);

    const venue = state.stage === 'AMATEUR' ? rng.pick(AMATEUR_CUPS) : stageLabel(state);
    const label = splits.length > 1 ? `${venue}　${split.name}` : venue;
    yield card('', splits.length > 1 ? `${split.name}戰報` : (state.stage === 'AMATEUR' ? '本年戰績' : '賽季戰報'),
      `${state.team}｜${label}<div class="statline">${formatStatLine(stat)}</div>`);

    // 賽段中的休息室：只有職業階段才有真正的休息室
    if (state.stage === 'PRO' && rng.chance(22)) yield* drawRoleplay(g, 'locker');

    const finish = yield* splitPlayoffs(g, split, stat, splits.length);
    state.champPoints += pointsFor(finish);
    state.splitLog.push({ name: split.name, stat, finish });

    // 每個賽段各抽一張事件卡——賽段變多，人生的岔路也跟著變多
    yield* drawEvent(g);
  }

  const stat = mergeSplits(collected);
  state.lastStat = stat;
  state.lastDelta = stat.delta;
  state.peakOvr = Math.max(state.peakOvr, ovr(state));
  if (state.stage === 'PRO') state.proYears += 1;

  const learned = trainHeroes(state, rng, stat.G);

  const penalty = patchPenalty(state);
  const ovrNote = penalty < 0
    ? `綜合 OVR <b class="hl">${ovr(state)}</b> <span class="dn">${penalty}</span>（版本落差）`
    : `綜合 OVR <b class="hl">${ovr(state)}</b>`;
  const line = formatStatLine(stat);
  if (splits.length > 1) {
    yield card('', '年度總結',
      `${state.team}｜${stageLabel(state)}　${ovrNote}<div class="statline">${line}</div>` +
      (state.stage === 'PRO' ? `<br><span class="muted">全年冠軍點數 ${state.champPoints}</span>` : ''));
  }
  state.seasonLog.push({ year: state.year, age: state.age, team: state.team, line, stat });

  if (learned.length) {
    yield card('info', '英雄池擴充',
      `苦練有成，<b class="hl">${learned.join('、')}</b> 正式進入你的比賽池。目前池深 <b class="hl">${state.heroPool.length}</b> 隻。`);
  }

  if (state.stage === 'PRO') {
    state.seedRank = worldsSeed(state.champPoints);
    yield* awards(g, stat);
  }

  if (rng.chance(38)) {
    const theme = applyPatch(state, rng);
    yield card('info', '版本大改動',
      `新版本降臨，<b class="hl">${theme}</b>成為主流。${state.traits.meta ? '你的<b class="hl">版本適應者</b>直覺讓適應壓力大減。' : '英雄池與版本適配度重新評估。'}`);
    if (!state.traits.meta && state.patchCount % 3 === 0 && unlockTrait(state, 'meta')) {
      yield card('gold', '隱藏素質解鎖：版本適應者', '多次版本洗禮後，你學會了順應版本——版本落差懲罰減半。');
      yield* fusionBeats(g);
    }
  }

  const injury = rollInjury(state, rng);
  state.carryInjuryRisk = 0; // 國際賽消耗只影響一季，用掉就清掉
  if (injury.kind === 'major') {
    yield card('bad', '重傷 · 整季報銷', '手腕／背部重傷，手術後提前結束本季，下季進入復健。');
  } else if (injury.kind === 'minor') {
    yield card('bad', '傷勢', '手腕不適，出賽與狀態受影響。');
  }

  if (!state.romance && state.age >= 18) state.singleYears += 1;
  if (state.singleYears >= 4 && !state.romance && unlockTrait(state, 'single')) {
    yield card('gold', '隱藏素質解鎖：單身', '你把青春全部獻給召喚峽谷。');
    yield* fusionBeats(g);
  }
}

/**
 * 一個賽段的季後賽。
 *
 * 舊版整年只有一次 `rng.chance()` 就決定有沒有冠軍，一局比分都看不到。
 * 現在是八強 BO3 → 四強 BO5 → 決賽 BO5 逐輪打，種子序決定從哪一輪開始，
 * 每一輪之前都留一個扮演的路口（賽前記者會、休息室），決勝局另外吃大心臟。
 *
 * @returns {'champion'|'final'|'semi'|'quarter'|'none'}
 */
function* splitPlayoffs(g, split, stat, splitCount) {
  const { state, rng } = g;
  if (state.stage !== 'PRO') return 'none';

  const title = splitCount > 1 ? `${stageLabel(state)} ${split.name}` : `${stageLabel(state)}`;
  if (!rng.chance(playoffBerth(state, stat))) {
    yield card('', `${split.name}季後賽`, `例行賽名次不夠，<b class="dn">無緣${split.name}季後賽</b>。`);
    return 'none';
  }

  const seed = splitSeed(state, stat);
  state.seedRank = seed;
  const rounds = roundsFrom(entryRound(seed));
  yield card('info', `${split.name}季後賽`,
    `以<b class="hl">第 ${seed} 種子</b>晉級${split.name}季後賽，從<b class="hl">${rounds[0].name}</b>打起。`);

  let reached = 'none';
  for (const round of rounds) {
    // 扮演路口只留在最有份量的兩輪：進場的第一輪與決賽。
    // 每一輪都問一次的話，一年會被問到九次，該有的重量就沒了
    if (round === rounds[0] || round.key === 'final') yield* drawRoleplay(g, 'presser');

    const oppOvr = opponentOvr(state, round.key, seed, rng);
    const res = runSeries(state, rng, { bo: round.bo, oppOvr, seed });
    const score = `${res.mine}-${res.theirs}`;
    const deciderNote = res.decider
      ? `<br><span class="muted">系列賽被拖進決勝局，${res.win ? '你們把它拿下來了' : '最後一局沒守住'}。</span>`
      : '';
    const foe = seed === 1 ? '對上一路殺上來的黑馬'
      : seed === 2 ? '對上實力相當的對手'
      : '對上種子序更前的隊伍';
    yield card(res.win ? 'good' : 'bad', `${round.name} · BO${round.bo}`,
      `${foe}，系列賽 <b class="${res.win ? 'up' : 'dn'}">${score}</b>${deciderNote}`);

    if (!res.win) { reached = round.key; break; }
    reached = round.key === 'final' ? 'champion' : round.key;
  }

  if (reached === 'champion') {
    state.wonPlayoffThisYear = true;
    state.wonSplitThisYear = true;
    state.splitTitles += 1;
    state.honors.push(`${state.year} ${title}冠軍`);
    yield card('gold', `${split.name}冠軍`, `你帶領 <b class="hl">${state.team}</b> 奪下 <b class="hl">${title}冠軍</b>！`);
    // 只有從最後一個種子序一路打上來才算下剋上，第三種子還不夠
    if (seed >= 4 && unlockTrait(state, 'underdog')) {
      yield card('gold', '隱藏素質解鎖：逆風翻盤',
        `第 ${seed} 種子一路打上去把冠軍拿走——沒有人看好的時候，你反而更強。`);
      yield* fusionBeats(g);
    }
    if (!state.traits.clutch && state.age <= 30 && unlockTrait(state, 'clutch')) {
      yield card('gold', '隱藏素質解鎖：大賽選手', '越大的舞台，你的手越穩。');
      yield* fusionBeats(g);
    }
    if (rng.chance(50)) yield* drawRoleplay(g, 'locker');
  } else if (reached === 'final') {
    state.honors.push(`${state.year} ${title}亞軍`);
  }
  return reached;
}

/**
 * 年度個人獎項。
 *
 * 舊版的門檻是「打滿一季就給」——單殺王要求 SOLO ≥ 場次 ×1.2，
 * 但 TOP/MID 的單殺基線本來就是每場 1.2～1.3，等於年年必拿；
 * 例行賽 MVP 也幾乎年年入袋。結果一段生涯堆出 40 幾項榮譽，
 * 生涯評分整個失真。這裡改成「相對於同位置基線」再加一次擲骰。
 */
function* awards(g, stat) {
  const { state, rng } = g;
  const o = effectiveOvr(state);
  const home = stageLabel(state);
  const par = LEAGUES[currentLeagueKey(state)].par;
  if (stat.G < 20) return;

  // 例行賽 MVP：一個聯賽一年只有一個人拿得到
  if (stat.delta >= 3 && stat.MVP >= Math.max(4, Math.round(stat.G * 0.09)) && rng.chance(30 + stat.delta * 3)) {
    state.honors.push(`${state.year} 例行賽 MVP`);
    yield card('gold', '例行賽 MVP', `以 ${stat.MVP} 次單場 MVP 拿下<b class="hl">${state.year} ${home} 例行賽 MVP</b>！`);
  }

  if (state.age <= 20 && stat.delta >= 2 && state.proYears <= 1) {
    state.honors.push(`${state.year} 最佳新人`);
    yield card('gold', '最佳新人', `新秀賽季即打出 <b class="hl">${stat.delta >= 4 ? '頂級' : '優秀'}</b> 表現，榮膺最佳新人。`);
  }

  // 單殺王：與同位置基線比較，而不是與場次比較
  const soloBaseline = STAT_BASELINE[state.role].SOLO;
  if (o >= par + 2 && stat.SOLO >= stat.G * soloBaseline * 1.5 && rng.chance(45)) {
    state.honors.push(`${state.year} 單殺王`);
    yield card('gold', '單殺王', `季內累積 <b class="hl">${stat.SOLO}</b> 次單殺，冠絕 ${home}！`);
    if (state.age < 26 && unlockTrait(state, 'laneking')) {
      yield card('gold', '隱藏素質解鎖：單殺王', '對線壓制是你的本能，SOLO 產出提升。');
      yield* fusionBeats(g);
    }
  }

  if (stat.delta >= 1 && rng.chance(22 + stat.delta * 4)) {
    state.honors.push(`${state.year} 全明星`);
    state.stats[LEAGUES[currentLeagueKey(state)].bucket].AS += 1;
    yield card('info', '全明星入選', `入選 ${state.year} ${home} 全明星。`);
  }
}

/** 縮放事件結果的數值：倍率再小也不會把有效果的一項縮成 0 */
function scaleAmount(v, mult) {
  if (!v || mult === 1) return v;
  return Math.sign(v) * Math.max(1, Math.round(Math.abs(v) * mult));
}

/** 隱藏素質相關的 flag——選了「安全牌」的選項時整批不生效 */
const TRAIT_FLAGS = ['popular', 'composure', 'leader', 'laneking', 'macroPoint', 'tiltRisk'];

/** 選項按鈕上的說明：成功率與幅度一律由數值生成，不在資料層寫死 */
function optionNote(opt, bonus) {
  const parts = [`成功 ${clamp((opt.odds ?? 50) + bonus, 5, 95)}%`];
  const gain = opt.gain ?? 1;
  const loss = opt.loss ?? 1;
  if (gain >= 1.5 && loss >= 1.5) parts.push('大起大落');
  else if (gain >= 1.5) parts.push('成了收穫加倍');
  else if (loss >= 1.5) parts.push('失手代價加重');
  else if (gain <= 0.6 && loss <= 0.6) parts.push('幅度小');
  if (opt.traits === false) parts.push('不觸發隱藏素質');
  return parts.join('・');
}

/**
 * 事件卡。
 *
 * 舊版是引擎自己擲一次 50/50 就把結果貼出來，玩家從頭到尾只是讀者——
 * 整段生涯能真正做決定的地方只剩訓練加點與合約路口。現在先描述處境，
 * 再讓玩家選一條應對方式，選項本身決定成功率與數值幅度；「安全牌」
 * 換到的是低變異，代價是那條路不會覺醒任何隱藏素質。
 */
function* drawEvent(g) {
  const { state, rng } = g;
  const ev = rng.pick(EVENT_CARDS);
  const oddsBonus = flag(state, 'giftedDice') ? 20 : 0;

  yield card('', ev.name, ev.prompt);

  const pickedId = yield {
    type: 'choice',
    title: `${ev.name}：你怎麼應對？`,
    options: ev.options.map((o) => ({
      id: o.id, label: o.label, main: !!o.main, note: optionNote(o, oddsBonus),
    })),
  };
  const opt = ev.options.find((o) => o.id === pickedId) || ev.options[0];

  const immune = flag(state, 'indulgentImmune') && ev.kind === 'indulgent';
  const good = immune || rng.chance(clamp((opt.odds ?? 50) + oddsBonus, 5, 95));
  const outcome = good ? ev.good : ev.bad;
  const mult = good ? (opt.gain ?? 1) : (opt.loss ?? 1);
  const allowTraits = opt.traits !== false;

  const notes = [];
  for (const [k, v] of Object.entries(outcome.ability || {})) {
    const applied = adjustAbility(state, k, scaleAmount(v, mult));
    if (applied > 0) notes.push(`${ABILITY_NAMES[k]} <span class="up">+${applied}</span>`);
    else if (applied < 0) notes.push(`${ABILITY_NAMES[k]} <span class="dn">${applied}</span>`);
  }

  const unlocked = [];
  const flags = { ...(outcome.flags || {}), ...(opt.flags || {}) };
  if (!allowTraits) for (const key of TRAIT_FLAGS) delete flags[key];
  // 數值型副作用跟能力值一樣吃選項倍率，布林型（素質、戀愛）則不縮放
  const patchDebt = scaleAmount(flags.patchDebt, mult);
  if (patchDebt) {
    adjustPatchDebt(state, patchDebt);
    notes.push(patchDebt < 0 ? '版本落差 <span class="up">↓</span>' : '版本落差 <span class="dn">↑</span>');
  }
  if (flags.injuryRisk) state.tempInjuryRisk += scaleAmount(flags.injuryRisk, mult);
  const bonusSalary = scaleAmount(flags.bonusSalary, mult);
  if (bonusSalary) { state.bonusSalary += bonusSalary; notes.push(`業外收入 <span class="up">+${bonusSalary}萬</span>`); }
  const mateMorale = scaleAmount(flags.mateMorale, mult);
  if (mateMorale) { state.mateMorale += mateMorale; notes.push('隊友士氣 <span class="dn">↓</span>'); }
  if (flags.romance) { state.romance = true; state.singleYears = 0; }
  if (flags.popular && unlockTrait(state, 'popular')) unlocked.push('popular');
  if (flags.composure && unlockTrait(state, 'composure')) unlocked.push('composure');
  if (flags.leader && unlockTrait(state, 'leader')) unlocked.push('leader');
  if (flags.laneking && state.age < 28 && unlockTrait(state, 'laneking')) unlocked.push('laneking');
  if (flags.macroPoint && state.ability.macro >= 60 && unlockTrait(state, 'macroG')) unlocked.push('macroG');
  if (flags.tiltRisk && !flag(state, 'tiltImmune') && rng.chance(25)) {
    if (unlockTrait(state, 'tilt')) unlocked.push('tilt');
  }

  // 自律：連續三次在享樂類事件上守住。安全牌不算——那是躲開，不是守住
  if (ev.kind === 'indulgent') {
    if (good && allowTraits) {
      state.discStreak += 1;
      if (state.discStreak >= 3 && unlockTrait(state, 'disc')) unlocked.push('disc');
    } else if (!good) {
      state.discStreak = 0;
    }
  }

  const tone = good ? 'good' : 'bad';
  const chosen = `<span class="muted">你的選擇：${opt.label}</span><br>`;
  const text = `<span class="${good ? 'up' : 'dn'}">${outcome.text}</span>${notes.length ? `（${notes.join('、')}）` : ''}`;
  yield card(tone, ev.name, chosen + text + (immune ? '<br><span class="muted">苦行僧：享樂誘惑對你無效。</span>' : ''));

  for (const key of unlocked) {
    const t = BASE_TRAITS[key];
    yield card(key === 'tilt' ? 'bad' : 'gold',
      `隱藏素質${key === 'tilt' ? '出現' : '解鎖'}：${t.name}`, t.desc);
  }
  if (unlocked.length) yield* fusionBeats(g);
}

/* ================= 扮演事件 ================= */

/** 性格特質的門檻。全部走同一條路：連續往同一個方向演，久了就成為那樣的人。 */
const PERSONA_RULES = [
  { key: 'trashtalk', tone: 'bold', streak: 5, need: (s) => s.mental.ego >= 74 && s.mental.fame >= 45 },
  { key: 'bigheart', tone: null, streak: 0, need: (s) => s.mental.nerve >= 90 },
  { key: 'glue', tone: 'plain', streak: 5, need: (s) => s.mental.chem >= 86 },
  { key: 'lonewolf', tone: 'bold', streak: 6, need: (s) => s.mental.chem <= 24 && s.mental.ego >= 72 },
  { key: 'idol', tone: null, streak: 0, need: (s) => s.mental.fame >= 72 && s.mental.rep >= 55 },
  { key: 'pariah', tone: null, streak: 0, need: (s) => s.mental.rep <= -75 },
];

/**
 * 抽一張扮演卡。
 *
 * 跟能力事件卡的關鍵差別：**這裡不擲骰決定成敗**。扮演不是賭博——你選了
 * 什麼就是什麼樣的人，心理值照著選項直接走。真正隨機的只有外界反應的
 * 敘述，而且反應的力道由知名度放大：越紅的人，同一句話被放得越大。
 *
 * @param {'presser'|'media'|'locker'|'coach'|'daily'} when
 */
function* drawRoleplay(g, when) {
  const { state, rng } = g;
  const pool = ROLEPLAY_CARDS.filter((c) => c.when === when && (!c.need || c.need(state)));
  if (!pool.length) return;

  // 依權重抽卡
  const total = pool.reduce((t, c) => t + c.weight, 0);
  let roll = rng.next() * total;
  const ev = pool.find((c) => (roll -= c.weight) < 0) || pool[0];

  yield card('', ev.name, ev.prompt);

  const pickedId = yield {
    type: 'choice',
    title: ev.name,
    options: ev.options.map((o) => ({ id: o.id, label: o.label, main: o.tone === 'plain' })),
  };
  const opt = ev.options.find((o) => o.id === pickedId) || ev.options[0];

  // 知名度放大聲量類的效果：紅了之後，同一句話的後座力完全不同
  const amp = 1 + Math.max(0, state.mental.fame - 40) / 100;
  const deltas = {};
  for (const [k, v] of Object.entries(opt.mental || {})) {
    deltas[k] = (k === 'fame' || k === 'rep') ? Math.round(v * amp) : v;
  }
  if (opt.tone === 'bold' && state.traits.trashtalk) {
    deltas.fame = Math.round((deltas.fame || 0) * 1.6);
    deltas.rep = Math.round((deltas.rep || 0) * 1.6);
  }
  if (opt.tone === 'plain' && state.traits.glue && deltas.chem > 0) deltas.chem *= 2;
  if (state.epic.showman) {
    if (deltas.fame < 0) deltas.fame = 0;
    if (deltas.rep < 0) deltas.rep = Math.round(deltas.rep * 0.5);
  }

  const notes = applyMental(state, deltas);

  // 連續往同一個方向演，才會定型成性格
  for (const t of Object.keys(state.toneStreak)) {
    state.toneStreak[t] = t === opt.tone ? state.toneStreak[t] + 1 : 0;
  }

  const reaction = rng.pick(CROWD_REACTIONS[opt.tone] || CROWD_REACTIONS.plain);
  yield card(opt.tone === 'bold' ? 'info' : '', ev.name,
    `<span class="muted">你的選擇：${opt.label}</span><br>${reaction}` +
    (notes.length ? `（${notes.join('、')}）` : ''));

  yield* personaBeats(g);
}

/** 性格特質的覺醒檢查。心理值本身不揭露，只在跨過門檻時給一張卡。 */
function* personaBeats(g) {
  const { state } = g;
  const unlocked = [];
  for (const rule of PERSONA_RULES) {
    if (state.traits[rule.key]) continue;
    if (rule.tone && state.toneStreak[rule.tone] < rule.streak) continue;
    if (!rule.need(state)) continue;
    if (unlockTrait(state, rule.key)) unlocked.push(rule.key);
  }
  for (const key of unlocked) {
    const t = BASE_TRAITS[key];
    yield card(key === 'pariah' ? 'bad' : 'gold',
      `性格成形：${t.name}`, t.desc);
  }
  if (unlocked.length) yield* fusionBeats(g);
}

/** 合成檢查——完全隱藏配方，卡片只給氛圍敘事 */
function* fusionBeats(g) {
  const gained = checkFusions(g.state);
  for (const key of gained) {
    yield card('gold', '？？ 覺醒',
      `你感到體內某股更深沉的力量徹底覺醒……<b class="hl">${EPIC_TRAITS[key].name}</b>` +
      `<br><span class="muted">${EPIC_TRAITS[key].desc}</span>`);
  }
}

/* ================= 季末：休賽期 ================= */

function* phaseOffseason(g) {
  const { state, rng } = g;
  yield { type: 'phase', index: 2 };

  // 季後賽已經在各賽段內打完了，休賽期處理的是鏡頭前的事
  if (state.stage === 'PRO' && !state.skipSeason && rng.chance(38)) {
    yield* drawRoleplay(g, 'media');
  }

  yield* settleSalary(g);

  if (state.pendingPoints > 0) {
    const points = state.pendingPoints;
    state.pendingPoints = 0;
    yield { type: 'alloc', mode: 'points', points, title: `能力點分配（${points} 點）` };
  }

  yield* internationalStage(g);

  if (state.pendingPoints > 0) {
    const points = state.pendingPoints;
    state.pendingPoints = 0;
    yield { type: 'alloc', mode: 'points', points, title: `大賽成果分配（${points} 點）` };
  }

  yield* movement(g);
}

function* settleSalary(g) {
  const { state } = g;
  if (state.stage === 'AMATEUR' || !state.contract) return;
  const pay = annualSalary(state, currentLeagueKey(state), state.contract.mult);
  const extra = state.bonusSalary;
  state.bonusSalary = 0;
  state.salary += pay + extra;
  const remain = Math.max(0, state.contract.years - 1);
  yield card('', '年度結算',
    `本年度薪資：<b class="hl">${formatMoney(pay)}</b>${extra ? `　業外 <b class="hl">${formatMoney(extra)}</b>` : ''}` +
    `　生涯累計 <b class="hl">${formatMoney(state.salary)}</b>　合約剩 ${remain} 年`);
}

function* internationalStage(g) {
  const { state, rng } = g;

  if (msiEligible(state)) {
    const forced = msiForced(state);
    const picked = yield {
      type: 'choice',
      title: `國家隊徵召 · 出征 MSI ${state.year}`,
      options: forced
        ? [{ id: 'go', label: '⋯⋯只能報到（列管徵召）', note: '依成績獲能力點｜下季受傷風險 +10%', main: true }]
        : [
            { id: 'go', label: '披上國家隊戰袍', note: '依成績獲能力點｜下季受傷風險 +10%', main: true },
            { id: 'skip', label: '以調整為由婉拒', note: '下季狀態優先' },
          ],
    };
    if (picked === 'go') {
      const res = runMsi(state, rng);
      yield card(res.index === 0 ? 'gold' : 'info', 'MSI 結算',
        `<b class="hl">${res.rank}</b>。獲得能力點 <b class="hl">${res.points}</b> 點。` +
        (state.epic.nationalace ? '國家隊王牌不受國際賽消耗影響。' : '國際賽消耗讓你下季受傷風險上升。'));
      if (res.index <= 1 && state.intlAppearances >= 2 && unlockTrait(state, 'intlghost')) {
        yield card('gold', '隱藏素質解鎖：國際賽之鬼', '國際舞台上，你是另一個人。');
        yield* fusionBeats(g);
      }
    }
  }

  if (worldsEligible(state) && rng.chance(worldsQualifyChance(state))) {
    yield card('info', '世界賽',
      `你隨 <b class="hl">${state.team}</b> 以<b class="hl">第 ${state.seedRank} 種子</b>晉級 ${state.year} 世界大賽！` +
      (state.seedRank >= 3 ? '<br><span class="muted">賽前預測沒有一份把你們排進四強。</span>' : ''));
    yield* drawRoleplay(g, 'presser');
    const res = runWorlds(state, rng);
    yield card(res.champion ? 'gold' : 'info', '世界賽結算',
      `<b class="hl">${res.stage}</b>。${res.champion ? '你捧起召喚師獎盃，成為全世界的英雄！' : ''}` +
      (res.underdog ? '<br><b class="hl">最後一張門票進來的隊伍，把冠軍帶走了。</b>' : ''));
    if (res.champion) {
      applyMental(state, { fame: 25, rep: 12, nerve: 8, chem: 6 });
      if (res.underdog && unlockTrait(state, 'bigheart')) {
        yield card('gold', '性格成形：大心臟', BASE_TRAITS.bigheart.desc);
        yield* fusionBeats(g);
      }
    }
    if (res.champion && !state.traits.franchise && unlockTrait(state, 'franchise')) {
      yield card('gold', '隱藏素質解鎖：神主牌', '你就是這支隊伍的門面，續約時沒有人敢先開口砍價。');
      yield* fusionBeats(g);
    }
  }
}

/* ================= 升降級 / 轉會 / FA / 解散 ================= */

function* movement(g) {
  const { state, rng } = g;

  if (state.stage === 'AMATEUR') {
    // 數值達標就會有隊伍上門，不必熬滿三年
    yield* amateurStage(g);
    return;
  }

  if (state.stage === 'AM2') {
    if (state.age >= 28) retire(`多次試訓落榜，${state.year} 年退出電競圈。`);
    const picked = yield {
      type: 'choice',
      title: '青訓年度結束',
      options: [
        { id: 'try', label: `再次參加${state.am2Track === 'OVERSEAS' ? '海外' : '主場'}賽區試訓`, main: true, note: `綜合 ${effectiveOvr(state)}` },
        { id: 'switch', label: state.am2Track === 'OVERSEAS' ? '轉回主場賽區試訓' : '改走海外賽區路線', note: '海外門檻高、薪資高' },
        { id: 'quit', label: '就此退役', warn: true },
      ],
    };
    if (picked === 'quit') retire('結束短暫的追夢之旅。');
    if (picked === 'switch') state.am2Track = state.am2Track === 'OVERSEAS' ? 'HOME' : 'OVERSEAS';

    const res = tryout(state, rng, state.am2Track);
    if (res.ok) {
      state.stage = 'PRO';
      state.stageYear = 0;
      signContract(state, rng, res);
      yield card('gold', '試訓通過',
        `你被 <b class="hl">${res.team}</b> 簽下，正式踏入 <b class="hl">${LEAGUES[res.league].region === 'HOME' ? homeLeagueName(state) : LEAGUES[res.league].name}</b> 職業賽場！教練體系：${state.coach}。`);
    } else {
      yield card('bad', '試訓落榜', '名單公布，沒有你的名字。再練一年。');
    }
    return;
  }

  /* ---- PRO ---- */
  if (state.age >= 28 && (state.lastDelta || 0) >= 0 && !state.skipSeason && unlockTrait(state, 'veteran')) {
    yield card('gold', '隱藏素質解鎖：老將', '28 歲仍屹立一軍，你學會用頭腦打比賽。<b class="hl">衰退減緩、可延長生涯</b>。');
    yield* fusionBeats(g);
  }

  if (effectiveOvr(state) < 30) retire('能力已跌破青訓最低水準，遭釋出，被迫退役。');

  const note = disbandNoteFor(state);
  if (note) {
    if (state.wonWorldsThisYear) {
      yield card('gold', '改寫歷史',
        `你們用一座世界冠軍<b class="hl">改寫了史實</b>——<b class="hl">${state.team}</b> 沒有解散，母公司宣布續營！`);
      state.honors.push(`${state.year} 改寫歷史`);
      // 續營＝合約照走
      tickContract(state);
      return;
    }
    yield card('bad', '隊伍解散', `<b class="hl">${state.team}</b> ${note}。合約作廢，你被<b class="hl">強制送入自由市場</b>。`);
    state.contract = null;
    state.forcedFA = true;
    yield* freeAgency(g, { forced: true });
    return;
  }

  // 休息室與輿論的後果。合約還沒到期也擋不住——這是「被開除」跟「約滿不續」的差別
  const verdict = clubVerdict(state, rng);
  if (verdict.kind !== 'none') {
    state.firedTimes += 1;
    state.contract = null;
    state.forcedFA = true;
    if (verdict.kind === 'fired') {
      yield card('bad', '戰隊切割',
        `${verdict.note}。<b class="hl">${state.team}</b> 單方面終止合約，你被<b class="dn">強制推上自由市場</b>，` +
        `而且這次願意接電話的隊伍不多。`);
    } else {
      yield card('bad', '被迫轉隊',
        `${verdict.note}。你跟隊友之間已經沒辦法再同場訓練，<b class="hl">${state.team}</b> 把你掛上交易名單。`);
    }
    yield* drawRoleplay(g, 'media');
    yield* freeAgency(g, { forced: true });
    return;
  }

  // 復健年也要走合約時鐘（舊版直接跳過，等於免費續一年）
  if (state.contract && state.contract.years > 1) {
    tickContract(state);
    return;
  }
  yield* freeAgency(g, { forced: false });
}

function tickContract(state) {
  if (state.contract) state.contract.years = Math.max(0, state.contract.years - 1);
  state.teamYears += 1;
}

/** 聯賽的顯示名（主場賽區依時代改名） */
function leagueLabel(state, leagueKey) {
  return LEAGUES[leagueKey].region === 'HOME' ? homeLeagueName(state) : LEAGUES[leagueKey].name;
}

function* joinProTeam(g, offer, track, title) {
  const { state, rng } = g;
  state.stage = 'PRO';
  state.stageYear = 0;
  state.am2Track = track;
  signContract(state, rng, offer);
  yield card('gold', title,
    `你被 <b class="hl">${offer.team}</b> 簽下，正式踏入 <b class="hl">${leagueLabel(state, offer.league)}</b>！教練體系：${state.coach}。`);
}

function* joinAcademy(g, offer, track) {
  const { state, rng } = g;
  state.stage = 'AM2';
  state.stageYear = 0;
  state.am2Track = track;
  signContract(state, rng, offer);
  yield card('info', '青訓報到',
    `<b class="hl">${offer.team}</b> 把你收進二隊。薪水很低，但你終於有教練、有訓練賽、有隊友。`);
}

/**
 * 業餘階段的出路判定：只要數值達標，就會有隊伍上門，不必熬滿三年。
 *
 * 「職業隊」不是只有一隊。舊流程只給「投入主場賽區試訓」這一個選項，門檻 45，
 * 但三年期滿時 OVR 中位數只有 37——那個選項的成功率實測是 0%，每個人都是走完
 * 假的路口再被丟進青訓。現在分成三層各自判定：
 *
 *   青訓二隊（門檻 36）：網咖打出名號後最常見的出路
 *   主場一隊（門檻 45）：少年天才，直接進一軍
 *   海外賽區（門檻 47）：極罕見
 *
 * 前三年可以婉拒、留下來把數值養高再談，婉拒沒有懲罰；第三年起必須做決定。
 */
function* amateurStage(g) {
  const { state, rng } = g;
  const mandatory = state.stageYear >= 3;
  const interest = scoutInterest(state);
  const offers = [];

  if (interest.overseas) {
    const abroad = tryout(state, rng, 'OVERSEAS');
    if (abroad.ok) offers.push({ offer: abroad, track: 'OVERSEAS', pro: true });
  }
  if (interest.home) {
    const home = tryout(state, rng, 'HOME');
    if (home.ok) offers.push({ offer: home, track: 'HOME', pro: true });
  }
  if (interest.am2) {
    const track = interest.overseas ? 'OVERSEAS' : 'HOME';
    offers.push({ offer: academyOffer(state, rng, track), track, pro: false });
  }

  if (!offers.length) {
    if (mandatory) yield* amateurDeadEnd(g);
    return;
  }

  yield card('gold', mandatory ? '職業隊的邀約' : '星探上門',
    `網咖店長把你上週那場的錄影傳了出去。<b class="hl">${offers.map((x) => x.offer.team).join('、')}</b> ` +
    `派人來看你打了一整晚。${mandatory ? '' : `${state.age} 歲，還沒打滿三年業餘，就有人來敲門了。`}`);

  const options = offers.map(({ offer, pro }, i) => ({
    id: `sign-${i}`,
    label: `${offer.team}（${pro ? leagueLabel(state, offer.league) : '青訓二隊'}）`,
    note: `${offer.years} 年｜年薪估 ${formatMoney(annualSalary(state, offer.league, offer.mult))}`
      + `｜隊伍平均 ${LEAGUES[offer.league].par}`,
    main: i === 0,
  }));

  if (mandatory) {
    options.push({ id: 'quit', label: '放棄職業之路', warn: true });
  } else {
    options.push({
      id: 'wait',
      label: '婉拒，留在業餘再練一年',
      note: `目前綜合 ${interest.ovr}；現在進去就是墊底，養高一點再談條件`,
    });
  }

  const picked = yield {
    type: 'choice',
    title: mandatory
      ? `網咖盃第 ${state.stageYear} 年 · 綜合 ${interest.ovr} · 該做決定了`
      : `有人要簽你 · ${state.year}`,
    options,
  };

  if (picked === 'quit') retire('最後一場網咖盃打完，你把自己的滑鼠收進背包，再也沒回過那條街。');
  if (picked === 'wait') {
    yield card('', '婉拒邀約', '你說再等等。回到網咖那個位子，繼續練。');
    return;
  }

  const chosen = offers[Number(picked.split('-')[1])];
  if (chosen.pro) yield* joinProTeam(g, chosen.offer, chosen.track, state.stageYear < 3 ? '提前轉職業' : '入選職業隊');
  else yield* joinAcademy(g, chosen.offer, chosen.track);
}

/** 三年期滿卻連青訓門檻都沒摸到 */
function* amateurDeadEnd(g) {
  const { state } = g;
  const o = effectiveOvr(state);
  if (state.age >= 22) {
    retire(`打到 ${state.age} 歲，連二隊的門檻都沒摸到。你把網咖那張會員卡剪了。`);
  }
  const picked = yield {
    type: 'choice',
    title: `網咖盃第 ${state.stageYear} 年 · 綜合 ${o} · 還沒有人來`,
    options: [
      { id: 'stay', label: '再打一年網咖盃', main: true, note: `門檻：青訓 ${SCOUT_BAR.AM2}｜主場一隊 ${SCOUT_BAR.HOME}｜最多撐到 22 歲` },
      { id: 'quit', label: '放棄職業之路', warn: true },
    ],
  };
  if (picked === 'quit') retire('最後一場網咖盃打完，你把自己的滑鼠收進背包，再也沒回過那條街。');
  yield card('', '再練一年', '沒有人打電話來。你把位子續了下去。');
}

function* freeAgency(g, { forced }) {
  const { state, rng } = g;
  const offers = generateOffers(state, rng, { excludeCurrentTeam: forced });
  const options = [];

  if (!forced && state.contract) {
    const { long, short } = renewalTerms(state);
    options.push({
      id: 'renew-long',
      label: `與 ${state.team} 續長約`,
      note: `${long.years} 年｜年薪估 ${formatMoney(annualSalary(state, state.league, long.mult))}`,
      main: true,
      payload: { team: state.team, league: state.league, ...long },
    });
    options.push({
      id: 'renew-short',
      label: `與 ${state.team} 簽短約`,
      note: `${short.years} 年｜年薪估 ${formatMoney(annualSalary(state, state.league, short.mult))}｜賭下次身價`,
      payload: { team: state.team, league: state.league, ...short },
    });
  }

  offers.forEach((offer, i) => {
    const league = LEAGUES[offer.league];
    const label = league.region === 'HOME' ? homeLeagueName(state) : league.name;
    options.push({
      id: `offer-${i}`,
      label: `${offer.team}（${label}）`,
      note: `${offer.years} 年｜年薪估 ${formatMoney(offer.salary)}｜係數 ×${offer.mult.toFixed(2)}`,
      payload: offer,
    });
  });

  if (!options.length) {
    if (forced) {
      state.forcedRetire = true;
      yield card('bad', '自由市場無人問津', '解散後，各隊名單已滿，電話再也沒有響過。');
      retire(`隊伍解散後無人接手，${state.year} 年黯然退役。`);
    }
    yield card('bad', '自由市場', '電話沒有響。市場對你的評價相當冷。');
    const picked = yield {
      type: 'choice',
      title: '沒有球隊開價',
      options: [
        { id: 'cut', label: `回 ${state.team} 減薪簽約`, note: '1 年｜年薪係數 ×0.70', main: true },
        { id: 'quit', label: '就此退役', warn: true },
      ],
    };
    if (picked === 'quit') retire(`FA 市場乏人問津，${state.year} 年黯然退役。`);
    signContract(state, rng, { team: state.team, league: state.league, years: 1, mult: 0.7 });
    yield card('info', '減薪續約', `你接受了減薪，留在 <b class="hl">${state.team}</b>。`);
    return;
  }

  if (!forced) options.push({ id: 'quit', label: '功成身退，宣布退役', warn: true });

  const pickedId = yield {
    type: 'choice',
    title: forced ? '自由市場報價一覽（強制轉隊）' : '合約到期 · 取得自由球員資格',
    options,
  };
  if (pickedId === 'quit') retire(`${state.year} 年，你在生涯高點選擇了離開。`);

  const chosen = options.find((o) => o.id === pickedId);
  const before = state.team;
  signContract(state, rng, chosen.payload);
  if (chosen.payload.team === before && chosen.id.startsWith('renew')) {
    yield card('info', '續約', `與 <b class="hl">${state.team}</b> 完成 ${chosen.payload.years} 年續約。`);
  } else {
    yield card('info', '簽約',
      `與 <b class="hl">${state.team}</b> 簽下 <b class="hl">${chosen.payload.years} 年</b>合約（年薪係數 ×${chosen.payload.mult.toFixed(2)}）。教練體系：${state.coach}。`);
  }
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

/* ================= 給 UI 用的加點介面 ================= */

export const alloc = { investAbility, abilityKeys };
