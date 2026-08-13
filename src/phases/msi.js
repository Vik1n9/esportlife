/**
 * MSI（季中邀請賽）。
 *
 * 這一檔的重點是身分：**MSI 是俱樂部賽事**。門票發給戰隊——賽段冠軍（2023 起前
 * 兩名）帶著整隊出征。舊版把它寫成「國家隊徵召 · 披上國家隊戰袍」，資格看個人
 * OVR ≥ 52，還能「以調整為由婉拒」，三年內打過就進「列管徵召」不能再拒；打完
 * 累積 10% 傷病風險。那整套是棒球 WBC 的模型，跟 LoL 沒有任何關係。
 *
 * 現在：
 * - 資格＝你的隊伍拿了賽段冠軍，跟你個人數值無關
 * - 沒有出不出賽的選擇。決策點改成媒體日的扮演——玩家決定的是在鏡頭前當什麼樣的人
 * - 賽制逐輪出比分，不是一次擲骰
 * - 時序在年中，打完還要回去打下一個賽段
 */
import { LEAGUES } from '../data/leagues.js';
import { MSI_RESULTS, msiRuleOf } from '../data/formats/msi.js';
import { runGroup } from '../kernel/groups.js';
import { opponentStrength } from '../kernel/strength.js';
import { runSeries } from '../kernel/series.js';
import { PRESSURE } from '../engine/psych.js';
import { applyMental } from '../engine/mental.js';
import { unlockTrait } from '../engine/progression.js';
import { bonus, floorOf } from '../kernel/modifiers.js';
import { card, drawRoleplay, fusionBeats } from './shared.js';

export const kind = 'MSI';

/**
 * 國際賽的對手不是聯賽對手，是各賽區的冠軍。
 * 基準拉到頂級賽區水準，再依輪次遞增。
 *
 * **絕對地板 72（0–100 刻度，V4 §11.1 §17.2 三）是這一段的核心**：主場賽區 par 是
 * 66，所以一支主場冠軍隊踏進 MSI，對手基準立刻從 66 跳到 72——那六點的落差就是
 * 「國際賽會吃掉你」的全部來源。位置戰力差幾點在常規賽看不出來，在這裡就是輸贏。
 */
function intlOpponent(state, step, rng) {
  const base = Math.max(LEAGUES[state.league]?.par ?? 66, 72);
  return opponentStrength(base + step + bonus(state, 'intlRoll') * -0.15 + rng.gauss(1.6));
}

export function* run(g, phase) {
  const { state, rng } = g;
  const rule = msiRuleOf(state.year);
  if (!rule || state.stage !== 'PRO' || state.skipSeason) return;
  if (!LEAGUES[state.league]?.region) return;

  // 門票發給戰隊：看剛結束那個賽段的季後賽名次。是第幾段由年曆帶進來
  const qualifier = state.splitLog[phase.msiAfter - 1];
  if (!qualifier || !rule.accepts.includes(qualifier.finish)) return;

  const via = qualifier.finish === 'champion'
    ? `${qualifier.name}冠軍`
    : `${qualifier.name}亞軍`;
  yield card('gold', `MSI ${state.year} · 出征`,
    `<b class="hl">${state.team}</b> 以<b class="hl">${via}</b>身分拿到 ${state.year} 季中邀請賽門票。` +
    (rule.majorSlots >= 2 && qualifier.finish === 'final'
      ? '<br><span class="muted">2023 年起主流賽區出兩隊，亞軍也去得了。</span>'
      : '') +
    `<br><span class="muted">全隊飛出去打，回來還有下一個賽段要打。</span>`);

  // 決策點不是「去不去」，是「在鏡頭前當什麼樣的人」。
  // 國際賽的關注度遠高於聯賽，同一句話的後座力也大得多
  yield* drawRoleplay(g, 'intl', { amp: 1.6 });

  const outcome = rule.format === 'DOUBLE_ELIM'
    ? yield* doubleElim(g)
    : yield* groupKnockout(g);

  yield* settle(g, outcome);
}

/* ---------------- 賽制 ---------------- */

/** 2015–2022：四隊小組雙循環，前二晉級，之後 BO5 淘汰賽 */
function* groupKnockout(g) {
  const { state, rng } = g;
  const oppRatings = [0, 2, 4].map((s) => intlOpponent(state, s, rng));

  const group = runGroup(state, rng, { oppRatings, seed: 0 });
  yield card(group.advanced ? 'good' : 'bad', 'MSI 小組賽',
    `六場循環戰 <b class="${group.advanced ? 'up' : 'dn'}">${group.wins}勝 ${group.losses}敗</b>。` +
    (group.note ? `${group.note}。` : '') +
    (group.advanced ? '晉級淘汰賽。' : '<b class="dn">小組止步</b>。'));
  if (!group.advanced) return 'out';

  return yield* knockout(g, ['四強', '決賽']);
}

/**
 * 2023 起：雙敗淘汰。
 * 敗部那條線是重點——輸一場不會直接回家，這是雙敗制跟單淘汰最大的差別。
 */
function* doubleElim(g) {
  const { state, rng } = g;

  const first = runSeries(state, rng, { bo: 5, oppRating: intlOpponent(state, 0, rng), seed: 0, pressure: PRESSURE.intl });
  yield card(first.win ? 'good' : 'bad', 'MSI 勝部首輪 · BO5',
    `系列賽 <b class="${first.win ? 'up' : 'dn'}">${first.mine}-${first.theirs}</b>。` +
    (first.win ? '留在勝部。' : '掉進敗部，再輸一場就回家。'));

  if (!first.win) {
    const lower = runSeries(state, rng, { bo: 5, oppRating: intlOpponent(state, 1.25, rng), seed: 0, pressure: PRESSURE.intl });
    yield card(lower.win ? 'good' : 'bad', 'MSI 敗部 · BO5',
      `系列賽 <b class="${lower.win ? 'up' : 'dn'}">${lower.mine}-${lower.theirs}</b>。` +
      (lower.win ? '從敗部殺回來了。' : '<b class="dn">兩敗淘汰</b>。'));
    if (!lower.win) return 'out';
  }

  return yield* knockout(g, ['四強', '決賽']);
}

/** BO5 淘汰賽。每一輪都是一個扮演路口——國際賽的鏡頭比聯賽多太多。 */
function* knockout(g, rounds) {
  const { state, rng } = g;
  for (let i = 0; i < rounds.length; i++) {
    const name = rounds[i];
    const isFinal = i === rounds.length - 1;
    if (isFinal) yield* drawRoleplay(g, 'intl', { amp: 1.6 });

    const res = runSeries(state, rng, {
      bo: 5, oppRating: intlOpponent(state, 5 + i * 3, rng), seed: 0, pressure: PRESSURE.intl,
    });
    const decider = res.decider
      ? `<br><span class="muted">被拖進第五局，${res.win ? '你們把它拿下來了' : '最後一局沒守住'}。</span>` : '';
    yield card(res.win ? 'good' : 'bad', `MSI ${name} · BO5`,
      `系列賽 <b class="${res.win ? 'up' : 'dn'}">${res.mine}-${res.theirs}</b>${decider}` +
      `<div class="statline">${res.games.length} 局｜陣亡 ${res.deaths}</div>`);

    if (!res.win) return isFinal ? 'final' : 'semi';
  }
  return 'champion';
}

/* ---------------- 結算 ---------------- */

function* settle(g, outcome) {
  const { state } = g;
  const result = MSI_RESULTS[outcome];

  const points = floorOf(state, 'intlFloor', result.points);
  state.pendingPoints += points;
  state.intlAppearances += 1;
  state.lastIntlYear = state.year;
  state.honors.push(`${state.year} ${result.rank}`);

  if (outcome === 'champion') { state.msiWins += 1; state.msiPodiums += 1; }
  else if (outcome === 'semi' || outcome === 'final') state.msiPodiums += 1;

  // MSI 冠軍為賽區多掙一張世界賽門票（2023 起的真實制度）
  if (result.slotBonus) state.worldsSlotBonus = result.slotBonus;

  // 站過國際賽的舞台就會留下東西——走得越遠留得越多。
  // 舊版只有奪冠才給，於是「多次世界賽常客的心理素質比沒去過的強」這件事做不出來
  applyMental(state, { comp: result.comp, fame: result.fame });

  // MSI 打完到下一個賽段開打只有兩三週，賽區內其他隊多練了一個版本
  state.patchDebt = Math.min(10, state.patchDebt + 1);

  yield card(outcome === 'champion' ? 'gold' : 'info', 'MSI 結算',
    `<b class="hl">${result.rank}</b>。獲得能力點 <b class="hl">${points}</b> 點。` +
    (result.slotBonus ? '<br><b class="hl">冠軍為賽區多掙到一張世界賽門票。</b>' : '') +
    '<br><span class="muted">飛了半個地球回來，下一個賽段的版本已經變了。</span>');

  if ((outcome === 'champion' || outcome === 'final')
    && state.intlAppearances >= 2 && unlockTrait(state, 'intlghost')) {
    yield card('gold', '隱藏素質解鎖：國際賽之鬼', '國際舞台上，你是另一個人。');
    yield* fusionBeats(g);
  }
}
