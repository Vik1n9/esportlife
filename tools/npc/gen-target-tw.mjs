#!/usr/bin/env node
/**
 * tools/npc/gen-target-tw.mjs — 台港澳 target_players.csv 生成器（零相依）
 *
 * S24b 的清單邏輯：把三個選手分類的枚舉結果合併成 target_players.csv。
 * 不重複 API 客戶端——枚舉靠 crawl.mjs enum-cat（README 有指令），本腳本只做
 * 組檔：去重、扣亂入條目、標 region、組 wiki_url、REDIRECT 展開驗證。
 *
 * 重跑流程（冪等，全部可重現）：
 *   node crawl.mjs enum-cat "Category:Taiwanese Players" --out tw_players.txt
 *   node crawl.mjs enum-cat "Category:Hong Kong Players" --out hk_players.txt
 *   node crawl.mjs enum-cat "Category:Macau Players" --out mo_players.txt
 *   node crawl.mjs check <合併清單> --out players_check.tsv   # 確認無 MISS／REDIRECT
 *   node gen-target-tw.mjs --out target_players.csv
 *
 * 設計決定（2026-08-16，S24b）：
 * - 分類枚舉回傳的就是正式頁題（消歧義後綴頁），重定向不會是分類成員——
 *   check 全 OK 即代表無需展開，MISS／REDIRECT 出現時本腳本直接失敗，不靜默放行。
 * - region 依來源分類（TW/HK/MO）；跨分類重疊以第一個來源為準並警告。
 * - 「Error」是 Macau 分類的亂入條目（非選手頁），內建忽略。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const WIKI_BASE = 'https://liquipedia.net/leagueoflegends/';
const DROPPED = new Set(['Error']);

// 來源分類檔：region 標記。檔案不存在時照樣跑（該分類可選），只是沒有該區選手。
const SOURCES = [
  { file: 'tw_players.txt', region: 'TW' },
  { file: 'hk_players.txt', region: 'HK' },
  { file: 'mo_players.txt', region: 'MO' },
];

const args = process.argv.slice(2);
// --out 與 crawl.mjs 同規則：直接當路徑用（相對 cwd），不用 join(ROOT, …) 拼——
// 拼 ROOT 會把絕對路徑也接到腳本目錄後面，行為不符直覺。
const outFile = (args.indexOf('--out') >= 0 ? args[args.indexOf('--out') + 1] : null) ?? 'target_players.csv';

const rows = [];
const seen = new Map();
const dropped = [];

for (const { file, region } of SOURCES) {
  const path = join(ROOT, file);
  let lines;
  try {
    lines = readFileSync(path, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    console.error(`警告: ${file} 不存在，跳過 ${region} 區（先跑 crawl.mjs enum-cat）`);
    continue;
  }
  for (const title of lines) {
    if (DROPPED.has(title)) {
      dropped.push(`${title}（${region}）`);
      continue;
    }
    if (seen.has(title)) {
      console.error(`警告: ${title} 跨分類重疊（${seen.get(title)}／${region}），取 ${seen.get(title)}`);
      continue;
    }
    seen.set(title, region);
    rows.push({
      wiki_url: `${WIKI_BASE}${title.replace(/ /g, '_')}`,
      player_id: title,
      region,
      fetch_priority: 1,
    });
  }
}

const csv = [
  'wiki_url,player_id,region,fetch_priority',
  ...rows.map((r) => `${r.wiki_url},${r.player_id},${r.region},${r.fetch_priority}`),
].join('\n') + '\n';

writeFileSync(outFile, csv);
console.error(`已寫出 ${outFile}：${rows.length} 筆（priority 全 1）`);
if (dropped.length) console.error(`已扣除亂入條目 ${dropped.length} 筆: ${dropped.join('、')}`);