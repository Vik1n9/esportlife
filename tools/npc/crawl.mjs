#!/usr/bin/env node
/**
 * tools/npc/crawl.mjs — Liquipedia 抓取工具（零相依，Node 18+）
 *
 * 庚組 NPC 資料線的第一段：抓整頁 Wikitext 落 raw_data/，不做任何解析
 * （解析是 S25 的活）。設計目標：
 *
 * - 冪等：已抓過的頁面重跑完全跳過（檔案存在且 manifest 有記錄），斷線續傳
 *   靠同一條規則——抓到一半中斷，重跑只補缺的。要重抓加 --force。
 * - 合規：固定識別 UA（Liquipedia 政策明文禁止 UA 輪替，輪替會被整 IP 擋）、
 *   gzip 必帶（漏掉回 406；Node 內建 fetch 自動送 Accept-Encoding 並解壓）、
 *   每請求間 2–5 秒隨機延遲、429／5xx 退避重試（尊重 Retry-After）。
 * - 稽核：每個 .wiki 檔頭寫來源 URL、抓取日、CC BY-SA 3.0 註記；成功／缺頁／
 *   重定向逐筆記 raw_data/manifest.jsonl 與 raw_data/crawl.log。
 *
 * 用法：
 *   node crawl.mjs enum-cat "Category:Taiwanese Players" [--out 清單.txt]
 *   node crawl.mjs check 清單.txt [--out 檢查結果.tsv]
 *   node crawl.mjs crawl 清單.txt [--force]
 *   node crawl.mjs probe "頁題"
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(ROOT, 'raw_data');
const MANIFEST = join(RAW_DIR, 'manifest.jsonl');
const LOG = join(RAW_DIR, 'crawl.log');

const API = 'https://liquipedia.net/leagueoflegends/api.php';
const UA = 'LiquipediaDataBot/1.0 (esportlife NPC data pipeline; github.com/Vik1n9/esportlife)';

const DELAY_MIN = 2000;
const DELAY_MAX = 5000;
const RETRY_DELAYS = [5_000, 15_000, 45_000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let lastRequestAt = 0;

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.error(line);
  appendFileSync(LOG, line + '\n');
}

async function apiRequest(params, retriesLeft = RETRY_DELAYS.length) {
  const wait = Math.max(0, lastRequestAt + DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN) - Date.now());
  if (wait > 0) await sleep(wait);
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA } });
  } catch (err) {
    lastRequestAt = Date.now();
    if (retriesLeft > 0) {
      log(`網路錯誤重試（${err.message}，${RETRY_DELAYS[RETRY_DELAYS.length - retriesLeft] / 1000}s 後）`);
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

async function fetchPage(title) {
  // 回傳 { ok, title, redirectTo, missing, error, wikitext }；redirects=1 時 parse 自動
  // 跟隨重定向，回傳內含 redirects 鏈與最終頁題，缺頁回 missingtitle。
  const data = await apiRequest({ action: 'parse', page: title, prop: 'wikitext', redirects: 1 });
  const p = data.parse;
  if (!p) return { ok: false, title, missing: data.error?.code === 'missingtitle', error: data.error?.info ?? 'unknown' };
  return {
    ok: true,
    title,
    resolvedTitle: p.title,
    redirectTo: p.redirects?.[0]?.to ?? null,
    wikitext: p.wikitext,
  };
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

function header(title) {
  return `<!-- 來源: ${API}?action=parse&page=${encodeURIComponent(title)}&redirects=1\n<!-- 抓取: ${new Date().toISOString()} (crawl.mjs) · CC BY-SA 3.0（Liquipedia） -->\n`;
}

async function cmdCheck(listFile, outFile) {
  // 批次存在性檢查：action=query 一次吃 50 個頁題，探勘覆蓋表與 S24b/c 的清單
  // 驗證都用它。輸出每行「頁題 \t OK｜MISS｜REDIRECT→目標」。
  const titles = readFileSync(listFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  const lines = [];
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = await apiRequest({ action: 'query', titles: batch.join('|'), redirects: 1 });
    const pages = data.query.pages;
    const redirectMap = new Map((data.query.redirects ?? []).map((r) => [r.from, r.to]));
    for (const t of batch) {
      let cur = t;
      const seen = new Set();
      while (redirectMap.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        cur = redirectMap.get(cur);
      }
      if (cur !== t) {
        lines.push(`${t}\tREDIRECT→${cur}`);
        continue;
      }
      const p = pages.find((page) => page.title === t);
      lines.push(p && !p.missing ? `${t}\tOK` : `${t}\tMISS`);
    }
  }
  if (outFile) writeFileSync(outFile, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}

async function cmdCrawl(listFile, { force }) {
  mkdirSync(RAW_DIR, { recursive: true });
  const titles = readFileSync(listFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  const manifest = readManifest();
  let fetched = 0;
  let skipped = 0;
  let missing = 0;
  let failed = 0;
  for (const title of titles) {
    const slug = slugify(title);
    if (!force && existsSync(join(RAW_DIR, `${slug}.wiki`)) && manifest.has(title)) {
      skipped++;
      continue;
    }
    const r = await fetchPage(title).catch((err) => {
      log(`FAIL ${title}（${err.message}，略過續下頁）`);
      return null;
    });
    if (!r) {
      failed++;
      continue;
    }
    if (!r.ok) {
      missing++;
      log(`MISS ${title}（${r.error}）`);
      continue;
    }
    if (r.redirectTo) log(`REDIRECT ${title} → ${r.redirectTo}（落檔名 ${slug}.wiki，內文為最終頁）`);
    writeFileSync(join(RAW_DIR, `${slug}.wiki`), header(title) + r.wikitext);
    appendFileSync(
      MANIFEST,
      JSON.stringify({
        title,
        resolvedTitle: r.resolvedTitle,
        redirectTo: r.redirectTo,
        file: `${slug}.wiki`,
        bytes: Buffer.byteLength(r.wikitext),
        fetchedAt: new Date().toISOString(),
      }) + '\n',
    );
    fetched++;
    if (fetched % 25 === 0) log(`進度 ${fetched}/${titles.length}`);
  }
  log(`抓取完成: 抓 ${fetched}、跳過 ${skipped}、缺頁 ${missing}、失敗 ${failed}（失敗的頁重跑會再試）`);
}

async function cmdEnumCat(categories, outFile) {
  // log() 要寫 LOG 檔，先確保 raw_data/ 存在（大分類分頁續傳才會觸發 log）
  mkdirSync(RAW_DIR, { recursive: true });
  const titles = new Set();
  for (const raw of categories) {
    const name = raw.startsWith('Category:') ? raw : `Category:${raw}`;
    let cmcontinue = null;
    do {
      const data = await apiRequest({
        action: 'query',
        list: 'categorymembers',
        cmtitle: name,
        cmlimit: 500,
        cmnamespace: '0',
        ...(cmcontinue ? { cmcontinue } : {}),
      });
      for (const m of data.query.categorymembers) titles.add(m.title);
      cmcontinue = data.continue?.cmcontinue ?? null;
      if (cmcontinue) log(`分類 ${name} 分頁續傳…（目前 ${titles.size} 頁）`);
    } while (cmcontinue);
  }
  const lines = [...titles].sort();
  if (outFile) {
    writeFileSync(outFile, lines.join('\n') + '\n');
    console.error(`已寫出 ${outFile}（${lines.length} 頁）`);
  } else {
    console.log(lines.join('\n'));
  }
}

async function cmdProbe(titles) {
  for (const title of titles) {
    const r = await fetchPage(title);
    if (!r.ok) console.log(`${title}\tMISS\t${r.error}`);
    else if (r.redirectTo) console.log(`${title}\tREDIRECT→${r.redirectTo}\t${Buffer.byteLength(r.wikitext)} bytes`);
    else console.log(`${title}\tOK\t${Buffer.byteLength(r.wikitext)} bytes`);
  }
}

async function cmdSearch(query) {
  // 找正確頁題用：探勘時猜不到的題名（LCP、更名後的 ahq 等）靠全文搜尋定位。
  const data = await apiRequest({ action: 'query', list: 'search', srsearch: query, srlimit: 20 });
  for (const r of data.query.search) console.log(`${r.title}\t(${r.size} bytes)`);
}

const USAGE = `用法:
  node crawl.mjs enum-cat "Category:Taiwanese Players" [--out 清單.txt]
  node crawl.mjs check 清單.txt [--out 檢查結果.tsv]
  node crawl.mjs crawl 清單.txt [--force]
  node crawl.mjs probe "頁題" [更多頁題…]
  node crawl.mjs search "搜尋字串"`;

const [sub, ...args] = process.argv.slice(2);
const options = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') options.out = args[++i];
  else if (args[i] === '--force') options.force = true;
  else positional.push(args[i]);
}

try {
  if (sub === 'enum-cat') await cmdEnumCat(positional, options.out);
  else if (sub === 'check') await cmdCheck(positional[0], options.out);
  else if (sub === 'crawl') await cmdCrawl(positional[0], { force: options.force });
  else if (sub === 'probe') await cmdProbe(positional);
  else if (sub === 'search') await cmdSearch(positional.join(' '));
  else console.log(USAGE);
} catch (err) {
  console.error(`失敗: ${err.message}`);
  process.exitCode = 1;
}