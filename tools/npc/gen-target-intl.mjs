#!/usr/bin/env node
/**
 * tools/npc/gen-target-intl.mjs — 國際 target_players.csv 段生成器（S24c，零相依）
 *
 * fetch_priority 2 範圍（§23.3 定案，不縮不擴）：歷年 Worlds／MSI 參賽隊全部隊員
 * ＋ LCK／LPL／LEC／LCS 歷年賽段冠軍隊員。枚舉路徑（S24a 探勘確認）：賽事頁
 * `{{TeamCard}}` 模板直接內嵌參賽隊隊員（p1–p6，t2p*／t3p* 是教練不算選手），
 * 不必逐隊頁展開。
 *
 * 輸入：
 * - events_worlds_msi.txt —— Worlds／MSI 賽事頁清單，全部隊伍算數
 * - events_champions.txt  —— LCK／LPL／LEC／LCS 歷年賽段頁清單，只算冠軍隊
 *   （冠軍判定：Tournament Awards 的 `award=Finals MVP`／`Grand Final MVP` 所屬
 *   `team=`；找不到時列進 UNRESOLVED，人工核對交接筆記）
 *
 * 輸出：target_players.csv 追加國際段（region=INTL、fetch_priority=2），
 * 台港澳段（S24b，region=TW/HK/MO、priority=1）保留不動、去重合併。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(ROOT, 'raw_data');
const WIKI_BASE = 'https://liquipedia.net/leagueoflegends/';

const slugify = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function loadRaw(title) {
  const file = join(RAW_DIR, `${slugify(title)}.wiki`);
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8');
}

// 解析所有 {{TeamCard ... }} 區塊（不含 columns start/end 包裝）。
function parseTeamCards(wiki) {
  const cards = [];
  const re = /\{\{TeamCard\n([\s\S]*?)\n\}\}/g;
  let m;
  while ((m = re.exec(wiki))) {
    const fields = {};
    // 欄位以 | 分隔（MediaWiki 模板參數規則），不是逐行——同一行常見多欄位
    // 如 `|p1=sOAZ |p1flag=fr`，逐行 parse 會把 p1flag 併進 p1 的值。
    for (const segment of m[1].split('|')) {
      const fm = segment.match(/^\s*([a-zA-Z0-9]+)\s*=\s*([\s\S]*)$/);
      if (fm && !(fm[1] in fields)) fields[fm[1]] = fm[2].trim();
    }
    if (!fields.team) continue;
    const players = [];
    for (let i = 1; i <= 6; i++) {
      const raw = fields[`p${i}`];
      if (!raw) continue;
      // p_link 優先當 player_id（消歧義正式頁題），否則用顯示名。
      const linkField = fields[`p${i}link`];
      const playerId = (linkField ?? raw).trim();
      if (playerId) players.push(playerId);
    }
    cards.push({ team: fields.team, players, qualifier: fields.qualifier ?? null });
  }
  return cards;
}

// Tournament Awards 找「決賽 MVP」判定冠軍隊：優先讀 Opponent 的 team=（多數年份有），
// 缺 team= 時（如 LCK 2025 改季賽制後 {{Opponent|Ruler}} 沒帶隊伍）改用 MVP 選手名
// 反查哪張 TeamCard 有這個人，比對出冠軍隊。
const FINALS_MVP_RE = /\{\{Slot\|award=(?:[^|]*\bFinal[^|]*MVP|Grand Final MVP)[^}]*\{\{Opponent\|([^|}]+)(?:\|[^}]*)?\}\}/i;

function findChampionCard(wiki, cards) {
  const m = wiki.match(FINALS_MVP_RE);
  if (!m) return null;
  const teamMatch = m[0].match(/\bteam=([a-zA-Z0-9._-]+)/);
  if (teamMatch) {
    const byTeamCode = cards.find((c) => slugify(c.team) === slugify(teamMatch[1]));
    if (byTeamCode) return byTeamCode;
  }
  const mvpPlayer = m[1].trim();
  return cards.find((c) => c.players.some((p) => slugify(p) === slugify(mvpPlayer))) ?? null;
}

const args = process.argv.slice(2);
const outFile = (args.indexOf('--out') >= 0 ? args[args.indexOf('--out') + 1] : null) ?? 'target_players.csv';
const worldsMsiListFile = (args.indexOf('--worlds-msi') >= 0 ? args[args.indexOf('--worlds-msi') + 1] : null) ?? 'events_worlds_msi.txt';
const championListFile = (args.indexOf('--champions') >= 0 ? args[args.indexOf('--champions') + 1] : null) ?? 'events_champions.txt';

const seen = new Map(); // player_id -> region
const rows = [];
const unresolvedChampions = [];
const teamsSeen = new Set();

function addPlayer(playerId, region, priority) {
  if (seen.has(playerId)) return;
  seen.set(playerId, region);
  rows.push({
    wiki_url: `${WIKI_BASE}${playerId.replace(/ /g, '_')}`,
    player_id: playerId,
    region,
    fetch_priority: priority,
  });
}

// Worlds／MSI：全部參賽隊全部隊員
let worldsMsiList = [];
try {
  worldsMsiList = readFileSync(worldsMsiListFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
} catch {
  console.error(`警告: ${worldsMsiListFile} 不存在，跳過 Worlds/MSI 段`);
}
let worldsMsiPlayers = 0;
for (const title of worldsMsiList) {
  const wiki = loadRaw(title);
  if (!wiki) {
    console.error(`警告: ${title} 無 raw（先跑 crawl.mjs crawl）`);
    continue;
  }
  for (const card of parseTeamCards(wiki)) {
    teamsSeen.add(card.team);
    for (const p of card.players) {
      addPlayer(p, 'INTL', 2);
      worldsMsiPlayers++;
    }
  }
}

// LCK/LPL/LEC/LCS：只算冠軍隊
let championList = [];
try {
  championList = readFileSync(championListFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
} catch {
  console.error(`警告: ${championListFile} 不存在，跳過賽段冠軍段`);
}
let championPlayers = 0;
for (const title of championList) {
  const wiki = loadRaw(title);
  if (!wiki) {
    console.error(`警告: ${title} 無 raw（先跑 crawl.mjs crawl）`);
    continue;
  }
  const cards = parseTeamCards(wiki);
  const card = findChampionCard(wiki, cards);
  if (!card) {
    unresolvedChampions.push(title);
    continue;
  }
  teamsSeen.add(card.team);
  for (const p of card.players) {
    addPlayer(p, 'INTL', 2);
    championPlayers++;
  }
}

// 讀既有 target_players.csv（台港澳段），合併輸出（去重以既有為準，國際段不覆寫台港澳）
// --out 與 crawl.mjs／gen-target-tw.mjs 同規則：直接當路徑用（相對 cwd），不拼 ROOT。
const existingPath = outFile;
let existingLines = [];
if (existsSync(existingPath)) {
  existingLines = readFileSync(existingPath, 'utf8').split('\n').filter(Boolean);
}
const header = existingLines[0] ?? 'wiki_url,player_id,region,fetch_priority';
const existingRows = existingLines.slice(1);
const existingIds = new Set(existingRows.map((l) => l.split(',')[1]));

let addedCount = 0;
let skippedOverlap = 0;
const newLines = [];
for (const r of rows) {
  if (existingIds.has(r.player_id)) {
    skippedOverlap++;
    continue;
  }
  newLines.push(`${r.wiki_url},${r.player_id},${r.region},${r.fetch_priority}`);
  addedCount++;
}

const csv = [header, ...existingRows, ...newLines].join('\n') + '\n';
writeFileSync(existingPath, csv);

console.error(`已寫出 ${outFile}：新增國際段 ${addedCount} 筆（priority 2），與台港澳段重疊略過 ${skippedOverlap} 筆`);
console.error(`Worlds/MSI 選手出現次數 ${worldsMsiPlayers}、賽段冠軍選手出現次數 ${championPlayers}（去重前，同人跨屆算多次是正常的）`);
console.error(`涉及隊伍（team= 原始值）共 ${teamsSeen.size} 個，寫進 teams_intl.txt 供 team_history 段使用`);
writeFileSync(join(ROOT, 'teams_intl.txt'), [...teamsSeen].sort().join('\n') + '\n');
if (unresolvedChampions.length) {
  console.error(`冠軍判定失敗（人工核對，${unresolvedChampions.length} 筆）：\n  ${unresolvedChampions.join('\n  ')}`);
}
