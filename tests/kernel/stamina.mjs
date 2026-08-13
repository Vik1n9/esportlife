/**
 * 體力：0–100 的消耗資源（V4 §6）。
 *
 * 這個 suite 守的是「經濟」與「曲線形狀」，不是某一個係數等於某個數字——係數還會被
 * S14（月回合制）與 S16（訓練選單）動。會紅的是形狀跑掉：休息不再有效、透支不再
 * 痛、賽事期間可以躺著休息、或者體力根本不會動。
 */
import { createState } from '../../src/engine/state.js';
import { Rng } from '../../src/core/rng.js';
import {
  BAND_FRESH, BAND_TIRED, MATCH_MONTH_COST, MONTHLY_RECOVER, REST_AT, REST_RECOVER,
  STAMINA_MAX, TRAIN_COST, advanceMonths, bandOf, canRest, consume, formFactor,
  injuryMul, monthlyDrift, monthsFor, planMonth, recover, recoveryOptions, seriesCost,
  staminaOf, staminaPower, successMul, vitCoef,
} from '../../src/engine/stamina.js';
import { injuryProbability } from '../../src/engine/progression.js';
import { simulateSeason } from '../../src/engine/season.js';
import { teamStrength } from '../../src/kernel/strength.js';

export const name = '體力資源與低體力懲罰曲線';

const fresh = (seed = 'sta', extra = {}) => Object.assign(
  createState({ name: 'S', role: 'MID', seed }), extra,
);

export async function run({ check, log }) {
  /* ---- 存在性：體力是資源，不是技能 ---- */
  {
    const s = fresh('born');
    check('出道時體力是滿的', s.stamina === STAMINA_MAX, s.stamina);
    check('舊存檔沒有這一格時當滿的算，不會傳染 undefined', staminaOf({}) === STAMINA_MAX);
    check('體力是純數字，存得下去', typeof s.stamina === 'number' && Number.isFinite(s.stamina));
  }

  /* ---- 原語：consume／recover 夾在 0–100 之間 ---- */
  {
    const s = fresh('prim');
    consume(s, 30);
    check('扣得動', s.stamina === 70, s.stamina);
    consume(s, 999);
    check('扣到 0 為止，不會變負', s.stamina === 0, s.stamina);
    recover(s, 999);
    check('回不超過上限', s.stamina === STAMINA_MAX, s.stamina);

    const drained = fresh('drift', { stamina: 10 });
    monthlyDrift(drained);
    check('每月自然恢復與行動無關', drained.stamina > 10, drained.stamina);
  }

  /* ---- V4 §7：體能是體力的體質，不然 vit 就沒有任何消費者 ---- */
  {
    const weak = fresh('weak'); weak.attr.vit = 20; weak.stamina = 0;
    const tough = fresh('tough'); tough.attr.vit = 100; tough.stamina = 0;
    monthlyDrift(weak); monthlyDrift(tough);
    check('體能高的人恢復得快', tough.stamina > weak.stamina, `${tough.stamina} vs ${weak.stamina}`);
    check('體質差異是幅度不是量級（±20% 以內）',
      vitCoef(tough) <= 1.2 && vitCoef(weak) >= 0.8, `${vitCoef(weak)} ~ ${vitCoef(tough)}`);
  }

  /* ---- §6.2 懲罰曲線：區間照表，區間內連續 ---- */
  {
    check('≥60 是正常成功率', successMul(BAND_FRESH) === 1 && successMul(100) === 1);
    check('30–59 落在 −15%~−25%',
      successMul(59) <= 0.85 && successMul(59) >= 0.75 && successMul(BAND_TIRED) >= 0.75 && successMul(BAND_TIRED) <= 0.85,
      `59 → ${successMul(59).toFixed(3)}、30 → ${successMul(30).toFixed(3)}`);
    // 邊界值是浮點算出來的（0.6 − 0.2 = 0.39999…），比較留 1e-9 的餘裕
    check('1–29 落在 −40%~−60%',
      successMul(29) <= 0.60 + 1e-9 && successMul(1) >= 0.40 - 1e-9,
      `29 → ${successMul(29).toFixed(3)}、1 → ${successMul(1).toFixed(3)}`);
    check('0 仍可行動，但失敗率極高', successMul(0) > 0 && successMul(0) < 0.4, successMul(0));
    check('曲線單調不遞增', [0, 1, 15, 29, 30, 45, 59, 60, 80, 100]
      .every((v, i, arr) => i === 0 || successMul(v) >= successMul(arr[i - 1])));
    // 區間內要真的有斜率，不然 59 與 30 是同一件事，玩家沒有「再撐一次」的判斷空間
    check('疲勞區內部有斜率', successMul(59) > successMul(31), `${successMul(59).toFixed(3)} vs ${successMul(31).toFixed(3)}`);
    check('透支區內部有斜率', successMul(29) > successMul(2), `${successMul(29).toFixed(3)} vs ${successMul(2).toFixed(3)}`);
  }

  /* ---- §6.2 受傷風險：只有透支區才加，疲勞區的代價是練不出東西 ---- */
  {
    check('充沛與疲勞不加受傷風險', injuryMul(100) === 1 && injuryMul(BAND_TIRED) === 1);
    check('透支區受傷風險上升', injuryMul(10) > 1, injuryMul(10).toFixed(2));
    check('見底時風險大增', injuryMul(0) >= injuryMul(1) && injuryMul(0) >= 1.6, injuryMul(0));

    const ok = fresh('inj-ok', { stamina: 80 });
    const bad = fresh('inj-bad', { stamina: 0 });
    check('受傷機率真的吃體力', injuryProbability(bad) > injuryProbability(ok),
      `${injuryProbability(bad).toFixed(1)}% vs ${injuryProbability(ok).toFixed(1)}%`);
    const old = fresh('inj-old', { stamina: 0, age: 34 });
    const young = fresh('inj-young', { stamina: 0, age: 22 });
    check('硬撐對年紀大的人更危險（乘法而不是加法）',
      injuryProbability(old) - injuryProbability(young) > 12,
      `${injuryProbability(old).toFixed(1)}% vs ${injuryProbability(young).toFixed(1)}%`);
  }

  /* ---- 手感係數：從 lineup.js 搬過來，量級不變 ---- */
  {
    check('體力低不再讓手感崩到 0.3（那是棒球的輪值模型）', formFactor(38) > 0.8, formFactor(38));
    check('體力高給小幅加成', formFactor(88) > 1 && formFactor(88) <= 1.06, formFactor(88));
    check('手感對體力是連續的', formFactor(75) > formFactor(62) && formFactor(62) > formFactor(50));
    check('上下界維持 0.85 ~ 1.06', formFactor(0) >= 0.85 && formFactor(100) <= 1.06);

    // §11.1 的體力修正項：換讀數來源，不換量級（教練 2.0 ＋ 體力 ~1.5 ≈ 3.5 點）
    const rested = fresh('pw-hi', { stamina: 90, stage: 'PRO', league: 'LCK' });
    const spent = fresh('pw-lo', { stamina: 5, stage: 'PRO', league: 'LCK' });
    for (const s of [rested, spent]) s.mates = [1, 2, 3, 4].map((i) => ({ name: `M${i}`, rating: 70 }));
    check('體力進勝率公式', teamStrength(rested) > teamStrength(spent),
      `${teamStrength(rested).toFixed(2)} vs ${teamStrength(spent).toFixed(2)}`);
    check('體力修正是修正項不是主項（滿檔也不到 3 點）', staminaPower(STAMINA_MAX) < 3, staminaPower(STAMINA_MAX));
  }

  /* ---- §6.3 賽事期間：不能休息，只能減少訓練 ---- */
  {
    check('平時可以選休息', canRest({}) === true);
    check('賽事期間不能選休息', canRest({ inEvent: true }) === false);
    const inEvent = recoveryOptions({ inEvent: true });
    check('賽事期間的選項裡沒有「休息」', !inEvent.some((o) => o.id === 'rest'), JSON.stringify(inEvent.map((o) => o.id)));
    check('賽事期間提供「減少訓練」', inEvent.some((o) => o.id === 'light'));
    check('賽事期間唯一的恢復手段是心態調整',
      inEvent.filter((o) => o.cost < 0).map((o) => o.id).join() === 'mindset', JSON.stringify(inEvent));
    check('平時的休息比賽事期的心態調整有效',
      REST_RECOVER > Math.abs(inEvent.find((o) => o.id === 'mindset').cost));

    const tired = fresh('ev', { stamina: 10 });
    check('自動駕駛在賽事期間不會選休息', planMonth(tired, { inEvent: true }) !== 'rest',
      planMonth(tired, { inEvent: true }));
    check('同一個狀態在平時會選休息', planMonth(tired) === 'rest');
    check('體力夠就練', planMonth(fresh('ev2', { stamina: REST_AT + 1 })) === 'train');
  }

  /* ---- 經濟：一次休息換得回幾個訓練月 ---- */
  {
    // §6.1 的四個數字合起來要撐得住 3–4 個月的節奏，這是它的算術骨架
    const drainPerTrainMonth = TRAIN_COST + MATCH_MONTH_COST - MONTHLY_RECOVER;
    const gainPerRestMonth = REST_RECOVER + MONTHLY_RECOVER - MATCH_MONTH_COST;
    const cycle = gainPerRestMonth / drainPerTrainMonth + 1;
    check('一次休息撐得住 2–3 個訓練月（＝ 3–4 個月一休）',
      cycle >= 3 && cycle <= 4, `${cycle.toFixed(2)} 個月`);
    check('訓練是這個系統裡最貴的行動', TRAIN_COST > MATCH_MONTH_COST && TRAIN_COST > MONTHLY_RECOVER);
    check('休息比不休息明顯有感', REST_RECOVER > TRAIN_COST);
    log(`體力經濟：訓練月淨 −${drainPerTrainMonth}、休息月淨 +${gainPerRestMonth} → 循環 ${cycle.toFixed(2)} 個月`);
  }

  /* ---- 推進 N 個月：體力真的會上下，而且會踩到透支區 ---- */
  {
    const s = fresh('run');
    const period = advanceMonths(s, 24, { matchLoad: 1 });
    check('24 個月裡有休息', period.rests > 0, `${period.rests} 次`);
    check('休息不是多數行動', period.rests / 24 < 0.5, `${period.rests}/24`);
    check('透支區真的會踩到', period.low > 0, `${period.low} 個月`);
    check('休息有記進 restLog', s.restLog.length === period.rests, `${s.restLog.length} 筆`);
    check('月份計數是累計的', s.staminaMonth === 24, s.staminaMonth);
    check('谷底平均落在合理範圍', period.avg > 5 && period.avg < BAND_FRESH, period.avg.toFixed(1));

    const gaps = s.restLog.map((x) => x.month).slice(1).map((m, i) => m - s.restLog[i].month);
    check('休息間隔不是每個月一次', Math.min(...gaps) >= 2, JSON.stringify(gaps));

    // 不出賽（板凳／傷停）的月份不打比賽，體力壓力較小
    const benched = fresh('bench');
    const benchPeriod = advanceMonths(benched, 24, { matchLoad: 0 });
    check('不出賽的月份體力壓力較小', benchPeriod.rests <= period.rests,
      `板凳 ${benchPeriod.rests} 次 vs 先發 ${period.rests} 次`);
  }

  /* ---- 賽事消耗：逐局計價，走得越深越累 ---- */
  {
    check('BO 逐局計價', seriesCost(5) > seriesCost(3), `${seriesCost(5)} vs ${seriesCost(3)}`);
    check('一輪季後賽 BO 約 −18（§6.1）', Math.abs(seriesCost(4.3) - 18) < 2, seriesCost(4.3).toFixed(1));
    check('賽段月數由賽段權重換算', monthsFor(1) > monthsFor(1 / 3) && monthsFor(1 / 3) >= 1,
      `${monthsFor(1)} / ${monthsFor(0.5)} / ${monthsFor(1 / 3)}`);
  }

  /* ---- 一個賽段跑完，體力狀態會變 ---- */
  {
    const rng = new Rng('sta-season');
    const s = fresh('season', { stage: 'PRO', league: 'LCK', team: 'T1' });
    s.mates = [1, 2, 3, 4].map((i) => ({ name: `M${i}`, rating: 70 }));
    const before = s.stamina;
    simulateSeason(s, rng, 'LCK', 0.5, 1);
    check('打完一個賽段體力不會停在原地', s.stamina !== before, `${before} → ${s.stamina}`);
    check('賽段結束後仍在 0–100 之間', s.stamina >= 0 && s.stamina <= STAMINA_MAX, s.stamina);
    check('賽段有推進月份', s.staminaMonth === monthsFor(0.5), s.staminaMonth);
  }

  /* ---- 面板要顯示得出來（體力與隱藏心理相反，必須看得見） ---- */
  {
    check('每一段體力都查得到標籤', [0, 1, 29, 30, 59, 60, 100].every((v) => !!bandOf(v).label));
    check('充沛與透支不是同一個標籤', bandOf(90).key !== bandOf(10).key);
    check('0 有自己的標籤（§6.2 的第四格）', bandOf(0).key !== bandOf(1).key);
  }
}
