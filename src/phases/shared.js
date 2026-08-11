/**
 * 階段共用的敘事零件。
 *
 * 這裡放的是「不只一個階段會用到」的 beat 產生器：事件卡、扮演卡、特質覺醒。
 * 每個階段自己的敘事寫在自己的檔案裡——邏輯與文案同居，改一個賽事只開一個檔。
 */
import { clamp } from '../core/rng.js';
import { ABILITY_NAMES } from '../data/abilities.js';
import { EVENT_CARDS } from '../data/events.js';
import { CROWD_REACTIONS, ROLEPLAY_CARDS } from '../data/roleplay.js';
import { BASE_TRAITS } from '../data/traits.js';
import { EPIC_TRAITS } from '../data/epics.js';
import { adjustAbility } from '../engine/abilities.js';
import { applyMental } from '../engine/mental.js';
import { adjustPatchDebt, checkFusions, unlockTrait } from '../engine/progression.js';
import { flag } from '../kernel/modifiers.js';

export const card = (tone, title, body) => ({ type: 'card', tone, title, body });

/** 縮放事件結果的數值：倍率再小也不會把有效果的一項縮成 0 */
function scaleAmount(v, mult) {
  if (!v || mult === 1) return v;
  return Math.sign(v) * Math.max(1, Math.round(Math.abs(v) * mult));
}

/** 隱藏素質相關的 flag——選了「安全牌」的選項時整批不生效 */
const TRAIT_FLAGS = ['popular', 'composure', 'leader', 'laneking', 'macroPoint', 'tiltRisk'];

function optionNote(opt, bonus) {
  const odds = clamp((opt.odds ?? 50) + bonus, 5, 95);
  const scale = (opt.gain ?? 1) !== 1 || (opt.loss ?? 1) !== 1
    ? `　成功 ×${opt.gain ?? 1}／失敗 ×${opt.loss ?? 1}` : '';
  return `成功率 ${Math.round(odds)}%${scale}`;
}

/**
 * 抽一張能力事件卡。這裡會擲骰——事件卡是賭博，扮演卡不是。
 */
export function* drawEvent(g) {
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

/* ================= 扮演 ================= */

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
 * 跟能力事件卡的關鍵差別：**這裡不擲骰決定成敗**。扮演不是賭博——你選了什麼就是
 * 什麼樣的人，心理值照著選項直接走。真正隨機的只有外界反應的敘述，而且反應的力道
 * 由知名度放大：越紅的人，同一句話被放得越大。
 *
 * @param {'presser'|'media'|'locker'|'coach'|'daily'} when
 * @param {{amp?:number}} [opts] `amp` 為外界反應的額外放大倍率（國際賽用）
 */
export function* drawRoleplay(g, when, { amp: extraAmp = 1 } = {}) {
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
  const amp = (1 + Math.max(0, state.mental.fame - 40) / 100) * extraAmp;
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
export function* personaBeats(g) {
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
    yield card(key === 'pariah' ? 'bad' : 'gold', `性格成形：${t.name}`, t.desc);
  }
  if (unlocked.length) yield* fusionBeats(g);
}

/** 合成檢查——完全隱藏配方，卡片只給氛圍敘事 */
export function* fusionBeats(g) {
  const gained = checkFusions(g.state);
  for (const key of gained) {
    yield card('gold', '？？ 覺醒',
      `你感到體內某股更深沉的力量徹底覺醒……<b class="hl">${EPIC_TRAITS[key].name}</b>` +
      `<br><span class="muted">${EPIC_TRAITS[key].desc}</span>`);
  }
}
