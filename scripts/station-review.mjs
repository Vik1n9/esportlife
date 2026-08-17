#!/usr/bin/env node
// 每站收尾的 OCR 審查閘門（委託模式，全程不呼叫 LLM、不需 API key）：
//   出包：  node scripts/station-review.mjs --station S21 [--note "補充背景"] [--skip-test]
//   閘門：  node scripts/station-review.mjs --station S21 --comments /tmp/review.json [--skip-test]
// 委託模式：OCR 只做確定性工程（檔案篩選、規則解析），審查由 host agent 親自執行，
// 意見依委託模式格式寫成 JSON，再進閘門。
// exit 0 = 可 commit；exit 2 = 有 critical／high 待修（禁 commit）；exit 1 = 流程錯誤。

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
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
const commentsFile = flag('comments') ?? '';
const skipTest = has('skip-test');

const sh = (cmd, argv, opts = {}) => spawnSync(cmd, argv, { encoding: 'utf8', ...opts });

// ── Phase 0：工作區必須有變更 ─────────────────────────────
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
if (!dirty) {
  console.log('工作區乾淨，沒有待審的變更。若站工作已 commit，改用：ocr delegate preview -c HEAD');
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
  console.log('測試通過。');
}

// ── Phase 2a：出審查包（委託模式）─────────────────────────
if (!commentsFile) {
  const background = [
    `電競人生 V4 重建${station ? `：站 ${station} 收尾審查` : ''}。`,
    '純前端 ESM、零建置、Node 原生測試（npm test）。禁建議引入建置工具、打包器、新 npm 依賴。',
    '條件判斷一律走 src/engine/conditions.js 的 evalCond；eventTrigger.js 的 whenHits 是待退役遺留，不得為其加能力。',
    '新謂詞要同時加進 conditions.js 的 QUERIES 與 tools/schema.js 的 PREDICATES。',
    '資料採單一來源：名次表／階名／旗標名只准一份；存機器鍵不存顯示字串。',
    note,
  ].filter(Boolean).join(' ');

  console.log('── Phase 2: ocr delegate（委託模式，不呼叫 LLM）──');
  const pv = sh('ocr', [
    'delegate', 'preview',
    '-f', 'json',
    '-b', background,
    '--exclude', '**/*.md',
  ], { maxBuffer: 64 * 1024 * 1024 });
  if (pv.status !== 0) {
    console.error('ocr delegate preview 失敗：');
    console.error(pv.stderr?.slice(-3000) ?? '');
    console.error(pv.stdout?.slice(-1000) ?? '');
    process.exit(1);
  }
  let preview;
  try {
    preview = JSON.parse(pv.stdout);
  } catch {
    console.error('ocr delegate preview 輸出不是 JSON：');
    console.error(pv.stdout.slice(-3000));
    process.exit(1);
  }

  const files = Array.isArray(preview.reviewable_files) ? preview.reviewable_files : [];
  if (!files.length) {
    console.log('沒有待審檔案（僅 *.md 變更？）。審查閘門視為通過。');
    process.exit(0);
  }

  const paths = files.map((f) => f.path);
  const rl = sh('ocr', ['delegate', 'rule', '-f', 'json', ...paths], { maxBuffer: 64 * 1024 * 1024 });
  let groups = [];
  if (rl.status === 0) {
    try {
      groups = JSON.parse(rl.stdout).groups ?? [];
    } catch {
      console.error('ocr delegate rule 輸出不是 JSON，規則段落改以未解析文字放入審查包。');
      groups = [{ group_id: 0, source: 'unparsed', pattern: '**', files: paths, rule: rl.stdout.slice(0, 30000) }];
    }
  } else {
    console.error('ocr delegate rule 失敗（' + (rl.stderr ?? '').trim() + '），繼續出包但不帶規則。');
  }

  const statusMap = new Map(dirty.split('\n').map((l) => [l.slice(3), l.slice(0, 2)]));
  const pkg = {
    schema_version: 1,
    station,
    background,
    mode: preview.mode,
    files: [],
    rules: groups,
  };
  for (const f of files) {
    const st = statusMap.get(f.path) ?? '';
    if (st.includes('?')) {
      pkg.files.push({ ...f, status: st, full_content: readFileSync(f.path, 'utf8') });
    } else {
      const d = sh('git', ['diff', 'HEAD', '--', f.path], { maxBuffer: 64 * 1024 * 1024 });
      pkg.files.push({ ...f, status: st, diff: d.stdout });
    }
  }

  const dir = mkdtempSync(join(tmpdir(), 'ocr-delegate-'));
  const pkgFile = join(dir, 'review-package.json');
  writeFileSync(pkgFile, JSON.stringify(pkg, null, 2));
  console.log(`審查包：${files.length} 個檔案（+${preview.total_insertions ?? '?'}／−${preview.total_deletions ?? '?'}）、規則 ${groups.length} 組`);
  console.log(`完整審查包：${pkgFile}`);
  console.log('下一步：host agent 逐檔審查（委託模式意見格式：path／content／severity／category…），');
  console.log('意見寫成 JSON，再跑本腳本：node scripts/station-review.mjs --comments <意見檔> 進閘門。');
  process.exit(0);
}

// ── Phase 2b：意見 JSON 閘門 ──────────────────────────────
console.log('── Phase 2: 意見 JSON 閘門 ──');
if (!existsSync(commentsFile)) {
  console.error(`意見檔不存在：${commentsFile}`);
  process.exit(1);
}
let data;
try {
  data = JSON.parse(readFileSync(commentsFile, 'utf8'));
} catch {
  console.error(`意見檔不是 JSON：${commentsFile}`);
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
console.log(`審查完畢：${comments.length} 條意見`);
console.log(`  critical ${buckets.critical.length}｜high ${buckets.high.length}｜medium ${buckets.medium.length}｜low ${buckets.low.length}`);

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
