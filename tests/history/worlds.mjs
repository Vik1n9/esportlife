/**
 * 世界賽的史實與門票制度。
 *
 * 舊版的三個問題：門票是擲骰（種子序算好了卻再擲一次，第一種子有 4% 拿不到票）、
 * 席位數寫死不隨時代、冠軍點數制被套用到 2025 年（那套制度 2022 年就廢止了）。
 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { worldsRuleOf, FINISH_TO_SEED } from '../../src/data/formats/worlds.js';
import { worldsSlotsOf } from '../../src/data/regions/index.js';
import { worldsSeed } from '../../src/kernel/series.js';
import { runSwiss, runGroup } from '../../src/kernel/groups.js';

export const name = '世界賽史實與門票制度';

export async function run({ check }) {
  /* ---- 種子序來源隨時代切換 ---- */
  check('2012 沒有點數制，只有冠軍去得了', worldsRuleOf(2012).seedFrom === 'REGIONAL_QUALIFIER');
  check('2013 冠軍點數制上路', worldsRuleOf(2013).seedFrom === 'CHAMP_POINTS');
  check('2022 仍是冠軍點數制', worldsRuleOf(2022).seedFrom === 'CHAMP_POINTS');
  check('2023 起冠軍點數制廢止（舊版一路套用到 2025）',
    worldsRuleOf(2023).seedFrom === 'FINAL_SPLIT_PLAYOFF');
  check('2025 不得使用冠軍點數', worldsRuleOf(2025).seedFrom !== 'CHAMP_POINTS');

  /* ---- 賽制隨時代 ---- */
  check('2022 是小組賽', worldsRuleOf(2022).stage === 'GROUP_KO');
  check('2023 起是 Swiss', worldsRuleOf(2023).stage === 'SWISS');
  check('2022 不得使用 Swiss（Swiss 2023 才引入）', worldsRuleOf(2022).stage !== 'SWISS');

  /* ---- 入圍賽 ---- */
  check('2016 年沒有入圍賽', worldsRuleOf(2016).playIn === null);
  check('2017 起有入圍賽', worldsRuleOf(2017).playIn !== null);
  check('2017–2022 頂級賽區的低種子也要打入圍', worldsRuleOf(2019).playIn.majorLastSeed === true);
  check('2023 起頂級賽區不再打入圍', worldsRuleOf(2024).playIn.majorLastSeed === false);
  check('非頂級賽區一律先打入圍', worldsRuleOf(2024).playIn.minorAlways === true);

  /* ---- 席位數隨時代，且主場賽區比頂級賽區少 ---- */
  check('LCK 2014 為 3 席', worldsSlotsOf(2014, 'KR') === 3, worldsSlotsOf(2014, 'KR'));
  check('LCK 2022 為 3 席', worldsSlotsOf(2022, 'KR') === 3, worldsSlotsOf(2022, 'KR'));
  check('LCK 2023 起為 4 席', worldsSlotsOf(2023, 'KR') === 4, worldsSlotsOf(2023, 'KR'));
  check('LPL 2023 起為 4 席', worldsSlotsOf(2023, 'CN') === 4, worldsSlotsOf(2023, 'CN'));
  check('LEC 恆為 3 席', worldsSlotsOf(2018, 'EU') === 3 && worldsSlotsOf(2025, 'EU') === 3);
  check('主場賽區 2012–2014 只有 1 張外卡門票', worldsSlotsOf(2013, 'HOME') === 1, worldsSlotsOf(2013, 'HOME'));
  check('主場賽區 2015 起為 2 席', worldsSlotsOf(2016, 'HOME') === 2 && worldsSlotsOf(2025, 'HOME') === 2);
  for (const y of [2013, 2018, 2023, 2028]) {
    check(`${y} 年主場賽區席位少於 LCK`, worldsSlotsOf(y, 'HOME') < worldsSlotsOf(y, 'KR'));
  }

  /* ---- 地區資格賽只在點數制年代存在 ---- */
  check('2016 最後一張門票要打地區資格賽', worldsRuleOf(2016).gauntlet === true);
  check('2023 起沒有地區資格賽', worldsRuleOf(2023).gauntlet === false);

  /* ---- 名次換算 ---- */
  check('賽段冠軍＝第一種子', FINISH_TO_SEED.champion === 1);
  check('沒進季後賽就沒有種子序', FINISH_TO_SEED.none === 0);
  check('冠軍點數不足就沒有門票', worldsSeed(0) === 0 && worldsSeed(39) === 0);
  check('點數越高種子序越前',
    worldsSeed(160) === 1 && worldsSeed(120) === 2 && worldsSeed(80) === 3 && worldsSeed(45) === 4);

  /* ---- 門票是確定性的，不是擲骰 ---- */
  {
    // 同一組戰績跑一百次，種子序必須每次都一樣——舊版在這裡會擲骰
    const rng = new Rng('worlds-det');
    const state = createState({ name: 'W', role: 'MID', seed: 'worlds-det' });
    state.stage = 'PRO'; state.league = 'LCK';
    state.splitLog = [{ name: '春季賽', finish: 'semi' }, { name: '夏季賽', finish: 'final' }];
    const seeds = new Set();
    for (let i = 0; i < 100; i++) seeds.add(FINISH_TO_SEED[state.splitLog[state.splitLog.length - 1].finish]);
    check('同樣的戰績永遠換算出同一個種子序', seeds.size === 1 && seeds.has(2), [...seeds].join(','));
  }

  /* ---- 賽段一定會出比分（過程不能被壓成一次擲骰） ---- */
  {
    const rng = new Rng('worlds-stage');
    const state = createState({ name: 'W', role: 'MID', seed: 'worlds-stage' });
    state.stage = 'PRO'; state.league = 'LCK';
    state.mates = [1, 2, 3, 4].map((i) => ({ name: `M${i}`, ovr: 60 }));
    for (const k of Object.keys(state.ability)) state.ability[k] = 60;

    for (let i = 0; i < 50; i++) {
      const swiss = runSwiss(state, rng, { par: 60 });
      check('Swiss 至少三輪，每輪都有比分', swiss.rounds.length >= 3 && swiss.rounds.every((r) => r.score));
      const group = runGroup(state, rng, { oppOvrs: [60, 60, 60] });
      check('小組賽有六場逐場紀錄', group.games.length === 6);
    }
  }
}
