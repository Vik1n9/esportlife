/**
 * 體力：0–100 的消耗資源（V4 §6）。
 *
 * 這個 suite 守的是「經濟」與「曲線形狀」，不是某一個係數等於某個數字——係數還會被
 * S14（月回合制）與 S16（訓練選單）動。會紅的是形狀跑掉：休息不再有效、透支不再
 * 痛、賽事期間可以躺著休息、或者體力根本不會動。
 */
import { createState } from '../../src/engine/state.js';
import { INNATE_POOL } from '../../src/data/innate.js';
import { Rng } from '../../src/core/rng.js';
import {
  BAND_FRESH, BAND_TIRED, MATCH_MONTH_COST, MONTHLY_RECOVER, MONTHS_PER_YEAR, REHAB_RECOVER,
  REST_RECOVER, STAMINA_MAX, bandOf, canRest, consume,
  formFactor, injuryMul, monthlyDrift, recover, recoveryOptions, seriesCost,
  staminaOf, staminaPower, successMul, vitCoef,
} from '../../src/engine/stamina.js';
import { TRAINING_ACTIVITIES, resolveTraining, trainingMenu } from '../../src/engine/training.js';
import { injuryProbability } from '../../src/engine/progression.js';
import { simulateSeason } from '../../src/engine/season.js';
import { teamStrength } from '../../src/kernel/strength.js';
import { MONTHS_PER_YEAR as CAL_MONTHS, calendarFor } from '../../src/engine/calendar.js';
import { REST_AT, monthAction, playCareer } from '../lib/harness.mjs';

export const name = '體力資源與低體力懲罰曲線';

/** 設施制（S16）訓練活動的平均消耗——經濟骨架用「平均」取代舊的單一 TRAIN_COST */
const TRAIN_ACTS = TRAINING_ACTIVITIES.filter((a) => a.kind === 'train');
const AVG_TRAIN_COST = TRAIN_ACTS.reduce((t, a) => t + a.cost, 0) / TRAIN_ACTS.length;

const fresh = (seed = 'sta', extra = {}) => {
  const s = createState({ name: 'S', role: 'MID', seed });
  // 體力 suite 構造「乾淨狀態」測曲線形狀：出生天賦（鐵人 cap 受傷率、玻璃體質
  // 放大小傷轉大傷）會直接污染受傷機率的對照組，S19d 之後 createState 會預填
  // 天生特質，這裡一律清掉，場景只由體力與年齡決定
  for (const e of INNATE_POOL) delete s.traits[e.key];
  return Object.assign(s, extra);
};

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
    // 兩組出生流（seed）不同——S19d 位移後起始 attr／心理會跟著漂，覆寫成相同值，
    // 場景只由體力差決定，不被出生天賦的差異蓋過
    const rested = fresh('pw-hi', { stamina: 90, stage: 'PRO', league: 'LCK' });
    const spent = fresh('pw-lo', { stamina: 5, stage: 'PRO', league: 'LCK' });
    for (const s of [rested, spent]) {
      s.mates = [1, 2, 3, 4].map((i) => ({ name: `M${i}`, rating: 70 }));
      for (const k of Object.keys(s.attr)) s.attr[k] = 50;
      for (const k of Object.keys(s.mental)) s.mental[k] = 50;
    }
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
    // 復健預防自 S46 起不是玩家選項（`menu: false`），非賽事期的恢復手段只剩休息
    const offEvent = recoveryOptions({});
    check('非賽事期的恢復選項只剩休息', offEvent.map((o) => o.id).join() === 'rest',
      JSON.stringify(offEvent.map((o) => o.id)));
    check('賽事期間提供「減少訓練」', inEvent.some((o) => o.id === 'light'));
    check('賽事期間唯一的恢復手段是心態調整',
      inEvent.filter((o) => o.cost < 0).map((o) => o.id).join() === 'mindset', JSON.stringify(inEvent));
    check('平時的休息比賽事期的心態調整有效',
      REST_RECOVER > Math.abs(inEvent.find((o) => o.id === 'mindset').cost));
  }

  /* ---- 訓練活動結算：引擎報價，玩家決定（S16 設施制） ---- */
  {
    const tired = fresh('act', { stamina: 20 });
    const rest = resolveTraining(tired, new Rng('act-r'), 'rest');
    check('休息回得多', rest.recovered >= REST_RECOVER * 0.8, rest.recovered);

    const worn = fresh('act2', { stamina: 60, tempInjuryRisk: 10 });
    const before = worn.stamina;
    const rehab = resolveTraining(worn, new Rng('act2-r'), 'rehab');
    check('復健預防回得比休息少', rehab.recovered < REST_RECOVER, rehab.recovered);
    check('復健預防壓得下臨時受傷風險（§5.2 它唯一的賣點）', worn.tempInjuryRisk < 10, worn.tempInjuryRisk);
    check('復健預防的恢復量對得上 §6.1', Math.abs(rehab.recovered - REHAB_RECOVER) <= REHAB_RECOVER * 0.25);

    // 訓練活動的選單帶預期成功率，體力決定它——這是「引導休息」的關鍵資訊
    const freshState = fresh('menu', { stamina: 90 });
    const fullNote = trainingMenu(freshState).find((o) => o.id === 'study').note;
    const lowNote = trainingMenu(fresh('menu-low', { stamina: 10 })).find((o) => o.id === 'study').note;
    check('活動選單標了體力價格與預期成功率', /體力/.test(fullNote) && /成功率/.test(fullNote), fullNote);
    check('體力低時預期成功率跟著掉（引導休息）', lowNote !== fullNote, `${fullNote} vs ${lowNote}`);

    // 保守玩法的判準本身（策略住在測試網，不在引擎裡）
    const menu = { options: trainingMenu(fresh('menu2')) };
    check('保守玩法：體力不夠就休息', monthAction(fresh('p2', { stamina: REST_AT - 1 }), menu) === 'rest');
    const pick = monthAction(fresh('p1', { stamina: REST_AT + 1 }), menu);
    check('保守玩法：體力夠就練（選某個訓練活動）',
      TRAINING_ACTIVITIES.some((a) => a.id === pick && a.kind === 'train'), pick);
  }

  /* ---- 經濟：一次休息換得回幾個訓練月 ---- */
  {
    /*
     * §6.1 的數字合起來要撐得住 3–4 個養成回合的節奏，這是它的算術骨架。
     *
     * ⚠ **月份的組成要向年曆拿，不能假設「每個月都有比賽」。** S13 寫這條時一年只有
     * 10 個「有比賽的月」，所以直接用 `TRAIN_COST + MATCH_MONTH_COST`；S14 之後一年是
     * 12 個真月份，其中只有一部分是常規賽月，還有五個月是賽事序列（季後賽／MSI／
     * 世界賽）——那幾個月玩家不訓練，卻照樣有自然恢復，等於每個循環都被灌進一筆
     * 額外的體力。照舊式算下去會得到 2.66，而實測是 3.76：算錯的是模型，不是遊戲。
     *
     * S16 設施制把「訓練消耗」拆成 20／25／30 三檔（§5.2），經濟骨架改用它們的平均
     * （＝27，正好是舊 TRAIN_COST），所以這條骨架在設施制下原封不動。
     */
    const cal = calendarFor({ year: 2019 }, 'LCK');
    const dev = cal.filter((p) => p.kind === 'MONTH');
    const matchShare = dev.filter((p) => p.matchWeight > 0).length / dev.length;
    const eventMonths = CAL_MONTHS - dev.length;

    const matchCost = MATCH_MONTH_COST * matchShare;
    const drainPerTrainMonth = AVG_TRAIN_COST + matchCost - MONTHLY_RECOVER;
    const gainPerRestMonth = REST_RECOVER + MONTHLY_RECOVER - matchCost;
    // 賽事月只有自然恢復與系列賽消耗（一年約兩輪 BO5＝8 局），攤回每個養成回合
    const surplus = (eventMonths * MONTHLY_RECOVER - seriesCost(8)) / dev.length;
    const cycle = (gainPerRestMonth + drainPerTrainMonth) / (drainPerTrainMonth - surplus);

    check('一次休息撐得住 2–3 個訓練月（＝ 3–4 個養成回合一休）',
      cycle >= 3 && cycle <= 4, `${cycle.toFixed(2)} 個養成回合`);
    check('訓練是這個系統裡最貴的行動', AVG_TRAIN_COST > MATCH_MONTH_COST && AVG_TRAIN_COST > MONTHLY_RECOVER);
    check('休息比不休息明顯有感', REST_RECOVER > AVG_TRAIN_COST);
    check('賽事月不是白給的：一年的自然恢復擋不掉一年的訓練消耗',
      CAL_MONTHS * MONTHLY_RECOVER < dev.length * AVG_TRAIN_COST,
      `${CAL_MONTHS * MONTHLY_RECOVER} vs ${(dev.length * AVG_TRAIN_COST).toFixed(0)}`);
    log(`體力經濟：${dev.length} 個養成回合（${(matchShare * 100).toFixed(0)}% 有比賽）、`
      + `${eventMonths} 個賽事月｜訓練月淨 −${drainPerTrainMonth.toFixed(1)}、休息月淨 `
      + `+${gainPerRestMonth.toFixed(1)}、賽事月回沖 +${surplus.toFixed(1)} → 循環 ${cycle.toFixed(2)}`);
  }

  /* ---- 跑一段真的生涯：月回合推得動體力，而且會踩到透支區 ---- */
  {
    // S13 這裡量的是引擎自動駕駛跑 24 個月。S14 之後沒有自動駕駛了，量的對象換成
    // 「月回合 ＋ 保守玩法」真的跑出來的一段生涯——那才是玩家會遇到的節奏
    const { state: s } = playCareer({ seed: 'sta-run', role: 'MID' });
    const months = s.staminaLog.months;
    check('生涯真的推進了月份', months > 50, months);
    check('有休息', s.restLog.length > 0, `${s.restLog.length} 次`);
    check('休息不是多數行動', s.restLog.length / months < 0.5, `${s.restLog.length}/${months}`);
    check('透支區真的會踩到', s.staminaLog.low > 0, `${s.staminaLog.low} 個月`);
    check('體力全程夾在 0–100', s.stamina >= 0 && s.stamina <= STAMINA_MAX, s.stamina);

    const gaps = s.restLog.map((x) => x.month).slice(1).map((m, i) => m - s.restLog[i].month);
    // 連著兩個回合都休息是允許的（體力見底的人回不到訓練線），但必須是例外。
    // S13 這裡寫的是「最小間隔 ≥ 2」，那在自動駕駛底下成立；玩家自己決定之後，
    // 體質差又被季後賽榨乾的人會真的需要連休兩個月——一律禁止等於禁掉一種真實處境
    const backToBack = gaps.filter((g) => g === 1).length / Math.max(1, gaps.length);
    check('休息不是每個月一次（連休是例外，不是常態）',
      backToBack < 0.2, `連休佔 ${(backToBack * 100).toFixed(1)}%`);
    check('一年 12 個月都在模型裡（休賽期不再被跳過）', MONTHS_PER_YEAR === 12);
  }

  /* ---- 賽事消耗：逐局計價，走得越深越累 ---- */
  {
    check('BO 逐局計價', seriesCost(5) > seriesCost(3), `${seriesCost(5)} vs ${seriesCost(3)}`);
    check('一輪季後賽 BO 約 −18（§6.1）', Math.abs(seriesCost(4.3) - 18) < 2, seriesCost(4.3).toFixed(1));
  }

  /* ---- 模擬比賽不再偷推時間（S14：推進月份的是月回合，不是賽季模擬） ---- */
  {
    const rng = new Rng('sta-season');
    const s = fresh('season', { stage: 'PRO', league: 'LCK', team: 'T1' });
    s.mates = [1, 2, 3, 4].map((i) => ({ name: `M${i}`, rating: 70 }));
    const before = s.stamina;
    const month = s.staminaMonth;
    simulateSeason(s, rng, 'LCK', 0.5, 1);
    check('模擬常規賽不推進月份', s.staminaMonth === month, s.staminaMonth);
    check('模擬常規賽本身不扣體力（扣款在月回合裡）', s.stamina === before, `${before} → ${s.stamina}`);

    // 體力照樣進表現：同一批比賽，透支的人手感較差
    const worn = fresh('season-worn', { stage: 'PRO', league: 'LCK', team: 'T1', stamina: 5 });
    worn.mates = s.mates;
    const fit = simulateSeason(fresh('season-fit', { stage: 'PRO', league: 'LCK', team: 'T1' }),
      new Rng('sta-cmp'), 'LCK', 0.5, 1, 95);
    const tiredStat = simulateSeason(worn, new Rng('sta-cmp'), 'LCK', 0.5, 1, 5);
    check('體力低的人同一批比賽贏得少', tiredStat.W <= fit.W, `${tiredStat.W} vs ${fit.W}`);
  }

  /* ---- 面板要顯示得出來（體力與隱藏心理相反，必須看得見） ---- */
  {
    check('每一段體力都查得到標籤', [0, 1, 29, 30, 59, 60, 100].every((v) => !!bandOf(v).label));
    check('充沛與透支不是同一個標籤', bandOf(90).key !== bandOf(10).key);
    check('0 有自己的標籤（§6.2 的第四格）', bandOf(0).key !== bandOf(1).key);
  }
}
