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
import { BASE_TRAITS, EPIC_TRAITS } from '../data/traits.js';
import { LEAGUES, START_YEAR } from '../data/world.js';
import {
  abilityKeys, adjustAbility, applyAgeDecline, effectiveOvr,
  investAbility, ovr, patchPenalty, retirementAge,
} from './abilities.js';
import { careerTier, tierName } from './career.js';
import { msiEligible, msiForced, runMsi, runWorlds, worldsEligible, worldsQualifyChance } from './international.js';
import {
  annualSalary, assignAcademyTeam, disbandNoteFor, formatMoney,
  generateOffers, renewalTerms, signContract, tryout,
} from './market.js';
import { accumulate, formatStatLine, simulateSeason } from './season.js';
import { adjustPatchDebt, applyPatch, checkFusions, rollInjury, trainHeroes, unlockTrait } from './progression.js';
import { homeLeagueName } from './team.js';

class RetireSignal extends Error {
  constructor(reason) { super(reason); this.reason = reason; }
}
const retire = (reason) => { throw new RetireSignal(reason); };

/* ================= 小工具 ================= */

export function stageLabel(state) {
  if (state.stage === 'ACAD') return '校園電競';
  if (state.stage === 'AM2') return state.am2Track === 'OVERSEAS' ? '海外青訓' : '青訓次級';
  return LEAGUES[state.league]?.region === 'HOME' ? homeLeagueName(state) : LEAGUES[state.league]?.name || '';
}

function currentLeagueKey(state) {
  if (state.stage === 'PRO') return state.league;
  return state.stage === 'AM2' ? 'AM2' : 'ACAD';
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
      `${state.year} 年春天，${ABILITY_NAMES ? '' : ''}<b class="hl">${state.name}</b> 加入 <b class="hl">${state.team}</b>。三年後的路，要自己選。` +
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
    yield card('bad', '更衣室流言',
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
}

function* rollTrainingDice(g, forced) {
  const { state, rng } = g;
  let dice;

  if (forced) {
    dice = Array.from({ length: forced }, () => rng.int(1, 6));
  } else {
    const r = rng.next();
    let count = r < 0.35 ? 4 : r < 0.75 ? 5 : r < 0.97 ? 6 : 7;
    if (state.epic.ascetic) count += 1;
    if (state.traits.disc && rng.chance(30)) count += 1;
    const gifted = state.traits.genius || state.epic.godhand;
    dice = Array.from({ length: count }, () => (gifted ? rng.int(4, 6) : rng.int(1, 6)));
  }

  const gifted = state.traits.genius || state.epic.godhand;
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

function* phaseSeason(g) {
  const { state, rng } = g;
  yield { type: 'phase', index: 1 };
  if (state.skipSeason) return;

  const leagueKey = currentLeagueKey(state);
  const stat = simulateSeason(state, rng, leagueKey);
  state.lastStat = stat;
  state.lastDelta = stat.delta;
  state.peakOvr = Math.max(state.peakOvr, ovr(state));

  const bucket = LEAGUES[leagueKey].bucket;
  accumulate(state, bucket, stat);
  if (state.stage === 'PRO') state.proYears += 1;

  const learned = trainHeroes(state, rng, stat.G);

  const penalty = patchPenalty(state);
  const ovrNote = penalty < 0
    ? `綜合 OVR <b class="hl">${ovr(state)}</b> <span class="dn">${penalty}</span>（版本落差）`
    : `綜合 OVR <b class="hl">${ovr(state)}</b>`;
  const line = formatStatLine(stat);
  yield card('', '賽季戰報',
    `${state.team}｜${stageLabel(state)}　${ovrNote}<div class="statline">${line}</div>`);
  state.seasonLog.push({ year: state.year, age: state.age, team: state.team, line, stat });

  if (learned.length) {
    yield card('info', '英雄池擴充',
      `苦練有成，<b class="hl">${learned.join('、')}</b> 正式進入你的比賽池。目前池深 <b class="hl">${state.heroPool.length}</b> 隻。`);
  }

  if (state.stage === 'PRO') yield* awards(g, stat);

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

  yield* drawEvent(g);

  if (!state.romance && state.age >= 18) state.singleYears += 1;
  if (state.singleYears >= 4 && !state.romance && unlockTrait(state, 'single')) {
    yield card('gold', '隱藏素質解鎖：單身', '你把青春全部獻給召喚峽谷。');
    yield* fusionBeats(g);
  }
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

function* drawEvent(g) {
  const { state, rng } = g;
  const ev = rng.pick(EVENT_CARDS);
  const goodChance = state.traits.genius || state.epic.godhand ? 70 : 50;
  const immune = state.epic.ascetic && ev.kind === 'indulgent';
  const good = immune || rng.chance(goodChance);
  const outcome = good ? ev.good : ev.bad;

  const notes = [];
  for (const [k, v] of Object.entries(outcome.ability || {})) {
    const applied = adjustAbility(state, k, v);
    if (applied > 0) notes.push(`${ABILITY_NAMES[k]} <span class="up">+${applied}</span>`);
    else if (applied < 0) notes.push(`${ABILITY_NAMES[k]} <span class="dn">${applied}</span>`);
  }

  const unlocked = [];
  const flags = outcome.flags || {};
  if (flags.patchDebt) {
    adjustPatchDebt(state, flags.patchDebt);
    notes.push(flags.patchDebt < 0 ? '版本落差 <span class="up">↓</span>' : '版本落差 <span class="dn">↑</span>');
  }
  if (flags.injuryRisk) state.tempInjuryRisk += flags.injuryRisk;
  if (flags.bonusSalary) { state.bonusSalary += flags.bonusSalary; notes.push(`業外收入 <span class="up">+${flags.bonusSalary}萬</span>`); }
  if (flags.mateMorale) { state.mateMorale += flags.mateMorale; notes.push('隊友士氣 <span class="dn">↓</span>'); }
  if (flags.romance) { state.romance = true; state.singleYears = 0; }
  if (flags.popular && unlockTrait(state, 'popular')) unlocked.push('popular');
  if (flags.composure && unlockTrait(state, 'composure')) unlocked.push('composure');
  if (flags.leader && unlockTrait(state, 'leader')) unlocked.push('leader');
  if (flags.laneking && state.age < 28 && unlockTrait(state, 'laneking')) unlocked.push('laneking');
  if (flags.macroPoint && state.ability.macro >= 60 && unlockTrait(state, 'macroG')) unlocked.push('macroG');
  if (flags.tiltRisk && !state.epic.ultstage && !state.traits.composure && rng.chance(25)) {
    if (unlockTrait(state, 'tilt')) unlocked.push('tilt');
  }

  // 自律：連續三次在享樂類事件上守住
  if (ev.kind === 'indulgent') {
    if (good) {
      state.discStreak += 1;
      if (state.discStreak >= 3 && unlockTrait(state, 'disc')) unlocked.push('disc');
    } else {
      state.discStreak = 0;
    }
  }

  const tone = good ? 'good' : 'bad';
  const text = `<span class="${good ? 'up' : 'dn'}">${outcome.text}</span>${notes.length ? `（${notes.join('、')}）` : ''}`;
  yield card(tone, ev.name, text + (immune ? '<br><span class="muted">苦行僧：享樂誘惑對你無效。</span>' : ''));

  for (const key of unlocked) {
    const t = BASE_TRAITS[key];
    yield card(key === 'tilt' ? 'bad' : 'gold',
      `隱藏素質${key === 'tilt' ? '出現' : '解鎖'}：${t.name}`, t.desc);
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

  if (state.stage === 'PRO' && !state.skipSeason) {
    const league = LEAGUES[state.league];
    const base = league.region === 'HOME' ? 14 : 6;
    const ceiling = league.region === 'HOME' ? 26 : 12;
    let chance = clamp(base + (state.lastDelta || 0) * 0.5, 1, ceiling);
    if (state.traits.clutch) chance *= 1.15;
    if (state.epic.ultstage) chance *= 1.15;
    if (state.traits.tilt) chance *= 0.85;
    if (rng.chance(chance)) {
      state.wonPlayoffThisYear = true;
      const title = league.region === 'HOME' ? `${homeLeagueName(state)} 季後賽冠軍` : `${league.name} 季後賽冠軍`;
      state.honors.push(`${state.year} ${title}`);
      yield card('gold', '季後賽', `你帶領 <b class="hl">${state.team}</b> 奪下 <b class="hl">${title}</b>！`);
      if (!state.traits.clutch && state.age <= 30 && unlockTrait(state, 'clutch')) {
        yield card('gold', '隱藏素質解鎖：大賽選手', '越大的舞台，你的手越穩。');
        yield* fusionBeats(g);
      }
    }
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
  if (state.stage === 'ACAD' || !state.contract) return;
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
    yield card('info', '世界賽', `你隨 <b class="hl">${state.team}</b> 晉級 ${state.year} 世界大賽！`);
    const res = runWorlds(state, rng);
    yield card(res.champion ? 'gold' : 'info', '世界賽結算',
      `<b class="hl">${res.stage}</b>。${res.champion ? '你捧起召喚師獎盃，成為全世界的英雄！' : ''}`);
    if (res.champion && !state.traits.franchise && unlockTrait(state, 'franchise')) {
      yield card('gold', '隱藏素質解鎖：神主牌', '你就是這支隊伍的門面，續約時沒有人敢先開口砍價。');
      yield* fusionBeats(g);
    }
  }
}

/* ================= 升降級 / 轉會 / FA / 解散 ================= */

function* movement(g) {
  const { state, rng } = g;

  if (state.stage === 'ACAD') {
    if (state.stageYear < 3) return;
    yield* academyCrossroads(g);
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
    yield card('gold', '隱藏素質解鎖：老將', '28 歲仍屹立一軍，你學會用頭腦打球。<b class="hl">衰退減緩、可延長生涯</b>。');
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

function* academyCrossroads(g) {
  const { state, rng } = g;
  const o = effectiveOvr(state);
  const options = [
    { id: 'home', label: '投入主場賽區試訓', main: true, note: `綜合 ${o}｜門檻約 ${LEAGUES.HOME.par - 8}` },
  ];
  if (o >= 48) options.push({ id: 'overseas', label: '直接挑戰海外賽區試訓', note: '門檻高，但一步到位' });
  options.push({ id: 'quit', label: '放棄職業之路', warn: true });

  const picked = yield { type: 'choice', title: `校園三年 · 綜合能力 ${o} · 人生的第一個路口`, options };
  if (picked === 'quit') retire('校園賽季結束後，你把滑鼠收進了抽屜。');

  const track = picked === 'overseas' ? 'OVERSEAS' : 'HOME';
  const res = tryout(state, rng, track);
  if (res.ok) {
    state.stage = 'PRO';
    state.stageYear = 0;
    state.am2Track = track;
    signContract(state, rng, res);
    yield card('gold', '入選職業隊',
      `你被 <b class="hl">${res.team}</b> 簽下，正式踏入 <b class="hl">${LEAGUES[res.league].region === 'HOME' ? homeLeagueName(state) : LEAGUES[res.league].name}</b>！教練體系：${state.coach}。`);
    return;
  }

  const after = yield {
    type: 'choice',
    title: '試訓落榜',
    options: [
      { id: 'am2', label: '進入青訓次級聯賽', main: true, note: '一年一次試訓機會，最多撐到 28 歲' },
      { id: 'quit', label: '就此退役', warn: true },
    ],
  };
  if (after === 'quit') retire('試訓落榜，決定離開電競圈。');
  assignAcademyTeam(state, rng, track);
  yield card('info', '青訓報到', `你加入 <b class="hl">${state.team}</b>，從次級聯賽重新開始。`);
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
