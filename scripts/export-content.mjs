/**
 * 匯出特質・事件卡・任務卡內容清單（繁體中文），供人工編輯。
 *
 * 輸出兩份檔（UTF-8）：
 *   docs/content-export/特質事件清單.md  主清單
 *   docs/content-export/名詞表.md         全專案鍵名 → 繁體中文名詞對照
 *
 * 規則：
 * - 鍵名不翻譯（單一來源），只把它翻譯成人類可讀的中文，方便對照與回寫。
 * - 事件效果（屬性／心理／旗標）直接嵌在成功／失敗文本的「〔…〕」內。
 * - 成功率顯示資料中的基準值（實際會受體力與抗壓影響，見主檔檔頭註記）。
 * - 條件式（when／trigger／goal／grantWhen）翻譯成中文條件句。
 *
 * 重新匯出：node scripts/export-content.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { BASE_TRAITS, RARE_TRAITS } from '../src/data/traits.js';
import { EPIC_TRAITS, LEGENDARY_TRAITS, UNIQUE_TRAITS, FUSIONS } from '../src/data/epics.js';
import { INNATE_POOL } from '../src/data/innate.js';
import { EVENT_CARDS } from '../src/data/events.js';
import { QUEST_CARDS } from '../src/data/quests.js';
import { ATTR_NAMES } from '../src/data/attributes.js';
import { MENTAL_NAMES } from '../src/data/mental.js';
import { FLAG_TRAIT } from '../src/engine/eventTrigger.js';

const OUT_DIR = new URL('../docs/content-export/', import.meta.url);
mkdirSync(OUT_DIR, { recursive: true });

/* ================= 名詞對照 ================= */

const TIER_NAMES = {
  common: '通用', rare: '稀有', epic: '史詩', legend: '傳說', legendary: '傳說', unique: '獨有',
};
const POOL_NAMES = {
  persona: '人格（媒體）', performance: '競技表現', psych: '心理', career: '生涯',
};
const LEVEL_NAMES = { light: '輕度', medium: '中度', heavy: '重度' };
const KIND_NAMES = { normal: '一般', indulgent: '享樂', romance: '感情', patch: '版本' };
const SLOT_NAMES = {
  amateur: '業餘期', am2: '青訓期', offseason: '休賽期（1、12 月）',
  regular: '常規賽期間', transfer: '轉會期', crisis: '降級／解散危機',
};
const SUB_NAMES = {
  transfer: '轉會', media: '媒體', life: '生活', team: '隊伍',
  training: '訓練', match: '賽事', body: '傷病', pressure: '壓力', crisis: '危機',
};
const OP_NAMES = { lt: '<', lte: '≤', eq: '＝', gte: '≥', gt: '>', ne: '≠' };

const EFFECT_NAMES = {
  growth_rate_mul: '訓練成長倍率', injuryRate: '受傷率', injuryMinorChance: '小傷轉大傷率',
  injuryImmune: '受傷免疫', patchDebt: '版本落差', patchImmune: '版本懲罰免疫',
  intlRoll: '國際賽加成', intlFloor: '國際賽保底', seriesGame: '系列賽加成',
  seriesDecider: '決勝局加成', worldsRoll: '世界賽加成', tiltImmune: '心態崩盤免疫',
  soloRate: '單殺率', killRate: '擊殺產出', teamLead: '隊友戰力', clutchAdd: '關鍵加成',
  underdogDepth: '低種子加成', contractFloor: '續約保底', contractAdd: '續約加分',
  contractCap: '報價上限', contractCapShort: '短約報價上限', offerPenalty: '報價縮水',
  endorsement: '代言收入', verdictFireRisk: '切割風險', verdictRiftRisk: '休息室摩擦',
  verdictShield: '切割免疫', verdictRiftShield: '默契崩盤免疫', benchRisk: '下放風險',
  fall_k_mul: '衰退倍率', fall_accel_mul: '衰退加速度', rise_k_mul: '上升期曲率',
  peak_age_shift: '巔峰延後（年）', decline_pull_mul: '天花板拉力', careerScore: '生涯評分',
  coachMult: '教練評價倍率', importExempt: '外援名額豁免', indulgentImmune: '享樂誘惑免疫',
  mental_comp: '抗壓', mental_conf: '自信', mental_drive: '動機',
  mental_disc: '紀律', mental_trust: '信任', mental_resl: '韌性',
};

const PREDICATE_NAMES = {
  age: '年齡', proYears: '職業年資', splitTitles: '賽段冠軍', awards: '生涯獎項',
  disbandCrises: '解散危機次數', fame: '知名度', careerScore: '生涯評價',
  coachRating: '教練評價', intlWinRate: '國際賽勝率', intlGames: '國際賽局數',
  assistsPerGame: '場均助攻', assist: '場均助攻', longestTenure: '最長效力年數', distinctTeams: '效力戰隊數',
  worldsBest: '世界賽最佳名次', msiBest: 'MSI 最佳名次', intlSemis: '國際賽四強',
  careerGames: '生涯出賽場次', awardsThisYear: '今年個人獎項',
  lastWorlds: '上屆世界賽名次', lastMsi: '上屆 MSI 名次',
  isReigningChampion: '現任世界賽衛冕者', fameLevel: '知名度等級', era: '年代',
  region: '賽區', role: '位置', stage: '生涯階段', wonWorldsThisYear: '今年奪世界冠軍',
  benchedStreak: '連續坐板凳月數', peakRating: '生涯巔峰評價',
  intlAppearances: '國際賽出征次數', marketQuiet: '轉會市場靜默', atPeak: '生涯巔峰期',
  stamina: '體力', patchDebt: '版本落差', injuryWeeks: '傷勢週數',
};

/* ================= 特質名稱全集（跨階） ================= */

const ALL_TRAITS = {
  ...BASE_TRAITS, ...RARE_TRAITS, ...EPIC_TRAITS, ...LEGENDARY_TRAITS, ...UNIQUE_TRAITS,
};
const TRAIT_TIER = {};
for (const [t, table] of [
  ['common', BASE_TRAITS], ['rare', RARE_TRAITS], ['epic', EPIC_TRAITS],
  ['legend', LEGENDARY_TRAITS], ['unique', UNIQUE_TRAITS],
]) for (const k of Object.keys(table)) TRAIT_TIER[k] = t;

const traitName = (key) => ALL_TRAITS[key]?.name || key;

/* ================= 條件式翻譯 ================= */

const statName = (k) => PREDICATE_NAMES[k] || MENTAL_NAMES[k] || ATTR_NAMES[k] || k;

function fmtCond(node) {
  if (node === true) return '恆真';
  if (node === false) return '恆假';
  if (!Array.isArray(node)) return String(node);
  switch (node[0]) {
    case 'and': return node.slice(1).map(fmtCond).join('，且 ');
    case 'or': return node.slice(1).map(fmtCond).join('，或 ');
    case 'not': return `非（${fmtCond(node[1])}）`;
    case 'has': return `持有 ${TIER_NAMES[node[1]]}·${traitName(node[2])}`;
    case 'hasCount': return `持有 ${TIER_NAMES[node[1]]}階特質 ≥ ${node[2]} 個`;
    case 'stat': return `${statName(node[1])} ${OP_NAMES[node[2]]} ${node[3]}`;
    case 'eventFlag': return `旗標「${node[1]}」亮起`;
    case 'eventCount': return `計數「${node[1]}」${OP_NAMES[node[2]]} ${node[3]}`;
    case 'percentile': return `${statName(node[1])} ≥ 同位置歷史 P${node[3]}`;
    case 'leaguePct': return `${statName(node[1])} ≥ 當季賽區同位置 P${node[3]}`;
    default: return JSON.stringify(node);
  }
}

/* ================= 效果／副作用翻譯 ================= */

function fmtEffect(key, val) {
  const name = EFFECT_NAMES[key] || key;
  if (val === true) return name;
  if (typeof val === 'number') return `${name} ${val > 0 ? '+' : ''}${val}`;
  if (val && typeof val === 'object') {
    if ('mul' in val) return `${name} ×${val.mul}`;
    if ('cap' in val) return `${name}${name.includes('上限') ? '' : ' 上限'} ${val.cap}`;
    if ('floor' in val) return `${name}${name.includes('保底') ? '' : ' 保底'} ${val.floor}`;
  }
  return `${name} ${JSON.stringify(val)}`;
}

function fmtEffects(effects) {
  if (!effects) return '—';
  const keys = Object.keys(effects);
  if (!keys.length) return '—';
  return keys.map((k) => fmtEffect(k, effects[k])).join('、');
}

/* ================= 事件旗標翻譯 ================= */

function flagNote(f, def) {
  if (f === 'macroPoint') return '（需轉線運營 ≥75）';
  if (f === 'laneking') return '（需 <28 歲）';
  if (f === 'tiltRisk') return '（25% 機率，心態崩盤免疫者除外）';
  if (def && def.need) return '（附帶條件）';
  return '';
}

function fmtEventFlags(flags) {
  if (!flags) return [];
  const parts = [];
  for (const [f, v] of Object.entries(flags)) {
    if (!v) continue;
    if (FLAG_TRAIT[f]) parts.push(`解鎖特質：${traitName(FLAG_TRAIT[f].key)}${flagNote(f, FLAG_TRAIT[f])}`);
    else if (f === 'patchDebt') parts.push(`版本落差${v > 0 ? '↑' : '↓'}`);
    else if (f === 'injuryRisk') parts.push(`受傷風險 +${v}`);
    else if (f === 'mateMorale') parts.push(`隊友士氣${v < 0 ? '↓' : '↑'}`);
    else if (f === 'bonusSalary') parts.push(`業外收入 ${v > 0 ? '+' : '−'}${Math.abs(v)}萬`);
    else if (f === 'romance') parts.push('交往');
    else parts.push(f);
  }
  return parts;
}

function fmtOutcome(outcome) {
  const parts = [];
  if (outcome.attr) {
    for (const [k, v] of Object.entries(outcome.attr)) parts.push(`${ATTR_NAMES[k]}${v > 0 ? '+' : ''}${v}`);
  }
  if (outcome.stamina) parts.push(`體力${outcome.stamina > 0 ? '+' : ''}${outcome.stamina}`);
  if (outcome.mental) {
    for (const [k, v] of Object.entries(outcome.mental)) parts.push(`${MENTAL_NAMES[k]}${v > 0 ? '+' : ''}${v}`);
  }
  parts.push(...fmtEventFlags(outcome.flags));
  return parts;
}

/* ================= 特質獲得來源 ================= */

const INNATE_KEYS = new Set(INNATE_POOL.map((e) => e.key));
const FUSION_OUT = new Map(FUSIONS.map((r) => [r.out, r]));
const FUSION_MATERIAL_OF = new Map(); // trait key -> [產物 trait key]
const QUEST_MATERIAL_OF = new Map();  // trait key -> [quest id]

for (const r of FUSIONS) {
  for (const [tier, key] of r.need) {
    if (!FUSION_MATERIAL_OF.has(key)) FUSION_MATERIAL_OF.set(key, []);
    FUSION_MATERIAL_OF.get(key).push(r.out);
  }
}

// 任務卡以素材身分吃掉的特質（trigger 的正向 has）
function collectQuestMats(node, acc) {
  if (!Array.isArray(node)) return;
  if (node[0] === 'has') acc.push(node[2]);
  else for (const c of node.slice(1)) collectQuestMats(c, acc);
}
for (const q of QUEST_CARDS) {
  const mats = [];
  collectQuestMats(q.trigger, mats);
  for (const k of mats) {
    if (!QUEST_MATERIAL_OF.has(k)) QUEST_MATERIAL_OF.set(k, []);
    if (!QUEST_MATERIAL_OF.get(k).includes(q.id)) QUEST_MATERIAL_OF.get(k).push(q.id);
  }
}

// 事件卡 → 解鎖的特質鍵（含選項與 on 結果）
const EVENT_UNLOCK_OF = new Map(); // trait key -> [{id, name, via, label}]
for (const ev of EVENT_CARDS) {
  const seen = new Set();
  const collect = (flags, via, label) => {
    if (!flags) return;
    for (const f of Object.keys(flags)) {
      const def = FLAG_TRAIT[f];
      if (def && !seen.has(def.key)) {
        seen.add(def.key);
        if (!EVENT_UNLOCK_OF.has(def.key)) EVENT_UNLOCK_OF.set(def.key, []);
        EVENT_UNLOCK_OF.get(def.key).push({ id: ev.id, name: ev.name, via, label });
      }
    }
  };
  collect(ev.good?.flags, 'good'); collect(ev.bad?.flags, 'bad');
  for (const o of ev.options) {
    collect(o.flags, 'option', o.label);
    if (o.on) { collect(o.on.good?.flags, 'good', o.label); collect(o.on.bad?.flags, 'bad', o.label); }
  }
}

// 直接授與點（phases 層，非資料）與扮演卡性格規則
const DIRECT_UNLOCK = {
  underdog: '季後賽低種子逆襲（種子序 ≥ 4）奪冠',
  clutch: '季後賽奪冠且 30 歲以下',
  intlghost: '國際賽生涯出場 ≥ 2 次且至少打進決賽',
  bigheart: '世界賽低種子奪冠',
  franchise: '世界賽奪冠',
  veteran: '28 歲以上、轉會期狀態平穩',
  meta: '賽季末版本洗禮（版本次數為 3 的倍數）',
  single: '單身滿 4 年',
  laneking: '賽季末、26 歲以下',
  disc: '享樂類事件連續守住 3 次（自律計數）',
};
const PERSONA_UNLOCK = {
  trashtalk: '扮演卡「bold」累積 5 次，且自信 ≥ 74、知名度 ≥ 45',
  bigheart: '抗壓 ≥ 90',
  glue: '信任 ≥ 55',
  lonewolf: '扮演卡「bold」累積 6 次，且信任 ≤ 24、自信 ≥ 72',
  idol: '知名度 ≥ 72，且未持有「圈內毒瘤」',
  pariah: '扮演卡「bold」累積 7 次，且信任 ≤ 15、知名度 ≥ 55',
};

function traitSources(key) {
  const sources = [];
  if (INNATE_KEYS.has(key)) sources.push('天生特質池（出生擲骰 0–2 個）');
  const evs = EVENT_UNLOCK_OF.get(key);
  if (evs) {
    for (const ev of evs) {
      if (ev.via === 'good') sources.push(`事件卡「${ev.name}」成功結果`);
      else if (ev.via === 'bad') sources.push(`事件卡「${ev.name}」失敗結果`);
      else sources.push(`事件卡「${ev.name}」的選項「${ev.label}」（不論成敗）`);
    }
  }
  if (DIRECT_UNLOCK[key]) sources.push(DIRECT_UNLOCK[key]);
  if (PERSONA_UNLOCK[key]) sources.push(PERSONA_UNLOCK[key]);
  if (FUSION_OUT.has(key)) {
    const r = FUSION_OUT.get(key);
    sources.push(`合成配方：${r.need.map(([t, k]) => `${traitName(k)}（${TIER_NAMES[t]}）`).join(' ＋ ')}`);
  }
  // 任務卡給的史詩／傳說
  const quests = QUEST_CARDS.filter((q) => q.result.key === key);
  for (const q of quests) {
    sources.push(`任務卡「${q.name}」（${q.id}）達成`);
  }
  if (UNIQUE_TRAITS[key]) {
    const t = UNIQUE_TRAITS[key];
    sources.push(`${t.grant}${t.grantWhen ? `｜條件：${fmtCond(t.grantWhen)}` : '｜由事件當下授予'}`);
  }
  return [...new Set(sources)];
}

function traitFusionProducts(key) {
  const out = FUSION_MATERIAL_OF.get(key);
  if (!out) return '—';
  return out.map((k) => `${traitName(k)}（${TIER_NAMES[TRAIT_TIER[k]]}）`).join('、');
}

function traitFusionMaterials(key) {
  const r = FUSION_OUT.get(key);
  if (!r) return '—';
  return r.need.map(([t, k]) => `${traitName(k)}（${TIER_NAMES[t]}）`).join(' ＋ ');
}

function traitQuestMaterials(key) {
  const qs = QUEST_MATERIAL_OF.get(key);
  if (!qs) return '—';
  const byId = new Map(QUEST_CARDS.map((q) => [q.id, q]));
  return qs.map((id) => `${byId.get(id)?.name || id}（${id}）`).join('、');
}

/* ================= 事件連鎖對映 ================= */

const FLAG_READ_BY = new Map();  // flag -> [card id]
const COUNT_READ_BY = new Map(); // count -> [card id]
for (const ev of EVENT_CARDS) {
  const walk = (n) => {
    if (!Array.isArray(n)) return;
    if (n[0] === 'eventFlag') {
      if (!FLAG_READ_BY.has(n[1])) FLAG_READ_BY.set(n[1], []);
      if (!FLAG_READ_BY.get(n[1]).includes(ev.id)) FLAG_READ_BY.get(n[1]).push(ev.id);
    } else if (n[0] === 'eventCount') {
      if (!COUNT_READ_BY.has(n[1])) COUNT_READ_BY.set(n[1], []);
      if (!COUNT_READ_BY.get(n[1]).includes(ev.id)) COUNT_READ_BY.get(n[1]).push(ev.id);
    } else for (const c of n.slice(1)) walk(c);
  };
  if (ev.when) walk(ev.when);
}
const CARD_BY_ID = new Map(EVENT_CARDS.map((ev) => [ev.id, ev]));

function fmtChainTags(marks, kind) {
  const lines = [];
  for (const f of marks.flags) {
    const readers = FLAG_READ_BY.get(f) || [];
    const next = readers.map((id) => CARD_BY_ID.get(id)?.name || id).join('、');
    lines.push(`${kind}「${f}」${next ? `（下接：${next}）` : '（無後續讀取）'}`);
  }
  for (const c of marks.counters) {
    const readers = COUNT_READ_BY.get(c) || [];
    const next = readers.map((id) => CARD_BY_ID.get(id)?.name || id).join('、');
    lines.push(`計數「${c}」＋1${next ? `（由 ${next} 讀取）` : ''}`);
  }
  return lines;
}

function collectChainMarks(ev) {
  const flags = new Set(); const clear = new Set(); const counters = new Set();
  const grab = (o) => {
    if (!o) return;
    for (const f of o.setFlags || []) flags.add(f);
    for (const f of o.clearFlags || []) clear.add(f);
    for (const c of o.counters || []) counters.add(c);
  };
  grab(ev.good); grab(ev.bad);
  for (const o of ev.options) {
    grab(o);
    if (o.on) { grab(o.on.good); grab(o.on.bad); }
  }
  return { flags: [...flags], clear: [...clear], counters: [...counters] };
}

/* ================= 事件卡選項 ================= */

function fmtOption(o) {
  const bits = [`${o.label}`];
  if (o.odds !== undefined) bits.push(`成功率 ${o.odds}%`);
  if (o.main) bits.push('（推薦）');
  if (o.traits === false) bits.push('（安全牌）');
  const hasScale = (o.gain ?? 1) !== 1 || (o.loss ?? 1) !== 1;
  if (hasScale) bits.push(`成功 ×${o.gain ?? 1}／失敗 ×${o.loss ?? 1}`);
  return bits.join('｜');
}

function fmtOutcomeLine(text, outcome) {
  const eff = fmtOutcome(outcome);
  return `${text}${eff.length ? `〔${eff.join('、')}〕` : ''}`;
}

/* ================= 主清單 ================= */

const lines = [];
lines.push(`# 電競人生 — 特質・事件卡・任務卡內容清單`);
lines.push(``);
lines.push(`> 由 \`scripts/export-content.mjs\` 產生（2026-08-19）。供人工編輯；改完要回寫到`);
lines.push(`> \`src/data/*.js\`（鍵名與結構不可更動，對照見「名詞表」）。此檔為導出版，非資料來源。`);
lines.push(``);
lines.push(`> 成功率顯示資料中的基準值；實際成功率受體力與抗壓修正（乘體力係數，再＋(抗壓−50)×0.3，`);
lines.push(`> 夾在 5–95%）。成功／失敗文本「〔…〕」內的數值是基值，會依選項的成功／失敗倍率縮放。`);
lines.push(``);

/* ── 特質 ── */
const TRAIT_ORDER = [
  ['common', '通用特質（common）', BASE_TRAITS],
  ['rare', '稀有特質（rare）', RARE_TRAITS],
  ['epic', '史詩特質（epic）', EPIC_TRAITS],
  ['legend', '傳說特質（legend）', LEGENDARY_TRAITS],
  ['unique', '獨有特質（unique）', UNIQUE_TRAITS],
];
const nTraits = TRAIT_ORDER.reduce((t, [, , table]) => t + Object.keys(table).length, 0);
lines.push(`## 特質（共 ${nTraits} 條）`);
lines.push(``);

for (const [tier, title, table] of TRAIT_ORDER) {
  lines.push(`### ${title}`);
  lines.push(``);
  for (const [key, t] of Object.entries(table)) {
    const srcs = traitSources(key);
    const fusionProd = traitFusionProducts(key);
    const fusionMat = traitFusionMaterials(key);
    const questMat = traitQuestMaterials(key);
    const excl = t.exclusiveWith ? t.exclusiveWith.map((k) => traitName(k)).join('、') : '—';
    const maint = t.maintain ? '有（條件不成立即失去）' : '—';
    const innate = t.innate ? '、天生來源' : '';

    lines.push(`#### ${t.name}（${key}）`);
    lines.push(`- 階級／池：${TIER_NAMES[tier]}（${tier}）・${POOL_NAMES[t.pool]}${innate}`);
    const eff = fmtEffects(t.effects);
    lines.push(`- 效果：${eff}`);
    lines.push(`- 副作用：${fmtEffects(t.sideEffects)}（${LEVEL_NAMES[t.sideEffectLevel]}）`);
    lines.push(`- 文本：${t.desc}`);
    lines.push(`- 獲得條件：${srcs.length ? srcs.join(' ＋ ') : '—'}`);
    lines.push(`- 上層特質（合成產物）：${fusionProd}`);
    lines.push(`- 下層特質（合成素材）：${fusionMat}`);
    const extras = [];
    if (questMat !== '—') extras.push(`任務卡素材：${questMat}`);
    if (excl !== '—') extras.push(`互斥：${excl}`);
    if (maint !== '—') extras.push(`維持條件：${maint}`);
    if (extras.length) lines.push(`- 補充：${extras.join('｜')}`);
    lines.push(``);
  }
}

/* ── 事件卡 ── */
const nEvents = EVENT_CARDS.length;
lines.push(`## 事件卡（共 ${nEvents} 張）`);
lines.push(``);

for (const ev of EVENT_CARDS) {
  const chain = collectChainMarks(ev);
  lines.push(`### ${ev.name}（${ev.id}）`);
  lines.push(`- 類型：${KIND_NAMES[ev.kind] || ev.kind}｜池：${ev.pool.map((p) => POOL_NAMES[p] || p).join('、')}｜子類：${SUB_NAMES[ev.sub] || ev.sub}｜時段：${ev.slot.map((s) => SLOT_NAMES[s] || s).join('、')}｜互斥：${ev.excl}｜優先度：${ev.priority ?? 0}`);
  const cond = ev.when ? fmtCond(ev.when) : '隨機池成員';
  lines.push(`- 觸發條件：${cond}`);
  lines.push(`- 文本：${ev.prompt}`);
  lines.push(`- 選項：`);
  ev.options.forEach((o, i) => {
    lines.push(`  ${i + 1}. ${fmtOption(o)}`);
    if (o.on) {
      lines.push(`     - 成功：${fmtOutcomeLine(o.on.good.text, o.on.good)}`);
      lines.push(`     - 失敗：${fmtOutcomeLine(o.on.bad.text, o.on.bad)}`);
    }
  });
  lines.push(`- 成功文本：${fmtOutcomeLine(ev.good.text, ev.good)}`);
  lines.push(`- 失敗文本：${fmtOutcomeLine(ev.bad.text, ev.bad)}`);
  const chainLines = [];
  chainLines.push(...fmtChainTags(chain, '點亮旗標'));
  for (const f of chain.clear) chainLines.push(`熄滅旗標「${f}」`);
  if (chainLines.length) lines.push(`- 連鎖事件：${chainLines.join('；')}`);
  lines.push(``);
}

/* ── 任務卡 ── */
const nQuests = QUEST_CARDS.length;
lines.push(`## 任務卡（共 ${nQuests} 張：傳說 ${QUEST_CARDS.filter((q) => q.type === 'legend').length}、路線 ${QUEST_CARDS.filter((q) => q.type === 'route').length}）`);
lines.push(``);

for (const q of QUEST_CARDS) {
  const typeLabel = q.type === 'legend' ? '傳說任務卡' : '替代生涯路線卡';
  lines.push(`### ${q.name}（${q.id}）`);
  lines.push(`- 類型：${typeLabel}`);
  lines.push(`- 文本：${q.text}`);
  lines.push(`- 觸發條件：${fmtCond(q.trigger)}`);
  lines.push(`- 達成目標：${fmtCond(q.goal)}`);
  lines.push(`- 期限：${q.deadline === null ? '生涯結束前' : `${q.deadline} 賽季`}`);
  lines.push(`- 達成結果：${TIER_NAMES[q.result.tier]}特質「${q.result.label || traitName(q.result.key)}」${q.result.label ? `（${q.result.key}）` : ''}`);
  lines.push(`- 失敗標籤：${q.failLabel}`);
  lines.push(``);
}

const main = lines.join('\n');
writeFileSync(new URL('特質事件清單.md', OUT_DIR), main, 'utf8');

/* ================= 名詞表 ================= */

const g = [];
g.push(`# 名詞表 — 全專案鍵名對照（繁體中文）`);
g.push(``);
g.push(`> 與「特質事件清單」同時由 \`scripts/export-content.mjs\` 產生。鍵名是程式碼的一等公民，`);
g.push(`> 不可翻譯；此表供翻譯、回寫與溝通時對照。`);
g.push(``);

const table = (title, rows) => {
  g.push(`## ${title}`);
  g.push(``);
  g.push(`| 鍵 | 繁體中文 |`);
  g.push(`| --- | --- |`);
  for (const [k, v] of rows) g.push(`| \`${k}\` | ${v} |`);
  g.push(``);
};

table('六大屬性', Object.entries(ATTR_NAMES));
table('心理六維', Object.entries(MENTAL_NAMES));
table('特質階級', Object.entries(TIER_NAMES).filter(([k]) => k !== 'legendary'));
table('合成池', Object.entries(POOL_NAMES));
table('副作用分級', Object.entries(LEVEL_NAMES));
table('事件類型 kind', Object.entries(KIND_NAMES));
table('時段標籤 slot', Object.entries(SLOT_NAMES));
table('子類別標籤 sub', Object.entries(SUB_NAMES));

const effectRows = Object.entries(EFFECT_NAMES).sort((a, b) => a[0].localeCompare(b[0]));
table('特質效果鍵（effects／sideEffects）', effectRows);

const flagRows = [];
for (const [f, def] of Object.entries(FLAG_TRAIT)) flagRows.push([f, `${traitName(def.key)}（解鎖特質）${flagNote(f, def)}`]);
for (const [f, v] of [
  ['patchDebt', '版本落差'], ['injuryRisk', '受傷風險'], ['mateMorale', '隊友士氣'],
  ['romance', '交往中'], ['bonusSalary', '業外收入'],
]) flagRows.push([f, v]);
table('事件旗標 flags', flagRows);

const predRows = Object.entries(PREDICATE_NAMES)
  .concat(Object.entries(MENTAL_NAMES))
  .concat(Object.entries(ATTR_NAMES))
  .sort((a, b) => a[0].localeCompare(b[0]));
table('條件謂詞（stat 查詢）', predRows);
table('比較子', Object.entries(OP_NAMES));

const nodeRows = [
  ['and', '且（全部成立）'], ['or', '或（任一成立）'], ['not', '非（否定）'],
  ['has', '持有 階·特質'], ['hasCount', '持有 階 特質數 ≥ n'],
  ['stat', '狀態查詢：謂詞 比較子 值'],
  ['eventFlag', '事件旗標亮起'], ['eventCount', '事件計數比較'],
  ['percentile', '歷史母體百分位（同位置）'],
  ['leaguePct', '當季模擬賽區百分位（同位置）'],
];
table('條件節點', nodeRows);

const glossary = g.join('\n');
writeFileSync(new URL('名詞表.md', OUT_DIR), glossary, 'utf8');

console.log(`特質 ${nTraits} 條、事件卡 ${nEvents} 張、任務卡 ${nQuests} 張`);
console.log(`已輸出：docs/content-export/特質事件清單.md`);
console.log(`已輸出：docs/content-export/名詞表.md`);