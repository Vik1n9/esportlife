#!/usr/bin/env node
/**
 * tools/npc/gen-team-history-intl.mjs — team_history.json 國際段生成器（S24c，零相依）
 *
 * 台港澳段（S24b）靠逐隊頁 {{Infobox team}} 取 created／disbanded／region——國際段
 * 148 隊若比照做，要再抓 148 頁 Infobox，Liquipedia 這幾小時的限流已證明不可行
 * （S24c 賽段頁枚舉本身就卡了 26 頁抓不下來）。改用**零額外抓取**的替代訊號，
 * 全部從已經抓到的 Worlds／MSI／賽段頁 TeamCard 反推：
 *
 * - region：TeamCard 的 `qualifier=` 連結前綴（LCK／LPL／LEC／LCS／PCS／LMS／LCP／
 *   OPL／TCL／LCL／LJL／CBLOL／VCS／GPL…）直接當 region 標記——這是該隊「用哪個
 *   賽區身分打進這次賽事」的第一手資料，比 Infobox 的 region／location 兩欄互相
 *   矛盾（S24b 交接筆記已實測）更可靠。查無 qualifier 的隊落 UNCLASSIFIED。
 *   ⚠ 2026-08-17 定案：賽區身分一律認**賽區代碼**，不依國籍分（LoL 賽事規則認
 *   賽區名，與選手／戰隊國籍無關；PCS 的香港隊與台灣隊同屬 PCS，不拆 TW/HK）。
 *   台港澳段（S24b）的 TW/HK/MO 標記是歷史產物，只代表抓取優先級分群，不當
 *   實體語意用。
 * - active_years：用該隊在已抓頁面中出現的年份範圍 [min, max] 近似——**不是**
 *   Infobox 的真實創隊／解散年，是「在我們資料裡有紀錄的年份窗」，S25 若要精確
 *   年表仍要另外查 Infobox。此簡化已寫進交接筆記。
 * - team_id：知名隊伍（多次闖進 Worlds／MSI 或四大賽區常客）用人工維護的
 *   ABBREVIATIONS_INTL 對照表（電競圈通用縮寫）；查無的隊用程式化縮寫（去通用
 *   字尾＋各字首)當 fallback，準確度較低，列入交接筆記待核。
 * - predecessors／successors：只填人工確認過的知名更名鏈（RENAMES_INTL）。
 *
 * 輸入：teams_intl.txt（gen-target-intl.mjs 產出的隊伍清單）＋ events_worlds_msi.txt
 * ／events_champions.txt／events_twhkmo.txt 對應的 raw_data（重新掃一次 TeamCard 取
 * qualifier／年份）。
 *
 * 2026-08-17 返工（S24c 補缺隊）：枚舉源從「teams_intl.txt（Worlds/MSI 參賽隊＋
 * split 冠軍隊）」擴充為「該清單 ∪ 全部已抓賽事頁 TeamCard 出現的隊」——split 頁
 * TeamCard 涵蓋該季**全參賽隊**（不只冠軍隊），S25 清洗名冊事件時會撞到這些隊
 * （262 名 CSV 選手、431 人次受影響，缺 118 隊），故全部收進 team_history。
 * 台港澳賽事頁（LMS/PCS/LCP/GPL）的外賽區隊（如 Berjaya Dragons、BOOM Esports）
 * 也由本站一併收（region 由 qualifier 前綴判定）。
 * 輸出：team_history.json 追加國際段（同檔，S23 schema 是權威），台港澳段不動。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(ROOT, 'raw_data');

const slugify = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// 隊名 key 統一 NFC 正規化——İstanbul（U+0130）lower 後是 i+U+0307 組合字，
// 手打的 'i̇' 若為 NFC 兩者才相等；不做 NFC 比對 NAME_ALIASES 會漏併
// （實測：İstanbul Wildcats 重複成 IWC/IWC2 兩隊）。
const normKey = (s) => s.normalize('NFC').toLowerCase();

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

// 知名隊伍縮寫（人工維護，電競圈通用縮寫；2026-08-16 建表、2026-08-17 返工補缺隊
// 時擴充）。查無的隊落程式化 fallback，見 fallbackAbbrev()。
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
  'ThunderTalk Gaming': 'TT', 'Ultra Prime': 'UP', "Anyone's Legend": 'AL',
  'Victory Five': 'V5', 'Rogue Warriors': 'RW', 'Rare Atom': 'RA', 'eStar Gaming': 'ES',
  'Vici Gaming': 'VG', 'Qiao Gu Reapers': 'QG', 'Newbee': 'NB', 'Game Talents': 'GT',
  'Fnatic': 'FNC', 'SK Gaming': 'SK', 'H2K': 'H2K', 'Origen': 'OG', 'G2 Esports': 'G2',
  'Splyce': 'SPY', 'Misfits Gaming': 'MSF', 'Rogue': 'RGE', 'MAD Lions': 'MAD',
  'Team Vitality': 'VIT', 'Team BDS': 'BDS', 'Gambit Esports': 'GMB', 'Gambit Gaming': 'GMB',
  'Moscow Five': 'M5', 'Alliance': 'ALK', 'Unicorns Of Love': 'UOL', 'Unicorns of Love': 'UOL',
  'Copenhagen Wolves': 'CW', 'Ninjas in Pyjamas': 'NIP',
  'Cloud9': 'C9', 'Team SoloMid': 'TSM', 'TSM': 'TSM', 'Counter Logic Gaming': 'CLG',
  'Counter Logic Gaming EU': 'CLG.EU', 'Team Liquid': 'TL', '100 Thieves': '100T',
  'FlyQuest': 'FLY', 'Evil Geniuses': 'EG', 'Golden Guardians': 'GG', 'Immortals': 'IMT',
  'NRG': 'NRG', 'Clutch Gaming': 'CG', 'Team Dignitas': 'DIG', 'Phoenix1': 'P1',
  'Echo Fox': 'EFX', 'Excel Esports': 'XL', 'FC Schalke 04 Esports': 'S04',
  'Team ROCCAT': 'ROC', 'OpTic Gaming': 'OPT', 'Team EnVyUs': 'NV', 'Astralis': 'AST',
  'Giants Gaming': 'GIA', 'Team Impulse': 'TIP', 'XDG Gaming': 'XDG', 'compLexity Gaming': 'COL',
  'Team 8': 'T8', 'Counter Logic Gaming Prime': 'CLG',
  'CJ Entus': 'CJ', 'CJ Entus Blaze': 'CJB', 'CJ Entus Frost': 'CJF',
  'MVP': 'MVP', 'MVP Ozone': 'MVO', 'MVP Blue': 'MVB', 'SANDBOX Gaming': 'SB',
  'FearX': 'FEX', 'Brion Esports': 'BRO', 'BRION': 'BRO', 'Incredible Miracle': 'IM',
  'Meet Your Makers': 'MYM', 'bbq Olivers': 'BBQ', 'Natus Vincere': 'NAVI', 'GIANTX': 'GX',
  'Karmine Corp': 'KC', 'Team Heretics': 'TH',
  'Flash Wolves': 'FW', 'ahq e-Sports Club': 'ahq', 'J Team': 'JT', 'Machi Esports': 'MCX',
  'G-Rex': 'GRX', 'Hong Kong Attitude': 'HKA', 'PSG Talon': 'PSG', 'Taipei Assassins': 'TPA',
  'CTBC Flying Oyster': 'CFO', 'Beyond Gaming': 'BYG', 'MAD Team': 'MAD_TW',
  'GAM Esports': 'GAM', 'Saigon Jokers': 'SJ', 'Saigon Buffalo': 'SGB', 'EVOS Esports': 'EVS',
  'Team Flash': 'TF', 'Phong Vũ Buffalo': 'PVB',
  'Hong Kong Esports': 'HKE', 'BOOM Esports': 'BOOM', 'Ground Zero Gaming': 'GZ',
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

// 2026-08-17 返工：LEC/LCK 2023+ 賽事頁改用縮寫 team=（KCORP/NAVI/HTICS/…）且
// 無 TeamCard 模板，Worlds/MSI 頁又沒進過這些隊（LEC 2023+ 隊從未打進
// Worlds/MSI）——純自動枚舉掃不到。此人工清單補這些「縮寫頁題隊」的實體隊名
// （電競圈常識，隨缺隊清單逐筆核對補入），併入枚舉源。region 直接人工標
// 賽區代碼（無頁面訊號可反推，不猜 ISO 國碼）。
const EXTRA_TEAMS = [
  ['Karmine Corp', 'LEC'], ['Team Heretics', 'LEC'], ['Natus Vincere', 'LEC'],
  ['GIANTX', 'LEC'], ['Liiv SANDBOX', 'LCK'], ['Team Hunters', 'LCK'],
  ['Game Talents', 'LPL'], ['Meme Stream Dream Team', 'LCS'],
  ['Throw Machine Gaming', 'LCS'],
];

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
// info Map 的 key 統一小寫處理，這裡只收「拼法/品牌小改」的重複）。
// 2026-08-17 返工擴充：姊妹隊／二隊／更名前身頁題併到主隊（電競圈慣例＋S25
// 別名判讀同構，缺隊清單的 1x-2x 變體在此收斂，不各自成隊）。
const NAME_ALIASES = {
  'gen.g esports': 'gen.g',
  'i̇stanbul wildcats': 'i̇stanbul wild cats',
  'sk telecom t1 1': 'sk telecom t1',
  'sk telecom t1 2': 'sk telecom t1',
  'sk telecom t1 k': 'sk telecom t1',
  'sk telecom t1 s': 'sk telecom t1',
  'kt rolster a': 'kt rolster',
  'kt rolster b': 'kt rolster',
  'kt rolster arrows': 'kt rolster',
  'kt rolster bullets': 'kt rolster',
  'jin air falcons': 'jin air green wings',
  'jin air green wings falcons': 'jin air green wings',
  'jin air stealths': 'jin air green wings',
  'jin air green wings stealths': 'jin air green wings',
  'najin shield': 'najin white shield',
  'najin e-mfire': 'najin sword',
  'freecs': 'afreeca freecs',
  'ksv esports': 'gen.g',
  'dragonx': 'drx',
  'suning gaming': 'suning',
  'topsports gaming': 'top esports',
  'ge tigers': 'koo tigers',
  'team curse': 'team liquid',
  'dignitas': 'team dignitas',
  'counter logic gaming prime': 'counter logic gaming',
  'mig frost': 'azubu frost',
  'mig blaze': 'azubu blaze',
  'dwg kia': 'damwon gaming',
  'brion esports': 'brion',
  'incredible miracle 1': 'incredible miracle',
  'incredible miracle 2': 'incredible miracle',
  'energy pacemaker.all': 'energy pacemaker',
  'ninjas in pyjamas.cn': 'ninjas in pyjamas',
};

const GENERIC_SUFFIXES = /\b(e-?sports|esports|gaming|team|club)\b/gi;

// NAME_ALIASES 查詢表（key 也過 normKey——檔案內手打 key 的 NFC/NFD 組合字
// 與執行期 normalize 後的字元必須一致，否則查不到、每輪重跑多收一隊）
const aliasLookup = new Map(Object.entries(NAME_ALIASES).map(([k, v]) => [normKey(k), normKey(v)]));
const applyAlias = (rawKey) => aliasLookup.get(rawKey) ?? rawKey;

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
    'LCP', 'CLS', 'LLN', 'Champions', 'International Wildcard Qualifier',
  ]);
  if (KNOWN.has(first)) return first === 'Champions' ? 'LCK' : first;
  return null;
}

const teamsListFile = join(ROOT, 'teams_intl.txt');
const teamsList = readFileSync(teamsListFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);

// 既有 team_history.json（台港澳段）——大小寫不敏感比對，已收錄的隊不重複進國際段
// ⚠ 比對鍵必須過 applyAlias：寫入的 display_name（如 İstanbul Wildcats）與掃描
// 收斂後的 key（i̇stanbul wild cats）若不一致，重跑會把同一隊當新隊每輪多收一隊
// （2026-08-17 實測 IWC→IWC2→IWC3→IWC4 每跑多一隊）。
const existing = JSON.parse(readFileSync(join(ROOT, 'team_history.json'), 'utf8'));
const existingNamesLower = new Set(existing.teams.map((t) => applyAlias(normKey(t.display_name))));

// 重新掃一次已抓到的 Worlds/MSI + 賽段 + 台港澳賽事頁，收集每隊出現的年份與 qualifier region
const eventFiles = [
  ...readFileSync(join(ROOT, 'events_worlds_msi.txt'), 'utf8').split('\n'),
  ...readFileSync(join(ROOT, 'events_champions.txt'), 'utf8').split('\n'),
  ...readFileSync(join(ROOT, 'events_twhkmo.txt'), 'utf8').split('\n'),
].map((s) => s.trim()).filter(Boolean);

// key = lowercase display name，累積年份／region 訊號／原始 casing 出現次數
const info = new Map();
const PAGE_REGION_RE = /^(champions|lpl|lck|lec|lcs|lms|pcs|lcp|gpl|garena)_/;
function pageRegion(title) {
  const m = slugify(title).match(PAGE_REGION_RE);
  if (!m) return null;
  const r = m[1];
  if (r === 'champions') return 'LCK';
  if (r === 'garena') return 'GPL';
  return r.toUpperCase();
}
for (const title of eventFiles) {
  const wiki = loadRaw(title);
  if (!wiki) continue;
  const year = yearFromTitle(title);
  const pageReg = pageRegion(title);
  for (const card of parseTeamCards(wiki)) {
    const rawKey = normKey(card.team);
    const key = applyAlias(rawKey);
    if (!info.has(key)) info.set(key, { casings: new Map(), years: new Set(), regions: new Map() });
    const rec = info.get(key);
    rec.casings.set(card.team, (rec.casings.get(card.team) ?? 0) + 1);
    if (year) rec.years.add(year);
    const region = regionFromQualifier(card.qualifier) ?? pageReg;
    if (region) rec.regions.set(region, (rec.regions.get(region) ?? 0) + 1);
  }
}

// 2026-08-17 返工：枚舉源 = teams_intl.txt（Worlds/MSI 參賽隊＋split 冠軍隊）
// ∪ 全部已抓賽事頁 TeamCard 出現的隊（split 頁全參賽隊、台港澳賽事頁外賽區隊）。
// ⚠ 這裡的 includes 比對是大小寫不敏感做在 normKey 上——teamsList 是原始拼法，
// info keys 已 normKey（lowercase＋NFC），兩者直接比永遠不中（那是死碼，實測過）。
const teamsListLower = new Set(teamsList.map(normKey));
const teamNames = [
  ...teamsList,
  ...[...info.keys()].sort().filter((k) => !teamsListLower.has(k)),
  ...EXTRA_TEAMS.map(([n]) => normKey(n)),
];

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
  const rawKey = normKey(name);
  const key = applyAlias(rawKey);
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
  // EXTRA_TEAMS 無頁面訊號，人工標的 region 直接採用（頁面訊號優先，不會覆蓋）
  const extraRegion = EXTRA_TEAMS.find(([n]) => normKey(n) === key)?.[1];
  if (!region && extraRegion) region = extraRegion;

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
