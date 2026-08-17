#!/usr/bin/env node
/**
 * S26 母體百分位 · 生成器。
 *
 * 讀 `tools/npc/cleaned_players.json`（S25 產物），產出
 * `src/data/npc/percentiles.js`——§14.3 兩條 route 路線的靜態門檻表
 * （究極綠葉「助攻 P90」、網紅選手「peakRating 中位數」）。
 *
 * 母體定義（§23.5 定案，S26 照做）：
 *
 *   - 究極綠葉：`cleaned` **同位置**全部有助攻紀錄的選手，不分年代不分賽區；
 *     門檻＝該位置生涯場均助攻 **P90**。⚠ 本環境的 `cleaned_players.json`
 *     沒有任何助攻欄位（S25 只解析名次，Liquipedia 選手頁無 KDA 統計），
 *     所以每位置樣本＝0 < 100 → **全位置 fallback**，表內保留現行絕對門檻
 *     2.5（§23.5 最小樣本規則）。
 *   - 網紅選手：`cleaned` 全部可回歸出 peakRating 的選手，不分位置；
 *     門檻＝母體 **P50**（中位數）。peakRating 由「名次 → par 框架」回歸
 *     得出（§23.3 指派 S26 定回歸目標與係數，S27 照寫）。
 *
 * 回歸錨點（§23.3 原文示意）：
 *   世界賽冠軍 ≈ LCK par 級（LCK par 76，§17.2）、四強 ≈ 主場 par+4.5 級
 *   （主場 par 66 → 70.5）。下方 `RATING_BY_EVENT`／`FINISH_OFFSET` 即 S26
 *   定案，S27 生成 NPC `peak.rating` 時照同一張表（單一來源規則）。
 *
 * 用法：
 *   node gen-percentiles.mjs          # 重算並覆寫 src/data/npc/percentiles.js
 *
 * 重跑冪等：只讀 cleaned_players.json，輸出單一檔案。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLEANED = path.join(HERE, 'cleaned_players.json');
const OUT = path.join(HERE, '..', '..', 'src', 'data', 'npc', 'percentiles.js');

/** 位置枚舉（與遊戲同一套） */
const ROLES = ['TOP', 'JGL', 'MID', 'ADC', 'SUP'];

/** 現行絕對門檻（§23.5：母體 < 100 時保留） */
const FALLBACK_ASSIST = 2.5;

/** 事件層級 → 該層級奪冠的 peakRating 基準（S26 定案，S27 照寫） */
const RATING_BY_EVENT = {
  worlds: 76,   // 世界賽冠軍 ≈ LCK par 級（§23.3 錨點）
  msi: 75,      // MSI 冠軍略低於世界賽
  LCK: 76, LPL: 76, KR: 76,   // 頂級賽區例行第一（champion 鍵＝例行第一，S25 交接）
  LEC: 70, LCS: 70,           // 次級賽區
  PCS: 66,                    // 主場賽區
};

/** 名次 → 相對該層級基準的偏移（champion = 0，越差越扣） */
const FINISH_OFFSET = {
  champion: 0, final: -2, semi: -4, quarter: -6, stage: -8, playin: -10, out: -10,
};

/** 事件強度序位（生涯最佳名次取「最高層級＋最好名次」） */
const EVENT_RANK = { worlds: 1, msi: 2, LCK: 3, LPL: 3, KR: 3, LEC: 4, LCS: 4, PCS: 5 };

/** 生涯最佳名次（單一來源：peak 的 rating 與 year 都過這份排序，不分開各算一份） */
export function bestFinishOf(player) {
  let best = null;
  for (const c of player.career || []) {
    for (const f of c.finishes || []) {
      const er = EVENT_RANK[f.event] ?? 9;
      const off = FINISH_OFFSET[f.finish];
      if (off === undefined) continue;
      const score = er * 100 + (off + 100);
      if (!best || score < best.score) {
        best = { score, event: f.event, finish: f.finish, year: f.year };
      }
    }
  }
  return best;
}

/** 由生涯 finishes 回歸該選手 peakRating（生涯最佳名次） */
export function peakRatingOf(player) {
  const best = bestFinishOf(player);
  if (!best) return null;
  const base = RATING_BY_EVENT[best.event];
  if (base === undefined) return null;
  return Math.max(55, base + (FINISH_OFFSET[best.finish] ?? -10));
}

function quantile(sorted, p) {
  return sorted[Math.floor(sorted.length * p)];
}

/**
 * 由 cleaned 選手陣列重算百分位表。純函式，測試用它與
 * `src/data/npc/percentiles.js` 對比（單一來源規則：percentiles.js 必須
 * 過這份計算的實際運算式，不得手抄）。
 */
export function computePercentiles(players) {
  const assist = {};
  for (const role of ROLES) {
    assist[role] = { p90: FALLBACK_ASSIST, fallback: true, sample: 0 };
  }
  const ratings = [];
  for (const p of players) {
    const v = peakRatingOf(p);
    if (v != null) ratings.push(v);
  }
  ratings.sort((a, b) => a - b);
  return {
    assist,
    peakRating: {
      p50: ratings.length ? quantile(ratings, 0.5) : FALLBACK_ASSIST,
      fallback: ratings.length < 100,
      sample: ratings.length,
    },
  };
}

function main() {
  const cleaned = JSON.parse(readFileSync(CLEANED, 'utf8'));
  const players = cleaned.players || [];
  const { assist, peakRating } = computePercentiles(players);

  const lines = [
    '/**',
    ' * NPC 母體百分位表（§14.3 兩條 route 路線的靜態門檻）——由',
    ' * `tools/npc/gen-percentiles.mjs` 產出，勿手改。',
    ' * 來源：Liquipedia（主源，CC BY-SA 3.0）、Leaguepedia（備援，CC BY-SA 3.0）。',
    ' * 母體定義與回歸錨點見 §23.5／§23.3（S26 定案）。',
    ' */',
    '',
    '/**',
    ` * 生涯場均助攻 P90 門檻（同位置全年代母體）。cleaned 目前無助攻欄位，`,
    ` * 每位置樣本 0 → 全 fallback，保留現行絕對門檻 ${FALLBACK_ASSIST}（§23.5）。`,
    ' * 百分位切換由 S30 視樣本狀況執行。',
    ' */',
    'export const ASSIST_P90 = {',
  ];
  for (const role of ROLES) {
    lines.push(`  ${role}: { p90: ${assist[role].p90}, fallback: ${assist[role].fallback}, sample: ${assist[role].sample} },`);
  }
  lines.push('};', '', '/**');
  lines.push(' * 歷史母體 peakRating 中位數（全部可回歸選手，不分位置）。');
  lines.push(' * 網紅選手門檻：玩家 peakRating ≤ 此值。');
  lines.push(' */');
  lines.push(`export const PEAK_RATING_P50 = { p50: ${peakRating.p50}, fallback: ${peakRating.fallback}, sample: ${peakRating.sample} };`);
  lines.push('', '/** percentile 節點的指標名（conditions.js 與 tools/schema.js 共用，單一來源） */');
  lines.push("export const PERCENTILE_METRICS = ['assist', 'peakRating'];");
  lines.push('');

  writeFileSync(OUT, lines.join('\n'));
  console.log(`已寫出 src/data/npc/percentiles.js`);
  console.log(`  助攻：${ROLES.join('/')} 全 fallback（樣本 0，門檻 ${FALLBACK_ASSIST}）`);
  console.log(`  peakRating P50 = ${peakRating.p50}（樣本 ${peakRating.sample}${peakRating.fallback ? '，fallback' : ''}）`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
