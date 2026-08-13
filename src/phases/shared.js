/**
 * 階段共用的敘事零件。
 *
 * 這裡放的是「不只一個階段會用到」的 beat 產生器：事件卡、扮演卡、特質覺醒。
 * 每個階段自己的敘事寫在自己的檔案裡——邏輯與文案同居，改一個賽事只開一個檔。
 */
import { clamp } from '../core/rng.js';
import { ATTR_NAMES } from '../data/attributes.js';
import { EVENT_CARDS } from '../data/events.js';
import { CROWD_REACTIONS, ROLEPLAY_CARDS } from '../data/roleplay.js';
import { BASE_TRAITS } from '../data/traits.js';
import { EPIC_TRAITS } from '../data/epics.js';
import { adjustAttr, skillValue } from '../engine/attributes.js';
import { applyMental } from '../engine/mental.js';
import { adjustPatchDebt, checkFusions, unlockTrait } from '../engine/progression.js';
import { flag, lookupTrait, traitName, traitTier } from '../kernel/modifiers.js';

export const card = (tone, title, body) => ({ type: 'card', tone, title, body });

/** 縮放事件結果的數值：倍率再小也不會把有效果的一項縮成 0 */
function scaleAmount(v, mult) {
  if (!v || mult === 1) return v;
  return Math.sign(v) * Math.max(1, Math.round(Math.abs(v) * mult));
}

/** 隱藏素質相關的 flag——選了「安全牌」的選項時整批不生效 */
const TRAIT_FLAGS = ['popular', 'composure', 'leader', 'laneking', 'macroPoint', 'tiltRisk',
  'grinder', 'meme', 'camera', 'guardian'];

/** flag 名稱 → 對應的特質鍵。事件卡的 trait 解鎖都走這張表。 */
const FLAG_TRAIT = {
  popular: 'popular', composure: 'composure', leader: 'leader', laneking: 'laneking',
  macroPoint: 'macroG', grinder: 'grinder', meme: 'meme', camera: 'camera',
  guardian: 'guardian', tiltRisk: 'tilt',
};

/** 一張事件卡所有選項／結果可能解鎖的特質鍵。純資料推導，不放邏輯。 */
function unlockableTraits(ev) {
  const set = new Set();
  const collect = (flags) => {
    if (!flags) return;
    for (const [f, t] of Object.entries(FLAG_TRAIT)) if (flags[f]) set.add(t);
  };
  collect(ev.good.flags); collect(ev.bad.flags);
  for (const o of ev.options) {
    collect(o.flags);
    if (o.on) { collect(o.on.good.flags); collect(o.on.bad.flags); }
  }
  return [...set];
}

/**
 * 目前「還抽得到」的事件卡。
 *
 * 類 roguelike：事件卡會**耗盡**。一張卡能解鎖的特質若全部都已取得（持有或已合成
 * 消耗），這張卡就摸不到了——玩家不會被同一張「最初教會他一招」的卡反覆餵食，反而
 * 有機會碰到更多種不同的事件。純敘事卡（不解鎖任何特質）永遠在池裡。
 *
 * 另外追蹤最近出過的卡，避免短時間內連著重複。兩層都只縮減「抽選範圍」，不會把池子
 * 抽空——耗盡後自動放回全池。
 */
function availableEvents(state) {
  const base = EVENT_CARDS.filter((ev) => {
    const traits = unlockableTraits(ev);
    if (!traits.length) return true;
    return traits.some((t) => !state.traits[t] && !state.fusedAway.includes(traitName(t)));
  });
  const recent = state.recentEvents || [];
  const fresh = base.filter((ev) => !recent.includes(ev.id));
  return (fresh.length ? fresh : base);
}

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
  const ev = rng.pick(availableEvents(state));
  const recent = state.recentEvents || [];
  state.recentEvents = [...recent, ev.id].slice(-6);
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
  // 選項若帶自己的 `on` 結果，就用自己的 good/bad——例如「關台／休息／不看」這類
  // 跟卡片主軸相反的路，套卡片的通用結果會顯得牛頭不對馬嘴。
  const outcome = opt.on ? (good ? opt.on.good : opt.on.bad) : (good ? ev.good : ev.bad);
  const mult = good ? (opt.gain ?? 1) : (opt.loss ?? 1);
  const allowTraits = opt.traits !== false;

  const notes = [];
  for (const [k, v] of Object.entries(outcome.attr || {})) {
    const applied = adjustAttr(state, k, scaleAmount(v, mult));
    if (applied > 0) notes.push(`${ATTR_NAMES[k]} <span class="up">+${applied}</span>`);
    else if (applied < 0) notes.push(`${ATTR_NAMES[k]} <span class="dn">${applied}</span>`);
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
  // `營運鬼才` 的門檻原本掛在已被拆掉的「大局觀」上。十二技能表裡它的後繼是「轉線運營」
  // （舊 awr .55／dec .35／syn .10 對新 .50／.35／.15，同一批屬性同一個量級），所以
  // 門檻 75 原封不動搬過來，難度沒有跟著換表而鬆動
  if (flags.macroPoint && skillValue(state, 'rotate') >= 75 && unlockTrait(state, 'macroG')) unlocked.push('macroG');
  if (flags.grinder && unlockTrait(state, 'grinder')) unlocked.push('grinder');
  if (flags.meme && unlockTrait(state, 'meme')) unlocked.push('meme');
  if (flags.camera && unlockTrait(state, 'camera')) unlocked.push('camera');
  if (flags.guardian && unlockTrait(state, 'guardian')) unlocked.push('guardian');
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

/** 連抽 n 張事件卡（不解鎖特質的事件也算，純粹增加人生岔路）。 */
export function* drawEvents(g, n) {
  for (let i = 0; i < n; i++) yield* drawEvent(g);
}

/* ================= 扮演 ================= */

/** 性格特質的門檻。全部走同一條路：連續往同一個方向演，久了就成為那樣的人。 */
const PERSONA_RULES = [
  { key: 'trashtalk', tone: 'bold', streak: 5, need: (s) => s.mental.conf >= 74 && (s.fame ?? 0) >= 45 },
  { key: 'bigheart', tone: null, streak: 0, need: (s) => s.mental.comp >= 90 },
  { key: 'glue', tone: 'plain', streak: 5, need: (s) => s.mental.trust >= 86 },
  { key: 'lonewolf', tone: 'bold', streak: 6, need: (s) => s.mental.trust <= 24 && s.mental.conf >= 72 },
  // 舊條件是「知名度 ≥72 且風評 ≥55」。V4 §9.4 拿掉 `rep` 之後，「紅而且沒有黑歷史」
  // 只能由「紅 ＋ 隊內處得好」表達——這也是 §9.4 把 rep 收掉的理由：風評本來就是
  // 別人怎麼看你跟身邊的人的關係，不需要一條自己的軸
  { key: 'idol', tone: null, streak: 0, need: (s) => (s.fame ?? 0) >= 72 && s.mental.trust >= 60 },
  // 舊條件是風評 ≤ −75。毒瘤跟獨狼要分得開：獨狼是「不跟人玩」（信任低＋自信高），
  // 毒瘤是「很紅，而且所有人都受不了他」——所以它多要一份聲量，也多演兩次才定型
  { key: 'pariah', tone: 'bold', streak: 7, need: (s) => s.mental.trust <= 15 && (s.fame ?? 0) >= 55 },
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

  // 知名度放大聲量的效果：紅了之後，同一句話的後座力完全不同。
  // 放大的只有聲量——隱藏六維不吃這個係數，它們是「你變成什麼人」，跟多少人在看無關
  const amp = (1 + Math.max(0, (state.fame ?? 0) - 40) / 100) * extraAmp;
  const deltas = {};
  for (const [k, v] of Object.entries(opt.mental || {})) {
    deltas[k] = k === 'fame' ? Math.round(v * amp) : v;
  }
  if (opt.tone === 'bold' && state.traits.trashtalk) deltas.fame = Math.round((deltas.fame || 0) * 1.6);
  if (opt.tone === 'plain' && state.traits.glue && deltas.trust > 0) deltas.trust *= 2;
  if (state.epic.showman && deltas.fame < 0) deltas.fame = 0;

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
    const t = lookupTrait(key);
    const tier = traitTier(key);
    const tone = tier === 'legendary' ? 'legendary' : tier === 'rare' ? 'info' : 'gold';
    yield card(tone, '？？ 覺醒',
      `你感到體內某股更深沉的力量徹底覺醒……<b class="hl">${t.name}</b>` +
      `<br><span class="muted">${t.desc}</span>`);
  }
}
