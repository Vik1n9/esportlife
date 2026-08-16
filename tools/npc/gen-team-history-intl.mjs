#!/usr/bin/env node
/**
 * tools/npc/gen-team-history-intl.mjs — team_history.json 國際段生成器（S24c，零相依）
 *
 * 吃 Worlds／MSI 賽事頁＋LCK/LPL/LEC/LCS 歷年賽段頁的 raw（同一批 gen-target-intl.mjs
 * 用的檔案），用 {{TeamCard}} 的 `team=`／`qualifier=` 欄位建隊伍清單，不額外抓隊頁
 * Infobox（國際隊數量大，逐隊抓 Infobox 在目前限流下不現實；S23.3 定案的
 * team_id／region／active_years 改用下列可從賽事頁本身推出的近似規則，已知
 * 侷限寫進交接筆記）：
 *
 * - region：從隊伍出現過的 `qualifier=` 連結（如 `[[LCK/2023/Summer|...]]`）取
 *   第一段路徑當聯賽代碼，對照 LEAGUE_REGION 表得出（多次出現取眾數）。
 *   World_Championship／International_Wildcard_* 等非聯賽 qualifier 不計票。
 * - active_years：用該隊在已抓頁面中出現的最早／最晚年份（頁題含年份）近似，
 *   不是 Infobox 的 created／disbanded 精確值——闕如亦寫進交接筆記。
 * - team_id：ABBREVIATIONS 人工表（電競圈通用縮寫，與 gen-team-history.mjs
 *   同精神）優先；查無對照表時退回「每個字首字母大寫」的程式化縮寫，並列進
 *   UNCLASSIFIED 供人工核對（不是查無此隊，是縮寫沒人工確認過）。
 * - predecessors／successors：只填非常明確、廣為人知的更名鏈（RENAMES 表），
 *   其餘留空——國際隊更名關係複雜，完整梳理留給後續站（交接筆記註記）。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(ROOT, 'raw_data');

const slugify = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function loadRaw(title) {
  const file = join(RAW_DIR, `${slugify(title)}.wiki`);
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8');
}

function parseTeamCards(wiki) {
  const cards = [];
  const re = /\{\{TeamCard\n([\s\S]*?)\n\}\}/g;
  let m;
  while ((m = re.exec(wiki))) {
    const fields = {};
    for (const segment of m[1].split('|')) {
      const fm = segment.match(/^\s*([a-zA-Z0-9]+)\s*=\s*([\s\S]*)$/);
      if (fm && !(fm[1] in fields)) fields[fm[1]] = fm[2].trim();
    }
    if (!fields.team) continue;
    cards.push({ team: fields.team, qualifier: fields.qualifier ?? null });
  }
  return cards;
}

// qualifier=[[<path>|display]] 的 <path> 第一段當聯賽代碼。
function leagueOf(qualifier) {
  if (!qualifier) return null;
  const m = qualifier.match(/\[\[([^|\]]+)/);
  if (!m) return null;
  return m[1].split('/')[0].replace(/_/g, ' ').trim();
}

const LEAGUE_REGION = new Map([
  ['LCK', 'KR'], ['Champions', 'KR'],
  ['LPL', 'CN'],
  ['LEC', 'EU'], ['LCS/Europe', 'EU'],
  ['LCS', 'NA'], ['LCS/North America', 'NA'], ['LCS/North_America', 'NA'],
  ['LMS', 'TW'], ['PCS', 'TW'], ['GPL', 'TW'], ['LCP', 'TW'],
  ['VCS', 'VN'],
  ['CBLOL', 'BR'],
  ['LJL', 'JP'],
  ['TCL', 'TR'],
  ['LLA', 'LATAM'], ['LLN', 'LATAM'], ['CLS', 'LATAM'],
  ['LCL', 'RU'],
  ['OPL', 'OCE'], ['LCO', 'OCE'],
]);

// 頁題取年份（World Championship/2017、LCK/2023/Summer、Champions/2012/Spring、
// LPL/2025/Split 1 皆含四位數年份）。
function yearOfTitle(title) {
  const m = title.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

// 人工維護：電競圈通用縮寫（與 gen-team-history.mjs 同精神，只收有信心的）。
// 2026-08-16 定：LCK/LPL/LEC/LCS 現役與知名歷史隊、Worlds 常客涵蓋；生僻外卡
// 賽區小隊不硬猜，落 UNCLASSIFIED 由人工補。
const ABBREVIATIONS = {
  // LCK / Korea
  'T1': 'T1', 'SK Telecom T1': 'T1', 'SKT': 'T1',
  'Gen.G': 'GEN', 'Gen.G Esports': 'GEN', 'KSV': 'GEN', 'KSV eSports': 'GEN', 'Samsung Galaxy': 'GEN',
  'Samsung Blue': 'SSB', 'Samsung White': 'SSW', 'Samsung Ozone': 'SSO',
  'KT Rolster': 'KT', 'DRX': 'DRX', 'DragonX': 'DRX', 'KING-ZONE DragonX': 'KZ', 'Longzhu Gaming': 'LZ',
  'Hanwha Life Esports': 'HLE', 'DAMWON Gaming': 'DK', 'Dplus': 'DK', 'DWG KIA': 'DK',
  // Freecs 實測（2023/2025 頁）與 BRION 同頁共存，不是同隊——Freecs 是
  // Afreeca Freecs 贊助改名後的簡稱（併同一 team_id=AF），BRION 是另一支
  // LCK 隊，兩者無驗證關係，不連 predecessors/successors。
  'Kwangdong Freecs': 'AF', 'Freecs': 'AF', 'Afreeca Freecs': 'AF', 'BRION': 'BRION',
  'Nongshim RedForce': 'NS', 'Liiv SANDBOX': 'LSB', 'SANDBOX Gaming': 'LSB', 'KOO Tigers': 'KOO', 'ROX Tigers': 'ROX',
  'NaJin Black Sword': 'NJB', 'NaJin Sword': 'NJS', 'NaJin White Shield': 'NJW',
  'Jin Air Green Wings': 'JAG', 'MVP': 'MVP', 'Griffin': 'GRF',
  // LPL / China
  'JD Gaming': 'JDG', 'Royal Never Give Up': 'RNG', 'Royal Club': 'RC', 'Star Horn Royal Club': 'RC',
  'EDward Gaming': 'EDG', 'Invictus Gaming': 'IG', 'FunPlus Phoenix': 'FPX',
  'Top Esports': 'TES', 'Bilibili Gaming': 'BLG', 'Weibo Gaming': 'WBG', 'LGD Gaming': 'LGD',
  'LNG Esports': 'LNG', 'Oh My God': 'OMG', 'Team WE': 'WE', 'Suning': 'SN',
  // SS 撞既有台港澳段 SillySilly Gaming 的縮寫，Snake Esports 改用 SNK 消歧義。
  'Rogue Warriors': 'RW', 'Vici Gaming': 'VG', 'Snake Esports': 'SNK',
  // LEC / Europe
  // MAD 撞既有台港澳段 MAD Team 的縮寫，MAD Lions 改用 MADL 消歧義。
  'G2 Esports': 'G2', 'Fnatic': 'FNC', 'MAD Lions': 'MADL', 'Team Vitality': 'VIT',
  'Team BDS': 'BDS', 'SK Gaming': 'SK', 'Rogue': 'RGE', 'Origen': 'OG',
  'Misfits Gaming': 'MSF', 'H2K': 'H2K', 'Splyce': 'SPY', 'Unicorns Of Love': 'UOL',
  'Unicorns of Love': 'UOL', 'Gambit Esports': 'GMB', 'Gambit Gaming': 'GMB',
  'Moscow Five': 'M5', 'Alliance': 'ALK', 'Lemondogs': 'LD', 'Copenhagen Wolves': 'CW',
  // LCS / North America
  'Cloud9': 'C9', 'Team Liquid': 'TL', 'Team SoloMid': 'TSM', 'TSM': 'TSM',
  '100 Thieves': '100T', 'FlyQuest': 'FLY', 'Evil Geniuses': 'EG', 'Golden Guardians': 'GG',
  'Immortals': 'IMT', 'NRG': 'NRG', 'Counter Logic Gaming': 'CLG', 'Counter Logic Gaming EU': 'CLG',
  'Team Dignitas': 'DIG', 'Team Impulse': 'TIP', 'LMQ': 'LMQ', 'Phoenix1': 'P1',
  // GPL/LMS/PCS 已在台港澳段（S24b），此處防呆重複用
  'Flash Wolves': 'FW', 'Ahq e-Sports Club': 'ahq', 'ahq e-Sports Club': 'ahq',
  'Taipei Assassins': 'TPA', 'CTBC Flying Oyster': 'CFO', 'PSG Talon': 'PSG',
  'Machi Esports': 'MCX', 'G-Rex': 'GRX', 'J Team': 'JT', 'Hong Kong Attitude': 'HKA',
  'Gamania Bears': 'GB', 'MAD Team': 'MAD_TW', 'Beyond Gaming': 'BYG',
  'DetonatioN FocusMe': 'DFM', 'GAM Esports': 'GAM', 'Talon Esports': 'TLN',
};

// 廣為人知的更名鏈（僅收高信心度案例，其餘留空由後續站梳理）。
// ⚠ 只對「ABBREVIATIONS 給不同 team_id」的兩端寫關係——同一 team_id 底下的
// 名稱變體（如 SK Telecom T1／T1 都併到 team_id=T1）已經用合併 active_years
// 表示同隊沿革，不需要（也不能，會自我指涉）再寫 predecessors/successors。
const RENAMES = {
  'Longzhu Gaming': { successors: ['KZ'] },
  // KING-ZONE DragonX 後續掉贊助名變 DragonX 再定名 DRX（併同一 team_id=DRX，
  // 靠合併 active_years 表示），不是變成 Hanwha Life Esports——HLE 是另一條
  // 血緣（MVP／Rebels Anarchy 系），本表不確定其鏈路，故留空不猜。
  'KING-ZONE DragonX': { predecessors: ['LZ'], successors: ['DRX'] },
  'Royal Club': { successors: ['RNG'] },
  'Royal Never Give Up': { predecessors: ['RC'] },
};

const args = process.argv.slice(2);
const outFile = (args.indexOf('--out') >= 0 ? args[args.indexOf('--out') + 1] : null) ?? join(ROOT, 'team_history.json');
const eventListFiles = ['events_worlds_msi.txt', 'events_champions.txt'];

const appearances = new Map(); // team display name -> { years:Set, leagueVotes:Map }

for (const listFile of eventListFiles) {
  let titles = [];
  try {
    titles = readFileSync(join(ROOT, listFile), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    console.error(`警告: ${listFile} 不存在，跳過`);
    continue;
  }
  for (const pageTitle of titles) {
    const wiki = loadRaw(pageTitle);
    if (!wiki) continue; // gen-target-intl.mjs 已對缺 raw 警告過，這裡不重複洗版
    const year = yearOfTitle(pageTitle);
    for (const card of parseTeamCards(wiki)) {
      if (!appearances.has(card.team)) appearances.set(card.team, { years: new Set(), leagueVotes: new Map() });
      const a = appearances.get(card.team);
      if (year) a.years.add(year);
      const league = leagueOf(card.qualifier);
      if (league && LEAGUE_REGION.has(league)) {
        a.leagueVotes.set(league, (a.leagueVotes.get(league) ?? 0) + 1);
      }
    }
  }
}

function pickRegion(leagueVotes) {
  let best = null;
  let bestCount = 0;
  for (const [league, count] of leagueVotes) {
    if (count > bestCount) {
      best = league;
      bestCount = count;
    }
  }
  return best ? LEAGUE_REGION.get(best) : null;
}

function programmaticId(name) {
  const words = name.replace(/[().]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map((w) => w[0]).join('').toUpperCase();
}

// 既有 team_history.json（台港澳段，S24b）當單一來源；同隊已存在就跳過，不覆寫。
const existingPath = join(ROOT, 'team_history.json');
const existing = JSON.parse(readFileSync(existingPath, 'utf8'));
const existingTeamIds = new Set(existing.teams.map((t) => t.team_id));
const existingDisplayNames = new Set(existing.teams.map((t) => t.display_name));

const existingDisplayNamesLower = new Set([...existingDisplayNames].map((n) => n.toLowerCase()));
const duplicates = [];
const unclassified = [];

// 只留台港澳段沒收過的隊。
const candidates = [...appearances].filter(([name]) => !existingDisplayNamesLower.has(name.toLowerCase()));

// 第一輪：ABBREVIATIONS 表內有對照的——人工判定同隊，用縮寫分組合併
// active_years／qualifier 票數，不各自成一筆（如 T1／SK Telecom T1 合一）。
const manualGroups = new Map(); // team_id -> { names:[], years:Set, leagueVotes:Map }
const programmatic = [];
for (const [displayName, data] of candidates) {
  const manualId = ABBREVIATIONS[displayName];
  if (!manualId) {
    programmatic.push([displayName, data]);
    continue;
  }
  if (existingTeamIds.has(manualId) && !manualGroups.has(manualId)) {
    duplicates.push(`${displayName}（team_id=${manualId} 與台港澳段撞號，判定同隊略過）`);
    continue;
  }
  if (!manualGroups.has(manualId)) manualGroups.set(manualId, { names: [], years: new Set(), leagueVotes: new Map() });
  const g = manualGroups.get(manualId);
  g.names.push(displayName);
  for (const y of data.years) g.years.add(y);
  for (const [league, count] of data.leagueVotes) g.leagueVotes.set(league, (g.leagueVotes.get(league) ?? 0) + count);
}

const intlTeams = [];
for (const [teamId, g] of manualGroups) {
  // 顯示名選最短的（通常是現名，如 "T1" 比 "SK Telecom T1" 短）。
  const displayName = g.names.slice().sort((a, b) => a.length - b.length)[0];
  const years = [...g.years].sort((a, b) => a - b);
  const rename = RENAMES[displayName] ?? {};
  intlTeams.push({
    team_id: teamId,
    display_name: displayName,
    region: pickRegion(g.leagueVotes),
    active_years: [years[0] ?? null, years[years.length - 1] ?? null],
    predecessors: rename.predecessors ?? [],
    successors: rename.successors ?? [],
  });
  existingTeamIds.add(teamId);
}

// 第二輪：沒有人工縮寫對照的——程式化縮寫，撞號時加後綴消歧義（不能靜默丟棄
// 不同隊伍，寧可縮寫醜也要每隊都留一筆，交接筆記註記待人工核對）。
for (const [displayName, data] of programmatic) {
  let teamId = programmaticId(displayName);
  if (existingTeamIds.has(teamId)) {
    let suffix = 2;
    while (existingTeamIds.has(`${teamId}${suffix}`)) suffix++;
    teamId = `${teamId}${suffix}`;
  }
  existingTeamIds.add(teamId);
  const region = pickRegion(data.leagueVotes);
  const years = [...data.years].sort((a, b) => a - b);
  const rename = RENAMES[displayName] ?? {};
  intlTeams.push({
    team_id: teamId,
    display_name: displayName,
    region,
    active_years: [years[0] ?? null, years[years.length - 1] ?? null],
    predecessors: rename.predecessors ?? [],
    successors: rename.successors ?? [],
  });
  unclassified.push(`${displayName}（${teamId}）`);
}

intlTeams.sort((a, b) => a.display_name.localeCompare(b.display_name));

existing.teams.push(...intlTeams);
existing.region = '台港澳段（S24b）＋國際段（S24c）';
existing.generated = new Date().toISOString().slice(0, 10);
writeFileSync(outFile, JSON.stringify(existing, null, 2) + '\n');

console.error(`已寫出 ${outFile}：新增國際隊 ${intlTeams.length} 筆（總計 ${existing.teams.length} 筆），視為重複略過 ${duplicates.length} 筆`);
if (duplicates.length) console.error(`重複略過：${duplicates.join('、')}`);
console.error(`縮寫待人工核對（不在 ABBREVIATIONS 表，用程式化縮寫）共 ${unclassified.length} 筆：`);
console.error(unclassified.join('、'));
console.error(`region 判定不出的隊（qualifier 非常規聯賽或缺失）：`);
console.error(intlTeams.filter((t) => !t.region).map((t) => t.display_name).join('、') || '無');
