/**
 * 賽段季後賽：一個賽段的收尾。
 *
 * S14 之前這段程式住在 `split.js` 的後半（例行賽結算完就接著打）。月回合制把賽段攤成
 * 月份之後它獨立出來，因為它跟常規賽已經是**兩種不同的東西**：常規賽是養成回合裡的
 * 一行戰報（不互動），季後賽是一個佔掉整個月的賽事序列。
 *
 * S15 把每一輪 BO 換成五拍共用序列（`seriesEvent.js`）——賽前敘事 → 備賽戰術 →
 * 結算 → 比分 → 賽後。這個檔剩下的只剩「對手怎麼來」「名次怎麼算」「奪冠敘事」。
 */
import { AMATEUR_CUPS } from '../data/teams.js';
import { LEAGUES } from '../data/leagues.js';
import { accumulate, formatStatLine, mergeSplits, simulateSeason } from '../engine/season.js';
import { currentLeagueKey, stageLabel } from '../engine/roster.js';
import { unlockTrait } from '../engine/progression.js';
import {
  entryRound, playoffBerth, pointsFor, roundsFrom, splitSeed,
} from '../kernel/series.js';
import { oppLineupText, playoffOpponent } from '../engine/opponents.js';
import { drawRoleplay, fusionBeats, kinded } from './shared.js';
const card = kinded('match');
import { runSeriesEvent } from './seriesEvent.js';

export const kind = 'PLAYOFF';

export function* run(g, phase) {
  const { state, rng } = g;
  if (state.skipSeason) return;

  const { split, splitCount } = phase;
  const leagueKey = currentLeagueKey(state);
  const lineup = g.lineup || { status: 'starter', share: 1 };

  /*
   * 這一段的例行賽數據＝它那幾個月的加總。
   *
   * 保底那一行是給「賽段只分到一個月」的年份用的：那種年份沒有常規賽的養成回合，
   * 比賽得在這裡補打完，否則會出現「有季後賽卻沒有戰績」的賽段。現行資料最多三賽段，
   * 走不到這條路，但賽段再多一級就會踩到。
   */
  const months = g.monthStats || [];
  const stat = months.length
    ? mergeSplits(months)
    : simulateSeason(state, rng, leagueKey, split.weight, lineup.share);
  g.monthStats = [];
  g.splits.push(stat);
  accumulate(state, LEAGUES[leagueKey].bucket, stat);

  if (lineup.share <= 0) {
    // 板凳沒有戰報，也沒有季後賽——位子被別人拿走了
    state.splitLog.push({ name: split.name, stat, finish: 'none', benched: true });
    yield* drawRoleplay(g, 'locker');
    return;
  }

  const venue = state.stage === 'AMATEUR' ? rng.pick(AMATEUR_CUPS) : stageLabel(state);
  const label = splitCount > 1 ? `${venue}　${split.name}` : venue;
  yield card('', splitCount > 1 ? `${split.name}總結` : (state.stage === 'AMATEUR' ? '本年戰績' : '賽季總結'),
    `${state.team}｜${label}<div class="statline">${formatStatLine(stat)}</div>`);

  // 賽段中的休息室：只有職業階段才有真正的休息室
  if (state.stage === 'PRO' && rng.chance(22)) yield* drawRoleplay(g, 'locker');

  const finish = yield* playoffs(g, split, stat, splitCount);
  state.champPoints += pointsFor(finish);
  state.splitLog.push({ name: split.name, stat, finish });
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

    // S29：對手由 NPC 池實體化（§23.4）。階梯目標＝par＋輪次遞增＋種子序懲罰
    // ＋擺動，選當年 carry 最接近的隊；陣容缺口落回匿名對手（敘事不帶身分）
    const opp = playoffOpponent(state, rng, round.key, seed);
    // 五拍：賽前敘事 → 備賽戰術 → 結算 → 比分 → 賽後。決賽的壓力係數比前面幾輪高
    // （V4 §9.3）——抗壓低的人會在這裡把陣亡數交出來
    const res = yield* runSeriesEvent(g, {
      title: `${round.name} · BO${round.bo}`,
      bo: round.bo,
      oppRating: opp.strength,
      seed,
      stakes: round.key === 'final' ? 'final' : 'playoff',
      oppNote: oppLineupText(opp)
        || (seed === 1 ? '對上一路殺上來的黑馬'
          : seed === 2 ? '對上實力相當的對手'
            : '對上種子序更前的隊伍'),
    });

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
    // TODO(S20e 或後續)：S20d 量測 clutch 持有 0/160——冠軍解鎖分支看起來沒咬到
    // （與單殺王 1.5 同類的門檻漂移嫌疑）。本站只修 N10／N11／N12 點名的死內容，
    // clutch 取得率留待下一站確認 `unlockTrait` 的機率與條件
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
