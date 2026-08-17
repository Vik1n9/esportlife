/**
 * NPC 母體百分位表（§14.3 兩條 route 路線的靜態門檻）——由
 * `tools/npc/gen-percentiles.mjs` 產出，勿手改。
 * 來源：Liquipedia（主源，CC BY-SA 3.0）、Leaguepedia（備援，CC BY-SA 3.0）。
 * 母體定義與回歸錨點見 §23.5／§23.3（S26 定案）。
 */

/**
 * 生涯場均助攻 P90 門檻（同位置全年代母體）。cleaned 目前無助攻欄位，
 * 每位置樣本 0 → 全 fallback，保留現行絕對門檻 2.5（§23.5）。
 * 百分位切換由 S30 視樣本狀況執行。
 */
export const ASSIST_P90 = {
  TOP: { p90: 2.5, fallback: true, sample: 0 },
  JGL: { p90: 2.5, fallback: true, sample: 0 },
  MID: { p90: 2.5, fallback: true, sample: 0 },
  ADC: { p90: 2.5, fallback: true, sample: 0 },
  SUP: { p90: 2.5, fallback: true, sample: 0 },
};

/**
 * 歷史母體 peakRating 中位數（全部可回歸選手，不分位置）。
 * 網紅選手門檻：玩家 peakRating ≤ 此值。
 */
export const PEAK_RATING_P50 = { p50: 68, fallback: false, sample: 679 };

/** percentile 節點的指標名（conditions.js 與 tools/schema.js 共用，單一來源） */
export const PERCENTILE_METRICS = ['assist', 'peakRating'];
