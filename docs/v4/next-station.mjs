#!/usr/bin/env node
/**
 * 動工解析器：讀 `docs/v4/README.md` 的狀態表，找出下一個該做的站。
 *
 * 這是「動工」機制的確定性核心——不靠模型記憶，直接解析狀態表本身。
 * 輸出預設是人讀摘要，`--json` 輸出機器可讀；解析失敗**大聲失敗**（exit 1），
 * 不默默跳過——README 格式一漂移（加欄、改狀態詞彙、加了站卻漏前置）立刻被抓到，
 * 逼著與 README 一起更新（見 AGENTS.md 收尾流程）。
 *
 * 用法：
 *   node docs/v4/next-station.mjs          # 人讀摘要
 *   node docs/v4/next-station.mjs --json   # 機器可讀 JSON
 *
 * exit code：
 *   0  有下一站（或可續做的進行中站）
 *   2  全部做完（沒有未開始且已解鎖的站）
 *   1  解析／完整性錯誤（大聲失敗）
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const readmePath = join(here, 'README.md');

function fail(msg) {
  console.error(`next-station: ${msg}`);
  process.exit(1);
}

/** 一行表格切回 cell 陣列（去掉首尾空 cell 與 `|`）。 */
function cells(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((s) => s.trim());
}

function parseStatus(raw) {
  if (raw.includes('完成')) return 'done';
  if (raw.includes('進行中')) return 'in-progress';
  if (raw.includes('未開始')) return 'not-started';
  return null;
}

function parse() {
  const text = readFileSync(readmePath, 'utf8');
  const stations = []; // 依文件順序
  const seen = new Set();

  for (const line of text.split('\n')) {
    // 只有第一欄是 `[Sxx](xx.md)` 連結的列才算站列；避開 v4.x 衝擊表與散文
    if (!/^\s*\|?\s*\[S\d+[a-z]*\]\([^)]*\)\s*\|/.test(line)) continue;

    const c = cells(line);
    const link = c[0];           // [S14](14-月回合制.md)
    const name = c[1] || '';
    const statusRaw = c[2] || '';
    const prereqRaw = c[3] || '';
    const difficulty = c[4] || '';
    const model = c[5] || '';

    const idMatch = link.match(/\[(S\d+[a-z]*)\]/);
    const docMatch = link.match(/\]\(([^)]+)\)/);
    if (!idMatch) fail(`無法解析站連結「${link}」`);
    const id = idMatch[1];
    if (seen.has(id)) fail(`站 id 重複：${id}`);
    seen.add(id);

    const status = parseStatus(statusRaw);
    if (!status) fail(`站 ${id} 的狀態「${statusRaw}」無法辨識（應為 完成／未開始／進行中）`);

    const prereqs = prereqRaw === '—' || prereqRaw === '-' || prereqRaw === ''
      ? []
      : prereqRaw.split(/\s+/).filter(Boolean);

    stations.push({
      id,
      name: name.replace(/\*\*/g, ''),
      doc: docMatch ? docMatch[1] : null,
      status,
      prereqs,
      difficulty,
      model,
    });
  }

  if (stations.length === 0) fail('沒解析到任何站列——狀態表格式可能漂移了');

  const byId = new Map(stations.map((s) => [s.id, s]));

  // 完整性檢查：前置必須指向已知站
  for (const s of stations) {
    for (const p of s.prereqs) {
      if (!byId.has(p)) fail(`站 ${s.id} 的前置「${p}」在狀態表裡找不到`);
    }
  }

  const done = new Set(stations.filter((s) => s.status === 'done').map((s) => s.id));
  const inProgress = stations.filter((s) => s.status === 'in-progress');

  const notStarted = stations.filter((s) => s.status === 'not-started');
  const available = notStarted.filter((s) => s.prereqs.every((p) => done.has(p)));
  const blocked = notStarted.filter((s) => !s.prereqs.every((p) => done.has(p)));

  return {
    total: stations.length,
    done: stations.filter((s) => s.status === 'done').map((s) => s.id),
    inProgress,
    next: available[0] ?? null,
    available,
    blocked: blocked.map((s) => ({
      id: s.id,
      name: s.name,
      missing: s.prereqs.filter((p) => !done.has(p)),
    })),
  };
}

function brief(s) {
  return `${s.id} ${s.name}（${s.difficulty || '?'} · ${s.model || '?'}）`;
}

const data = parse();
const json = process.argv.includes('--json');

if (json) {
  console.log(JSON.stringify(data, null, 2));
} else {
  console.log(`完成 ${data.done.length}／${data.total} 站。`);

  if (data.inProgress.length > 0) {
    console.log('\n進行中（該續做，交接筆記已回填）：');
    for (const s of data.inProgress) console.log(`  ${brief(s)}`);
  }

  if (data.next) {
    console.log('\n下一站：');
    console.log(`  ${brief(data.next)}`);
    console.log(`  說明書：docs/v4/${data.next.doc}`);
    console.log(`  前置：${data.next.prereqs.length ? data.next.prereqs.join(' ') : '—'}`);
    console.log(`  ⚠ 建議模型：${data.next.model || '?'}（難度 ${data.next.difficulty || '?'}）——開工前先切換`);
  }

  const others = data.available.filter((s) => s !== data.next);
  if (others.length > 0) {
    console.log('\n可並行的已解鎖站（非關鍵路徑，可開分會話做；每項附難度＋建議模型，選它就照那個模型切換）：');
    for (const s of others) console.log(`  ${brief(s)}`);
  }

  if (data.blocked.length > 0) {
    console.log('\n被封鎖（前置未完成）：');
    for (const b of data.blocked) {
      console.log(`  ${b.id} ${b.name}　缺 ${b.missing.join(' ')}`);
    }
  }

  if (!data.next && data.inProgress.length === 0) {
    console.log('\n全部做完。');
  }
}

process.exit(data.next || data.inProgress.length > 0 ? 0 : 2);
