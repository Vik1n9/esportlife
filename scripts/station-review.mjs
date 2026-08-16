#!/usr/bin/env node
// 每站收尾的 OCR 審查閘門：npm test → ocr review → 回報。
// 用法：node scripts/station-review.mjs --station S21 [--note "補充背景"] [--skip-test]
// exit 0 = 可 commit；exit 2 = 有 critical／high 待修（禁 commit）；exit 1 = 流程錯誤。

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const station = flag('station') ?? '';
const note = flag('note') ?? '';
const skipTest = has('skip-test');

const sh = (cmd, argv, opts = {}) => {
  const r = spawnSync(cmd, argv, { encoding: 'utf8', ...opts });
  return r;
};

// ── Phase 0：工作區必須有變更 ─────────────────────────────
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
if (!dirty) {
  console.log('工作區乾淨，沒有待審的變更。若站工作已 commit，改用：ocr review --audience agent -c HEAD');
  process.exit(0);
}

// ── Phase 1：npm test 閘門 ────────────────────────────────
if (!skipTest) {
  console.log('── Phase 1: npm test ──');
  const t = sh('npm', ['test'], { cwd: join(import.meta.dirname, '..') });
  if (t.status !== 0) {
    console.log(t.stdout?.slice(-4000) ?? '');
    console.error(t.stderr?.slice(-2000) ?? '');
    console.error('測試未過，不進審查。修完重跑本腳本。');
    process.exit(1);
  }
  const ok = (t.stdout.match(/通過|passed|ok/gi) ?? []).length;
  console.log(`測試通過。`);
}

// ── Phase 2：OCR 環境檢查 ─────────────────────────────────
const llm = sh('ocr', ['llm', 'test']);
if (llm.status !== 0) {
  console.error('ocr LLM 未設定：' + (llm.stderr ?? llm.stdout ?? '').trim());
  console.error(`設定方式（擇一）：
  環境變數：export OCR_LLM_URL=... OCR_LLM_TOKEN=... OCR_LLM_MODEL=...（Anthropic 加 OCR_USE_ANTHROPIC=true）
  永久設定：ocr config set llm.url ... / llm.auth_token ... / llm.model ... / llm.use_anthropic true`);
  process.exit(1);
}

// ── Phase 3：跑審查 ───────────────────────────────────────
const background = [
  `電競人生 V4 重建${station ? `：站 ${station} 收尾審查` : ''}。`,
  '純前端 ESM、零建置、Node 原生測試（npm test）。禁建議引入建置工具、打包器、新 npm 依賴。',
  '條件判斷一律走 src/engine/conditions.js 的 evalCond；eventTrigger.js 的 whenHits 是待退役遺留，不得為其加能力。',
  '新謂詞要同時加進 conditions.js 的 QUERIES 與 tools/schema.js 的 PREDICATES。',
  '資料採單一來源：名次表／階名／旗標名只准一份；存機器鍵不存顯示字串。',
  note,
].filter(Boolean).join(' ');

console.log('── Phase 2: ocr review ──');
const outFile = join(mkdtempSync(join(tmpdir(), 'ocr-')), 'review.json');
const rv = sh('ocr', [
  'review',
  '--audience', 'agent',
  '-f', 'json',
  '-b', background,
  '--exclude', '**/*.md',
], { maxBuffer: 64 * 1024 * 1024 });

if (rv.status !== 0) {
  console.error('ocr review 失敗：');
  console.error(rv.stderr?.slice(-3000) ?? '');
  console.error(rv.stdout?.slice(-1000) ?? '');
  process.exit(1);
}
writeFileSync(outFile, rv.stdout);

// ── Phase 4：解析與回報 ───────────────────────────────────
let data;
try {
  data = JSON.parse(rv.stdout);
} catch {
  console.error('ocr 輸出不是 JSON，原始結果存於：' + outFile);
  console.error(rv.stdout.slice(-3000));
  process.exit(1);
}

const comments = Array.isArray(data.comments) ? data.comments
  : Array.isArray(data.issues) ? data.issues
  : [];

const rank = { critical: 0, high: 1, medium: 2, low: 3 };
const buckets = { critical: [], high: [], medium: [], low: [] };
for (const c of comments) {
  const sev = String(c.severity ?? '').toLowerCase();
  (buckets[sev] ?? buckets.low).push(c);
}

console.log('');
console.log(`審查完畢：${data.files_reviewed ?? '?'} 個檔案、${comments.length} 條意見`);
console.log(`  critical ${buckets.critical.length}｜high ${buckets.high.length}｜medium ${buckets.medium.length}｜low ${buckets.low.length}`);
console.log(`  完整 JSON：${outFile}`);

for (const sev of ['critical', 'high', 'medium', 'low']) {
  if (!buckets[sev].length) continue;
  console.log('');
  console.log(`── ${sev.toUpperCase()} ──`);
  for (const c of buckets[sev]) {
    const loc = `${c.path ?? '?'}${c.start_line ? `:${c.start_line}${c.end_line && c.end_line !== c.start_line ? `-${c.end_line}` : ''}` : ''}`;
    console.log(`- ${loc}`);
    for (const line of String(c.content ?? '').trim().split('\n')) console.log(`    ${line}`);
    if (c.suggestion_code) console.log('    建議碼：' + String(c.suggestion_code).replace(/\n/g, '\n    '));
  }
}

const blocking = buckets.critical.length + buckets.high.length;
if (blocking > 0) {
  console.error('');
  console.error(`禁 commit：尚有 ${blocking} 條 critical／high。修完重跑 npm test，再跑本腳本複審。`);
  process.exit(2);
}
console.log('');
console.log('審查閘門通過。medium／low 自行斟酌：修掉或記進該站交接筆記，然後 commit、push。');
process.exit(0);
