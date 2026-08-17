#!/usr/bin/env node
/**
 * tools/npc/gen-crawl-list-intl.mjs — S24d 國際抓取清單生成器（零相依）
 *
 * 把 S24c 的三個來源合成一份 Liquipedia 頁題清單 `crawl_intl_all.txt`：
 *   - `target_players.csv` 的 region=INTL 選手（wiki_url 反解頁題）
 *   - `teams_intl.txt` 國際隊頁
 *   - `events_worlds_msi.txt` ＋ `events_champions.txt` 賽事頁
 * 去重排序後輸出，與台港澳段的 `crawl_twhkmo_all.txt` 同角色。可重跑再生。
 *
 * 用法：node gen-crawl-list-intl.mjs [--out crawl_intl_all.txt]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);

// wiki_url → 頁題：Liquipedia 的 URL 用底線代空格，且整段是 percent-encoded。
const titleOf = (url) => decodeURIComponent(url.replace('https://liquipedia.net/leagueoflegends/', '')).replace(/_/g, ' ');

const players = read('target_players.csv').slice(1)
  .map((line) => line.split(','))
  .filter((cols) => cols[2] === 'INTL')
  .map((cols) => titleOf(cols[0]));

const titles = [...new Set([
  ...players,
  ...read('teams_intl.txt'),
  ...read('events_worlds_msi.txt'),
  ...read('events_champions.txt'),
])].sort();

const outArg = process.argv.indexOf('--out');
const out = outArg >= 0 ? process.argv[outArg + 1] : 'crawl_intl_all.txt';
writeFileSync(join(ROOT, out), titles.join('\n') + '\n');
console.error(`已寫出 ${out}（選手 ${players.length}、合計 ${titles.length} 頁）`);
