/**
 * 教練六選一（S49）：資料表不變式 ＋ 教練效果進 modifier 系統 ＋ 各消費端接線。
 *
 * 六個教練的機制效果是 coachBonus 之外「教練有差別」的全部——戰力點平均 2.0 是
 * §11.1 的跨筆硬約束（動任一個數字都要補回，否則整個聯盟強度集體位移），效果鍵
 * 錯一個就是整型教練退化成純戰力點（打錯鍵只會靜默失效）。
 */
import { createState } from '../../src/engine/state.js';
import { COACHES } from '../../src/data/coaches.js';
import {
  COACH_FACTORS, coachFactors, coachOf, factor, flag, immune, lifecycleWindows,
} from '../../src/kernel/modifiers.js';
import { EFFECT_KEYS } from '../../tools/schema.js';
import { coachBonus } from '../../src/kernel/strength.js';
import { injuryProbability } from '../../src/engine/progression.js';
import { driftMental } from '../../src/engine/mental.js';
import { recover, trainCost } from '../../src/engine/stamina.js';
import { trainingMenu } from '../../src/engine/training.js';

const withCoach = (name) => {
  const s = createState({ name: 'C', role: 'MID', seed: 'coach' });
  s.coach = name;
  return s;
};

/** vit／體力釘在中性，把教練以外的變因全部固定 */
const neutralize = (s) => { s.attr.vit = 60; s.stamina = 100; return s; };

export const name = '教練六選一：資料表不變式與 modifier 接線';

export async function run({ check }) {
  /* ---- 資料表不變式 ---- */
  {
    check('教練六筆（S49 起）', COACHES.length === 6, `${COACHES.length}`);
    check('教練名字唯一', new Set(COACHES.map((c) => c.name)).size === 6);
    const mean = COACHES.reduce((t, c) => t + c.bonus, 0) / COACHES.length;
    check('戰力點平均 == 2.0（§11.1 硬約束）', mean === 2.0, `${mean}`);
    check('每個教練都有 desc 與機制效果',
      COACHES.every((c) => typeof c.desc === 'string' && c.desc.length > 0
        && c.effects && Object.keys(c.effects).length > 0));
    check('訓練狂帶副作用（§13.1 雙面性，不該有純益教練）',
      COACHES.find((c) => c.name === '訓練狂').sideEffects != null);
  }

  /* ---- 效果鍵全在 EFFECT_KEYS（打錯字只會靜默失效，這條擋掉它） ---- */
  {
    const bad = [];
    for (const c of COACHES) {
      for (const side of ['effects', 'sideEffects']) {
        for (const k of Object.keys(c[side] || {})) {
          if (!EFFECT_KEYS.includes(k)) bad.push(`${c.name}.${k}`);
        }
      }
    }
    check('教練效果鍵全在 EFFECT_KEYS', bad.length === 0, bad.join('、'));
    const clampOk = Object.values(COACH_FACTORS)
      .every((e) => Array.isArray(e.clamp) && e.clamp.length === 2 && e.clamp[0] < 1 && e.clamp[1] > 1 && e.clamp[0] < e.clamp[1]);
    check('教練四倍率鍵的 clamp 都是含 1 的閉區間', clampOk, JSON.stringify(COACH_FACTORS));
  }

  /* ---- 教練效果真的進得了 factor／flag（第五個效果來源） ---- */
  {
    check('coachOf 依名字查表', coachOf(withCoach('訓練狂'))?.bonus === 1.5);
    check('無教練時 coachOf 回 null', coachOf(withCoach(null)) === null);

    check('訓練狂 → trainYield ×1.15', factor(withCoach('訓練狂'), 'trainYield') === 1.15);
    check('無教練 → trainYield 1.0', factor(withCoach(null), 'trainYield') === 1.0);
    check('訓練狂 → trainCostMul ×1.10（副作用）', factor(withCoach('訓練狂'), 'trainCostMul') === 1.1);
    check('體能教練 → trainCostMul ×0.85', factor(withCoach('體能教練'), 'trainCostMul') === 0.85);
    check('體能教練 → recoverMul ×1.15', factor(withCoach('體能教練'), 'recoverMul') === 1.15);
    check('體能教練 → injuryRate ×0.85', factor(withCoach('體能教練'), 'injuryRate') === 0.85);
    check('戰術大師 → tacticMul ×1.3', factor(withCoach('戰術大師'), 'tacticMul') === 1.3);
    check('版本先知 → patchDebt ×0.5', factor(withCoach('版本先知'), 'patchDebt') === 0.5);
    check('心理輔導 → benchRisk ×0.8', factor(withCoach('心理輔導'), 'benchRisk') === 0.8);
    check('心理輔導 → mentalConverge 旗標', flag(withCoach('心理輔導'), 'mentalConverge') === true);
    check('無教練 → mentalConverge 不亮', flag(withCoach(null), 'mentalConverge') === false);
    check('經紀團隊 → endorsement ×1.25', factor(withCoach('經紀團隊'), 'endorsement') === 1.25);

    check('戰力點照常進 coachBonus（戰術大師 +3.0）', coachBonus(withCoach('戰術大師')) === 3.0);
    check('無教練 coachBonus 為 0', coachBonus(withCoach(null)) === 0);
  }

  /* ---- offerPenalty 免疫（同鍵 immune 寫法，S49 定案） ---- */
  {
    const agent = withCoach('經紀團隊');
    check('經紀團隊 → offerPenalty 免疫', immune(agent, 'offerPenalty') === true);
    check('無教練不免疫', immune(withCoach(null), 'offerPenalty') === false);
    const pariah = withCoach('經紀團隊');
    pariah.traits.pariah = true;
    check('圈內毒瘤的旗標仍真（免疫不抹除旗標本身）', flag(pariah, 'offerPenalty') === true);
    check('經紀團隊免疫圈內毒瘤（消費端以 !immune 短路）', immune(pariah, 'offerPenalty') === true);
    const barePariah = withCoach(null);
    barePariah.traits.pariah = true;
    check('沒請經紀團隊不免疫', immune(barePariah, 'offerPenalty') === false);
  }

  /* ---- 消費端接線：訓練成本／恢復／受傷率 ---- */
  {
    const fitness = neutralize(withCoach('體能教練'));
    check('體能教練：trainCost 30 → 26（×0.85）', trainCost(fitness, 30) === 26, `${trainCost(fitness, 30)}`);
    const grinder = neutralize(withCoach('訓練狂'));
    check('訓練狂：trainCost 30 → 33（×1.10 副作用）', trainCost(grinder, 30) === 33, `${trainCost(grinder, 30)}`);
    const neutral = neutralize(withCoach(null));
    check('無教練：trainCost 30 → 30', trainCost(neutral, 30) === 30);

    const stacked = withCoach('體能教練');
    stacked.attr.vit = 100;   // vitCostCoef 0.8 × trainCostMul 0.85，乘積下限照 S47 交接交 S50
    check('vit 100＋體能教練：trainCost 30 → 20（0.8×0.85 乘積，round 只在最後）',
      trainCost(stacked, 30) === 20, `${trainCost(stacked, 30)}`);

    const r = neutralize(withCoach('體能教練'));
    r.stamina = 50;
    recover(r, 20);
    check('體能教練：recover 20 → 73（×1.15）', r.stamina === 73, `${r.stamina}`);

    const plain = neutralize(withCoach(null));
    const low = injuryProbability(plain);
    const lowFit = injuryProbability(fitness);
    check('體能教練：受傷率 ×0.85（同條件下更低）', lowFit < low && Math.abs(lowFit - low * 0.85) < 1e-9,
      `無教練=${low}／體能教練=${lowFit}`);

    // cap 仍最後套：鐵人（injuryRate cap 10）之下，教練的乘法不突破天花板
    const ironNoCoach = neutralize(withCoach(null));
    ironNoCoach.traits.iron = true;
    const ironFit = neutralize(withCoach('體能教練'));
    ironFit.traits.iron = true;
    check('鐵人 cap 10 與教練乘法並存（cap 最後套）',
      injuryProbability(ironNoCoach) === 10 && injuryProbability(ironFit) === 10,
      `無教練=${injuryProbability(ironNoCoach)}／體能教練=${injuryProbability(ironFit)}`);
  }

  /* ---- 選單不能說謊：教練折扣進顯示（S47 不變式的 S49 延伸） ---- */
  {
    const fitness = neutralize(withCoach('體能教練'));
    const menu = trainingMenu(fitness);
    const rest = menu.find((m) => m.id === 'rest');
    check('休息顯示含 recoverMul（與 recover 同算式）',
      rest.staminaDelta === Math.round(50 * 1 * 1.15), `${rest.staminaDelta}`);
    const scrim = menu.find((m) => m.id === 'scrim');
    check('消耗顯示走 trainCost（含 trainCostMul）', scrim.staminaDelta === -trainCost(fitness, 30),
      `${scrim.staminaDelta}`);
  }

  /* ---- 心理漂移收斂（心理輔導，S49 定案：六維逐年向中性 ±1） ---- */
  {
    const mk = (coach) => {
      const s = withCoach(coach);
      s.mental = { comp: 80, conf: 50, drive: 20, disc: 30, trust: 70, resl: 10 };
      s.traits = {};
      return s;
    };
    const psych = mk('心理輔導');
    driftMental(psych);
    check('心理輔導：六維向 50 收斂 ±1（80→79／20→21／30→31／10→11）',
      psych.mental.comp === 79 && psych.mental.drive === 21
      && psych.mental.disc === 31 && psych.mental.resl === 11,
      JSON.stringify(psych.mental));
    check('心理輔導：50 的維度不振盪', psych.mental.conf === 50);
    check('心理輔導：trust 收斂加倍（標準 −1 ＋ 收斂 −1 → 68）', psych.mental.trust === 68,
      `${psych.mental.trust}`);

    const plain = mk(null);
    driftMental(plain);
    check('無教練：只有 trust 收斂（70 → 69），其餘不動',
      plain.mental.trust === 69 && plain.mental.comp === 80 && plain.mental.drive === 20,
      JSON.stringify(plain.mental));

    const stuckFit = mk('心理輔導');
    stuckFit.traits.trashtalk = true;
    stuckFit.mental.trust = 40;
    driftMental(stuckFit);
    check('心理輔導：trashtalk 卡住標準收斂，輔導迴圈照走（40 → 41）', stuckFit.mental.trust === 41,
      `${stuckFit.mental.trust}`);
  }

  /* ---- clamp：教練與史詩特質疊加時各自受夾（S49 完成定義） ---- */
  {
    const grinder = withCoach('訓練狂');
    grinder.epic.ascetic = true;   // 史詩特質：growth_rate_mul 1.15
    check('訓練狂＋成長史詩：trainYield 夾在 2.0 內', coachFactors(grinder).trainYield === 1.15);
    check('訓練狂＋成長史詩：growth_rate_mul 夾在 2.0 內', lifecycleWindows(grinder).growth_rate_mul === 1.15);
    check('無教練 coachFactors 全 1',
      Object.values(coachFactors(withCoach(null))).every((v) => v === 1));
  }
}
