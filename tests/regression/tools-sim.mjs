/**
 * 工具守門：`tools/demo-sim.mjs` 端到端跑完整 DEMO（§19.5）。
 *
 * 這個 suite 守的不是平衡分布（那是 `demo.mjs` 的活），是「腳本本身還活著」：
 * 機制或資料更動之後，`simulate()` 必須還能把 10 段 PRO 起點的三年期程**完整**
 * 跑到收束——跑不動、收束不自洽，`npm test` 當場紅，逼出「改機制要一併改腳本」
 * 的同步義務（快照的更新則是人工步驟：`npm run sim:demo:update`）。
 *
 * ⚠ 10 段＝1 種子 × 5 位置 × 2 打法，是「端到端跑完整個 demo」的最小樣本；
 * 量分布的樣本數在 `demo.mjs`（100 段），不要在這裡疊。
 */
import { simulate } from '../../tools/demo-sim.mjs';
import { DEMO_MONTHS } from '../../src/engine/demo.js';
import { DEMO_END_YEAR } from '../../src/data/eras.js';

export const name = 'DEMO 模擬腳本端到端';
export const order = 60;

export async function run({ check, log }) {
  const { metrics, runs } = simulate({ runs: 10, seedPrefix: 'sim-gate' });

  check('模擬段數符合目標（10 段）', metrics.runs === 10, `${metrics.runs}`);
  check('10 段全部跑到收束（done）', metrics.doneCount === metrics.runs, `${metrics.doneCount}/${metrics.runs}`);
  check('期滿＋提早＝總段數', metrics.expired + metrics.early === metrics.runs,
    `${metrics.expired}+${metrics.early}/${metrics.runs}`);

  check('沒有一段跑超過 36 個月', runs.every((r) => (r.beatTypes.month || 0) <= DEMO_MONTHS),
    `最多 ${Math.max(...runs.map((r) => r.beatTypes.month || 0))}`);
  check('沒有一段跑過 DEMO 終點年', runs.every((r) => r.state.year <= DEMO_END_YEAR),
    runs.filter((r) => r.state.year > DEMO_END_YEAR).map((r) => `${r.seed}/${r.role}@${r.state.year}`).join(',') || 'ok');

  const expired = runs.filter((r) => r.state.demoEnded);
  const early = runs.filter((r) => !r.state.demoEnded);
  check('期滿段跑滿 36 個月整、無退役原因', expired.every((r) => (r.beatTypes.month || 0) === DEMO_MONTHS && !r.state.retireReason),
    expired.map((r) => `${r.beatTypes.month}`).join(',') || '無期滿段');
  check('提早結局段都有退役原因、沒被標期滿', early.every((r) => !!r.state.retireReason && !r.state.demoEnded),
    early.filter((r) => !r.state.retireReason).map((r) => `${r.seed}/${r.role}`).join(',') || 'ok');

  const numberKeys = ['runs', 'doneCount', 'firstYearSurvived', 'expired', 'early',
    'monthsMin', 'monthsMax', 'monthsMean', 'startOvrMean', 'startOvrP10', 'startOvrP90',
    'peakOvrMean', 'peakOvrP10', 'peakOvrP90', 'honorsMean'];
  check('指標鍵齊備且為數值', numberKeys.every((k) => typeof metrics[k] === 'number'),
    numberKeys.filter((k) => typeof metrics[k] !== 'number').join(',') || 'ok');
  check('指標自洽：計數不負、月數不零、評價大於零', metrics.firstYearSurvived >= 0
    && metrics.monthsMin >= 1 && metrics.startOvrMean > 0 && metrics.peakOvrMean > 0,
    JSON.stringify({ firstYearSurvived: metrics.firstYearSurvived, monthsMin: metrics.monthsMin,
      startOvrMean: metrics.startOvrMean, peakOvrMean: metrics.peakOvrMean }));

  log(`端到端 10 段：期滿 ${metrics.expired}／提早 ${metrics.early}、月份 ${metrics.monthsMin}–${metrics.monthsMax}、`
    + `起始 ${metrics.startOvrMean}、巔峰 ${metrics.peakOvrMean}`);
}
