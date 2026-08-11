/**
 * 賽季結束：合併各賽段數據、算世界賽種子序、年度獎項、版本改動、傷病。
 *
 * 這是「所有賽段都打完之後、國際賽開打之前」的結算點。種子序在這裡定案，世界賽
 * 才有門票可談。
 */
import { LEAGUES } from '../data/leagues.js';
import { STAT_BASELINE } from '../data/abilities.js';
import { ABILITY_NAMES } from '../data/abilities.js';
import { effectiveOvr, ovr, patchPenalty } from '../engine/abilities.js';
import { currentLeagueKey, stageLabel } from '../engine/roster.js';
import { formatStatLine, mergeSplits } from '../engine/season.js';
import { applyPatch, rollInjury, trainHeroes, unlockTrait } from '../engine/progression.js';
import { worldsSeed } from '../kernel/series.js';
import { card, fusionBeats } from './shared.js';

export const kind = 'SEASON_END';

export function* run(g, phase) {
  const { state, rng } = g;
  if (state.skipSeason) return;

  const stat = mergeSplits(g.splits);
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
  if (phase.splitCount > 1) {
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
  if (injury.kind === 'severe') {
    yield card('bad', '手術 · 整季報銷',
      '手腕的狀況已經不是休息能解決的了。醫生建議動刀，下個賽季確定報銷。');
  } else if (injury.kind === 'major') {
    yield card('bad', '傷勢',
      `背部與手腕的舊傷復發，預計<b class="dn">缺席約 ${injury.weeks} 週</b>。替補會先頂上。`);
  } else if (injury.kind === 'minor') {
    yield card('bad', '傷勢',
      `手腕不適，預計<b class="dn">缺席約 ${injury.weeks} 週</b>。`);
  }

  if (!state.romance && state.age >= 18) state.singleYears += 1;
  if (state.singleYears >= 4 && !state.romance && unlockTrait(state, 'single')) {
    yield card('gold', '隱藏素質解鎖：單身', '你把青春全部獻給召喚峽谷。');
    yield* fusionBeats(g);
  }
}

/**
 * 年度個人獎項。
 *
 * 舊版的門檻是「打滿一季就給」——單殺王要求 SOLO ≥ 場次 ×1.2，但 TOP/MID 的單殺
 * 基線本來就是每場 1.2～1.3，等於年年必拿；例行賽 MVP 也幾乎年年入袋。結果一段
 * 生涯堆出 40 幾項榮譽，生涯評分整個失真。這裡改成「相對於同位置基線」再加一次擲骰。
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
