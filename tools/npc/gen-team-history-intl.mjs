#!/usr/bin/env node
/**
 * tools/npc/gen-team-history-intl.mjs — team_history.json 國際段生成器（S24c，零相依）
 *
 * 台港澳段（S24b）靠逐隊頁 {{Infobox team}} 取 created／disbanded／region——國際段
 * 148 隊若比照做，要再抓 148 頁 Infobox，Liquipedia 這幾小時的限流已證明不可行
 * （S24c 賽段頁枚舉本身就卡了 26 頁抓不下來）。改用**零額外抓取**的替代訊號，
 * 全部從已經抓到的 Worlds／MSI／賽段頁 TeamCard 反推：
 *
 * - region：TeamCard 的 `qualifier=` 連結前綴（LCK／LPL／LEC／LCS／OPL／TCL／
 *   LCL／LJL／CBLOL／VCS／GPL／CLS／LLN…）直接當 region 標記——這是該隊「用哪個
 *   賽區身分打進這次賽事」的第一手資料，比 Infobox 的 region／location 兩欄互相
 *   矛盾（S24b 交接筆記已實測）更可靠。查無 qualifier 的隊落 UNCLASSIFIED。
 * - active_years：用該隊在已抓頁面中出現的年份範圍 [min, max] 近似——**不是**
 *   Infobox 的真實創隊／解散年，是「在我們資料裡有紀錄的年份窗」，S25 若要精確
 *   年表仍要另外查 Infobox。此簡化已寫進交接筆記。
 * - team_id：知名隊伍（多次闖進 Worlds／MSI 或四大賽區常客）用人工維護的
 *   ABBREVIATIONS_INTL 對照表（電競圈通用縮寫）；查無的隊用程式化縮寫（去通用
 *   字尾＋各字首)當 fallback，準確度較低，列入交接筆記待核。
 * - predecessors／successors：只填人工確認過的知名更名鏈（RENAMES_INTL）。
 *
 * 輸入：teams_intl.txt（gen-target-intl.mjs 產出的隊伍清單）＋ events_worlds_msi.txt
 * ／events_champions.txt 對應的 raw_data（重新掃一次 TeamCard 取 qualifier／年份）。
 * 輸出：team_history.json 追加國際段（同檔，S23 schema 是權威），台港澳段不動。
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

function yearFromTitle(title) {
  const m = title.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
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

// 知名隊伍縮寫（人工維護，電競圈通用縮寫；2026-08-16 建表）。查無的隊落程式化
// fallback，見 fallbackAbbrev()。
const ABBREVIATIONS_INTL = {
  'SK Telecom T1': 'SKT', 'T1': 'T1', 'KT Rolster': 'KT', 'Gen.G': 'GEN', 'Gen.G Esports': 'GEN',
  'Afreeca Freecs': 'AF', 'KOO Tigers': 'KOO', 'ROX Tigers': 'ROX', 'Samsung Galaxy': 'SSG',
  'Samsung White': 'SSW', 'Samsung Blue': 'SSB', 'Samsung Ozone': 'SSO', 'Longzhu Gaming': 'LZ',
  'KING-ZONE DragonX': 'KZ', 'Griffin': 'GRF', 'DAMWON Gaming': 'DWG', 'Dplus': 'DK',
  'Hanwha Life Esports': 'HLE', 'DRX': 'DRX', 'Kwangdong Freecs': 'KDF', 'Liiv SANDBOX': 'LSB',
  'Nongshim RedForce': 'NS', 'BRO': 'BRO', 'NaJin Black Sword': 'NJB', 'NaJin Sword': 'NJS',
  'NaJin White Shield': 'NJW', 'Jin Air Green Wings': 'JAG',
  'Royal Club': 'RC', 'Star Horn Royal Club': 'RC', 'Royal Never Give Up': 'RNG',
  'Invictus Gaming': 'IG', 'EDward Gaming': 'EDG', 'LGD Gaming': 'LGD', 'Oh My God': 'OMG',
  'Team WE': 'WE', 'LNG Esports': 'LNG', 'JD Gaming': 'JDG', 'FunPlus Phoenix': 'FPX',
  'Top Esports': 'TES', 'Bilibili Gaming': 'BLG', 'Weibo Gaming': 'WBG', 'Suning': 'SN',
  'LMQ': 'LMQ',
  'Fnatic': 'FNC', 'SK Gaming': 'SK', 'H2K': 'H2K', 'Origen': 'OG', 'G2 Esports': 'G2',
  'Splyce': 'SPY', 'Misfits Gaming': 'MSF', 'Rogue': 'RGE', 'MAD Lions': 'MAD',
  'Team Vitality': 'VIT', 'Team BDS': 'BDS', 'Gambit Esports': 'GMB', 'Gambit Gaming': 'GMB',
  'Moscow Five': 'M5', 'Alliance': 'ALK', 'Unicorns Of Love': 'UOL', 'Unicorns of Love': 'UOL',
  'Copenhagen Wolves': 'CW', 'Ninjas in Pyjamas': 'NIP',
  'Cloud9': 'C9', 'Team SoloMid': 'TSM', 'TSM': 'TSM', 'Counter Logic Gaming': 'CLG',
  'Counter Logic Gaming EU': 'CLG.EU', 'Team Liquid': 'TL', '100 Thieves': '100T',
  'FlyQuest': 'FLY', 'Evil Geniuses': 'EG', 'Golden Guardians': 'GG', 'Immortals': 'IMT',
  'NRG': 'NRG', 'Clutch Gaming': 'CG', 'Team Dignitas': 'DIG', 'Phoenix1': 'P1',
  'Flash Wolves': 'FW', 'ahq e-Sports Club': 'ahq', 'J Team': 'JT', 'Machi Esports': 'MCX',
  'G-Rex': 'GRX', 'Hong Kong Attitude': 'HKA', 'PSG Talon': 'PSG', 'Taipei Assassins': 'TPA',
  'CTBC Flying Oyster': 'CFO', 'Beyond Gaming': 'BYG', 'MAD Team': 'MAD_TW',
  'GAM Esports': 'GAM', 'Saigon Jokers': 'SJ', 'Saigon Buffalo': 'SGB', 'EVOS Esports': 'EVS',
  'Team Flash': 'TF', 'Phong Vũ Buffalo': 'PVB',
  'DetonatioN FocusMe': 'DFM', 'Rampage': 'RPG',
  'Chiefs Esports Club': 'CHF', 'Dire Wolves': 'DW', 'Legacy Esports': 'LGC', 'ORDER': 'ORDER',
  'Beşiktaş e-Sports Club': 'BJK', '1907 Fenerbahçe Esports': '1907', 'Galatasaray Esports': 'GS',
  'İstanbul Wild Cats': 'IWC', 'İstanbul Wildcats': 'IWC',
  'Albus NoX Luna': 'ANX', 'Vega Squadron': 'VEG', 'Virtus.pro': 'VP',
  'INTZ': 'INTZ', 'INTZ eSports': 'INTZ', 'paiN Gaming': 'paiN', 'RED Canids': 'RED',
  'KaBuM! e-Sports': 'KBM', 'Flamengo eSports': 'FLA', 'LOUD': 'LOUD',
  'Isurus': 'ISG', 'Isurus Gaming': 'ISG', 'Rainbow7': 'R7', 'Kaos Latin Gamers': 'KLG',
  'Infinity': 'INF', 'Infinity Esports': 'INF', 'Infinity eSports': 'INF',
};

// 已知更名鏈（人工確認，鍵＝現名／較新名，值＝前身縮寫陣列；只記兩端都在清單內的線性繼承）
const RENAMES_INTL = {
  'SK Telecom T1': { predecessors: [], successors: ['T1'] },
  'T1': { predecessors: ['SKT'], successors: [] },
  'Longzhu Gaming': { predecessors: [], successors: ['KZ'] },
  'KING-ZONE DragonX': { predecessors: ['LZ'], successors: [] },
  'DAMWON Gaming': { predecessors: [], successors: ['DK'] },
  'Dplus': { predecessors: ['DWG'], successors: [] },
  'Star Horn Royal Club': { predecessors: [], successors: ['RC'] },
  'Royal Club': { predecessors: [], successors: [] },
  'Origen': { predecessors: [], successors: [] },
  'Counter Logic Gaming EU': { predecessors: [], successors: [] },
  'Gambit Gaming': { predecessors: [], successors: ['GMB'] },
  'Gambit Esports': { predecessors: ['GMB'], successors: [] },
  'Unicorns Of Love': { predecessors: [], successors: [] },
};

// 同隊跨年頁題不一致（人工核對到的別名，非單純大小寫差異——大小寫差異已由
// info Map 的 key 統一小寫處理，這裡只收「拼法/品牌小改」的重複）
const NAME_ALIASES = {
  'gen.g esports': 'gen.g',
  'i̇stanbul wildcats': 'i̇stanbul wild cats',
};

const GENERIC_SUFFIXES = /\b(e-?sports|esports|gaming|team|club)\b/gi;

function fallbackAbbrev(name) {
  const stripped = name.replace(GENERIC_SUFFIXES, ' ').trim();
  const words = (stripped || name).split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map((w) => w[0]).join('').toUpperCase().slice(0, 5);
}

// TeamCard qualifier= 連結前綴 → region 標記（賽區代碼本身，見檔頭說明：不硬轉
// ISO 國碼，直接沿用 Liquipedia 賽區品牌，可追溯回原始資料）。
function regionFromQualifier(qualifier) {
  if (!qualifier) return null;
  const m = qualifier.match(/\[\[([^\]|]+)/);
  if (!m) return null;
  const target = m[1].trim().replace(/_/g, ' ');
  const parts = target.split('/');
  const first = parts[0];
  // LCS 品牌歷史上分過南北美／歐洲子賽區（LCS/Europe、LCS/North America）——
  // 不能只看第一段，否則歐洲隊會被誤標成 LCS（NA）。
  if (first === 'LCS' && parts[1] === 'Europe') return 'LEC';
  if (first === 'LCS' && parts[1] === 'North America') return 'LCS';
  const KNOWN = new Set([
    'LCK', 'LPL', 'LEC', 'LCS', 'OPL', 'TCL', 'LCL', 'LJL', 'CBLOL', 'VCS', 'GPL', 'LMS', 'PCS',
    'CLS', 'LLN', 'Champions', 'International Wildcard Qualifier',
  ]);
  if (KNOWN.has(first)) return first === 'Champions' ? 'LCK' : first;
  return null;
}

const teamsListFile = join(ROOT, 'teams_intl.txt');
const teamNames = readFileSync(teamsListFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);

// 既有 team_history.json（台港澳段）——大小寫不敏感比對，已收錄的隊不重複進國際段
const existing = JSON.parse(readFileSync(join(ROOT, 'team_history.json'), 'utf8'));
const existingNamesLower = new Set(existing.teams.map((t) => t.display_name.toLowerCase()));

// 重新掃一次已抓到的 Worlds/MSI + 賽段頁，收集每隊出現的年份與 qualifier region
const eventFiles = [
  ...readFileSync(join(ROOT, 'events_worlds_msi.txt'), 'utf8').split('\n'),
  ...readFileSync(join(ROOT, 'events_champions.txt'), 'utf8').split('\n'),
].map((s) => s.trim()).filter(Boolean);

// key = lowercase display name，累積年份／region 訊號／原始 casing 出現次數
const info = new Map();
for (const title of eventFiles) {
  const wiki = loadRaw(title);
  if (!wiki) continue;
  const year = yearFromTitle(title);
  for (const card of parseTeamCards(wiki)) {
    const rawKey = card.team.toLowerCase();
    const key = NAME_ALIASES[rawKey] ?? rawKey;
    if (!info.has(key)) info.set(key, { casings: new Map(), years: new Set(), regions: new Map() });
    const rec = info.get(key);
    rec.casings.set(card.team, (rec.casings.get(card.team) ?? 0) + 1);
    if (year) rec.years.add(year);
    const region = regionFromQualifier(card.qualifier);
    if (region) rec.regions.set(region, (rec.regions.get(region) ?? 0) + 1);
  }
}

function pickCanonicalCasing(rec, fallbackName) {
  let best = fallbackName;
  let bestCount = -1;
  for (const [casing, count] of rec.casings) {
    if (count > bestCount) { best = casing; bestCount = count; }
  }
  return best;
}

const seenTeamIds = new Set(existing.teams.map((t) => t.team_id).filter(Boolean));
const entries = [];
const unclassified = [];
const lowConfidenceIds = [];
const processedKeys = new Set();

for (const name of teamNames) {
  const rawKey = name.toLowerCase();
  const key = NAME_ALIASES[rawKey] ?? rawKey;
  if (existingNamesLower.has(key)) continue; // 已在台港澳段，S24b 收過
  if (processedKeys.has(key)) continue; // 大小寫變體去重
  processedKeys.add(key);

  const rec = info.get(key) ?? { casings: new Map([[name, 1]]), years: new Set(), regions: new Map() };
  const displayName = pickCanonicalCasing(rec, name);
  const years = [...rec.years].sort((a, b) => a - b);
  let region = null;
  let regionBest = -1;
  for (const [r, count] of rec.regions) {
    if (count > regionBest) { region = r; regionBest = count; }
  }

  let teamId = ABBREVIATIONS_INTL[displayName] ?? ABBREVIATIONS_INTL[name] ?? null;
  let lowConfidence = false;
  if (!teamId) {
    teamId = fallbackAbbrev(displayName);
    lowConfidence = true;
  }
  // team_id 撞號（含台港澳段既有縮寫）：加序號避免覆蓋，交接筆記記人工核對
  let finalId = teamId;
  let suffix = 2;
  while (seenTeamIds.has(finalId)) {
    finalId = `${teamId}${suffix}`;
    suffix++;
    lowConfidence = true;
  }
  seenTeamIds.add(finalId);
  if (lowConfidence) lowConfidenceIds.push(`${displayName} → ${finalId}`);

  const renameInfo = RENAMES_INTL[displayName] ?? RENAMES_INTL[name] ?? null;
  const entry = {
    team_id: finalId,
    display_name: displayName,
    region,
    active_years: [years[0] ?? null, years[years.length - 1] ?? null],
    predecessors: renameInfo?.predecessors ?? [],
    successors: renameInfo?.successors ?? [],
  };
  if (!region) unclassified.push(displayName);
  entries.push(entry);
}

existing.teams.push(...entries);
existing.region = '台港澳段（S24b）＋國際段（S24c，region 為 Liquipedia 賽區代碼、非 ISO 國碼；active_years 為已抓資料的年份窗近似值、非 Infobox 創隊/解散年）';
writeFileSync(join(ROOT, 'team_history.json'), JSON.stringify(existing, null, 2) + '\n');

console.error(`已寫出 team_history.json：新增國際段 ${entries.length} 隊（台港澳段 ${existing.teams.length - entries.length} 隊不動）`);
console.error(`region 未判定（UNCLASSIFIED，qualifier 訊號不足）：${unclassified.length} 隊${unclassified.length ? '：' + unclassified.join('、') : ''}`);
console.error(`team_id 為程式化 fallback（非人工縮寫表，較低信心）：${lowConfidenceIds.length} 隊，詳見交接筆記`);
