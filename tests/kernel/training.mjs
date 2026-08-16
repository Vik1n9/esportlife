/**
 * 設施制訓練（V4 §5）：活動表、兩階段判定、成長公式、訓練事件卡。
 *
 * 這站換掉了整個「骰子加點」協定，所以這個 suite 是它自己的守門員：活動表形狀、
 * 成功率吃體力、成功係數對照、成長只漲活動涵蓋的屬性、休息／復健的副作用、以及
 * 「普通成敗不碰心理、受傷只在大失敗」這條 §14.8.4／§6.2 的邊界。
 *
 * S18 之後訓練卡是完整目錄（60 張）：兜底 24（6 活動 × 4 檔位，永不空池）＋
 * PRO 20（低體力危險 4／高體力獎勵 4／一般 12）＋ AM2 8 ＋ 業餘 8。抽卡改
 * `drawTrainingCard`：activity／stage／stamina 過濾 ＋ weight 加權。
 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import {
  SUCCESS_COEF, TRAIN_YIELD, TRAINING_ACTIVITIES, drawTrainingCard,
  expectedSuccess, resolveTraining, tickActiveEffects, trainingMenu,
} from '../../src/engine/training.js';
import { TRAINING_CARDS, poolOfTier } from '../../src/data/trainingCards.js';
import { ATTR_NAMES, ATTRS } from '../../src/data/attributes.js';
import { MENTAL_KEYS } from '../../src/data/mental.js';
import { staminaOf } from '../../src/engine/stamina.js';

export const name = '設施制訓練與訓練事件卡';

const ACTIVITY_IDS = ['mechanics', 'scrim', 'vod', 'fitness', 'soloq', 'heroes'];
const TIERS = ['great_success', 'success', 'failure', 'great_failure'];

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

  /* ---- 完整目錄（S18）：數量、id、weight、tier 一致 ---- */
  {
    check('訓練卡 60 張（兜底 24＋PRO 20＋AM2 8＋業餘 8）', TRAINING_CARDS.length === 60, String(TRAINING_CARDS.length));
    check('id 唯一', new Set(TRAINING_CARDS.map((c) => c.id)).size === TRAINING_CARDS.length);
    check('weight 全部 > 0', TRAINING_CARDS.every((c) => c.weight > 0));
    // 池別是 tier 的導出值（S20c／N19），不是欄位——沒有第二份手抄本就沒有「對不上」
    check('池別不再是手抄欄位（60 張都沒有 pool）', TRAINING_CARDS.every((c) => c.pool === undefined));
    check('poolOfTier 把四個檔位分成兩池',
      poolOfTier('great_success') === 'success' && poolOfTier('success') === 'success'
      && poolOfTier('failure') === 'failure' && poolOfTier('great_failure') === 'failure');
    for (const tier of TIERS) {
      check(`每個檔位至少 1 張（${tier}）`, TRAINING_CARDS.some((c) => c.tier === tier));
    }
    // 兜底保證：每個活動 × 檔位都有「只標 activity」的無條件卡（不標 stage／stamina）
    for (const act of ACTIVITY_IDS) {
      for (const tier of TIERS) {
        const base = TRAINING_CARDS.filter((c) =>
          c.activity?.includes(act) && c.tier === tier && !c.stage && !c.stamina);
        check(`兜底：${act} × ${tier} 有無條件卡`, base.length === 1, String(base.length));
      }
    }
    check('stage 值全在 STAGES 內', TRAINING_CARDS.every((c) =>
      !c.stage || c.stage.every((s) => ['AMATEUR', 'AM2', 'PRO'].includes(s))));
    check('stamina 是合法閉區間 [lo,hi]', TRAINING_CARDS.every((c) =>
      !c.stamina || (Array.isArray(c.stamina) && c.stamina.length === 2
        && c.stamina[0] <= c.stamina[1] && c.stamina[0] >= 0 && c.stamina[1] <= 100)));
    check('activity 值全在六活動內', TRAINING_CARDS.every((c) =>
      !c.activity || c.activity.every((a) => ACTIVITY_IDS.includes(a))));
  }

  /* ---- 心理／受傷／attr 邊界（§14.8.4／§6.2） ---- */
  {
    const mentalCards = (tier) => TRAINING_CARDS
      .filter((c) => c.tier === tier && c.effects?.mental)
      .map((c) => Object.values(c.effects.mental));
    const flat = (arr) => arr.flat();
    const great = flat([...mentalCards('great_success'), ...mentalCards('great_failure')]);
    check('大成功／大失敗心理增減 |v| ≤ 5', great.every((v) => Math.abs(v) <= 5), String(great));
    check('普通成功卡不帶心理效果', TRAINING_CARDS.every((c) =>
      c.tier === 'success' ? !c.effects?.mental : true));
    check('普通失敗卡不帶心理效果', TRAINING_CARDS.every((c) =>
      c.tier === 'failure' ? !c.effects?.mental : true));
    check('受傷只由大失敗卡承擔（§6.2）', TRAINING_CARDS.every((c) =>
      c.effects?.injury ? c.tier === 'great_failure' : true));
    check('受傷只標在 PRO 低體力卡（[0,39]）', TRAINING_CARDS.every((c) => {
      if (!c.effects?.injury) return true;
      return c.stage?.includes('PRO') && c.stamina?.[0] >= 0 && c.stamina?.[1] <= 39;
    }));
    check('業餘／AM2 卡 attr 幅度 ≤ ±1', TRAINING_CARDS.every((c) => {
      if (!c.stage || !c.effects?.attr) return true;
      const isYouth = c.stage.includes('AMATEUR') || c.stage.includes('AM2');
      if (!isYouth) return true;
      return Object.values(c.effects.attr).every((v) => Math.abs(v) <= 1);
    }));
    check('業餘／AM2 卡無 injury 大失敗', TRAINING_CARDS.every((c) => {
      if (!c.stage || (!c.stage.includes('AMATEUR') && !c.stage.includes('AM2'))) return true;
      return !c.effects?.injury;
    }));
  }

  /* ---- 池抽（S18）：activity／stage／stamina 過濾生效 ---- */
  {
    const rng = new Rng('draw-pro');
    const s = fresh('draw-pro', { stamina: 80, stage: 'PRO' });
    const drawn = new Set();
    for (let i = 0; i < 300; i++) {
      const c = drawTrainingCard(s, rng, 'scrim', 'success');
      drawn.add(c.id);
      check('抽到的卡 tier 正確', c.tier === 'success', c.tier);
      check('抽到的卡 activity 包含該活動或全活動', !c.activity || c.activity.includes('scrim'), c.id);
      check('PRO 抽不到業餘／AM2 卡', c.stage === undefined || c.stage.includes('PRO'), c.id);
    }
    check('scrim 成功池抽得出多張不同卡', drawn.size > 1, `共 ${drawn.size} 張`);

    // stage 過濾：業餘期抽不到 PRO 卡
    const am = fresh('draw-am', { stamina: 80, stage: 'AMATEUR' });
    const rng2 = new Rng('draw-am-r');
    for (let i = 0; i < 100; i++) {
      const c = drawTrainingCard(am, rng2, 'mechanics', 'great_success');
      check('業餘抽不到 PRO 卡', !c.stage || c.stage.includes('AMATEUR'), `${c.id} stage=${c.stage}`);
    }

    // stamina 過濾：低體力時 PRO 危險卡進池、高體力不進
    const lo = fresh('draw-lo', { stamina: 20, stage: 'PRO' });
    const hi = fresh('draw-hi', { stamina: 90, stage: 'PRO' });
    const rngLo = new Rng('draw-lo-r');
    const rngHi = new Rng('draw-hi-r');
    const lowDanger = new Set(['tr_pro_low_mech', 'tr_pro_low_scrim', 'tr_pro_low_fit', 'tr_pro_low_soloq']);
    let lowHit = 0, hiHit = 0;
    for (let i = 0; i < 400; i++) {
      if (lowDanger.has(drawTrainingCard(lo, rngLo, 'mechanics', 'great_failure').id)) lowHit++;
      if (lowDanger.has(drawTrainingCard(hi, rngHi, 'mechanics', 'great_failure').id)) hiHit++;
    }
    check('低體力時危險卡進池（有機會抽到）', lowHit > 0, `低體力命中 ${lowHit}/400`);
    check('高體力時危險卡不進池', hiHit === 0, `高體力命中 ${hiHit}/400`);
  }

  /* ---- 池抽：weight 加權（2:1 的池，長樣本比例收斂） ---- */
  {
    const s = fresh('draw-w', { stamina: 80, stage: 'AM2' });
    const rng = new Rng('draw-w-r');
    // AM2 的 great_success 池 = 兜底 6（weight 3 each）＋ AM2 6 張（weight 6 each）
    const base = new Set(['tr_mechanics_great_success', 'tr_scrim_great_success', 'tr_vod_great_success',
      'tr_fitness_great_success', 'tr_soloq_great_success', 'tr_heroes_great_success']);
    let am2Hit = 0;
    const N = 1200;
    for (let i = 0; i < N; i++) {
      const c = drawTrainingCard(s, rng, 'mechanics', 'great_success');
      if (!base.has(c.id)) am2Hit++;
    }
    const ratio = am2Hit / N;
    check('weight 加權生效：AM2 卡（6）約兩倍於兜底卡（3）',
      ratio > 0.55 && ratio < 0.75, `AM2 命中率 ${(ratio * 100).toFixed(1)}%`);
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
    check('結算結果有 attrNotes 欄位', Array.isArray(result.attrNotes), typeof result.attrNotes);
    check('結算後體力被消耗', staminaOf(s) < 90, staminaOf(s));
  }

  /* ---- 選單的結構化欄位（§22.2.1 三項並列，S39） ---- */
  // 訓練選項的三段資訊（體力增減／影響屬性／預期成功率）必須以機器欄位給 UI，
  // 不能再只有一條壓扁的字串；note 保留，且兩者必須同源（同一份計算結果）
  {
    const state = fresh('menu-s', { stamina: 90 });
    const menu = trainingMenu(state);
    check('選單與活動表同長', menu.length === TRAINING_ACTIVITIES.length, String(menu.length));
    for (const opt of menu) {
      const act = TRAINING_ACTIVITIES.find((a) => a.id === opt.id);
      check(`${act.id}：staminaDelta 與 cost 反號（正＝恢復）`,
        opt.staminaDelta === -act.cost, `${opt.staminaDelta} vs cost ${act.cost}`);
      if (act.kind === 'rest' || act.kind === 'rehab') {
        check(`${act.id}：休息／復健不分成敗`, opt.successRate === null, String(opt.successRate));
        check(`${act.id}：休息／復健不影響屬性`, Array.isArray(opt.attrs) && opt.attrs.length === 0, JSON.stringify(opt.attrs));
      } else {
        check(`${act.id}：successRate 等於 expectedSuccess 的四捨五入（不重算）`,
          opt.successRate === Math.round(expectedSuccess(state, act) * 100),
          `${opt.successRate} vs ${expectedSuccess(state, act)}`);
        check(`${act.id}：attrs 就是活動的屬性鍵`,
          JSON.stringify(opt.attrs) === JSON.stringify(Object.keys(act.weights)), JSON.stringify(opt.attrs));
      }
    }
    // note 是同一份計算結果的另一種呈現——過寫入端的欄位重建一遍，不手抄字串
    const mech = menu.find((o) => o.id === 'mechanics');
    const mechNote = `體力 −${-mech.staminaDelta}　${mech.attrs.map((k) => ATTR_NAMES[k]).join('·')}　成功率 ${mech.successRate}%`;
    check('note 與結構化欄位同源（重建後逐字相同）', mech.note === mechNote, `${mech.note} vs ${mechNote}`);
    const rest = menu.find((o) => o.id === 'rest');
    check('休息的 note 也走同一份欄位', rest.note.includes(`體力 +${rest.staminaDelta}`), rest.note);
  }

  log(`設施制訓練：${TRAINING_ACTIVITIES.length} 個活動、${TRAINING_CARDS.length} 張訓練事件卡（S18 完整目錄）`);
}
