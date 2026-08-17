#!/usr/bin/env node
/**
 * tools/npc/crawl-lp.mjs — Leaguepedia（Fandom）備援抓取工具（零相依，Node 18+）
 *
 * S24d 的國際分片檔。存在理由：Liquipedia 對本執行環境的出口 IP 做了 IP 級封鎖
 * （`HTTP 429` + CAPTCHA 解鎖頁，非速率抖動），`crawl.mjs` 的退避重試救不回來
 * ——CAPTCHA 要瀏覽器人工過。照規格 §23.7 備援順序 Liquipedia → Leaguepedia →
 * synthetic，國際段走第二級，逐筆標 `data_source`。
 *
 * 與 `crawl.mjs` 的差異（`crawl.mjs` 一行未動，見 24d 說明書「要動的檔案」）：
 *
 * - **API 端點**：`https://lol.fandom.com/api.php`（Leaguepedia），授權同為
 *   CC BY-SA 3.0，`data_source` 標 `leaguepedia`。
 * - **批次取內容**：走 `action=query&prop=revisions&rvslots=main`，一次 20 個
 *   頁題。`crawl.mjs` 是逐頁 `action=parse`（Liquipedia 對 parse 的限流遠嚴於
 *   query），批次讓 898 頁從「以小時計」變成「以分鐘計」，同時大幅降低請求數。
 * - **頁題對照**：兩站頁題規則不同（Liquipedia `Uzi (Chinese player)` vs
 *   Leaguepedia `Uzi (Jian Zi-Hao)`），先跑 `map` 產出對照表（含重定向解析與
 *   缺頁），`crawl` 只吃對照表。落檔名一律用 **Liquipedia 頁題**的 slug，
 *   下游（S25）不必知道這批是備援救回來的就能照同一把鍵查。
 *
 * 冪等／續傳規則與 `crawl.mjs` 相同：檔案存在且 manifest 有記錄就跳過；
 * manifest／log 也共用同兩個檔（`raw_data/manifest.jsonl`、`raw_data/crawl.log`）。
 *
 * 用法：
 *   node crawl-lp.mjs map 清單.txt --out 對照.tsv
 *   node crawl-lp.mjs crawl 對照.tsv [--force]
 *   node crawl-lp.mjs probe "頁題" [更多頁題…]
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(ROOT, 'raw_data');
const MANIFEST = join(RAW_DIR, 'manifest.jsonl');
const LOG = join(RAW_DIR, 'crawl.log');

const API = 'https://lol.fandom.com/api.php';
const UA = 'esportlife-npc-pipeline/1.0 (github.com/Vik1n9/esportlife)';
const SOURCE = 'leaguepedia';

const DELAY = 1500;
const RETRY_DELAYS = [5_000, 15_000, 45_000];
const MAP_BATCH = 50; // action=query 存在性檢查上限
const CRAWL_BATCH = 20; // 帶 rvslots 內容，壓小批次避免單次回應過大

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let lastRequestAt = 0;

function log(msg) {
  const line = `${new Date().toISOString()} [lp] ${msg}`;
  console.error(line);
  appendFileSync(LOG, line + '\n');
}

async function apiRequest(params, retriesLeft = RETRY_DELAYS.length) {
  const wait = Math.max(0, lastRequestAt + DELAY - Date.now());
  if (wait > 0) await sleep(wait);
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA } });
  } catch (err) {
    lastRequestAt = Date.now();
    if (retriesLeft > 0) {
      log(`網路錯誤重試（${err.message}）`);
      await sleep(RETRY_DELAYS[RETRY_DELAYS.length - retriesLeft]);
      return apiRequest(params, retriesLeft - 1);
    }
    throw err;
  }
  lastRequestAt = Date.now();
  if ((res.status === 429 || res.status >= 500) && retriesLeft > 0) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const d = retryAfter > 0 ? retryAfter * 1000 : RETRY_DELAYS[RETRY_DELAYS.length - retriesLeft];
    log(`退避重試 HTTP ${res.status}（${d / 1000}s 後）`);
    await sleep(d);
    return apiRequest(params, retriesLeft - 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

const slugify = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// 人工維護的頁題對照（單一來源，改表不改產出檔）。只列規則推不出來的：
// Liquipedia 的大小寫風格化、Leaguepedia 的隊名版本差異。
const MANUAL_TITLES = {
  // 選手：Liquipedia 與 Leaguepedia 的 ID 大小寫風格不同（MediaWiki 只正規化首字母）
  LaMiaZealot: 'LaMiaZeaLoT',
  NBs: 'Nbs',
  LIoyd: 'Lloyd', // ⚠ Liquipedia 題名是大寫 I 的風格化寫法，Leaguepedia 用 ll
  // 隊伍：Leaguepedia 收在另一個名稱版本（多為現名／簡稱）
  Dplus: 'Dplus Kia',
  'Gen.G Esports': 'Gen.G',
  'INTZ eSports': 'INTZ',
  'KING-ZONE DragonX': 'Kingzone DragonX',
  // Liquipedia 把 LLA／LLN 的 Infinity 拆成三個頁題（Infinity／Infinity Esports／
  // Infinity eSports），Leaguepedia 全收在 INFINITY 一頁。三個目標都指同一頁，
  // 實體合併留給 S25（S24c 交接筆記已列這三個變體為待對齊項）。
  Infinity: 'INFINITY',
  'Infinity Esports': 'INFINITY',
  'Infinity eSports': 'INFINITY',
  // ⚠ 裸頁題 `Rogue` 在 Leaguepedia 重定向到歐洲戰隊，不是這位澳洲輔助——
  // 消歧義後綴被剝掉之後撞上同名戰隊，是 candidates() 的天然盲點，只能列表。
  'Rogue (Australian player)': 'Rogue (Jake Sharwood)',
};

// 賽事頁題規則：Liquipedia `LCK/2020/Summer` vs Leaguepedia
// `LCK/2020 Season/Summer Season`；2013 年以前 Leaguepedia 用賽季序號
// （2012＝Season 2、2013＝Season 3），北美／歐洲 LCS 在 Leaguepedia 是
// `NA LCS`／`EU LCS` 前綴。候選一律多列幾個變體，存在性由 map 批次驗證，
// 猜錯的自然落選——不必為每個聯賽逐年硬編。
const SEASON_ORDINAL = { 2012: 'Season 2', 2013: 'Season 3' };

function eventCandidates(title) {
  const parts = title.split('/');
  if (parts.length < 2) return [];
  // 國際賽：Liquipedia 走 `賽事/年`，Leaguepedia 走 `年 Season World Championship`
  // ／`年 Mid-Season Invitational`（2011 是 `Season 1 World Championship`，
  // 由重定向接住，不必另外列）。
  if (parts[0] === 'World Championship' && /^\d{4}$/.test(parts[1])) {
    return [`${parts[1]} Season World Championship`];
  }
  if (parts[0] === 'Mid-Season Invitational' && /^\d{4}$/.test(parts[1])) {
    return [`${parts[1]} Mid-Season Invitational`];
  }
  let league = parts[0];
  let rest = parts.slice(1);
  if (league === 'LCS' && (rest[0] === 'Europe' || rest[0] === 'North America')) {
    league = rest[0] === 'Europe' ? 'EU LCS' : 'NA LCS';
    rest = rest.slice(1);
  }
  const [year, ...tail] = rest;
  if (!/^\d{4}$/.test(year)) return [];
  const split = tail.join('/');
  // LCK 2015 以前在 Leaguepedia 仍掛舊名 Champions（Liquipedia 已統一成 LCK）
  const leagues = league === 'LCK' && Number(year) <= 2015 ? [league, 'Champions'] : [league];
  const seasons = [`${year} Season`, SEASON_ORDINAL[year]].filter(Boolean);
  const splits = split
    ? [split === 'Finals' ? 'Season Finals' : `${split} Season`, split]
    : [''];
  const out = [];
  for (const lg of leagues) {
    for (const s of seasons) {
      for (const sp of splits) out.push(sp ? `${lg}/${s}/${sp}` : `${lg}/${s}`);
    }
  }
  return out;
}

// Liquipedia 頁題 → Leaguepedia 候選頁題。兩站消歧義規則不同：Liquipedia 用國籍
// （`Uzi (Chinese player)`），Leaguepedia 用本名（`Uzi (Jian Zi-Hao)`）或不消歧義。
// 候選只負責「找得到頁」，找到的頁是不是同一個人由 verify 另外核。
function candidates(title) {
  const out = [];
  if (MANUAL_TITLES[title]) out.push(MANUAL_TITLES[title]);
  out.push(title);
  const m = title.match(/^(.+?) \((.+)\)$/);
  if (m) out.push(m[1]);
  out.push(...eventCandidates(title));
  return [...new Set(out)];
}

function readManifest() {
  if (!existsSync(MANIFEST)) return new Map();
  return new Map(
    readFileSync(MANIFEST, 'utf8').split('\n').filter(Boolean).map((line) => {
      const entry = JSON.parse(line);
      return [entry.title, entry];
    }),
  );
}

function header(title, resolved) {
  return `<!-- 來源: ${API}?action=query&titles=${encodeURIComponent(resolved)}&prop=revisions&rvslots=main&redirects=1\n<!-- 抓取: ${new Date().toISOString()} (crawl-lp.mjs) · data_source=${SOURCE} · 對照 Liquipedia 頁題「${title}」 · CC BY-SA 3.0（Leaguepedia） -->\n`;
}

// 一次查一批頁題的存在性，回傳 Map<輸入頁題, 最終頁題|null>（跟隨重定向與正規化）。
async function resolveBatch(titles) {
  const data = await apiRequest({ action: 'query', titles: titles.join('|'), redirects: 1 });
  const q = data.query ?? {};
  const norm = new Map((q.normalized ?? []).map((n) => [n.from, n.to]));
  const redir = new Map((q.redirects ?? []).map((r) => [r.from, r.to]));
  const present = new Map((q.pages ?? []).map((p) => [p.title, !p.missing]));
  const out = new Map();
  for (const t of titles) {
    let cur = norm.get(t) ?? t;
    const seen = new Set();
    while (redir.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = redir.get(cur);
    }
    out.set(t, present.get(cur) ? cur : null);
  }
  return out;
}

async function cmdMap(listFile, outFile) {
  mkdirSync(RAW_DIR, { recursive: true });
  const titles = readFileSync(listFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  const probes = [...new Set(titles.flatMap(candidates))];
  const resolved = new Map();
  for (let i = 0; i < probes.length; i += MAP_BATCH) {
    const batch = probes.slice(i, i + MAP_BATCH);
    for (const [k, v] of await resolveBatch(batch)) resolved.set(k, v);
    log(`對照進度 ${Math.min(i + MAP_BATCH, probes.length)}/${probes.length}`);
  }
  const lines = [];
  let ok = 0;
  let miss = 0;
  for (const t of titles) {
    const hit = candidates(t).map((c) => resolved.get(c)).find(Boolean);
    if (hit) {
      ok++;
      lines.push(`${t}\t${hit}`);
    } else {
      miss++;
      lines.push(`${t}\tMISS`);
    }
  }
  const text = lines.join('\n') + '\n';
  if (outFile) writeFileSync(outFile, text);
  else console.log(text);
  log(`對照完成: 命中 ${ok}、缺頁 ${miss}（共 ${titles.length}）`);
}

async function cmdCrawl(mapFile, { force }) {
  mkdirSync(RAW_DIR, { recursive: true });
  const rows = readFileSync(mapFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)
    .map((line) => line.split('\t'))
    .filter(([, resolved]) => resolved && resolved !== 'MISS');
  const manifest = readManifest();
  // ⚠ 跳過只看**檔案**存在，不加「manifest 有這個 title」的條件：Liquipedia 頁題
  // 大小寫與國際清單常常不同（`SwordArT` vs `SwordArt`、`KaSing` vs `kaSing`、
  // `Pk` vs `PK`），slug 卻相同——多一個 manifest 條件就會把 S24b 抓的主源 raw
  // 當成沒抓過而覆蓋掉（實際踩過 7 檔）。要重抓一律走 --force。
  const pending = rows.filter(([title]) => force || !existsSync(join(RAW_DIR, `${slugify(title)}.wiki`)));
  log(`備援抓取開始: 待抓 ${pending.length}、跳過 ${rows.length - pending.length}`);
  let fetched = 0;
  let missing = 0;
  for (let i = 0; i < pending.length; i += CRAWL_BATCH) {
    const batch = pending.slice(i, i + CRAWL_BATCH);
    const byResolved = new Map();
    for (const [title, resolved] of batch) {
      if (!byResolved.has(resolved)) byResolved.set(resolved, []);
      byResolved.get(resolved).push(title);
    }
    const data = await apiRequest({
      action: 'query',
      titles: [...byResolved.keys()].join('|'),
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      redirects: 1,
    });
    const q = data.query ?? {};
    const alias = new Map([
      ...(q.normalized ?? []).map((n) => [n.from, n.to]),
      ...(q.redirects ?? []).map((r) => [r.from, r.to]),
    ]);
    const content = new Map();
    for (const p of q.pages ?? []) {
      const text = p.revisions?.[0]?.slots?.main?.content;
      if (text) content.set(p.title, text);
    }
    for (const [resolved, titles] of byResolved) {
      let key = resolved;
      const seen = new Set();
      while (!content.has(key) && alias.has(key) && !seen.has(key)) {
        seen.add(key);
        key = alias.get(key);
      }
      const text = content.get(key);
      if (!text) {
        missing += titles.length;
        for (const t of titles) log(`MISS ${t} → ${resolved}（Leaguepedia 無內容）`);
        continue;
      }
      for (const title of titles) {
        writeFileSync(join(RAW_DIR, `${slugify(title)}.wiki`), header(title, key) + text);
        appendFileSync(
          MANIFEST,
          JSON.stringify({
            title,
            resolvedTitle: key,
            redirectTo: key === resolved ? null : resolved,
            file: `${slugify(title)}.wiki`,
            bytes: Buffer.byteLength(text),
            fetchedAt: new Date().toISOString(),
            dataSource: SOURCE,
          }) + '\n',
        );
        fetched++;
      }
    }
    if ((i / CRAWL_BATCH) % 5 === 0) log(`進度 ${fetched}/${pending.length}`);
  }
  log(`備援抓取完成: 抓 ${fetched}、缺內容 ${missing}、跳過 ${rows.length - pending.length}`);
}

// ── 消歧義解析 ────────────────────────────────────────────────────────────────
// Leaguepedia 對重複 ID 用 `{{DisambigPage}}`（`Ghost` 列十個不同的 Ghost），
// Liquipedia 則是「唯一那個用裸頁題、其餘加國籍後綴」。照 candidates() 抓回來的
// 裸頁題因此常常是消歧義頁而不是選手頁——raw 落了張目錄進來，S25 對不到人。
// 這裡用兩個訊號把它解回單一候選：
//   ① Liquipedia 頁題括號裡的國籍／本名（`Uzi (Chinese player)`）；
//   ② 本地已抓的 Liquipedia 賽事頁 `{{TeamCard}}` 裡，這個 ID 打過的隊伍。
// 兩個訊號都是既有資料，零額外來源。解不掉的列 UNRESOLVED 交人工／S25。

const NATIONALITY = {
  Argentinian: 'Argentina',
  Australian: 'Australia',
  Cantonese: 'Hong Kong',
  Chilean: 'Chile',
  Chinese: 'China',
  Filipino: 'Philippines',
  German: 'Germany',
  Italian: 'Italy',
  Japanese: 'Japan',
  Korean: 'South Korea',
  Russian: 'Russia',
  Swedish: 'Sweden',
  Taiwanese: 'Taiwan',
  Thai: 'Thailand',
  Vietnamese: 'Vietnam',
};

// TeamCard 的 `pNflag=` 國碼 → Leaguepedia `country=` 值。只列本專案清單實際出現
// 的國碼；沒收錄的碼視同無訊號（不猜）。
const FLAG_COUNTRY = {
  cn: 'China', kr: 'South Korea', tw: 'Taiwan', hk: 'Hong Kong', mo: 'Macau',
  vn: 'Vietnam', th: 'Thailand', ph: 'Philippines', sg: 'Singapore', my: 'Malaysia',
  id: 'Indonesia', jp: 'Japan', au: 'Australia', nz: 'New Zealand', us: 'United States',
  ca: 'Canada', br: 'Brazil', ar: 'Argentina', cl: 'Chile', mx: 'Mexico', pe: 'Peru',
  dk: 'Denmark', se: 'Sweden', no: 'Norway', fi: 'Finland', de: 'Germany', fr: 'France',
  es: 'Spain', pt: 'Portugal', it: 'Italy', nl: 'Netherlands', be: 'Belgium',
  pl: 'Poland', cz: 'Czech Republic', ro: 'Romania', gr: 'Greece', hu: 'Hungary',
  tr: 'Turkey', ru: 'Russia', ua: 'Ukraine', kz: 'Kazakhstan', at: 'Austria',
  ch: 'Switzerland', gb: 'United Kingdom', uk: 'United Kingdom', ie: 'Ireland',
};

// TeamCard 的 `posN=` → Leaguepedia `role=`。兩邊寫法都不統一（top／Top、
// ad／adc／bottom／Bot），各自正規化成五個位置。
const POSITIONS = {
  top: 'Top', toplane: 'Top',
  jg: 'Jungle', jungle: 'Jungle', jungler: 'Jungle',
  mid: 'Mid', middle: 'Mid', midlane: 'Mid',
  ad: 'Bot', adc: 'Bot', bot: 'Bot', bottom: 'Bot', marksman: 'Bot',
  sup: 'Support', support: 'Support',
};
const position = (raw) => POSITIONS[String(raw ?? '').trim().toLowerCase().replace(/[\s_-]/g, '')] ?? null;

// team_history.json 的賽區碼 → Leaguepedia `residency=` 值。residency 是「現在
// 在哪個賽區出賽」，不是國籍——只當加分訊號，不當否決訊號（選手會轉賽區）。
const RESIDENCY = {
  LPL: 'China', LCK: 'Korea', LEC: 'EMEA', LCS: 'North America',
  VCS: 'Vietnam', PCS: 'Taiwan', LMS: 'Taiwan', TW: 'Taiwan', HK: 'Taiwan',
  LJL: 'Japan', CBLOL: 'Brazil', OPL: 'Oceania', TCL: 'Turkey',
  LCL: 'EMEA', LLA: 'Latin America', LLN: 'Latin America', CLS: 'Latin America',
  GPL: 'Southeast Asia',
};

// 隊伍消歧義：Leaguepedia 把同名隊拆成「Griffin (Korean Team)」「Lyon Gaming
// (2017 Latin America North Team)」這種帶賽區／年份的頁題，用 team_history.json
// 已有的 region 與 active_years 對回去即可，不必另抓。
const REGION_KEYWORDS = {
  LCK: ['Korean'], LPL: ['Chinese'], LEC: ['European'], LCS: ['North American'],
  OPL: ['Oceanic'], LJL: ['Japanese'], VCS: ['Vietnamese'], TCL: ['Turkish'],
  CBLOL: ['Brazilian'], LLA: ['Latin America'], LLN: ['Latin America North', 'Latin America'],
  CLS: ['Latin America South', 'Chilean'], LCL: ['Russian', 'CIS'],
  PCS: ['Taiwanese'], LMS: ['Taiwanese'], TW: ['Taiwanese'], GPL: ['Southeast Asian'],
};

const DISAMBIG_RE = /\{\{DisambigPage/i;

// 消歧義頁的候選：`|player1=Ghost (Jang Yong-jun)`、`|team1=INFINITY`。
// kind='team' 時只收 teamN=（隊伍目標不會是選手頁，反之亦然）。
function disambigCandidates(wiki, kind = 'player') {
  const prefix = kind === 'team' ? 'team' : '(?:player|team)';
  return [...wiki.matchAll(new RegExp(`^\\|${prefix}\\d+\\s*=\\s*([^|\\n]+)`, 'gim'))]
    .map((m) => m[1].trim())
    .filter(Boolean);
}

// 本地 Liquipedia 賽事頁的 TeamCard → { teams: Map<選手 ID, Set<隊名>>,
// flags: Map<選手 ID, Set<國碼>> }。只取 team=／pNflag= 與 p1–p6／pNlink
// （教練 t2p* 不算選手），與 gen-target-intl.mjs 的枚舉口徑一致。
function teamCardContext() {
  const teams = new Map();
  const flags = new Map();
  const roles = new Map();
  const eventTitles = [
    ...readFileSync(join(ROOT, 'events_worlds_msi.txt'), 'utf8').split('\n'),
    ...readFileSync(join(ROOT, 'events_champions.txt'), 'utf8').split('\n'),
  ].map((s) => s.trim()).filter(Boolean);
  for (const title of eventTitles) {
    const file = join(RAW_DIR, `${slugify(title)}.wiki`);
    if (!existsSync(file)) continue;
    const wiki = readFileSync(file, 'utf8');
    for (const m of wiki.matchAll(/\{\{TeamCard\n([\s\S]*?)\n\}\}/g)) {
      const fields = {};
      for (const segment of m[1].split('|')) {
        const fm = segment.match(/^\s*([a-zA-Z0-9]+)\s*=\s*([\s\S]*)$/);
        if (fm && !(fm[1] in fields)) fields[fm[1]] = fm[2].trim();
      }
      if (!fields.team) continue;
      for (let i = 1; i <= 6; i++) {
        const raw = fields[`p${i}`];
        if (!raw) continue;
        const id = (fields[`p${i}link`] ?? raw).trim();
        if (!teams.has(id)) teams.set(id, new Set());
        teams.get(id).add(fields.team);
        const flag = fields[`p${i}flag`]?.trim().toLowerCase();
        if (flag) {
          if (!flags.has(id)) flags.set(id, new Set());
          flags.get(id).add(flag);
        }
        const pos = position(fields[`pos${i}`]);
        if (pos) {
          if (!roles.has(id)) roles.set(id, new Set());
          roles.get(id).add(pos);
        }
      }
    }
  }
  return { teams, flags, roles };
}

// 隊名 → 賽區碼（team_history.json，S24b/S24c 產物）。同一隊在檔裡是 display_name，
// TeamCard 的 team= 多半逐字相同；對不上的當無訊號。
function teamRegions() {
  const file = join(ROOT, 'team_history.json');
  if (!existsSync(file)) return new Map();
  const data = JSON.parse(readFileSync(file, 'utf8'));
  return new Map((data.teams ?? []).map((t) => [t.display_name, t]));
}

async function fetchContents(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += CRAWL_BATCH) {
    const batch = titles.slice(i, i + CRAWL_BATCH);
    const data = await apiRequest({
      action: 'query',
      titles: batch.join('|'),
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      redirects: 1,
    });
    const q = data.query ?? {};
    const alias = new Map([
      ...(q.normalized ?? []).map((n) => [n.from, n.to]),
      ...(q.redirects ?? []).map((r) => [r.from, r.to]),
    ]);
    const byTitle = new Map();
    for (const p of q.pages ?? []) {
      const text = p.revisions?.[0]?.slots?.main?.content;
      if (text) byTitle.set(p.title, text);
    }
    for (const t of batch) {
      let key = t;
      const seen = new Set();
      while (!byTitle.has(key) && alias.has(key) && !seen.has(key)) {
        seen.add(key);
        key = alias.get(key);
      }
      if (byTitle.has(key)) out.set(t, byTitle.get(key));
    }
  }
  return out;
}

const field = (wiki, name) => (wiki.match(new RegExp(`\\|\\s*${name}\\s*=\\s*([^|\\n]*)`, 'i')) ?? [])[1]?.trim() ?? '';

async function cmdResolve(mapFile, outFile) {
  const rows = readFileSync(mapFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)
    .map((line) => line.split('\t'));
  const { teams: teamsByPlayer, flags: flagsByPlayer, roles: rolesByPlayer } = teamCardContext();
  const teamRecord = teamRegions();
  const teamTargets = new Set(readFileSync(join(ROOT, 'teams_intl.txt'), 'utf8')
    .split('\n').map((s) => s.trim()).filter(Boolean));
  const eventTargets = new Set([
    ...readFileSync(join(ROOT, 'events_worlds_msi.txt'), 'utf8').split('\n'),
    ...readFileSync(join(ROOT, 'events_champions.txt'), 'utf8').split('\n'),
  ].map((s) => s.trim()).filter(Boolean));
  const needs = [];
  for (const [title, resolved] of rows) {
    const file = join(RAW_DIR, `${slugify(title)}.wiki`);
    if (!existsSync(file)) continue;
    const wiki = readFileSync(file, 'utf8');
    if (!wiki.includes('data_source=leaguepedia')) continue; // Liquipedia 原抓的不動
    const kind = teamTargets.has(title) ? 'team' : 'player';
    if (!DISAMBIG_RE.test(wiki)) {
      // 型別把關：剝掉消歧義後綴的裸頁題可能撞上同名戰隊（`Rogue (Australian
      // player)` → 歐洲戰隊 Rogue）。抓回來的頁 Infobox 型別不對就當場報出來，
      // 只能靠 MANUAL_TITLES 補——沒有消歧義頁可挑候選。
      if (eventTargets.has(title)) continue; // 賽事頁不做型別把關
      const wrongType = kind === 'team'
        ? !/\{\{Infobox Team/i.test(wiki)
        : !/\{\{Infobox Player/i.test(wiki);
      if (wrongType) log(`TYPE-MISMATCH ${title} → ${resolved}（抓到的頁不是${kind === 'team' ? '戰隊' : '選手'}頁，請補 MANUAL_TITLES）`);
      continue;
    }
    needs.push({ title, resolved, kind, candidates: disambigCandidates(wiki, kind) });
  }
  log(`消歧義待解 ${needs.length} 筆`);
  const contents = await fetchContents([...new Set(needs.flatMap((n) => n.candidates))]);
  const lines = [];
  let solved = 0;
  const unresolved = [];
  for (const n of needs) {
    if (n.kind === 'team') {
      const rec = teamRecord.get(n.title);
      const keywords = REGION_KEYWORDS[rec?.region] ?? [];
      const years = rec?.active_years ?? [];
      const scored = n.candidates.map((c) => {
        let score = 0;
        for (const k of keywords) if (c.includes(k)) score += 4;
        for (const y of years) if (c.includes(String(y))) score += 3;
        if (n.candidates.length === 1) score += 1; // 唯一隊伍候選：消歧義頁上沒有第二個可能
        return { c, score };
      }).sort((a, b) => b.score - a.score);
      if (scored[0]?.score > 0 && (scored.length === 1 || scored[0].score > scored[1].score)) {
        solved++;
        lines.push(`${n.title}\t${scored[0].c}`);
        log(`RESOLVE(team) ${n.title} → ${scored[0].c}（分 ${scored[0].score}／次高 ${scored[1]?.score ?? '—'}）`);
      } else {
        unresolved.push(n);
        log(`UNRESOLVED ${n.title}（隊伍候選 ${n.candidates.length}、最高分 ${scored[0]?.score ?? 0}）`);
      }
      continue;
    }
    const m = n.title.match(/^(.+?) \((.+)\)$/);
    const hint = m?.[2] ?? null;
    const wantName = hint && !/ player$/.test(hint) ? hint.toLowerCase() : null;
    const wantTeams = teamsByPlayer.get(n.title) ?? teamsByPlayer.get(m?.[1] ?? n.title) ?? new Set();
    // 國籍訊號：頁題括號優先（Liquipedia 明寫），其次 TeamCard 的 pNflag——
    // 同一 ID 在不同屆掛到兩個以上國碼時視同無訊號（那多半是同名不同人）。
    const seenFlags = [...(flagsByPlayer.get(n.title) ?? flagsByPlayer.get(m?.[1] ?? n.title) ?? [])]
      .map((f) => FLAG_COUNTRY[f]).filter(Boolean);
    const wantCountry = (hint ? NATIONALITY[hint.replace(/ player$/, '')] : null)
      ?? (new Set(seenFlags).size === 1 ? seenFlags[0] : null);
    const wantRoles = rolesByPlayer.get(n.title) ?? rolesByPlayer.get(m?.[1] ?? n.title) ?? new Set();
    const wantResidency = new Set([...wantTeams]
      .map((t) => RESIDENCY[teamRecord.get(t)?.region]).filter(Boolean));
    const scored = n.candidates.map((c) => {
      const wiki = contents.get(c) ?? '';
      const country = field(wiki, 'country');
      const name = field(wiki, 'name');
      let score = 0;
      if (wantCountry && country === wantCountry) score += 4;
      if (wantCountry && country && country !== wantCountry) score -= 4;
      if (wantName && name.toLowerCase() === wantName) score += 6;
      for (const team of wantTeams) if (wiki.includes(team)) score += 2;
      // residency／role 只加分不扣分：選手會轉賽區、轉位置，缺席不代表不是他
      if (wantResidency.has(field(wiki, 'residency'))) score += 3;
      if (wantRoles.has(position(field(wiki, 'role')))) score += 3;
      return { c, score, country, name };
    });
    const best = scored.slice().sort((a, b) => b.score - a.score);
    if (best[0]?.score > 0 && (best.length === 1 || best[0].score > best[1].score)) {
      solved++;
      lines.push(`${n.title}\t${best[0].c}`);
      log(`RESOLVE ${n.title} → ${best[0].c}（分 ${best[0].score}／次高 ${best[1]?.score ?? '—'}）`);
    } else {
      unresolved.push(n);
      log(`UNRESOLVED ${n.title}（候選 ${n.candidates.length}、最高分 ${best[0]?.score ?? 0}）`);
    }
  }
  if (outFile) writeFileSync(outFile, lines.join('\n') + '\n');
  else console.log(lines.join('\n'));

  // 解不掉的：`<slug>.wiki` 留著那張消歧義頁（那就是這個 ID 在 Leaguepedia 的
  // 誠實對應），另外把每個候選的選手頁一併落檔（本來就抓進記憶體了），並列一份
  // 待辦清單交 S25 實體對齊——S24 不做清洗，但要把材料備齊。
  const manifest = readManifest();
  let extra = 0;
  const todo = [];
  for (const n of unresolved) {
    todo.push([n.title, ...n.candidates].join('\t'));
    for (const c of n.candidates) {
      const text = contents.get(c);
      if (!text) continue;
      const file = join(RAW_DIR, `${slugify(c)}.wiki`);
      // ⚠ 只看檔案存在，不看 manifest：候選頁題 slug 可能與某個目標頁題的 slug
      // 相撞（`INFINITY` vs 目標 `Infinity`），照 manifest 判斷會把目標的 raw
      // 蓋掉——那筆 manifest 記的是 Liquipedia 頁題，查不到候選頁題。
      if (existsSync(file)) continue;
      writeFileSync(file, header(c, c) + text);
      appendFileSync(MANIFEST, JSON.stringify({
        title: c,
        resolvedTitle: c,
        redirectTo: null,
        file: `${slugify(c)}.wiki`,
        bytes: Buffer.byteLength(text),
        fetchedAt: new Date().toISOString(),
        dataSource: SOURCE,
        note: `disambig candidate of ${n.title}`,
      }) + '\n');
      manifest.set(c, true);
      extra++;
    }
  }
  writeFileSync(join(ROOT, 'unresolved_disambig_lp.tsv'), todo.join('\n') + (todo.length ? '\n' : ''));
  log(`消歧義解析: 解出 ${solved}、未解 ${unresolved.length}（候選頁另落檔 ${extra} 個，清單 unresolved_disambig_lp.tsv）`);
}

async function cmdProbe(titles) {
  for (const [t, r] of await resolveBatch(titles)) console.log(`${t}\t${r ?? 'MISS'}`);
}

const USAGE = `用法:
  node crawl-lp.mjs map 清單.txt --out 對照.tsv
  node crawl-lp.mjs crawl 對照.tsv [--force]
  node crawl-lp.mjs resolve 對照.tsv --out 消歧義修正.tsv
  node crawl-lp.mjs probe "頁題" [更多頁題…]`;

const [sub, ...args] = process.argv.slice(2);
const options = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') options.out = args[++i];
  else if (args[i] === '--force') options.force = true;
  else positional.push(args[i]);
}

try {
  if (sub === 'map') await cmdMap(positional[0], options.out);
  else if (sub === 'resolve') await cmdResolve(positional[0], options.out);
  else if (sub === 'crawl') await cmdCrawl(positional[0], { force: options.force });
  else if (sub === 'probe') await cmdProbe(positional);
  else console.log(USAGE);
} catch (err) {
  console.error(`失敗: ${err.message}`);
  process.exitCode = 1;
}
