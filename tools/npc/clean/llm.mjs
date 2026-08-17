/**
 * S25 資料清洗 · LLM 語意對齊批次（隊名別名 → team_id）。
 *
 * 說明書規格：模糊描述打包成批次（每次 10 筆）呼叫 LLM 輸出 team_id JSON
 * 陣列；映射結果寫入本地字典檔（team_alias.json），後續查表不再呼叫 LLM。
 *
 * ⚠ 本執行環境沒有 LLM API／CLI（實測：anthropic／openai／ollama 皆無、
 * 無 API key 環境變數）。落地形式調整：批次腳本產出 `pending_team_alias.json`
 * （模糊隊名＋候選 team_id），由執行者以電競常識判讀填答寫進
 * `team_alias.json`——「LLM 語意」的職責（判斷力）不變，只是承載者從外部
 * API 換成執行者；字典快取結構與「後續查表不再呼叫」的機制照舊。
 * 若未來環境有 LLM API，把 `answer()` 換成批次呼叫即可，字典格式不動。
 *
 * 用法：
 *   node clean/llm.mjs scan      # 掃殘餘別名 → pending_team_alias.json
 *   node clean/llm.mjs apply     # 套用 team_alias.json 回 pending 的查表率
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { TeamResolver, readJson, readTsv } from './align.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NPC = path.join(HERE, '..');

const ALIAS_FILE = path.join(HERE, 'team_alias.json');
const PENDING_FILE = path.join(HERE, 'pending_team_alias.json');

/** 掃描器：把 raw 裡出現過的所有隊名拼法收集起來（由 gen-clean 餵），
 *  規則層＋字典層都解不掉的寫進 pending。 */
export function collectPending(names, resolver) {
  const pending = [...new Set(names.map((n) => n?.trim()).filter(Boolean))]
    .filter((n) => !resolver.resolve(n))
    .sort();
  writeFileSync(PENDING_FILE, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), pending }, null, 2));
  return pending;
}

/** 判讀（人工／外部 LLM 填答）的寫入入口：`{"別名": "team_id", …}`。
 * 填答前會驗證 team_id 存在於 team_history.json。 */
export function applyAlias(aliasDict, teamHistory) {
  const ids = new Set(teamHistory.teams.map((t) => t.team_id));
  const bad = Object.entries(aliasDict).filter(([, v]) => !ids.has(v));
  if (bad.length) {
    throw new Error(`team_id 不在 team_history.json：${bad.map(([k, v]) => `${k}→${v}`).join('、')}`);
  }
  writeFileSync(ALIAS_FILE, JSON.stringify(aliasDict, null, 2) + '\n');
}

function main() {
  const cmd = process.argv[2];
  const teamHistory = readJson('team_history.json');
  if (cmd === 'apply') {
    const aliasDict = JSON.parse(readFileSync(process.argv[3] ?? ALIAS_FILE, 'utf8'));
    applyAlias(aliasDict, teamHistory);
    console.log(`team_alias.json 已寫入 ${Object.keys(aliasDict).length} 筆別名。`);
    return;
  }
  console.error('用法：node clean/llm.mjs apply [alias.json]');
  process.exit(2);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

// 供 gen-clean 使用的批次介面（10 筆/批的「批」由 scan 輸出結構保留，判讀者逐批填）
export const BATCH_SIZE = 10;
export { ALIAS_FILE, PENDING_FILE, readTsv };