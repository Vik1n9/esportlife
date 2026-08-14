/**
 * 設施制訓練（V4 §5）：活動表、兩階段判定、成長公式、訓練事件卡。
 *
 * 這站換掉了整個「骰子加點」協定，所以這個 suite 是它自己的守門員：活動表形狀、
 * 成功率吃體力、成功係數對照、成長只漲活動涵蓋的屬性、休息／復健的副作用、以及
 * 「普通成敗不碰心理、受傷只在大失敗」這條 §14.8.4／§6.2 的邊界。
 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import {
  SUCCESS_COEF, TRAIN_YIELD, TRAINING_ACTIVITIES, expectedSuccess, resolveTraining, tickActiveEffects,
} from '../../src/engine/training.js';
import { TRAINING_CARDS } from '../../src/data/trainingCards.js';
import { ATTRS } from '../../src/data/attributes.js';
import { staminaOf } from '../../src/engine/stamina.js';

export const name = '設施制訓練與訓練事件卡';

const fresh = (seed = 'tr', extra = {}) => Object.assign(
  createState({ name: 'T', role: 'MID', seed }), extra,
);

export async function run({ check, log }) {
  /* ---- 活動表形狀（§5.2） ---- */
  {
    check('八項訓練活動', TRAINING_ACTIVITIES.length === 8, String(TRAINING_ACTIVITIES.length));
    const train = TRAINING_ACTIVITIES.filter((a) => a.kind === 'train');
    check('六個漲屬性的活動、其餘是英雄池／休息／復健', train.length === 5, String(train.length));
    for (const a of train) {
      const sum = Object.values(a.weights).reduce((t, v) => t + v, 0);
      check(`訓練活動 ${a.id} 的屬性權重和為 1`, Math.abs(sum - 1) < 1e-9, `${a.id} 和 ${sum}`);
    }
    const rest = TRAINING_ACTIVITIES.find((a) => a.id === 'rest');
    check('休息的體力消耗是負的（恢復）', rest.cost < 0, rest.cost);
  }

  /* ---- 預期成功率吃體力（§5.4 階段一） ---- */
  {
    const a = TRAINING_ACTIVITIES.find((x) => x.id === 'mechanics');
    const hi = fresh('ps-hi', { stamina: 90 });
    const lo = fresh('ps-lo', { stamina: 10 });
    check('體力高時預期成功率較高', expectedSuccess(hi, a) > expectedSuccess(lo, a),
      `${(expectedSuccess(hi, a) * 100).toFixed(0)}% vs ${(expectedSuccess(lo, a) * 100).toFixed(0)}%`);
    check('滿體力成功率不高於 100%', expectedSuccess(hi, a) <= 1, expectedSuccess(hi, a));
    check('見底體力成功率不低於 0', expectedSuccess(lo, a) >= 0, expectedSuccess(lo, a));
  }

  /* ---- 成功係數對照（§5.4） ---- */
  {
    check('成功係數：大成功 1.5／成功 1.0／失敗 0.3／大失敗 0',
      SUCCESS_COEF.great_success === 1.5 && SUCCESS_COEF.success === 1.0
      && SUCCESS_COEF.failure === 0.3 && SUCCESS_COEF.great_failure === 0,
      JSON.stringify(SUCCESS_COEF));
    check('基礎成長值是正數（§21.2 旋鈕）', TRAIN_YIELD > 0, TRAIN_YIELD);
  }

  /* ---- 成長只漲活動涵蓋的屬性（§5.3 權重） ---- */
  {
    const s = fresh('grow', { stamina: 90 });
    const before = { ...s.attr };
    const result = resolveTraining(s, new Rng('grow-r'), 'mechanics');
    const grew = ATTRS.filter((k) => s.attr[k] > before[k]);
    check('訓練後有屬性成長', grew.length > 0, grew.join('、'));
    check('mechanics 只漲 tec／agi', grew.every((k) => ['tec', 'agi'].includes(k)), grew.join('、'));
    check('結算結果標了檔位與成功係數', typeof result.tier === 'string' && result.successCoef === SUCCESS_COEF[result.tier]);
  }

  /* ---- 休息／復健：恢復體力、復健降風險，都不漲屬性 ---- */
  {
    const s = fresh('rest', { stamina: 20 });
    const before = s.stamina;
    const attrBefore = { ...s.attr };
    const rest = resolveTraining(s, new Rng('rest-r'), 'rest');
    check('休息恢復體力', rest.recovered > 0 && s.stamina > before, s.stamina);
    check('休息不漲屬性', ATTRS.every((k) => s.attr[k] === attrBefore[k]));

    const worn = fresh('rehab', { stamina: 60, tempInjuryRisk: 10 });
    resolveTraining(worn, new Rng('rehab-r'), 'rehab');
    check('復健壓得下臨時受傷風險（§5.2 唯一的賣點）', worn.tempInjuryRisk < 10, worn.tempInjuryRisk);
  }

  /* ---- 英雄池練習：漲英雄專精，不漲屬性 ---- */
  {
    const s = fresh('hero', { stamina: 90 });
    const attrBefore = { ...s.attr };
    resolveTraining(s, new Rng('hero-r'), 'heroes');
    const mastery = Object.values(s.mastery).reduce((t, v) => t + v, 0);
    check('英雄池練習累積專精', mastery > 0, String(mastery));
    check('英雄池練習不漲屬性', ATTRS.every((k) => s.attr[k] === attrBefore[k]));
  }

  /* ---- 訓練事件卡：普通成敗不碰心理，大成功／大失敗才碰（§14.8.4） ---- */
  {
    const byTier = Object.fromEntries(TRAINING_CARDS.map((c) => [c.tier, c]));
    check('普通成功卡不帶心理效果', !byTier.success.effects.mental);
    check('普通失敗卡不帶心理效果', !byTier.failure.effects.mental);
    check('大成功卡帶心理效果', !!byTier.great_success.effects.mental);
    check('大失敗卡帶心理效果', !!byTier.great_failure.effects.mental);
    check('受傷只由大失敗卡承擔（§6.2）',
      byTier.great_failure.effects.injury === true && !byTier.success.effects.injury
      && !byTier.failure.effects.injury && !byTier.great_success.effects.injury);
  }

  /* ---- activeEffects：大成功寫入短期 buff，每月遞減 ---- */
  {
    const s = fresh('eff', { stamina: 90, activeEffects: [{ id: 'momentum', label: '手感火燙', months: 2, trainBoost: 0.05 }] });
    tickActiveEffects(s);
    check('activeEffects 剩餘月數遞減', s.activeEffects[0].months === 1, s.activeEffects[0].months);
    tickActiveEffects(s);
    check('剩餘月數歸零後移除', s.activeEffects.length === 0, s.activeEffects.length);
  }

  /* ---- 結算結果帶訓練事件卡文本（month.js 組卡用） ---- */
  {
    const s = fresh('card', { stamina: 90 });
    const result = resolveTraining(s, new Rng('card-r'), 'mechanics');
    check('結算結果帶檔位對應的卡', !!result.card && result.card.tier === result.tier, result.card?.tier);
    check('結算後體力被消耗', staminaOf(s) < 90, staminaOf(s));
  }

  log(`設施制訓練：${TRAINING_ACTIVITIES.length} 個活動、${TRAINING_CARDS.length} 張訓練事件卡（假卡）`);
}
