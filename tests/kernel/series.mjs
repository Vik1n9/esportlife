/** BO 系列賽與種子序換算。 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { runSeries, worldsSeed, splitSeed, REVERSE_SWEEP_KEY } from '../../src/kernel/series.js';
import { DECIDER_CHECK, deciderCheckM, deciderCheckDecay } from '../../src/engine/psych.js';

export const name = 'BO 系列賽與種子序';

/** 依序餵勝負的骰子（series 逐局 chance 依序讀、gauss 歸零、int 取左界） */
const scripted = (seq) => {
  let i = 0;
  return { chance: () => seq[i++], gauss: () => 0, int: (a, b) => a };
};

export async function run({ check }) {
  const rng = new Rng('series');
  const state = createState({ name: 'P', role: 'TOP', seed: 'series' });
  state.league = 'HOME'; state.stage = 'PRO';

  for (const bo of [3, 5]) {
    const need = Math.ceil(bo / 2);
    for (let i = 0; i < 200; i++) {
      const res = runSeries(state, rng, { bo, oppRating: 53, seed: 2 });
      check(`BO${bo} 勝方剛好拿到 ${need} 勝`, Math.max(res.mine, res.theirs) === need, `${res.mine}-${res.theirs}`);
      check(`BO${bo} 總局數不超過 ${bo}`, res.mine + res.theirs <= bo, `${res.mine}-${res.theirs}`);
      check(`BO${bo} 比分與勝負一致`, res.win === (res.mine > res.theirs));
    }
  }

  /* ---------------- §24.4.2 Bo5 高壓檢定（S35） ---------------- */

  // 檢定公式與衰減：m≥60 不衰減；m<60 走 3.0×(1−m/60)^1.5
  check('檢定 m＝comp×0.6＋resl×0.4', deciderCheckM(100, 50) === 100 * 0.6 + 50 * 0.4);
  check('檢定 m 達門檻不衰減', deciderCheckDecay(DECIDER_CHECK.threshold) === 0 && deciderCheckDecay(100) === 0);
  check('檢定衰減＝3.0×(1−m/60)^1.5', Math.abs(deciderCheckDecay(0) - 3.0) < 1e-9
    && Math.abs(deciderCheckDecay(30) - 3.0 * Math.pow(1 - 30 / 60, 1.5)) < 1e-9);

  // Bo5 回傳 deciderCheck（對稱檢定的讀取面），Bo3 不檢定
  {
    const s = createState({ name: 'P', role: 'TOP', seed: 'series-check' });
    s.league = 'HOME'; s.stage = 'PRO';
    s.mental = { comp: 40, resl: 40 };
    const r5 = runSeries(s, scripted([true, true, true]), { bo: 5, oppRating: 53, seed: 2 });
    check('Bo5 回傳檢定結果（m 與雙邊衰減）', !!r5.deciderCheck
      && r5.deciderCheck.m === deciderCheckM(40, 40)
      && Math.abs(r5.deciderCheck.mineDecay - deciderCheckDecay(deciderCheckM(40, 40))) < 1e-9);
    check('檢定結果帶匿名對手的 m=50 基準', r5.deciderCheck.oppM === 50);
    const r3 = runSeries(s, scripted([true, true]), { bo: 3, oppRating: 53, seed: 2 });
    check('Bo3 無檢定', !r3.deciderCheck);
  }

  // 檢定是隊伍強度加項：低 comp/resl 的生涯在決勝局勝率下修，高者不受影響
  {
    const low = createState({ name: 'P', role: 'TOP', seed: 'series-low' });
    low.league = 'HOME'; low.stage = 'PRO'; low.mental = { comp: 0, resl: 0 };
    const high = createState({ name: 'P', role: 'TOP', seed: 'series-high' });
    high.league = 'HOME'; high.stage = 'PRO'; high.mental = { comp: 90, resl: 90 };
    // 對手強檢定（m=100 → 不衰減）時，衰弱方決勝局被吃滿 3.0 點
    const oppStrong = { checkM: 100 };
    const pLow = runSeries(low, scripted([false, false, false]), { bo: 5, oppRating: 53, seed: 2, opp: oppStrong });
    check('低 comp/resl 者檢定衰減＝滿額', Math.abs(pLow.deciderCheck.mineDecay - 3.0) < 1e-9);
    const pHigh = runSeries(high, scripted([false, false, false]), { bo: 5, oppRating: 53, seed: 2, opp: oppStrong });
    check('高 comp/resl 者不衰減', pHigh.deciderCheck.mineDecay === 0);
  }

  /* ---------------- §24.4.4 reverse_sweep 記帳（S35） ---------------- */

  {
    // 0:2 落後翻成 3:2 → 記帳 reverse_sweep
    const s = createState({ name: 'P', role: 'TOP', seed: 'series-rev' });
    s.league = 'HOME'; s.stage = 'PRO';
    const res = runSeries(s, scripted([false, false, true, true, true]), { bo: 5, oppRating: 53, seed: 2 });
    check('0:2→3:2 判定為讓二追三', res.reverseSweep === true && res.mine === 3 && res.theirs === 2);
    check('讓二追三進 eventCounts 記帳', (s.eventCounts?.[REVERSE_SWEEP_KEY] ?? 0) === 1);

    // 1:2 之後連兩勝不是讓二追三（沒到過 0:2）
    const t = createState({ name: 'P', role: 'TOP', seed: 'series-norev' });
    t.league = 'HOME'; t.stage = 'PRO';
    const res2 = runSeries(t, scripted([true, false, false, true, true]), { bo: 5, oppRating: 53, seed: 2 });
    check('未到 0:2 不算讓二追三', !res2.reverseSweep && (t.eventCounts?.[REVERSE_SWEEP_KEY] ?? 0) === 0);
  }

  check('冠軍點數不足就沒有世界賽門票', worldsSeed(0) === 0 && worldsSeed(39) === 0);
  check('點數越高種子序越前', worldsSeed(160) === 1 && worldsSeed(120) === 2 && worldsSeed(80) === 3 && worldsSeed(45) === 4);
  check('例行賽越強種子序越前', splitSeed(state, { G: 100, W: 80, delta: 5 }) === 1 && splitSeed(state, { G: 100, W: 30, delta: -3 }) === 4);
}
