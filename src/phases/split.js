/**
 * 一個賽段：例行賽 → 休息室 → 季後賽 → 事件卡。
 *
 * LoL 的一年不是一次結算。依當年該賽區的真實賽制跑 1～3 個賽段，每段各自有例行賽、
 * 季後賽與冠軍點數。賽段變多的是決策點與事件，不是比賽場數——場次是切開來分的。
 */
import { AMATEUR_CUPS } from '../data/teams.js';
import { accumulate, formatStatLine, simulateSeason } from '../engine/season.js';
import { currentLeagueKey, stageLabel } from '../engine/roster.js';
import { LEAGUES } from '../data/leagues.js';
import { unlockTrait } from '../engine/progression.js';
import {
  entryRound, opponentOvr, playoffBerth, pointsFor, roundsFrom, runSeries, splitSeed,
} from '../kernel/series.js';
import { card, drawEvent, drawRoleplay, fusionBeats } from './shared.js';

export const kind = 'SPLIT';

export function* run(g, phase) {
  const { state, rng } = g;
  if (state.skipSeason) return;

  const { split, splitCount } = phase;
  const leagueKey = currentLeagueKey(state);

  const stat = simulateSeason(state, rng, leagueKey, split.weight);
  g.splits.push(stat);
  accumulate(state, LEAGUES[leagueKey].bucket, stat);

  const venue = state.stage === 'AMATEUR' ? rng.pick(AMATEUR_CUPS) : stageLabel(state);
  const label = splitCount > 1 ? `${venue}　${split.name}` : venue;
  yield card('', splitCount > 1 ? `${split.name}戰報` : (state.stage === 'AMATEUR' ? '本年戰績' : '賽季戰報'),
    `${state.team}｜${label}<div class="statline">${formatStatLine(stat)}</div>`);

  // 賽段中的休息室：只有職業階段才有真正的休息室
  if (state.stage === 'PRO' && rng.chance(22)) yield* drawRoleplay(g, 'locker');

  const finish = yield* playoffs(g, split, stat, splitCount);
  state.champPoints += pointsFor(finish);
  state.splitLog.push({ name: split.name, stat, finish });

  // 每個賽段各抽一張事件卡——賽段變多，人生的岔路也跟著變多
  yield* drawEvent(g);
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
