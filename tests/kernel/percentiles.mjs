/**
 * 母體百分位表（S26，§14.3／§23.5）。
 *
 * 兩條 route 路線（究極綠葉／網紅選手）改回百分位後的守門員：
 *
 *  1. **percentiles.js 過生成器實際運算式重算**（單一來源規則）——`percentiles.js`
 *     是 `tools/npc/gen-percentiles.mjs` 的產物，測試重跑同一份計算函式比對，
 *     不得手抄一份預期值（手抄只是把生成器的輸出抄第二遍）。
 *  2. **門檻值跨消費端一致**：引擎節點（conditions.js）、查詢層（ledger.js）、
 *     編輯器（tools/schema.js）讀的是同一份表——分開 import 反而各自手抄。
 *  3. **fallback 語意**：助攻母體樣本 0（cleaned 無助攻欄位）→ 全位置 fallback
 *     保留絕對門檻；peakRating 母體 679（>100）→ 非 fallback 用真中位數。
 */
import { readFileSync } from 'node:fs';
import { computePercentiles } from '../../tools/npc/gen-percentiles.mjs';
import { ASSIST_P90, PEAK_RATING_P50, PERCENTILE_METRICS } from '../../src/data/npc/percentiles.js';
import { assistP90, peakRatingP50 } from '../../src/engine/ledger.js';
import { COND_KINDS } from '../../src/engine/conditions.js';
import { COND_NODES, PREDICATES } from '../../tools/schema.js';
import { QUERIES } from '../../src/engine/conditions.js';
import { createState } from '../../src/engine/state.js';

export const name = '母體百分位表（S26）';

const CLEANED = new URL('../../tools/npc/cleaned_players.json', import.meta.url);

export async function run({ check }) {
  /* ---- 1. percentiles.js 過生成器實際運算式重算 ---- */
  const cleaned = JSON.parse(readFileSync(CLEANED, 'utf8'));
  const recomputed = computePercentiles(cleaned.players || []);

  check('ASSIST_P90 每個位置與生成器重算一致',
    Object.keys(ASSIST_P90).every((role) =>
      ASSIST_P90[role].p90 === recomputed.assist[role].p90
      && ASSIST_P90[role].fallback === recomputed.assist[role].fallback
      && ASSIST_P90[role].sample === recomputed.assist[role].sample),
    JSON.stringify(ASSIST_P90));

  check('PEAK_RATING_P50 與生成器重算一致',
    PEAK_RATING_P50.p50 === recomputed.peakRating.p50
    && PEAK_RATING_P50.fallback === recomputed.peakRating.fallback
    && PEAK_RATING_P50.sample === recomputed.peakRating.sample,
    JSON.stringify(PEAK_RATING_P50));

  /* ---- 2. 助攻母體樣本 0 → 全 fallback（cleaned 無助攻欄位） ---- */
  check('助攻母體樣本 0 → 每位置 fallback 保留絕對門檻',
    Object.values(ASSIST_P90).every((e) => e.sample === 0 && e.fallback === true && e.p90 === 2.5),
    JSON.stringify(ASSIST_P90));

  /* ---- 3. peakRating 母體 679（>100）→ 非 fallback ---- */
  check('peakRating 母體樣本 ≥ 100 → 非 fallback',
    PEAK_RATING_P50.sample >= 100 && PEAK_RATING_P50.fallback === false,
    JSON.stringify(PEAK_RATING_P50));

  /* ---- 4. PERCENTILE_METRICS 是引擎節點與編輯器共用的單一來源 ---- */
  check('percentile 節點在 COND_KINDS（引擎）與 COND_NODES（編輯器）都註冊',
    COND_KINDS.includes('percentile') && COND_NODES.includes('percentile'));

  /* ---- 5. 查詢層讀同一份表（assistP90 依位置、peakRatingP50 不分位置） ---- */
  {
    const s = createState({ name: 'P', role: 'MID', seed: 'percentile-query' });
    check('assistP90 讀玩家位置門檻', assistP90(s) === ASSIST_P90.MID.p90, `${assistP90(s)}`);
    check('peakRatingP50 不分位置', peakRatingP50() === PEAK_RATING_P50.p50, `${peakRatingP50()}`);
    s.role = 'SUP';
    check('assistP90 換位置跟著換', assistP90(s) === ASSIST_P90.SUP.p90, `${assistP90(s)}`);
  }

  /* ---- 6. percentile 節點要爆未知指標（與 conditions.mjs 互補） ---- */
  {
    const metricNames = PERCENTILE_METRICS;
    check('PERCENTILE_METRICS 列出 assist／peakRating',
      metricNames.includes('assist') && metricNames.includes('peakRating'),
      metricNames.join('／'));
    const schemaPredicates = PREDICATES;
    check('QUERIES 與 PREDICATES 維持同步（percentile 不走 stat 謂詞）',
      Object.keys(QUERIES).every((k) => schemaPredicates.includes(k)),
      '');
  }
}
