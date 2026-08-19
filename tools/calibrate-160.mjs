/**
 * 160 段校準量測腳本（S30，§23.4／§23.5／S14／S16 判準）——調常數用的可重現量測
 * 工具，**不是遊戲機制**（同 `demo-sim.mjs` 的定位，量的是 AMATEUR 基線路線）。
 *
 * 用法：
 *   node tools/calibrate-160.mjs                跑 160 段、印全部校準指標
 *   node tools/calibrate-160.mjs --quiet        只印指標表（掃值時用）
 *   node tools/calibrate-160.mjs --intl         附 §24.4.1 大賽經驗加成診斷（靜態池量測）
 *   node tools/calibrate-160.mjs --influencer   附網紅選手可達性診斷
 *
 * 驅動與 `tests/regression/smoke.mjs` 同一顆（harness `playMatrix` 同款矩陣：
 * 16 種子 × 五路 × focus／spread），常數全匯入不手抄——常數改了這裡自動跟。
 * 斷言的活在 `npm test`（`regression/invariants.mjs`）；本腳本只印數字供
 * 「判準 → 量測 → 結論」的對照。
 */
import { fileURLToPath } from 'node:url';
import { careerScore, careerTier } from '../src/engine/career.js';
import { OPPONENT_SUPPORT } from '../src/kernel/strength.js';
// S29 前的快照站沒有 RESIDUAL（對手全走匿名路）——量測舊基線時缺欄位給 null
import * as strengthNS from '../src/kernel/strength.js';
const OPPONENT_SUPPORT_RESIDUAL = strengthNS.OPPONENT_SUPPORT_RESIDUAL ?? null;
import { ROLES } from '../src/data/skills.js';
import { TIER_NAMES } from '../src/data/events.js';
import { QUERIES } from '../src/engine/conditions.js';
import { INTL_EXP_CAP, INTL_EXP_COEF, intlYearsOf, isGlobalBossTeam, teamsInYear } from '../src/engine/opponents.js';
import { playCareer } from '../tests/lib/harness.mjs';

const mean = (a) => (a.length ? a.reduce((t, v) => t + v, 0) / a.length : 0);
const pct = (v) => `${(v * 100).toFixed(1)}%`;

const ROUTE_IDS = ['route-region-ruler', 'route-mercenary', 'route-team-soul', 'route-green-leaf', 'route-influencer'];

export function simulate({ seedPrefix = 'seed', seedCount = 16, roles = ROLES, styles = ['focus', 'spread'] } = {}) {
  const seeds = Array.from({ length: seedCount }, (_, i) => `${seedPrefix}-${i}`);
  const runs = [];
  for (const seed of seeds) {
    for (const role of roles) {
      for (const style of styles) {
        const strategy = ['first', 'last', 'random'][seed.length % 3];
        runs.push({ seed, role, style, ...playCareer({ seed, role, strategy, style }) });
      }
    }
  }
  return runs;
}

/** 收回全部校準指標（純量測，不斷言、不做 IO） */
export function collectMetrics(runs) {
  const n = runs.length;
  const perStyle = n / 2;
  const peaks = runs.map((r) => r.state.peakRating);
  const peakOf = (style) => runs.filter((r) => r.style === style).map((r) => r.state.peakRating);

  // 頂端才兌現（invariants.mjs 同一條的數字面）
  const crowns = (s) => s.worldsWins * 2 + s.worldsFinals + s.msiWins;
  const withCrown = runs.filter((r) => crowns(r.state) > 0).map((r) => r.state.peakRating);
  const without = runs.filter((r) => crowns(r.state) === 0).map((r) => r.state.peakRating);
  const gap = mean(withCrown) - mean(without);

  // 等第與傳奇率
  const tiers = { focus: new Array(TIER_NAMES.length).fill(0), spread: new Array(TIER_NAMES.length).fill(0) };
  for (const r of runs) tiers[r.style][careerTier(r.state)]++;

  // 特質持有
  const legendHolders = runs.filter((r) => Object.values(r.state.legendary).some(Boolean)).length;
  const legend3 = runs.filter((r) => Object.values(r.state.legendary).filter(Boolean).length >= 3).length;
  const epicHolders = runs.filter((r) => Object.values(r.state.epic).some(Boolean)).length;

  // route：逐卡達成數、後 50%（生涯評分）覆蓋率（§14.2 驗收線的問法）
  const routeAch = Object.fromEntries(ROUTE_IDS.map((id) => [id, 0]));
  const byScore = [...runs].sort((a, b) => careerScore(a.state) - careerScore(b.state));
  const bottom = byScore.slice(0, Math.floor(n / 2));
  const bottomWithRoute = bottom.filter((r) => (r.state.quests?.done || [])
    .some((d) => d.result === 'achieved' && ROUTE_IDS.includes(d.id))).length;
  for (const r of runs) {
    for (const d of (r.state.quests?.done || [])) {
      if (d.result === 'achieved' && routeAch[d.id] != null) routeAch[d.id] += 1;
    }
  }

  // 國際賽
  const worldsWins = runs.reduce((t, r) => t + r.state.worldsWins, 0);
  const msiWins = runs.reduce((t, r) => t + r.state.msiWins, 0);
  const intlW = runs.reduce((t, r) => t + r.state.intlRecord.W, 0);
  const intlL = runs.reduce((t, r) => t + r.state.intlRecord.L, 0);
  const intlChampCareers = runs.filter((r) => r.state.worldsWins + r.state.msiWins > 0).length;

  // 體力節奏（S14 判準同 invariants：休息佔比、透支月佔比；手感中點與體力修正係數
  // 的判準量在月內谷底，beat 邊界量不到，由 kernel/stamina 測試守）
  const months = runs.reduce((t, r) => t + (r.state.staminaLog?.months || 0), 0);
  const rests = runs.reduce((t, r) => t + (r.state.restLog?.length || 0), 0);
  const low = runs.reduce((t, r) => t + (r.state.staminaLog?.low || 0), 0);

  // 對手實體化率（§23.4 不變式 2，量測）
  const oppFaces = { playoff: { draws: 0, materialized: 0 }, intl: { draws: 0, materialized: 0 } };
  for (const r of runs) {
    for (const k of ['playoff', 'intl']) {
      oppFaces[k].draws += r.state.oppFaces?.[k]?.draws ?? 0;
      oppFaces[k].materialized += r.state.oppFaces?.[k]?.materialized ?? 0;
    }
  }

  // Bo5 高壓檢定（S36 重驗 §24.4.2 四常數：觸發率與雙邊衰減均值）
  const dec = { bo5: 0, fired: 0, mineDecay: 0, oppDecay: 0 };
  for (const r of runs) {
    for (const k of Object.keys(dec)) dec[k] += r.state.deciderLog?.[k] ?? 0;
  }

  // 隊友（S28 校準護欄：量 rating 分布偏移，不動 matesAverage）
  const mateRatings = [];
  let mateReal = 0; let mateTotal = 0;
  for (const r of runs) {
    for (const m of (r.state.mates || [])) {
      mateRatings.push(m.rating);
      mateTotal += 1;
      if (m.npcId) mateReal += 1;
    }
  }

  return {
    n, perStyle,
    peakMean: mean(peaks), peakFocus: mean(peakOf('focus')), peakSpread: mean(peakOf('spread')),
    peakMin: Math.min(...peaks), peakMax: Math.max(...peaks),
    peakOverCap: mean(peaks) / 100,
    topGap: gap, topGapRatio: gap / 100,
    tiers,
    legendRateFocus: tiers.focus[0] / perStyle, legendRateSpread: tiers.spread[0] / perStyle,
    legendHolders, legendHolderRate: legendHolders / n, legend3, legend3Rate: legend3 / n,
    epicHolderRate: epicHolders / n,
    routeAch, routeAchTotal: Object.values(routeAch).reduce((t, v) => t + v, 0),
    bottomRouteCoverage: bottomWithRoute / bottom.length,
    worldsPerCareer: worldsWins / n, msiPerCareer: msiWins / n,
    intlWinRate: intlW / (intlW + intlL), intlW, intlL,
    intlChampCareers,
    proYearsMean: mean(runs.map((r) => r.state.proYears)),
    retireAgeMean: mean(runs.map((r) => r.state.age)),
    endYearMin: Math.min(...runs.map((r) => r.state.year)),
    endYearMax: Math.max(...runs.map((r) => r.state.year)),
    staminaMonths: months, restShare: rests / months, lowShare: low / months,
    oppFaces,
    decider: dec,
    mateRatingMean: mean(mateRatings), mateRealShare: mateReal / Math.max(1, mateTotal),
  };
}

export function formatReport(m) {
  const L = [];
  L.push(`160 段校準量測（AMATEUR 起點・${m.n} 段＝${m.n / 10} 種子 × 5 路 × 2 打法）`);
  L.push(`常數：OPPONENT_SUPPORT ${OPPONENT_SUPPORT}｜OPPONENT_SUPPORT_RESIDUAL ${OPPONENT_SUPPORT_RESIDUAL}`);
  L.push('');
  L.push(`平均巔峰教練評價 ${m.peakMean.toFixed(2)}（÷上限 ${m.peakOverCap.toFixed(3)}，最高 ${m.peakMax}、最低 ${m.peakMin}）`);
  L.push(`　老手 ${m.peakFocus.toFixed(2)}｜新手 ${m.peakSpread.toFixed(2)}`);
  L.push(`頂端落差 ${m.topGap.toFixed(2)}（÷上限 ${m.topGapRatio.toFixed(3)}，門檻 0.08，餘裕 ${(m.topGapRatio - 0.08).toFixed(3)}）`);
  L.push(`等第（老手｜新手）：${TIER_NAMES.map((t, i) => `${t} ${m.tiers.focus[i]}｜${m.tiers.spread[i]}`).join('、')}`);
  L.push(`傳奇率：老手 ${pct(m.legendRateFocus)}、新手 ${pct(m.legendRateSpread)}`);
  L.push(`傳說持有 ${m.legendHolders}/${m.n}（${pct(m.legendHolderRate)}）｜傳說 ≥3 ${m.legend3}（${pct(m.legend3Rate)}，硬線 ≤12%）`);
  L.push(`史詩持有率 ${pct(m.epicHolderRate)}`);
  L.push(`route 達成 ${m.routeAchTotal} 段：${Object.entries(m.routeAch).map(([id, v]) => `${id.replace('route-', '')} ${v}`).join('、')}`);
  L.push(`後 50% 局 route 覆蓋率 ${pct(m.bottomRouteCoverage)}（門檻 ≥60%）`);
  L.push(`世界冠軍人均 ${m.worldsPerCareer.toFixed(3)}｜MSI冠軍人均 ${m.msiPerCareer.toFixed(3)}｜有國際冠軍 ${m.intlChampCareers} 段`);
  L.push(`國際賽局勝負 ${m.intlW}/${m.intlL}（勝率 ${pct(m.intlWinRate)}）`);
  L.push(`平均職業年資 ${m.proYearsMean.toFixed(1)} 季｜平均退役年齡 ${m.retireAgeMean.toFixed(1)}｜退役年份 ${m.endYearMin}–${m.endYearMax}`);
  L.push(`體力：${m.staminaMonths} 個月樣本，休息 ${pct(m.restShare)}、透支月 ${pct(m.lowShare)}（00b 基準 29.5%／27.0%）`);
  const oppLine = (k) => (m.oppFaces[k].draws
    ? `${pct(m.oppFaces[k].materialized / m.oppFaces[k].draws)}（${m.oppFaces[k].materialized}/${m.oppFaces[k].draws}）`
    : '（無抽選）');
  L.push(`對手實體化率：intl ${oppLine('intl')}、playoff ${oppLine('playoff')}`);
  const d = m.decider;
  L.push(d.bo5
    ? `Bo5 高壓檢定：${d.bo5} 場 Bo5、打到第五局 ${d.fired}（${pct(d.fired / d.bo5)}）｜`
      + `衰減均值 我方 ${(d.mineDecay / Math.max(1, d.fired)).toFixed(3)}、對手 `
      + `${(d.oppDecay / Math.max(1, d.fired)).toFixed(3)}（淨 `
      + `${((d.oppDecay - d.mineDecay) / Math.max(1, d.fired)).toFixed(3)} 點，正＝對玩家有利）`
    : 'Bo5 高壓檢定：（無 Bo5 樣本）');
  L.push(`隊友 rating 均值 ${m.mateRatingMean.toFixed(2)}｜真實 NPC 佔 ${pct(m.mateRealShare)}`);
  return L;
}

/**
 * 大賽經驗加成診斷（S36 重驗 §24.4.1 第 2 條）：p2（Global_Boss）選隊池的
 * 原始 n ＝五名先發國際賽年數和，與各「係數／上界」組合下的 intlExp 分布。
 * 這是**靜態資料量測**（不跑生涯）——池是 NPC 名冊導出的，與種子無關。
 * 判讀重點是 sd 與飽和率：sd → 0 表示加成退化成常數，「老將紅利」名存實亡。
 */
export function intlExpDiagnosis() {
  const lines = [];
  const ns = [];
  for (let year = 2012; year <= 2030; year += 1) {
    const p2 = teamsInYear(year).filter(isGlobalBossTeam);
    if (!p2.length) continue;
    const yearNs = p2.map(intlYearsOf).sort((a, b) => a - b);
    lines.push(`${year}：p2 ${p2.length} 隊｜n 中位 ${yearNs[Math.floor(yearNs.length / 2)]}`
      + `（${yearNs[0]}–${yearNs.at(-1)}）`);
    ns.push(...yearNs);
  }
  if (!ns.length) return ['（p2 池為空）'];
  ns.sort((a, b) => a - b);
  const q = (p) => ns[Math.floor(ns.length * p)];
  lines.push(`合計 ${ns.length} 個隊年｜n：min ${ns[0]} p25 ${q(0.25)} p50 ${q(0.5)}`
    + ` p75 ${q(0.75)} max ${ns.at(-1)}｜均 ${mean(ns).toFixed(2)}`);
  const sweep = [[INTL_EXP_COEF, INTL_EXP_CAP], [0.25, 3.0], [0.2, 3.0], [0.15, 3.0], [0.25, 4.0]];
  for (const [coef, cap] of sweep) {
    const vs = ns.map((v) => Math.min(cap, coef * v));
    const mu = mean(vs);
    const sd = Math.sqrt(mean(vs.map((v) => (v - mu) ** 2)));
    const sat = vs.filter((v) => v >= cap).length / vs.length;
    lines.push(`  係數 ${coef} 上界 ${cap}：均 ${mu.toFixed(2)}｜sd ${sd.toFixed(2)}｜飽和 ${pct(sat)}`);
  }
  return lines;
}

/** 網紅選手可達性診斷（S26 留的結構性互斥問題）：fame 分級 × peakRating 分位 */
export function influencerDiagnosis(runs) {
  const lines = [];
  for (const fame of [0, 1, 2, 3, 4]) {
    const group = runs.filter((r) => QUERIES.fameLevel(r.state) === fame);
    if (!group.length) { lines.push(`fame ${fame}：0 段`); continue; }
    const ps = group.map((r) => r.state.peakRating).sort((a, b) => a - b);
    const le = (x) => ps.filter((v) => v <= x).length;
    lines.push(`fame ${fame}：${group.length} 段｜peakRating p25=${ps[Math.floor(ps.length * 0.25)]}`
      + ` p50=${ps[Math.floor(ps.length * 0.5)]}｜≤68(P50) ${le(68)}、≤70 ${le(70)}、≤72 ${le(72)}、≤75 ${le(75)}`);
  }
  return lines;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const argv = process.argv.slice(2);
  const seedCount = (() => {
    const i = argv.indexOf('--seeds');
    return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : 16;
  })();
  const t0 = Date.now();
  const runs = simulate({ seedCount });
  const m = collectMetrics(runs);
  for (const line of formatReport(m)) console.log(line);
  if (!process.argv.includes('--quiet')) console.log(`（${((Date.now() - t0) / 1000).toFixed(1)}s）`);
  if (process.argv.includes('--intl')) {
    console.log('');
    for (const line of intlExpDiagnosis()) console.log(line);
  }
  if (process.argv.includes('--influencer')) {
    console.log('');
    for (const line of influencerDiagnosis(runs)) console.log(line);
  }
}
