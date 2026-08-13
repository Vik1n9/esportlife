/**
 * 一個賽段：例行賽 → 休息室 → 季後賽 → 事件卡。
 *
 * LoL 的一年不是一次結算。依當年該賽區的真實賽制跑 1～3 個賽段，每段各自有例行賽、
 * 季後賽與冠軍點數。賽段變多的是決策點與事件，不是比賽場數——場次是切開來分的。
 */
import { AMATEUR_CUPS } from '../data/teams.js';
import { accumulate, formatStatLine, simulateSeason } from '../engine/season.js';
import { lineupFor } from '../engine/lineup.js';
import { applyMental } from '../engine/mental.js';
import { currentLeagueKey, stageLabel } from '../engine/roster.js';
import { LEAGUES } from '../data/leagues.js';
import { unlockTrait } from '../engine/progression.js';
import {
  entryRound, opponentRating, playoffBerth, pointsFor, roundsFrom, runSeries, splitSeed,
} from '../kernel/series.js';
import { card, drawEvents, drawRoleplay, fusionBeats } from './shared.js';

export const kind = 'SPLIT';

export function* run(g, phase) {
  const { state, rng } = g;
  if (state.skipSeason) return;

  const { split, splitCount } = phase;
  const leagueKey = currentLeagueKey(state);

  // 先決定這一段你打不打得到——LoL 少打只有兩個原因：被下放，或傷勢缺席
  const lineup = lineupFor(state, rng);
  yield* lineupBeats(g, split, lineup);
  state.returningFromInjury = lineup.missedWeeks > 0;
  state.benchedStreak = lineup.status === 'benched' ? (state.benchedStreak || 0) + 1 : 0;

  const stat = simulateSeason(state, rng, leagueKey, split.weight, lineup.share);
  g.splits.push(stat);
  accumulate(state, LEAGUES[leagueKey].bucket, stat);

  if (lineup.status === 'benched') {
    // 板凳沒有戰報，也沒有季後賽——位子被別人拿走了
    state.splitLog.push({ name: split.name, stat, finish: 'none', benched: true });
    yield* drawRoleplay(g, 'locker');
    yield* drawEvents(g, 2);
    return;
  }

  const venue = state.stage === 'AMATEUR' ? rng.pick(AMATEUR_CUPS) : stageLabel(state);
  const label = splitCount > 1 ? `${venue}　${split.name}` : venue;
  yield card('', splitCount > 1 ? `${split.name}戰報` : (state.stage === 'AMATEUR' ? '本年戰績' : '賽季戰報'),
    `${state.team}｜${label}<div class="statline">${formatStatLine(stat)}</div>`);

  // 賽段中的休息室：只有職業階段才有真正的休息室
  if (state.stage === 'PRO' && rng.chance(22)) yield* drawRoleplay(g, 'locker');

  const finish = yield* playoffs(g, split, stat, splitCount);
  state.champPoints += pointsFor(finish);
  state.splitLog.push({ name: split.name, stat, finish });

  // 每個賽段抽兩張事件卡——類 roguelike，觸發頻率提高，人生岔路更多
  yield* drawEvents(g, 2);
}

/**
 * 出賽狀態的敘事。
 *
 * 坐板凳不是「數字變小」，是你的位子被別人拿走了——所以它要有一張自己的卡，
 * 而且會扣知名度：不出賽的人，鏡頭就不會在你身上。
 */
function* lineupBeats(g, split, lineup) {
  const { state } = g;
  if (state.stage !== 'PRO') return;

  if (lineup.status === 'benched') {
    const streak = (state.benchedStreak || 0) + 1;
    applyMental(state, { fame: -8, chem: -4, nerve: -3 });
    yield card('bad', `${split.name} · 板凳`,
      `名單公布，先發位置<b class="dn">沒有你</b>。整個賽段你坐在台下看替補打你的位子。` +
      (streak >= 2
        ? '<br><b class="dn">連續兩個賽段沒上場——再這樣下去，這裡不會有你的位子。</b>'
        : '<br><span class="muted">教練說再看看狀況。</span>'));
    return;
  }

  if (lineup.missedWeeks > 0) {
    applyMental(state, { fame: -3 });
    yield card('bad', `${split.name} · 傷勢缺席`,
      `手腕的狀況讓你缺席了<b class="dn">約 ${lineup.missedWeeks} 週</b>，替補頂上。` +
      `<br><span class="muted">回來之後，位子還在不在是另一回事。</span>`);
    return;
  }

  if (lineup.status === 'rotation') {
    yield card('', `${split.name} · 輪替`,
      `教練開始輪替你的位置，出賽時間被分掉一半。<br><span class="muted">每一場都是試鏡。</span>`);
  }
}

/**
 * 賽段季後賽。
 *
 * 舊版整年只有一次 `rng.chance()` 就決定有沒有冠軍，一局比分都看不到。現在是
 * 八強 BO3 → 四強 BO5 → 決賽 BO5 逐輪打，種子序決定從哪一輪開始，決勝局另外
 * 吃大心臟。每一輪之前都留一個扮演的路口。
 *
 * @returns {'champion'|'final'|'semi'|'quarter'|'none'}
 */
function* playoffs(g, split, stat, splitCount) {
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

    const oppRating = opponentRating(state, round.key, seed, rng);
    const res = runSeries(state, rng, { bo: round.bo, oppRating, seed });
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
