#!/usr/bin/env node
/**
 * S27 參數生成 · NPC 名冊生成器。
 *
 * 讀 `tools/npc/cleaned_players.json`（S25 產物），把史實轉成 V4 的 NPC 結構，
 * 產出 `src/data/npc/roster.js`——S28（隊友）／S29（逐選手對手）的輸入。
 *
 * 管線分工（§23.1 第 4 條）：確定性數學（peak.rating、attributes、lifecycle、
 * career）由本腳本照 S23／S26 定案計算；需要語意理解的維度（psych 六維、
 * traits 天生特質、tags 敘事標籤）本應逐選手單呼叫 LLM 落檔快取——但本執行環境
 * 無 LLM API（S25 已實測），落地形式比照 S25 先例：**確定性規則先產出全部預設**，
 * 執行者對 priority 1 逐筆語意判讀後寫入 `npc_overrides.json` 快取，本腳本讀取
 * 覆寫（「LLM 語意」的判斷力由執行者承擔，快取結構照 §23.1 定案）。
 *
 * 生成範圍（S23 定案 fetch_priority 2 範圍 ＋ S27 拍板）：priority 1（台港澳全量）
 * 與 priority 2（歷年 Worlds／MSI 參賽隊員 ＋ 四大賽區賽段冠軍隊員）；priority 3
 * 不生成（非 Global_Boss 取材範圍）。
 *
 * 逐欄來源（§23.3 schema）：
 *   peak.rating    照 S26 `peakRatingOf`（RATING_BY_EVENT／FINISH_OFFSET，單一來源）。
 *                   無名次（finishes 空）的選手 peak = null、attributes = null，
 *                   tags 標 `no_finish`——強度骨幹缺位就不拍腦袋填數字，S29 抽陣容
 *                   時自然跳過。
 *   attributes     位置原型反映射：`55 + 40 × (w[attr] / w_max)`，再縮放使
 *                   Σ(attr × ROLE_ATTR_WEIGHTS) = peak.rating。位置 null 走五路
 *                   平均權重原型。
 *   lifecycle      { peak_age, rise_k, fall_k } 三參數（§7.2 曲線形狀，S27 補
 *                   §23.3 的「範圍見下表」缺表），fall_accel 固定 1.5（§7.2 tec
 *                   基準）。peak_age 優先用史實巔峰年（best finish 年 − 出生年），
 *                   缺資料走位置基準 24 ± hash jitter。
 *   position       枚舉換成遊戲同一套（JGL → JG）。
 *
 * 用法：
 *   node gen-roster.mjs                 # 重算並覆寫 src/data/npc/roster.js
 *   node gen-roster.mjs --validate-only # 只驗證既有 roster.js，不重算
 *
 * 重跑冪等：確定性部分靠固定公式＋`hash01(player_id)`，語意部分靠 overrides 快取。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { ATTRS } from '../../src/data/attributes.js';
import { ROLE_ATTR_WEIGHTS, ROLES } from '../../src/data/skills.js';
import { bestFinishOf, peakRatingOf } from './gen-percentiles.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLEANED = path.join(HERE, 'cleaned_players.json');
const OUT = path.join(HERE, '..', '..', 'src', 'data', 'npc', 'roster.js');
const OVERRIDES = path.join(HERE, 'npc_overrides.json');

/** cleaned 位置 → 遊戲位置枚舉（遊戲用 JG，Liquipedia 慣用 JGL） */
const POSITION_MAP = { TOP: 'TOP', JGL: 'JG', JG: 'JG', MID: 'MID', ADC: 'ADC', SUP: 'SUP' };

/** 生成範圍：只生成這兩個優先級（S27 拍板，p3 不生成） */
const GEN_PRIORITIES = new Set([1, 2]);

/** attributes 位置原型的基線與幅度（§23.3 反映射，S27 定案） */
const ATTR_BASE = 55;
const ATTR_RANGE = 40;

/** lifecycle fall_accel 固定值（§7.2 tec 基準；NPC 三參數不含它） */
const NPC_FALL_ACCEL = 1.5;

/**
 * FNV-1a 32-bit hash → [0, 1)。player_id 是穩定主鍵，同 id 重跑同值——確定性
 * jitter 的來源（不是真隨機，是「可重現的每選手常數」）。
 */
function hash01(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}

/** 由 player_id 派生一組 [0,1) 亂數，n 個 */
function seededRandoms(playerId, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(hash01(`${playerId}#${i}`));
  return out;
}

/** 位置枚舉換成遊戲同一套；null 原樣保留 */
function roleKey(cleanedPos) {
  if (cleanedPos == null) return null;
  return POSITION_MAP[cleanedPos] ?? null;
}

/* ================= 生涯統計（psych／traits／tags 的共同輸入） ================= */

function careerStats(player) {
  const career = player.career || [];
  const finishes = career.flatMap((c) => c.finishes || []);
  const yearPoints = career.filter((c) => c.years).flatMap((c) => c.years);
  const spanFromCareer = yearPoints.length ? Math.max(...yearPoints) - Math.min(...yearPoints) : 0;
  const span = player.active_years
    ? player.active_years[1] - player.active_years[0]
    : spanFromCareer;
  const teamCount = career.length;
  let longestTenure = 0;
  for (const c of career) {
    if (c.years) longestTenure = Math.max(longestTenure, c.years[1] - c.years[0] + 1);
  }
  const worldsChamp = finishes.some((f) => f.event === 'worlds' && f.finish === 'champion');
  const msiChamp = finishes.some((f) => f.event === 'msi' && f.finish === 'champion');
  const intlDeep = finishes.filter((f) => (f.event === 'worlds' || f.event === 'msi') && ['champion', 'final', 'semi'].includes(f.finish)).length;
  const intlAny = finishes.some((f) => f.event === 'worlds' || f.event === 'msi');
  const champCount = finishes.filter((f) => f.finish === 'champion').length;
  return { span, teamCount, longestTenure, worldsChamp, msiChamp, intlDeep, intlAny, champCount, finishCount: finishes.length };
}

/* ================= peak（照 S26） ================= */

/** peak = { rating, year }；無名次回傳 null（不拍數字） */
function peakOf(player) {
  const rating = peakRatingOf(player);
  if (rating == null) return null;
  const best = bestFinishOf(player);
  return { rating, year: best ? best.year ?? null : null };
}

/* ================= attributes（位置原型反映射） ================= */

/** 位置原型：55 + 40 × (w / w_max)。位置 null 走五路平均權重 */
function attributePrototype(role) {
  let w;
  if (role) {
    w = ROLE_ATTR_WEIGHTS[role];
  } else {
    w = {};
    for (const a of ATTRS) w[a] = ROLES.reduce((s, r) => s + ROLE_ATTR_WEIGHTS[r][a], 0) / ROLES.length;
  }
  const wMax = Math.max(...ATTRS.map((a) => w[a]));
  const proto = {};
  let rw = 0;
  for (const a of ATTRS) {
    proto[a] = ATTR_BASE + ATTR_RANGE * (w[a] / wMax);
    rw += proto[a] * w[a];
  }
  return { proto, roleWeighted: rw };
}

/** 反映射：縮放使 Σ(attr × 權重) = rating */
function attributesOf(role, rating) {
  if (rating == null) return null;
  const { proto, roleWeighted } = attributePrototype(role);
  const out = {};
  for (const a of ATTRS) out[a] = Math.round(proto[a] * (rating / roleWeighted));
  return out;
}

/* ================= lifecycle（S27 補 §23.3 缺表） ================= */

function lifecycleOf(player) {
  const [rPeak, rRise, rFall] = seededRandoms(player.player_id, 3);
  // peak_age 優先用史實巔峰年（best finish 年 − 出生年）
  let peakAge = 24 + Math.round((rPeak - 0.5) * 4); // 22–26
  const best = peakOf(player);
  if (best && best.year != null && player.birth_year != null) {
    peakAge = Math.max(20, Math.min(28, best.year - player.birth_year));
  }
  const riseK = 1.8 + (rRise - 0.5) * 0.8; // 1.4–2.2
  const fallK = 0.04 + (rFall - 0.5) * 0.04; // 0.02–0.06
  return {
    peak_age: peakAge,
    rise_k: Number(riseK.toFixed(3)),
    fall_k: Number(fallK.toFixed(4)),
    fall_accel: NPC_FALL_ACCEL,
  };
}

/* ================= psych（確定性規則 + jitter） ================= */

function psychOf(player) {
  const s = careerStats(player);
  const [r0, r1, r2, r3, r4, r5] = seededRandoms(`${player.player_id}#psych`, 6);
  const jitter = (r) => Math.round((r - 0.5) * 16); // ±8

  const comp = 50 + Math.min(16, s.intlDeep * 4) - (s.intlAny ? 0 : 2) + jitter(r0);
  const conf = 50 + Math.min(12, s.champCount * 3) - (s.champCount ? 0 : 2) + jitter(r1);
  const drive = 50 + (s.span >= 10 ? 8 : s.span >= 6 ? 5 : s.span < 3 ? -4 : 0) + jitter(r2);
  const disc = 50 + (s.teamCount <= 2 ? 6 : s.teamCount >= 5 ? -6 : 0) + jitter(r3);
  const trust = 50 + (s.longestTenure >= 6 ? 9 : s.longestTenure >= 4 ? 6 : 0) + jitter(r4);
  const resl = 50 + (s.span >= 8 ? 5 : s.span >= 6 ? 3 : 0) + jitter(r5);

  const clamp = (v) => Math.max(20, Math.min(90, v));
  return { comp: clamp(comp), conf: clamp(conf), drive: clamp(drive), disc: clamp(disc), trust: clamp(trust), resl: clamp(resl) };
}

/* ================= traits（確定性規則，0–2 個 common） ================= */

function traitsOf(player) {
  const s = careerStats(player);
  const out = [];
  if (s.worldsChamp) out.push('clutch');
  if (s.span >= 8) out.push('veteran');
  if (s.teamCount >= 5) out.push('lonewolf');
  if (s.msiChamp && !out.includes('macroG')) out.push('macroG');
  if (s.champCount >= 2 && out.length < 2) out.push('leader');
  if (s.intlDeep >= 2 && !s.worldsChamp && out.length < 2) out.push('intlghost');
  if (out.length < 2 && s.finishCount === 0 && s.span >= 6) out.push('veteran');
  return out.slice(0, 2);
}

/* ================= tags（確定性規則） ================= */

function tagsOf(player) {
  const s = careerStats(player);
  const tags = [];
  if (player.birth_year == null) tags.push('birth_estimated');
  if (s.finishCount === 0) tags.push('no_finish');
  if (s.span === 0) tags.push('short_peak');
  if (s.teamCount >= 4) tags.push('journeyman');
  if (s.intlAny) tags.push('intl_season');
  if (s.worldsChamp) tags.push('worlds_champion');
  return tags;
}

/* ================= 主組裝 ================= */

function buildEntry(player, override) {
  const role = roleKey(player.position);
  const peak = peakOf(player);
  const career = (player.career || []).map((c) => ({
    years: c.years,
    team_id: c.team_id,
    finishes: (c.finishes || []).map((f) => ({ year: f.year, event: f.event, finish: f.finish })),
  }));
  const teamId = career.length ? career[career.length - 1].team_id : null;
  const birthYear = player.birth_year ?? (player.active_years ? player.active_years[0] - 17 : null);

  const entry = {
    player_id: player.player_id,
    team_id: teamId,
    birth_year: birthYear,
    position: role,
    active_years: player.active_years,
    career,
    peak,
    lifecycle: lifecycleOf(player),
    attributes: attributesOf(role, peak ? peak.rating : null),
    psych: psychOf(player),
    traits: traitsOf(player),
    tags: tagsOf(player),
    data_source: player.data_source,
    fetch_priority: player.fetch_priority,
  };

  if (override) {
    if (override.psych) entry.psych = { ...entry.psych, ...override.psych };
    if (override.traits) entry.traits = override.traits;
    if (override.tags) entry.tags = override.tags;
  }
  return entry;
}

export function buildRoster(players, overrides = {}) {
  const selected = players.filter((p) => GEN_PRIORITIES.has(p.fetch_priority));
  const roster = selected.map((p) => buildEntry(p, overrides[p.player_id]));
  roster.sort((a, b) => (a.player_id < b.player_id ? -1 : a.player_id > b.player_id ? 1 : 0));
  return roster;
}

/* ================= schema 驗證（完成定義） ================= */

const ATTR_KEYS = ['vit', 'agi', 'awr', 'tec', 'syn', 'dec'];
const PSYCH_KEYS = ['comp', 'conf', 'drive', 'disc', 'trust', 'resl'];

export function validateRoster(roster) {
  const errors = [];
  const ids = new Set();
  for (const p of roster) {
    if (ids.has(p.player_id)) errors.push(`重複 player_id: ${p.player_id}`);
    ids.add(p.player_id);
    if (!GEN_PRIORITIES.has(p.fetch_priority)) errors.push(`${p.player_id}: fetch_priority 不在生成範圍`);
    if (p.position != null && !ROLES.includes(p.position)) errors.push(`${p.player_id}: 位置 ${p.position} 非遊戲枚舉`);
    if (p.peak != null) {
      if (typeof p.peak.rating !== 'number' || p.peak.rating < 50 || p.peak.rating > 100) errors.push(`${p.player_id}: peak.rating ${p.peak.rating} 越界`);
      if (!p.attributes) errors.push(`${p.player_id}: 有 rating 但無 attributes`);
    } else if (p.attributes != null) {
      errors.push(`${p.player_id}: 無 rating 卻有 attributes`);
    }
    if (p.attributes) {
      for (const k of ATTR_KEYS) if (typeof p.attributes[k] !== 'number') errors.push(`${p.player_id}: attributes.${k} 非數字`);
    }
    for (const k of PSYCH_KEYS) {
      const v = p.psych?.[k];
      if (typeof v !== 'number' || v < 0 || v > 100) errors.push(`${p.player_id}: psych.${k} = ${v} 越界`);
    }
    if (!Array.isArray(p.traits) || !Array.isArray(p.tags)) errors.push(`${p.player_id}: traits/tags 非陣列`);
  }
  return errors;
}

/* ================= 輸出 ================= */

const HEADER = `/**
 * NPC 名冊（S28／S29 消費）——由 \`tools/npc/gen-roster.mjs\` 產出，勿手改。
 * 來源：Liquipedia（主源，CC BY-SA 3.0）、Leaguepedia（備援，CC BY-SA 3.0）。
 * 逐欄定義見 §23.3；psych／traits／tags 由確定性規則產出＋執行者語意覆寫
 * （tools/npc/npc_overrides.json 快取，§23.1 第 4 條的 LLM 職責由執行者承擔）。
 * 備援／填充紀錄見各筆 data_source 與 tags。
 */
`;

function emit(roster) {
  const body = roster.map((p) => `  ${JSON.stringify(p)}`).join(',\n');
  const lines = [HEADER, `export const NPC_ROSTER = [\n${body}\n];\n\n`];
  lines.push('/** player_id → NPC 詳情（穩定主鍵，§23.6 引擎按 ID 查名冊） */\n');
  lines.push('export const NPC_BY_ID = Object.fromEntries(NPC_ROSTER.map((p) => [p.player_id, p]));\n');
  return lines.join('');
}

function main() {
  const validateOnly = process.argv.includes('--validate-only');
  if (validateOnly) {
    const src = readFileSync(OUT, 'utf8');
    const errors = validateRoster(parseRoster(src));
    if (errors.length) {
      console.error(`schema 驗證失敗：\n${errors.join('\n')}`);
      process.exit(1);
    }
    console.log('roster.js schema 驗證通過。');
    return;
  }

  const cleaned = JSON.parse(readFileSync(CLEANED, 'utf8'));
  const players = cleaned.players || [];
  const overrides = existsSync(OVERRIDES) ? JSON.parse(readFileSync(OVERRIDES, 'utf8')) : {};

  const roster = buildRoster(players, overrides);
  const errors = validateRoster(roster);
  if (errors.length) {
    console.error(`schema 驗證失敗：\n${errors.join('\n')}`);
    process.exit(1);
  }

  writeFileSync(OUT, emit(roster));
  const withRating = roster.filter((p) => p.peak).length;
  const withPos = roster.filter((p) => p.position).length;
  const overridden = Object.keys(overrides).length;
  console.log(`已寫出 src/data/npc/roster.js：${roster.length} 筆（p1+p2）`);
  console.log(`  有 peak.rating：${withRating}；有 position：${withPos}；覆寫：${overridden} 筆`);
}

/** 從既有 roster.js 字串解出陣列（validate-only 用，避免 import 執行期副作用） */
function parseRoster(src) {
  const m = src.match(/export const NPC_ROSTER = (\[[\s\S]*?\]);/);
  if (!m) throw new Error('roster.js 找不到 NPC_ROSTER');
  return JSON.parse(m[1]);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
