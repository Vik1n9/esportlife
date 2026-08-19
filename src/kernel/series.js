/**
 * BO 系列賽與種子序換算。
 *
 * 舊版的季後賽是一次 `rng.chance()` 直接吐冠軍——一整年最重要的環節連一局比分都
 * 沒有。現在拆成逐局模擬，決勝局另外吃「大心臟」的加成。節奏放慢的用意是：每一輪
 * 之前都留得下一個扮演的路口。
 *
 * 放在 kernel 是因為它有三個消費者：賽段季後賽、MSI、世界賽。國際賽舞台原本各自
 * 只擲一次骰，最大的兩個舞台反而比聯賽季後賽粗糙——那是承襲自棒球模型的痕跡。
 *
 * 種子序換算（`splitSeed`／`worldsSeed`／`pointsFor`）刻意跟系列賽放同一個檔：那些
 * 門檻是平衡數值，改它的時候一定同時在看系列賽邏輯，拆開只會多開一個檔。
 *
 * ⚠ S29 起對手的「選隊目標水準」（§11.1 階梯）搬到 `engine/opponents.js`——
 * 逐選手對手模型要在目標上接 NPC 選隊，階梯目標與選隊不能拆兩處。
 *
 * 這裡不 yield beat，只回傳結果，敘事與選擇留給 phases 組裝。
 */
import { clamp } from '../core/rng.js';
import { CHAMPIONSHIP_POINTS, PLAYOFF_ROUNDS } from '../data/formats/playoffs.js';
import { bumpEventCounters } from '../engine/eventTrigger.js';
import { clutchBonus, underdogBonus } from '../engine/mental.js';
import { PRESSURE, DECIDER_PRESSURE, deciderCheckDecay, deciderCheckM } from '../engine/psych.js';
import { seriesDeaths } from '../engine/season.js';
import { teamStrength } from './strength.js';
import { bonus } from './modifiers.js';

/** Bo5 0:2 落後翻成 3:2 的記帳鍵（§24.4.4，`['eventCount','reverse_sweep',…]`） */
export const REVERSE_SWEEP_KEY = 'reverse_sweep';

/**
 * 進不進得了季後賽。例行賽打得越好、隊伍越強，機會越大。
 * @param {object} stat 該賽段的例行賽數據
 */
export function playoffBerth(state, stat) {
  const winRate = stat.G ? stat.W / stat.G : 0;
  // 前兩項吃勝率不吃評價，所以不縮放；delta 項是 per-point 係數，÷1.25（§17.2 二）
  return clamp(18 + (winRate - 0.5) * 240 + (stat.delta || 0) * 2.4, 5, 95);
}

/**
 * 兩支隊的戰力差 → 基準單局勝率（未夾取、未疊加任何個人修正）。
 *
 * 斜率 1.76 ＝ 舊的 2.2 ÷ 1.25：0–100 刻度下同一個相對戰力差會產出 1.25 倍的點數，
 * 係數不除就等於把勝率對戰力的靈敏度整體上調兩成（§11.1 §17.2 二）。
 *
 * **單一來源**（§24.2.1 明文：「clamp 常數不得第三處手抄」）：`gameChance`（玩家系列賽）
 * 與 `leagueSim.js` 的 NPC 賽區背景模擬（S32）都經這裡算基準勝率，前者疊加個人修正後
 * 才夾取，後者直接夾取。
 */
export function baseGameChance(strengthDiff) {
  return 50 + strengthDiff * 1.76;
}

/**
 * 單局勝率（百分比）。`decider` 為決勝局，額外吃大心臟。夾在 8–92% 不變。
 *
 * `mod` 是備賽戰術（S15）帶進來的勝率修正：只加在這一輪系列賽上，是單場的準備、
 * 不是屬性。預設 0 對既有呼叫零影響。
 *
 * `strengthShift` 是 Bo5 高壓檢定（§24.4.2）的第五局隊伍強度加項——玩家隊與
 * 對手的衰減差，正負皆可，只加在戰力差上、不進 §9.2 乘法鏈。
 */
export function gameChance(state, oppRating, { decider = false, seed = 0, mod = 0, strengthShift = 0 } = {}) {
  let p = baseGameChance(teamStrength(state) - oppRating + strengthShift);
  p += underdogBonus(state, seed) + bonus(state, 'seriesGame') + mod;
  if (decider) p += clutchBonus(state) + bonus(state, 'seriesDecider');
  return clamp(p, 8, 92);
}

/**
 * 打一輪系列賽。
 *
 * `pressure`（V4 §9.3）是這一輪的壓力係數，只影響**陣亡數**不影響勝負：抗壓進勝率
 * 的路是 §9.2 的發揮倍率與上面的 `clutchBonus`，失誤走的是可見數據那一條。所有 BO
 * 系列賽都經過這裡，所以失誤的可見出口只要接在這一個點上。
 *
 * @param {number} bo 1、3 或 5
 * @param {number} [pressure] 見 `psych.PRESSURE`，預設季後賽
 * @param {number} [mod] 備賽戰術的單場勝率修正（S15），預設 0
 * @param {object|null} [opp] 實體化對手（§24.4.2 對稱檢定讀 `opp.checkM`），匿名對手視同 m=50
 * @returns {{win:boolean, mine:number, theirs:number, games:string[], decider:boolean, deaths:number,
 *   deciderCheck?:object, reverseSweep?:boolean}}
 */
export function runSeries(state, rng, { bo, oppRating, seed, pressure = PRESSURE.playoff, mod = 0, opp = null }) {
  const need = Math.ceil(bo / 2);
  // Bo5 2:2 第五局＝檢定局（§24.4.2）：團隊強度加項，不進 §9.2 乘法鏈。
  // 玩家衰減 − 對手衰減——檢定是對稱的，兩邊各衰各的，只有低 comp／resl 的生涯吃虧
  let checkShift = 0;
  let deciderCheck = null;
  if (bo === 5) {
    const m = state.mental || {};
    const mineM = deciderCheckM(m.comp ?? 50, m.resl ?? 50);
    const oppM = opp?.checkM ?? 50;
    const mineDecay = deciderCheckDecay(mineM);
    const oppDecay = deciderCheckDecay(oppM);
    checkShift = oppDecay - mineDecay;
    deciderCheck = { m: mineM, oppM, mineDecay, oppDecay };
  }
  let mine = 0; let theirs = 0;
  let down02 = false;
  const games = [];
  while (mine < need && theirs < need) {
    const decider = bo > 1 && mine === need - 1 && theirs === need - 1;
    const won = rng.chance(gameChance(state, oppRating, {
      decider, seed, mod, strengthShift: decider ? checkShift : 0,
    }));
    if (won) mine += 1; else theirs += 1;
    if (mine === 0 && theirs === 2) down02 = true;
    games.push(`${won ? 'W' : 'L'}${decider ? '*' : ''}`);
  }
  const decider = games.some((g) => g.endsWith('*'));
  // §24.4.2 四常數的重驗讀點（S36）：檢定局觸發率與雙邊衰減，缺欄不記帳
  const log = bo === 5 ? state.deciderLog : null;
  if (log) {
    log.bo5 += 1;
    if (decider) {
      log.fired += 1;
      log.mineDecay += deciderCheck.mineDecay;
      log.oppDecay += deciderCheck.oppDecay;
    }
  }
  // 被拖進決勝局，壓力不是線性疊加的——整輪一起往上調
  const deaths = seriesDeaths(state, rng, games.length, pressure * (decider ? DECIDER_PRESSURE : 1));
  const reverseSweep = bo === 5 && down02 && mine === 3 && theirs === 2;
  if (reverseSweep) bumpEventCounters(state, [REVERSE_SWEEP_KEY]);
  return {
    win: mine > theirs, mine, theirs, games, decider, deaths,
    ...(bo === 5 ? { deciderCheck } : {}),
    ...(reverseSweep ? { reverseSweep } : {}),
  };
}

/**
 * 一個賽段的季後賽從哪一輪打起。
 * 例行賽越強，種子序越前，可以直接從四強開始——這也是「第四種子」要多打一輪才進得了
 * 決賽的原因。
 */
export function entryRound(seed) {
  return seed <= 2 ? 'semi' : 'quarter';
}

export function roundsFrom(key) {
  const start = PLAYOFF_ROUNDS.findIndex((r) => r.key === key);
  return PLAYOFF_ROUNDS.slice(start < 0 ? 0 : start);
}

/** 賽段內的種子序：由例行賽戰績推出，1 為第一種子 */
export function splitSeed(state, stat) {
  const winRate = stat.G ? stat.W / stat.G : 0;
  if (winRate >= 0.72) return 1;
  if (winRate >= 0.60) return 2;
  if (winRate >= 0.50) return 3;
  return 4;
}

/** 名次 → 冠軍點數 */
export function pointsFor(finish) {
  return CHAMPIONSHIP_POINTS[finish] ?? CHAMPIONSHIP_POINTS.none;
}

/**
 * 全年冠軍點數 → 世界賽種子序。
 * 回傳 0 代表沒拿到門票。第 4 種子存在的意義就是讓下剋上有起點。
 *
 * 這套制度只在 2013–2022 有效，2023 起改看最後一個賽段的季後賽名次——
 * 年代切換由 `data/formats/worlds.js` 決定，這裡只負責換算。
 */
export function worldsSeed(points) {
  if (points >= 155) return 1;
  if (points >= 110) return 2;
  if (points >= 70) return 3;
  if (points >= 40) return 4;
  return 0;
}
