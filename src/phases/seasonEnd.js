/**
 * 賽季結束：合併各賽段數據、算世界賽種子序、年度獎項、版本改動、傷病。
 *
 * 這是「所有賽段都打完之後、國際賽開打之前」的結算點。種子序在這裡定案，世界賽
 * 才有門票可談。
 */
import { AWARDS } from '../data/awards.js';
import { LEAGUES } from '../data/leagues.js';
import { STAT_BASELINE } from '../data/skills.js';
import { coachRating, effectiveCoachRating, patchPenalty, roleSkills, skillValue } from '../engine/attributes.js';
import { SKILL_NAMES } from '../data/skills.js';
import { currentLeagueKey, stageLabel } from '../engine/roster.js';
import { formatStatLine, mergeSplits } from '../engine/season.js';
import { applyPatch, grantUniqueTraits, trainHeroes, unlockTrait } from '../engine/progression.js';
import { UNIQUE_TRAITS } from '../data/epics.js';
import { worldsSeed } from '../kernel/series.js';
import { fusionBeats, kinded } from './shared.js';
const card = kinded('season');

export const kind = 'SEASON_END';

export function* run(g, phase) {
  const { state, rng } = g;
  if (state.skipSeason) return;

  const stat = mergeSplits(g.splits);
  state.lastStat = stat;
  state.lastDelta = stat.delta;
  state.peakRating = Math.max(state.peakRating, coachRating(state));
  if (state.stage === 'PRO') state.proYears += 1;

  const learned = trainHeroes(state, rng, stat.G);

  /*
   * 年度總結不再印一個總評數字（V4 §10.1：教練評價是內部值）。
   * 改印本位置的核心技能——那才是玩家練得到、也看得懂要往哪投的東西。
   */
  const penalty = patchPenalty(state);
  const coreLine = roleSkills(state).slice(0, 4)
    .map((k) => `${SKILL_NAMES[k]} <b class="hl">${skillValue(state, k)}</b>`).join('　');
  const skillNote = penalty < 0
    ? `${coreLine}　<span class="dn">版本落差 ${penalty}</span>`
    : coreLine;
  const line = formatStatLine(stat);
  if (phase.splitCount > 1) {
    yield card('', '年度總結',
      `${state.team}｜${stageLabel(state)}<div class="statline">${skillNote}</div><div class="statline">${line}</div>` +
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
    // 獨有特質（§14.1，S20c）：年度結算跑一次授予檢查。放在 awards 之後，因為
    // 「老來俏」的條件讀的是**今年**的個人獎項——獎項要先發下去才判得出來
    for (const key of grantUniqueTraits(state)) {
      const t = UNIQUE_TRAITS[key];
      yield card('gold', `獨有素質覺醒：${t.name}`, t.desc);
    }
    // 生涯軌跡帳本（S17a）：轉會後第一個完整賽季結束，補寫當筆 teamHistory 的
    // 首季教練評價與隊伍平均（§14.3「流浪傭兵」的條件讀它；隊友強度讀 state.mates）。
    // `fromYear !== state.year` 排除簽約當季（transfer 在 seasonEnd 之後，簽約年的
    // seasonEnd 早已跑過，最早能補是下一年）
    const entry = state.teamHistory[state.teamHistory.length - 1];
    if (entry && entry.toYear === null && entry.firstSeasonRating === null && entry.fromYear !== state.year) {
      entry.firstSeasonRating = effectiveCoachRating(state);
      entry.teamAvgRating = state.mates.length
        ? Math.round(state.mates.reduce((t, m) => t + m.rating, 0) / state.mates.length)
        : 0;
    }
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

  // ⚠ 年度受傷擲骰已移除（§6.2 v4.3）：受傷改由訓練事件卡的大失敗效果承擔
  // （`engine/training.js` 的 resolveTraining）。大失敗出現機率隨體力區間上升，
  // 所以「硬撐一整年」的風險現在兌現在每個透支的訓練月，而不是一年一擲。

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
 *
 * 個人獎項同時寫進生涯軌跡帳本（S17a）：`awards` 計數（§14.3「究極綠葉」要求
 * 個人獎項數 = 0）、milestone 記名目（§15.5 傳記拼接）。**不另外用字串比對算獎項**
 * ——`awards` 必須與 `honors.push` 同一行增加（說明書明文）。
 */
function award(state, text) {
  state.honors.push(text);
  state.awards += 1;
  state.milestones.push({ year: state.year, kind: 'award', text: text.replace(`${state.year} `, '') });
}

function* awards(g, stat) {
  const { state, rng } = g;
  const o = effectiveCoachRating(state);
  const home = stageLabel(state);
  const par = LEAGUES[currentLeagueKey(state)].par;
  if (stat.G < 20) return;

  // 例行賽 MVP：一個聯賽一年只有一個人拿得到
  // 0–100 重校：delta 門檻是水準量 ×1.25（3 → 3.75），機率的 per-point 係數 ÷1.25（3 → 2.4）
  if (stat.delta >= 3.75 && stat.MVP >= Math.max(4, Math.round(stat.G * 0.09)) && rng.chance(30 + stat.delta * 2.4)) {
    award(state, `${state.year} ${AWARDS.REGULAR_MVP}`);
    yield card('gold', '例行賽 MVP', `以 ${stat.MVP} 次單場 MVP 拿下<b class="hl">${state.year} ${home} 例行賽 MVP</b>！`);
  }

  /*
   * 最佳新人（S20d/N10 重校）：舊門檻 delta ≥ 2.5 實測 0/160——菜鳥首個完整賽季
   * 的 delta 分位是 p0 −0.4／p90 −8.4，沒有人夠得著「優於聯盟平均 +2.5」。新秀的
   * 優秀不是比平均強，是「沒被平均甩開」：首年落在 −1.5 以內的前段就是聯盟級新人。
   * 年齡門檻一併移除：`proYears ≤ 1` 已定義菜鳥，再卡年齡只砍人。
   */
  if (stat.delta >= -1.5 && state.proYears <= 1) {
    award(state, `${state.year} ${AWARDS.ROOKIE}`);
    yield card('gold', '最佳新人', `新秀賽季即站穩先發，榮膺 <b class="hl">${state.year} ${home} 最佳新人</b>。`);
  }

  // 單殺王：與同位置基線比較，而不是與場次比較。1.5 倍門檻實測只有持有傳說的
  // 怪物夠得著（裸係數上限約 1.27），降到 1.4（S20d/N10）：頂級對線者加
  // 一項對線特質即可觸及，仍是稀有獎。
  const soloBaseline = STAT_BASELINE[state.role].SOLO;
  if (o >= par + 2.5 && stat.SOLO >= stat.G * soloBaseline * 1.4 && rng.chance(45)) {
    award(state, `${state.year} ${AWARDS.SOLO_KING}`);
    yield card('gold', '單殺王', `季內累積 <b class="hl">${stat.SOLO}</b> 次單殺，冠絕 ${home}！`);
    if (state.age < 26 && unlockTrait(state, 'laneking')) {
      yield card('gold', '隱藏素質解鎖：單殺王', '對線壓制是你的本能，SOLO 產出提升。');
      yield* fusionBeats(g);
    }
  }

  if (stat.delta >= 1.25 && rng.chance(22 + stat.delta * 3.2)) {
    award(state, `${state.year} ${AWARDS.ALL_STAR}`);
    state.stats[LEAGUES[currentLeagueKey(state)].bucket].AS += 1;
    yield card('info', '全明星入選', `入選 ${state.year} ${home} 全明星。`);
  }
}
