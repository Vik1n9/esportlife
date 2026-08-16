#!/usr/bin/env node
/**
 * tools/npc/gen-target-intl.mjs — 國際 target_players.csv 段生成器（S24c，零相依）
 *
 * fetch_priority 2 範圍（§23.3 定案，不縮不擴）：歷年 Worlds／MSI 參賽隊全部隊員
 * ＋ LCK／LPL／LEC／LCS 歷年賽段冠軍隊員。枚舉路徑（S24a 探勘確認）：賽事頁
 * `{{TeamCard}}` 模板直接內嵌參賽隊隊員（p1–p6，t2p*／t3p* 是教練不算選手），
 * 不必逐隊頁展開。
 *
 * 冠軍判定（2026-08-16 實測後改法，見交接筆記）：
 * split 頁本身**沒有**可靠的靜態文字冠軍欄——TeamPrizePool 的 Slot 不含隊伍、
 * 名次靠 `{{ShowBracket}}` 走 LPDB 資料庫算圖（24a 已警告，靜態 wikitext 抓不到）；
 * Tournament Awards 的裸 `award=MVP` 是例行賽 MVP，跟冠軍隊無關，不能當判定。
 * 改用**零額外抓取的可靠訊號**：Worlds／MSI 賽事頁的 `qualifier=` 連結——
 * 當某隊的 qualifier 剛好連到該 split 自己的頁面（不是 Championship Points／
 * Regional Finals／Promotion／Qualifier 這些變體），代表這隊是「該 split 冠軍直接
 * 拿到的種子」，是該 split 冠軍的地位證明（實測驗證：2017 LCK Summer 冠軍
 * Longzhu Gaming 的 qualifier 正是 `LCK/Summer/2017`，符合真實史實——當年 Longzhu
 * 爆冷擊敗 SKT 奪冠）。以此建 ground truth 表（region/year/split → 隊伍＋名單），
 * 找不到 ground truth 時退回 `Finals MVP`／`Grand Final MVP`／`Playoffs MVP`
 * （不含裸 `MVP`）當次要訊號，兩者都沒有則列 UNRESOLVED 人工核對。
 *
 * 輸入：
 * - events_worlds_msi.txt —— Worlds／MSI 賽事頁清單，全部隊伍算數，同時是冠軍
 *   ground truth 的唯一來源
 * - events_champions.txt  —— LCK／LPL／LEC／LCS 歷年賽段頁清單；有 ground truth
 *   時去該頁找對應 TeamCard 補全名單（split 當時陣容，可能與 Worlds/MSI 時不同），
 *   頁面沒抓到或找不到對應隊伍時直接退回 ground truth 卡自帶的名單（來自
 *   Worlds/MSI 頁，不因 429 抓不到 split 頁而漏算）
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

// 次要訊號（無 ground truth 時才用）：Tournament Awards 的「決賽 MVP」——限定
// Finals／Grand Final／Playoffs 字樣，裸 award=MVP（例行賽 MVP）不算數，跟冠軍隊
// 無關聯。優先讀 Opponent 的 team=，缺 team=（如 LCK 2025 改季賽制後
// {{Opponent|Ruler}} 沒帶隊伍）改用 MVP 選手名反查哪張 TeamCard 有這個人。
const FINALS_MVP_RE = /\{\{Slot\s*\|award=(?:Finals? MVP|Grand Finals? MVP|Playoffs? MVP)\b[^}]*\{\{Opponent\|([^|}]+)(?:\|[^}]*)?\}\}/i;

function findChampionCardByMvp(wiki, cards) {
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

// 把 Worlds／MSI 頁 qualifier= 連結目標正規化成跟 events_champions.txt 同格式的
// split 頁題（LCK/2015/Spring 這種新序，含 LCS/Europe、LCS/North America 兩個
// 子賽區）。連結格式兩種都出現過：Region/Split/Year（舊）、Region/Year/Split（新）。
// 回傳 null 表示不是「乾淨」的 split 連結（Championship Points／Regional Finals／
// Promotion／Qualifier／Road to MSI 等變體一律不算——那些是晉級途徑，不是冠軍證明）。
const SPLIT_RE = /^(Spring|Summer|Winter)$/i;
const YEAR_RE = /^\d{4}$/;
const REGIONS = new Set(['LCK', 'LPL', 'LEC', 'LCS', 'Champions']);

function normalizeSplitTarget(target) {
  const parts = target.split('/').map((s) => s.replace(/_/g, ' ').trim());
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (REGIONS.has(a) && YEAR_RE.test(b) && SPLIT_RE.test(c)) return `${a}/${b}/${c}`;
    if (REGIONS.has(a) && SPLIT_RE.test(b) && YEAR_RE.test(c)) return `${a}/${c}/${b}`;
  }
  if (parts.length === 4 && parts[0] === 'LCS' && (parts[1] === 'Europe' || parts[1] === 'North America')) {
    const [, sub, b, c] = parts;
    if (YEAR_RE.test(b) && SPLIT_RE.test(c)) return `LCS/${sub}/${b}/${c}`;
    if (SPLIT_RE.test(b) && YEAR_RE.test(c)) return `LCS/${sub}/${c}/${b}`;
  }
  return null;
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
// splitKey（如 "LCK/2015/Spring"） → { team, players }，由 Worlds/MSI 頁的
// qualifier= 連結反推，是冠軍判定的 ground truth（見檔頭說明）。
const championGroundTruth = new Map();

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
    if (card.qualifier) {
      const linkMatch = card.qualifier.match(/\[\[([^\]|]+)/);
      const target = linkMatch ? linkMatch[1].trim() : null;
      const splitKey = target ? normalizeSplitTarget(target) : null;
      if (splitKey && !championGroundTruth.has(splitKey)) {
        championGroundTruth.set(splitKey, card);
      }
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
let groundTruthHits = 0;
let mvpFallbackHits = 0;
for (const title of championList) {
  const wiki = loadRaw(title);
  const groundTruthCard = championGroundTruth.get(title) ?? null;

  let card = null;
  if (groundTruthCard) {
    groundTruthHits++;
    // 有 ground truth：split 頁本身有抓到的話，優先用該頁同隊的 TeamCard（split
    // 當時陣容，可能含替補）；頁面沒抓到或找不到對應隊伍，直接退回 ground truth
    // 卡本身（來自 Worlds/MSI 頁，不因 429 抓不到 split 頁而漏算冠軍隊）。
    if (wiki) {
      const cards = parseTeamCards(wiki);
      card = cards.find((c) => slugify(c.team) === slugify(groundTruthCard.team)) ?? groundTruthCard;
    } else {
      card = groundTruthCard;
    }
  } else if (wiki) {
    card = findChampionCardByMvp(wiki, parseTeamCards(wiki));
    if (card) mvpFallbackHits++;
  }

  if (!card) {
    unresolvedChampions.push(wiki ? title : `${title}（無 raw 且無 ground truth）`);
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
console.error(`冠軍判定：ground truth（Worlds/MSI qualifier 反推）${groundTruthHits} 筆、MVP 次要訊號 ${mvpFallbackHits} 筆、共 ${championList.length} 個 split`);
console.error(`涉及隊伍（team= 原始值）共 ${teamsSeen.size} 個，寫進 teams_intl.txt 供 team_history 段使用`);
writeFileSync(join(ROOT, 'teams_intl.txt'), [...teamsSeen].sort().join('\n') + '\n');
if (unresolvedChampions.length) {
  console.error(`冠軍判定失敗（人工核對，${unresolvedChampions.length} 筆）：\n  ${unresolvedChampions.join('\n  ')}`);
}
