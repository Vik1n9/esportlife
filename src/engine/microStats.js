/**
 * NPC 微觀數據生成與個人數據榜（§24.2.3／§24.2.4，S33 落地）。
 *
 * S32 的賽區背景模擬只結算勝負，聯賽數據撐不起排行榜與 §24.3 的動態基準。這裡把
 * 單局詳細數據（K/D/A、DPM、CSM、VSPM）算出來，六維嚴格綁定 NPC 的 tec/agi/awr
 * 三屬性與位置權重表（S31 定案，本站照做——判斷點在分布真不真實，不是公式怎麼定）。
 *
 * 調參紀律（§24.2.4）：分布不對只動 σM／權重表／局型修正三樣，**不動**
 * `STAT_BASELINE` 與夾取界——基線表與玩家端共用，動了連玩家側校準一起漂。
 */
import { clamp } from '../core/rng.js';
import { STAT_BASELINE, TEAM_DPM_TOTAL } from '../data/skills.js';

/** 位置權重表（§24.2.3）：位置身分鐵則同款長法——輔助的擊殺／CS 權重低到幾乎沒意義 */
export const MICRO_WEIGHTS = {
  TOP: { wK: 0.9, wD: 0.8, wA: 0.5, wCS: 1.0 },
  JG:  { wK: 0.8, wD: 0.9, wA: 0.8, wCS: 0.8 },
  MID: { wK: 1.0, wD: 0.8, wA: 0.6, wCS: 1.0 },
  ADC: { wK: 1.2, wD: 0.7, wA: 0.4, wCS: 1.2 },
  SUP: { wK: 0.3, wD: 0.7, wA: 1.4, wCS: 0.2 },
};

const DPM_SCALE = TEAM_DPM_TOTAL / 100;   // §24.2.3：DPM ＝ 傷害佔比% × 24

/** 夾取界（單局，§24.2.3）——非評價量，不套 §17.2 的 ÷1.25 */
const CLAMPS = {
  K: [0, 15], D: [0, 12], A: [0, 25], DPM: [150, 1200], CSM: [0.5, 12], VSPM: [0.2, 4],
};

/** 屬性項用超過 60 的餘量（§24.2.3）：弱選手不產出負修正，只讓強選手拉開 */
const over60 = (x) => Math.max(0, x - 60);

/**
 * 局型識別與方差級距（§24.2.4）。`deltaAbs` 是**夾取前**的宏觀強度差，`weakSideWon`
 * 是這一局強度較低那一方有沒有贏這一局——逐局 gauss 擺動只進勝負判定，不進局型識別。
 * `intl` 是不是國際賽對局（Global_Boss 對手），σM 再乘 1.25（S35 消費）。
 */
export function gameTypeOf(deltaAbs, weakSideWon, intl = false) {
  let sigmaM = 1.0;
  let winMod = { K: 1, D: 1, DPM: 1 };
  let loseMod = { K: 1, D: 1, DPM: 1 };
  if (deltaAbs >= 8) {
    sigmaM = 1.3;
    winMod = { K: 1.3, D: 0.7, DPM: 1.2 };
    loseMod = { K: 0.7, D: 1.4, DPM: 0.8 };
  } else if (deltaAbs < 3 && weakSideWon) {
    sigmaM = 1.5;   // 爆冷局：只放大方差，勝負修正不變
  }
  return { sigmaM: sigmaM * (intl ? 1.25 : 1), winMod, loseMod };
}

/**
 * 單一 NPC 單局微觀數據（§24.2.3 公式）。`player` 需帶 `position`／`tec`／`agi`／`awr`；
 * `mods` 是 `gameTypeOf` 算出的 `winMod` 或 `loseMod`，依這一局有沒有贏挑一份。
 */
export function generateMicroStats(rng, player, sigmaM, mods) {
  const base = STAT_BASELINE[player.position];
  const w = MICRO_WEIGHTS[player.position];
  const tec = over60(player.tec);
  const agi = over60(player.agi);
  const awr = over60(player.awr);

  let K = base.K * (1 + tec * 0.010 * w.wK) + rng.gauss(0.6 * sigmaM);
  let D = base.D * (1 - agi * 0.008 * w.wD) + rng.gauss(0.5 * sigmaM);
  const A = base.A * (1 + awr * 0.006 * w.wA + tec * 0.003) + rng.gauss(0.9 * sigmaM);
  let DPM = base.DMG * DPM_SCALE * (1 + tec * 0.006 * w.wK) + rng.gauss(60 * sigmaM);
  const CSM = base.CS * (1 + tec * 0.004 * w.wCS) + rng.gauss(0.5 * sigmaM);
  const VSPM = base.VIS * (1 + awr * 0.008) + rng.gauss(0.15 * sigmaM);

  K *= mods.K; D *= mods.D; DPM *= mods.DPM;

  return {
    K: clamp(K, ...CLAMPS.K),
    D: clamp(D, ...CLAMPS.D),
    A: clamp(A, ...CLAMPS.A),
    DPM: clamp(DPM, ...CLAMPS.DPM),
    CSM: clamp(CSM, ...CLAMPS.CSM),
    VSPM: clamp(VSPM, ...CLAMPS.VSPM),
  };
}

/**
 * 累加進 §24.2.2 的 `stats` 池：只存匯總（逐選手逐賽段累計＋場次），場均值讀取時
 * 才除——存半成品的平均值會在多次累加後累積捨入誤差，總量＋場次才是精確的匯總。
 *
 * `games`／`totals` 是**已經橫跨 N 場的總量**（S34：玩家一次寫入一批常規賽或一輪
 * 系列賽，不像 NPC 逐局呼叫）——與 `accumulateMicroStats`（NPC，逐局呼叫、
 * `games` 恆為 1）共用同一份累加邏輯，不另開一份。
 */
export function accumulateMicroTotals(stats, playerId, position, games, totals) {
  if (!games) return;
  const row = stats[playerId] || (stats[playerId] = {
    role: position, G: 0, K: 0, D: 0, A: 0, DPM: 0, CSM: 0, VSPM: 0,
  });
  row.G += games;
  row.K += totals.K; row.D += totals.D; row.A += totals.A;
  row.DPM += totals.DPM; row.CSM += totals.CSM; row.VSPM += totals.VSPM;
}

/** NPC 逐局呼叫的單場版本（§24.2.3）：games 恆為 1，走同一份累加邏輯。 */
export function accumulateMicroStats(stats, playerId, position, s) {
  accumulateMicroTotals(stats, playerId, position, 1, s);
}

/**
 * 單一維度的場均值。`metric === 'KDA'` 用 `(ΣK+ΣA)/max(1,ΣD)`（總量比），
 * 不對逐場 KDA 先取平均再平均——後者在死亡數小的場次會過度放大單場離群值。
 */
export function metricAverage(row, metric) {
  if (!row || !row.G) return 0;
  if (metric === 'KDA') return (row.K + row.A) / Math.max(1, row.D);
  return row[metric] / row.G;
}

/**
 * 個人數據榜：某賽段某位置依某維度取前 n 名。唯讀查詢端，不得直接戳 `stats`
 * （與 `standingsFor`／`playerRank` 同款界線）。
 */
export function leaderboard(stats, position, metric, n = 5) {
  if (!stats) return [];
  return Object.entries(stats)
    .filter(([, row]) => row.role === position && row.G > 0)
    .map(([id, row]) => ({ id, G: row.G, value: metricAverage(row, metric) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}
