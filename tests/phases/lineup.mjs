/**
 * 先發／板凳／傷勢缺席。
 *
 * 舊版用 staminaFactor 讓體力決定出賽場次——體力 35 以下只打 30% 的比賽。那是棒球
 * 的輪值與休養模型。LoL 是五個固定先發，隊伍打幾場你就打幾場。
 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { benchRisk, formFactor, lineupFor, SPLIT_WEEKS } from '../../src/engine/lineup.js';
import { simulateSeason } from '../../src/engine/season.js';
import { rollInjury } from '../../src/engine/progression.js';

export const name = '先發板凳與傷勢缺席';

function pro(seed, ovrValue, extra = {}) {
  const state = createState({ name: 'L', role: 'MID', seed });
  state.stage = 'PRO'; state.league = 'LCK'; state.team = 'T1';
  for (const k of Object.keys(state.ability)) state.ability[k] = ovrValue;
  state.mates = [1, 2, 3, 4].map((i) => ({ name: `M${i}`, ovr: ovrValue }));
  Object.assign(state, extra);
  return state;
}

export async function run({ check }) {
  const rng = new Rng('lineup');

  /* ---- 體力進表現，不進場次 ---- */
  {
    check('體力低不再讓 formFactor 崩到 0.3（那是棒球的輪值模型）', formFactor(30) > 0.8, formFactor(30));
    check('體力高給小幅加成', formFactor(70) > 1 && formFactor(70) <= 1.06, formFactor(70));
    check('體力對表現的影響是連續的', formFactor(60) > formFactor(50) && formFactor(50) > formFactor(40));

    const tired = pro('tired', 62); tired.ability.sta = 30;
    const fresh = pro('fresh', 62); fresh.ability.sta = 70;
    let tiredG = 0; let freshG = 0; let tiredD = 0; let freshD = 0;
    for (let i = 0; i < 200; i++) {
      const a = simulateSeason(tired, rng, 'LCK', 1, 1);
      const b = simulateSeason(fresh, rng, 'LCK', 1, 1);
      tiredG += a.G; freshG += b.G; tiredD += a.D; freshD += b.D;
    }
    check('體力低不會少打（場次差距在 5% 以內）',
      Math.abs(tiredG - freshG) / freshG < 0.05, `${tiredG} vs ${freshG}`);
    check('體力低反映在陣亡數上', tiredD > freshD, `${tiredD} vs ${freshD}`);
  }

  /* ---- 出賽比例 ---- */
  {
    const state = pro('share', 62);
    const full = simulateSeason(state, rng, 'LCK', 1, 1);
    const half = simulateSeason(state, rng, 'LCK', 1, 0.5);
    const none = simulateSeason(state, rng, 'LCK', 1, 0);
    check('share 0.5 約打一半場次', Math.abs(half.G / full.G - 0.5) < 0.1, `${half.G}/${full.G}`);
    check('share 0 完全不出賽', none.G === 0, none.G);
    check('不出賽時數據全空', none.K === 0 && none.W === 0);
  }

  /* ---- 被下放的機率由狀態決定，不是憑空擲骰 ---- */
  {
    const good = pro('bench-good', 70);
    const bad = pro('bench-bad', 50);
    check('打得比隊伍平均好，被下放風險低', benchRisk(good) < 8, benchRisk(good).toFixed(1));
    check('打不到隊伍平均，風險明顯上升', benchRisk(bad) > benchRisk(good) + 10,
      `${benchRisk(bad).toFixed(1)} vs ${benchRisk(good).toFixed(1)}`);

    const rift = pro('bench-rift', 70); rift.mental.chem = 5;
    check('默契見底會被下放', benchRisk(rift) > benchRisk(good) + 10, benchRisk(rift).toFixed(1));

    const back = pro('bench-back', 70, { returningFromInjury: true });
    check('傷癒回歸時位子不一定還在', benchRisk(back) > benchRisk(good) + 10, benchRisk(back).toFixed(1));

    const repeat = pro('bench-again', 70, { benchedStreak: 1 });
    check('坐過一次之後更容易再坐', benchRisk(repeat) > benchRisk(good), benchRisk(repeat).toFixed(1));

    check('風險有上限，不會變成必然', benchRisk(pro('bench-worst', 20, { mental: { ...bad.mental, chem: 0 }, age: 34, returningFromInjury: true, benchedStreak: 3 })) <= 75);
  }

  /* ---- 業餘與青訓沒有板凳這回事 ---- */
  {
    const am = createState({ name: 'A', role: 'MID', seed: 'am' });
    check('業餘階段風險為 0', benchRisk(am) === 0);
    for (let i = 0; i < 50; i++) {
      check('業餘階段一律先發', lineupFor(am, rng).status === 'starter');
    }
  }

  /* ---- 傷勢缺席以「週」計，逐賽段消化 ---- */
  {
    const state = pro('injury', 70);
    state.injuryWeeks = SPLIT_WEEKS + 4;
    const first = lineupFor(state, rng);
    check('整段都在養傷時完全不出賽', first.share === 0 && first.status === 'injured', JSON.stringify(first));
    check('剩下的週數留到下一段', state.injuryWeeks === 4, state.injuryWeeks);

    const second = lineupFor(state, rng);
    check('第二段只缺席剩下的週數', second.missedWeeks === 4, second.missedWeeks);
    check('缺席之後仍打得到大部分場次', second.share > 0.5 || second.status === 'benched', JSON.stringify(second));
    check('週數消化完畢', state.injuryWeeks === 0, state.injuryWeeks);
  }

  /* ---- 傷勢分檔：整季報銷要罕見 ---- */
  {
    const state = pro('injury-mix', 62);
    const kinds = { none: 0, minor: 0, major: 0, severe: 0 };
    for (let i = 0; i < 4000; i++) {
      state.injuryWeeks = 0; state.rehabYears = 0; state.tempInjuryRisk = 0;
      kinds[rollInjury(state, rng).kind]++;
    }
    const hurt = kinds.minor + kinds.major + kinds.severe;
    check('大多數賽季不受傷', kinds.none > hurt, JSON.stringify(kinds));
    check('小傷比重傷常見', kinds.minor > kinds.major, JSON.stringify(kinds));
    check('動刀報銷整季是罕見事件（舊版是所有重傷都報銷）',
      kinds.severe < kinds.major * 0.3, JSON.stringify(kinds));
    check('每一檔都出現得到', kinds.minor > 0 && kinds.major > 0 && kinds.severe > 0, JSON.stringify(kinds));
  }
}
