/**
 * DEMO 模擬腳本（§19.5）——調數值用的可重現量測工具，**不是遊戲機制**。
 *
 * 用法：
 *   node tools/demo-sim.mjs                跑 100 段、印指標、與快照印 diff
 *   node tools/demo-sim.mjs --runs 200     加樣本
 *   node tools/demo-sim.mjs --update       跑完把指標寫回 snapshots/demo.json
 *   npm run sim:demo / sim:demo:update     package.json 的同一條入口
 *
 * 驅動與 `tests/regression/demo.mjs` 同一顆：harness 的自動駕駛玩家（§19.3 的
 * 「驗證重點」量在同一條 DEMO 路線上），常數全匯入（`DEMO_YEARS`／`DEMO_END_YEAR`／
 * `DEMO_MONTHS`）不手抄——資料改了這裡自動跟。
 *
 * ⚠ **機制或資料更動時，這個腳本與 `snapshots/demo.json` 要一併改**（`.opencodereview/rule.json`
 * 的 `src/data/**` 單一來源規則）：快照只是 before/after 對照基線，一般執行只印 diff 不硬紅；斷言
 * 的活由 `npm test` 的 `tests/regression/tools-sim.mjs`（端到端）與 `demo.mjs`
 * （分布）守。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { playMatrix } from '../tests/lib/harness.mjs';
import { createState } from '../src/engine/state.js';
import { coachRating } from '../src/engine/attributes.js';
import { DEMO_MONTHS } from '../src/engine/demo.js';
import { DEMO_END_YEAR, DEMO_YEARS, START_YEAR } from '../src/data/eras.js';
import { ROLES } from '../src/data/skills.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
export const SNAPSHOT_PATH = join(ROOT, '..', 'snapshots', 'demo.json');

const mean = (a) => (a.length ? a.reduce((t, v) => t + v, 0) / a.length : 0);
const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const round1 = (v) => Math.round(v * 10) / 10;

/**
 * 跑一批 DEMO（PRO 起點、三年期程）生涯，收回純量指標。不做 IO、不做斷言——
 * IO 在 CLI、斷言在 `tests/regression/tools-sim.mjs`。
 *
 * `runs` 是目標段數：實際段數＝種子數 × 位置 × 打法，種子數反推後取整，所以
 * 實跑數就近（100 → 10 種子 × 5 位置 × 2 打法，恰好 100）。
 */
export function simulate({ runs = 100, seedPrefix = 'demo', roles = ROLES, styles = ['focus', 'spread'] } = {}) {
  const perSeed = Math.max(1, roles.length * styles.length);
  const seedCount = Math.max(1, Math.round(runs / perSeed));
  const seeds = Array.from({ length: seedCount }, (_, i) => `${seedPrefix}-${i}`);

  const matrix = playMatrix({ seeds, roles, styles, stage: 'PRO' });

  const starts = [];
  const peaks = [];
  const months = [];
  const reasons = {};
  let survivedFirstYear = 0;
  let expired = 0;
  let doneCount = 0;
  let honorsTotal = 0;
  for (const { state, role, seed, beatTypes } of matrix) {
    starts.push(coachRating(createState({ name: 'SIM', role, seed, stage: 'PRO' })));
    peaks.push(state.peakRating);
    months.push(beatTypes.month || 0);
    honorsTotal += state.honors.length;
    if (state.done) doneCount++;
    if (state.year > START_YEAR) survivedFirstYear++;
    if (state.demoEnded) expired++;
    else reasons[state.retireReason] = (reasons[state.retireReason] || 0) + 1;
  }

  const metrics = {
    runs: matrix.length,
    doneCount,
    firstYearSurvived: survivedFirstYear,
    expired,
    early: matrix.length - expired,
    monthsMin: Math.min(...months),
    monthsMax: Math.max(...months),
    monthsMean: round1(mean(months)),
    startOvrMean: round1(mean(starts)),
    startOvrP10: quant(starts, 0.1),
    startOvrP90: quant(starts, 0.9),
    peakOvrMean: round1(mean(peaks)),
    peakOvrP10: quant(peaks, 0.1),
    peakOvrP90: quant(peaks, 0.9),
    honorsMean: round1(honorsTotal / matrix.length),
    reasons,
  };
  return { metrics, runs: matrix };
}

/** 把 metrics 印成人讀得懂的行 */
export function formatReport(metrics) {
  const lines = [];
  lines.push(`DEMO 模擬：${metrics.runs} 段（PRO 起點・${DEMO_YEARS} 年 ${DEMO_MONTHS} 個月・終點 ${DEMO_END_YEAR}）`);
  lines.push(`全部跑完 ${metrics.doneCount}/${metrics.runs}`);
  lines.push(`第一年存活 ${metrics.firstYearSurvived}/${metrics.runs}`);
  lines.push(`期滿收束 ${metrics.expired}/${metrics.runs}｜提早結局 ${metrics.early}/${metrics.runs}`);
  lines.push(`月份 ${metrics.monthsMin}–${metrics.monthsMax}（平均 ${metrics.monthsMean}，上限 ${DEMO_MONTHS}）`);
  lines.push(`起始評價：平均 ${metrics.startOvrMean}（p10 ${metrics.startOvrP10}／p90 ${metrics.startOvrP90}）`);
  lines.push(`巔峰評價：平均 ${metrics.peakOvrMean}（p10 ${metrics.peakOvrP10}／p90 ${metrics.peakOvrP90}）`);
  lines.push(`榮譽：平均 ${metrics.honorsMean} 項`);
  for (const [reason, n] of Object.entries(metrics.reasons).sort((a, b) => b[1] - a[1])) {
    lines.push(`  提早結局 ${n} 段：${reason}`);
  }
  return lines;
}

export async function loadSnapshot(path = SNAPSHOT_PATH) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 與快照的數值 diff（只比數值鍵）。基線不同（runs／seedPrefix 不一致）只警告不擋——
 * 快照是對照基線不是斷言，硬紅的職責在 `tests/regression/`。
 */
export function diffWithSnapshot(metrics, snapshot, { seedPrefix = 'demo' } = {}) {
  if (!snapshot) return ['（尚無快照：node tools/demo-sim.mjs --update 落地第一顆）'];
  const lines = [];
  if (snapshot.meta?.runs !== metrics.runs || snapshot.meta?.seedPrefix !== seedPrefix) {
    lines.push(`⚠ 快照基線不同（runs ${snapshot.meta?.runs} vs ${metrics.runs}`
      + `、seedPrefix ${snapshot.meta?.seedPrefix} vs ${seedPrefix}），diff 僅供參考`);
  }
  const base = snapshot.metrics || {};
  let changed = false;
  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value !== 'number') continue;
    if (!(key in base)) { lines.push(`+ ${key}：${value}（快照無此鍵）`); changed = true; continue; }
    const delta = Math.round((value - base[key]) * 10) / 10;
    if (delta === 0) continue;
    lines.push(`${delta > 0 ? '↑' : '↓'} ${key}：${base[key]} → ${value}（${delta > 0 ? '+' : ''}${delta}）`);
    changed = true;
  }
  if (!changed) lines.push('與快照完全一致');
  return lines;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  const update = argv.includes('--update');
  const opts = {
    runs: Number(flag('runs', '100')),
    seedPrefix: flag('seed-prefix', 'demo'),
    roles: flag('roles', ROLES.join(',')).split(',').map((s) => s.trim()).filter(Boolean),
    styles: flag('style', 'focus,spread').split(',').map((s) => s.trim()).filter(Boolean),
  };
  const { metrics } = simulate(opts);
  for (const line of formatReport(metrics)) console.log(line);

  if (update) {
    const snapshot = {
      meta: {
        tool: 'demo-sim',
        date: new Date().toISOString().slice(0, 10),
        runs: metrics.runs,
        seedPrefix: opts.seedPrefix,
        roles: opts.roles.join(','),
        styles: opts.styles.join(','),
        demoYears: DEMO_YEARS,
        demoEndYear: DEMO_END_YEAR,
      },
      metrics,
    };
    await mkdir(dirname(SNAPSHOT_PATH), { recursive: true });
    await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`快照已寫入 snapshots/demo.json（${metrics.runs} 段）`);
  } else {
    const snapshot = await loadSnapshot();
    if (snapshot) {
      console.log('');
      console.log('與快照（snapshots/demo.json）的 diff：');
      for (const line of diffWithSnapshot(metrics, snapshot, { seedPrefix: opts.seedPrefix })) {
        console.log(`  ${line}`);
      }
    }
  }
}
