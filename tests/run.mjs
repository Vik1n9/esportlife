/**
 * 測試 runner。
 *
 * 自動掃描 tests/{kernel,phases,history,regression}/*.mjs，每個檔案是一個 suite：
 *
 *   export const name = '季後賽 BO 系列';
 *   export async function run({ check, log }) { ... }
 *
 * 新增一個 suite 不必改這個檔——這是刻意的，因為賽事與階段會頻繁增減。
 *
 * 執行：node tests/run.mjs            跑全部
 *       node tests/run.mjs kernel     只跑某一區
 *       node tests/run.mjs series     只跑檔名或 suite 名符合的
 */
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const GROUPS = ['kernel', 'phases', 'history', 'regression'];

const filter = process.argv[2];

let failures = 0;
let checks = 0;

function makeCheck(suiteName) {
  return (label, condition, detail = '') => {
    checks++;
    if (condition) return;
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  };
}

const log = (msg) => console.log(`  ${msg}`);

/** suite 之間共享的資料（例如冒煙測試跑出來的生涯樣本，讓分布檢查不必重跑） */
const shared = {};

async function loadSuites() {
  const found = [];
  for (const group of GROUPS) {
    let files;
    try {
      files = await readdir(join(ROOT, group));
    } catch {
      continue;   // 該分組還沒有測試
    }
    for (const file of files.filter((f) => f.endsWith('.mjs')).sort()) {
      const path = join(ROOT, group, file);
      const mod = await import(pathToFileURL(path).href);
      if (typeof mod.run !== 'function') {
        console.error(`  ✗ ${group}/${file} 沒有匯出 run()`);
        failures++;
        continue;
      }
      found.push({ group, file, name: mod.name || file.replace(/\.mjs$/, ''), order: mod.order ?? 100, run: mod.run });
    }
  }
  // order 讓「先產生共享樣本」的 suite 排在使用者前面
  return found.sort((a, b) => a.order - b.order || a.file.localeCompare(b.file));
}

const suites = await loadSuites();
const selected = filter
  ? suites.filter((s) => s.group === filter || s.file.includes(filter) || s.name.includes(filter))
  : suites;

if (!selected.length) {
  console.error(`找不到符合 "${filter}" 的 suite。可用：${suites.map((s) => `${s.group}/${s.file}`).join(', ')}`);
  process.exit(1);
}

const started = Date.now();
for (const suite of selected) {
  console.log(`▸ ${suite.group}/${suite.name}`);
  try {
    await suite.run({ check: makeCheck(suite.name), log, shared });
  } catch (err) {
    failures++;
    console.error(`  ✗ suite 拋出例外 — ${err && err.stack ? err.stack : err}`);
  }
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
console.log('');
if (failures) {
  console.error(`✗ ${failures} 項檢查失敗（共 ${checks} 項，${elapsed}s）`);
  process.exit(1);
}
console.log(`✓ 全部檢查通過（${checks} 項，${elapsed}s）`);
