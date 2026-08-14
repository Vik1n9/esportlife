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
import { adjustAttr } from '../engine/attributes.js';
import { applyMental } from '../engine/mental.js';
import { adjustPatchDebt, checkFusions, unlockTrait } from '../engine/progression.js';
import { STAMINA_MAX } from '../engine/stamina.js';
import { eventOdds, FLAG_TRAIT, TRAIT_FLAGS } from '../engine/eventTrigger.js';
import { flag, lookupTrait, traitTier } from '../kernel/modifiers.js';

export const card = (tone, title, body) => ({ type: 'card', tone, title, body });

/** 縮放事件結果的數值：倍率再小也不會把有效果的一項縮成 0 */
function scaleAmount(v, mult) {
  if (!v || mult === 1) return v;
  return Math.sign(v) * Math.max(1, Math.round(Math.abs(v) * mult));
}

function optionNote(state, opt) {
  const odds = eventOdds(state, opt);
  const scale = (opt.gain ?? 1) !== 1 || (opt.loss ?? 1) !== 1
    ? `　成功 ×${opt.gain ?? 1}／失敗 ×${opt.loss ?? 1}` : '';
  return `成功率 ${Math.round(odds)}%${scale}`;
}

/**
 * 呈現並結算一張能力事件卡。**抽卡不發生在這裡**——這個月出哪張卡由
 * `engine/eventTrigger.js` 的觸發引擎決定（條件優先、時段過濾、互斥），這裡只回答
 * 「這張卡出了之後玩家怎麼應對、結果長什麼樣」。這裡會擲骰——事件卡是賭博，
 * 扮演卡不是。
 *
 * @param {object} g
 * @param {object} ev 要呈現的事件卡（`eventTrigger` 選出的）
 * @param {{fromChain?:boolean}} [opts] 連鎖觸發的卡不再追連鎖（防環）
 */
export function* drawEvent(g, ev, { fromChain = false } = {}) {
  const { state, rng } = g;

  yield card('', ev.name, ev.prompt);

  const pickedId = yield {
    type: 'choice',
    title: `${ev.name}：你怎麼應對？`,
    options: ev.options.map((o) => ({
      id: o.id, label: o.label, main: !!o.main, note: optionNote(state, o),
    })),
  };
  const opt = ev.options.find((o) => o.id === pickedId) || ev.options[0];

  const immune = flag(state, 'indulgentImmune') && ev.kind === 'indulgent';
  const good = immune || rng.chance(eventOdds(state, opt));
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
  // 體力與心理六維是 S17 新加的結果欄位（§12.2），S18 內容站開始填。體力是消耗資源，
  // 跟屬性一樣吃選項倍率；心理是「你變成什麼人」，跟扮演卡一樣不縮放
  if (outcome.stamina) {
    const applied = scaleAmount(outcome.stamina, mult);
    state.stamina = clamp((state.stamina ?? 0) + applied, 0, STAMINA_MAX);
    notes.push(`體力 <span class="${applied >= 0 ? 'up' : 'dn'}">${applied >= 0 ? '+' : ''}${applied}</span>`);
  }
  if (outcome.mental) notes.push(...applyMental(state, outcome.mental));

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
  // 事件卡的特質解鎖全部資料化——門檻／機率／免疫條件都在 FLAG_TRAIT 表裡宣告，
  // 新增一張能解鎖特質的卡不用再動這裡
  for (const [f, def] of Object.entries(FLAG_TRAIT)) {
    if (!flags[f]) continue;
    if (def.need && !def.need(state)) continue;
    if (def.blockIf && def.blockIf(state)) continue;
    if (def.chance !== undefined && !rng.chance(def.chance)) continue;
    if (unlockTrait(state, def.key)) unlocked.push(def.key);
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
  // 觸發後續事件（連鎖，§12.2「各選項結果…觸發後續事件」）。連鎖的卡不再追連鎖，
  // 防 A→B→A 死環；S18 內容站填 `chain` 欄位時生效
  if (outcome.chain && !fromChain) {
    for (const id of outcome.chain) {
      const next = EVENT_CARDS.find((c) => c.id === id);
      if (next) yield* drawEvent(g, next, { fromChain: true });
    }
  }
}

/** 連抽一組事件卡（不解鎖特質的事件也算，純粹增加人生岔路）。 */
export function* drawEvents(g, evs) {
  for (const ev of evs) yield* drawEvent(g, ev);
}

/* ================= 扮演 ================= */

/** 性格特質的門檻。全部走同一條路：連續往同一個方向演，久了就成為那樣的人。 */
const PERSONA_RULES = [
  { key: 'trashtalk', tone: 'bold', streak: 5, need: (s) => s.mental.conf >= 74 && (s.fame ?? 0) >= 45 },
  { key: 'bigheart', tone: null, streak: 0, need: (s) => s.mental.comp >= 90 },
  // 舊條件是默契 ≥86（v3 的 chem）。S20 對映後 trust 由扮演卡決定，但整體會受爭議卡
  // 與年底回歸壓制（160 段實測上限約 6x）——86 是不可達的門檻。改成 55：隊友願意
  // 跟你打的信任線，與 bigheart 的單維度極端值同構
  { key: 'glue', tone: null, streak: 0, need: (s) => s.mental.trust >= 55 },
  { key: 'lonewolf', tone: 'bold', streak: 6, need: (s) => s.mental.trust <= 24 && s.mental.conf >= 72 },
  // 舊條件是「知名度 ≥72 且風評 ≥55」。§9.4 拿掉 `rep` 後，「沒有黑歷史」改由
  // 毒瘤特質的缺席表達：紅的人裡只有不是圈內毒瘤的才算偶像（跟 meme 的互斥一致）。
  // 嘴砲王不算黑歷史——能紅的嘴砲照樣有粉絲，那是 trashtalk 的價值
  { key: 'idol', tone: null, streak: 0, need: (s) => (s.fame ?? 0) >= 72 && !s.traits.pariah },
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

/* ---------------- 生涯軌跡帳本（S17a，V4 §14.3／§15.5） ---------------- */

/** 國際賽 BO5 系列賽的局勝負累進帳本。res 是 runSeriesEvent 的回傳（mine/theirs 為局數） */
export function recordIntlSeries(state, res) {
  state.intlRecord.W += res.mine;
  state.intlRecord.L += res.theirs;
}

/** 國際賽小組／Swiss 循環的局勝負累進帳本（wins/losses 就是局數） */
export function recordIntlGroup(state, res) {
  state.intlRecord.W += res.wins;
  state.intlRecord.L += res.losses;
}
