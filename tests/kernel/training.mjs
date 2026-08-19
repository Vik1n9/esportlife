/**
 * 設施制訓練（V4 §5）：活動表、兩階段判定、成長公式、訓練事件卡。
 *
 * 這站換掉了整個「骰子加點」協定，所以這個 suite 是它自己的守門員：活動表形狀、
 * 成功率吃體力、成功係數對照、成長只漲活動涵蓋的屬性、休息／復健的副作用、以及
 * 「普通成敗不碰心理、受傷只在大失敗」這條 §14.8.4／§6.2 的邊界。
 *
 * S18 之後訓練卡是完整目錄（60 張）：S46 起是兜底 20（5 活動 × 4 檔位，永不空池）＋
 * PRO 24（低體力危險 4／高體力獎勵 4／一般 16）＋ AM2 8 ＋ 業餘 8。抽卡改
 * `drawTrainingCard`：activity／stage／stamina 過濾 ＋ weight 加權。
 *
 * S46 之後這個 suite 還多守兩條設計骨架：**錯位輪替**（六個選單活動的主屬性集合 ==
 * 副屬性集合 == ATTRS，且主 ≠ 副）與**休息也給成長**（倍率隨休息前的體力遞減）。
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
import { restYieldMul, staminaOf, trainCost, vitCoef } from '../../src/engine/stamina.js';
import { ACTIVITY_KEYS, ACTIVITY_LABELS } from '../../tools/schema.js';

export const name = '設施制訓練與訓練事件卡';

/** 有卡池的五項活動（S46）。導出而非手抄——手抄一份就是下一個「工具認得、引擎不認得」 */
const ACTIVITY_IDS = TRAINING_ACTIVITIES.filter((a) => a.pool).map((a) => a.id);
const TIERS = ['great_success', 'success', 'failure', 'great_failure'];

const fresh = (seed = 'tr', extra = {}) => Object.assign(
  createState({ name: 'T', role: 'MID', seed }), extra,
);

export async function run({ check, log }) {
  /* ---- 活動表形狀（§5.2） ---- */
  {
    const menuActs = TRAINING_ACTIVITIES.filter((a) => a.menu !== false);
    check('六項訓練活動進玩家選單', menuActs.length === 6, String(menuActs.length));
    check('復健預防隱藏保留（復健年的自動流程還要用）',
      TRAINING_ACTIVITIES.filter((a) => a.menu === false).map((a) => a.id).join() === 'rehab',
      JSON.stringify(TRAINING_ACTIVITIES.filter((a) => a.menu === false).map((a) => a.id)));
    check('五個活動走成敗判定、休息不走', TRAINING_ACTIVITIES.filter((a) => a.kind === 'train').length === 5,
      String(TRAINING_ACTIVITIES.filter((a) => a.kind === 'train').length));
    for (const a of menuActs) {
      const sum = Object.values(a.weights).reduce((t, v) => t + v, 0);
      check(`訓練活動 ${a.id} 的屬性權重和為 1`, Math.abs(sum - 1) < 1e-9, `${a.id} 和 ${sum}`);
    }
    const rest = TRAINING_ACTIVITIES.find((a) => a.id === 'rest');
    check('休息的體力消耗是負的（恢復）', rest.cost < 0, rest.cost);

    /*
     * 錯位輪替（S46 的設計骨架）：六個選單活動一主一副，主屬性集合 == 副屬性集合 ==
     * ATTRS，且每個活動主 ≠ 副。六屬性曝光因此完全均等，沒有屬性被結構性餓死——
     * 之後有人加活動或改權重，這裡會立刻擋下來。
     */
    const mains = [];
    const subs = [];
    for (const a of menuActs) {
      const pairs = Object.entries(a.weights).sort((x, y) => y[1] - x[1]);
      check(`${a.id}：一主一副兩個屬性`, pairs.length === 2, JSON.stringify(a.weights));
      check(`${a.id}：權重是 .7／.3`, Math.abs(pairs[0][1] - 0.7) < 1e-9 && Math.abs(pairs[1][1] - 0.3) < 1e-9,
        JSON.stringify(a.weights));
      check(`${a.id}：主 ≠ 副`, pairs[0][0] !== pairs[1][0], pairs[0][0]);
      mains.push(pairs[0][0]);
      subs.push(pairs[1][0]);
    }
    check('錯位輪替：六個主屬性互不重複且蓋滿六屬性',
      [...mains].sort().join() === [...ATTRS].sort().join(), mains.join('、'));
    check('錯位輪替：六個副屬性互不重複且蓋滿六屬性',
      [...subs].sort().join() === [...ATTRS].sort().join(), subs.join('、'));
  }

  /* ---- 預期成功率吃體力（§5.4 階段一） ---- */
  {
    const a = TRAINING_ACTIVITIES.find((x) => x.id === 'study');
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
    const result = resolveTraining(s, new Rng('grow-r'), 'study');
    const grew = ATTRS.filter((k) => s.attr[k] > before[k]);
    check('訓練後有屬性成長', grew.length > 0, grew.join('、'));
    check('study 只漲 awr／tec', grew.every((k) => ['awr', 'tec'].includes(k)), grew.join('、'));
    check('結算結果標了檔位與成功係數', typeof result.tier === 'string' && result.successCoef === SUCCESS_COEF[result.tier]);
  }

  /* ---- 休息（S46）：恢復體力，也漲屬性；越透支學得越多 ---- */
  {
    const s = fresh('rest', { stamina: 20 });
    const before = s.stamina;
    const attrBefore = { ...s.attr };
    const rest = resolveTraining(s, new Rng('rest-r'), 'rest');
    check('休息恢復體力', rest.recovered > 0 && s.stamina > before, s.stamina);
    check('休息也漲屬性（S46）', ATTRS.some((k) => s.attr[k] > attrBefore[k]),
      JSON.stringify(rest.gains));
    const restW = TRAINING_ACTIVITIES.find((a) => a.id === 'rest').weights;
    check('休息的主屬性是靈巧、副屬性是體能', restW.agi === 0.7 && restW.vit === 0.3,
      JSON.stringify(restW));
    check('休息不分成敗、不抽卡', rest.tier === undefined && rest.card === undefined,
      JSON.stringify({ tier: rest.tier, card: rest.card?.id }));

    // 倍率讀「休息前」的體力：越透支給越多（10 > 50 > 90），這條就是防濫用機制
    const mulAt = [10, 50, 90].map((v) => restYieldMul(v));
    check('休息成長倍率隨體力遞減（10 > 50 > 90）',
      mulAt[0] > mulAt[1] && mulAt[1] > mulAt[2], mulAt.map((m) => m.toFixed(2)).join(' > '));
    check('滿血休息約等於白費一個月（≤ 訓練月的 15%）', restYieldMul(100) <= 0.15, restYieldMul(100));

    // 端到端：同一個種子、同一份天賦，低體力休息拿到的成長比滿體力多
    const totalGain = (stamina) => {
      const st = fresh('rest-y', { stamina });
      const r = resolveTraining(st, new Rng('rest-y-r'), 'rest');
      return r.gains.reduce((t, g) => t + g.points, 0);
    };
    const drained = totalGain(10);
    const full = totalGain(100);
    check('低體力休息拿到的成長多於滿體力', drained > full, `${drained} vs ${full}`);

    const worn = fresh('rehab', { stamina: 60, tempInjuryRisk: 10 });
    resolveTraining(worn, new Rng('rehab-r'), 'rehab');
    check('復健壓得下臨時受傷風險（§5.2 唯一的賣點）', worn.tempInjuryRisk < 10, worn.tempInjuryRisk);
  }

  /* ---- 英雄池：不再是獨立活動，改掛在 SOLO RANK 的 heroGames 上（S46） ---- */
  {
    check('只有 SOLO RANK 掛 heroGames',
      TRAINING_ACTIVITIES.filter((a) => a.heroGames).map((a) => a.id).join() === 'soloq',
      JSON.stringify(TRAINING_ACTIVITIES.filter((a) => a.heroGames).map((a) => a.id)));
    // 出賽等效場次隨成功係數縮放，所以要多跑幾把才保證抽到非大失敗的檔位
    let mastery = 0;
    for (let i = 0; i < 5 && mastery === 0; i++) {
      const s = fresh(`hero${i}`, { stamina: 90 });
      resolveTraining(s, new Rng(`hero-r${i}`), 'soloq');
      mastery = Object.values(s.mastery).reduce((t, v) => t + v, 0);
    }
    check('SOLO RANK 附帶累積英雄專精', mastery > 0, String(mastery));

    // 大失敗（successCoef = 0）→ 0 場 → 不練，語意自然，不必特判
    const soloq = TRAINING_ACTIVITIES.find((a) => a.id === 'soloq');
    check('大失敗時等效場次歸零',
      Math.round(soloq.heroGames * SUCCESS_COEF.great_failure) === 0);
    check('SOLO RANK 仍漲屬性（跟舊的英雄池練習不同）',
      Object.keys(soloq.weights).length === 2, JSON.stringify(soloq.weights));
  }

  /* ---- 完整目錄（S18）：數量、id、weight、tier 一致 ---- */
  {
    check('訓練卡 60 張（兜底 20＋PRO 24＋AM2 8＋業餘 8）', TRAINING_CARDS.length === 60, String(TRAINING_CARDS.length));
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
    check('activity 值全在五活動內', TRAINING_CARDS.every((c) =>
      !c.activity || c.activity.every((a) => ACTIVITY_IDS.includes(a))));
    // 編輯器與引擎同源（S46）：工具的下拉清單就是引擎的活動表，不是手抄本——
    // 手抄本會讓人在編輯器裡寫出標著不存在活動的**永久抽不到的死卡**
    check('編輯器的 ACTIVITY_KEYS 逐字等於引擎的有卡池活動',
      ACTIVITY_KEYS.join() === ACTIVITY_IDS.join(), `${ACTIVITY_KEYS.join()} vs ${ACTIVITY_IDS.join()}`);
    check('編輯器的 ACTIVITY_LABELS 逐字等於引擎的活動名',
      ACTIVITY_KEYS.every((k) => ACTIVITY_LABELS[k]
        === TRAINING_ACTIVITIES.find((a) => a.id === k).name), JSON.stringify(ACTIVITY_LABELS));
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
      const c = drawTrainingCard(am, rng2, 'study', 'great_success');
      check('業餘抽不到 PRO 卡', !c.stage || c.stage.includes('AMATEUR'), `${c.id} stage=${c.stage}`);
    }

    // stamina 過濾：低體力時 PRO 危險卡進池、高體力不進
    const lo = fresh('draw-lo', { stamina: 20, stage: 'PRO' });
    const hi = fresh('draw-hi', { stamina: 90, stage: 'PRO' });
    const rngLo = new Rng('draw-lo-r');
    const rngHi = new Rng('draw-hi-r');
    const lowDanger = new Set(['tr_pro_low_study', 'tr_pro_low_scrim', 'tr_pro_low_fit', 'tr_pro_low_soloq']);
    let lowHit = 0, hiHit = 0;
    for (let i = 0; i < 400; i++) {
      if (lowDanger.has(drawTrainingCard(lo, rngLo, 'study', 'great_failure').id)) lowHit++;
      if (lowDanger.has(drawTrainingCard(hi, rngHi, 'study', 'great_failure').id)) hiHit++;
    }
    check('低體力時危險卡進池（有機會抽到）', lowHit > 0, `低體力命中 ${lowHit}/400`);
    check('高體力時危險卡不進池', hiHit === 0, `高體力命中 ${hiHit}/400`);
  }

  /* ---- 池抽：weight 加權（2:1 的池，長樣本比例收斂） ---- */
  {
    const s = fresh('draw-w', { stamina: 80, stage: 'AM2' });
    const rng = new Rng('draw-w-r');
    // AM2 的 study × great_success 池 = 兜底 1 張（weight 3）＋ AM2 1 張（weight 6）
    const base = new Set(ACTIVITY_IDS.map((a) => `tr_${a}_great_success`));
    let am2Hit = 0;
    const N = 1200;
    for (let i = 0; i < N; i++) {
      const c = drawTrainingCard(s, rng, 'study', 'great_success');
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
    const result = resolveTraining(s, new Rng('card-r'), 'study');
    check('結算結果帶檔位對應的卡', !!result.card && result.card.tier === result.tier, result.card?.tier);
    check('結算結果有 attrNotes 欄位', Array.isArray(result.attrNotes), typeof result.attrNotes);
    check('結算後體力被消耗', staminaOf(s) < 90, staminaOf(s));
  }

  /* ---- state.lastActivity（S48：月度事件卡傾向的唯一真相來源） ---- */
  {
    const s = fresh('la-train', { stamina: 90 });
    resolveTraining(s, new Rng('la-train-r'), 'soloq');
    check('resolveTraining 開頭寫 state.lastActivity（訓練）', s.lastActivity === 'soloq', s.lastActivity);
    const s2 = fresh('la-rest', { stamina: 90 });
    resolveTraining(s2, new Rng('la-rest-r'), 'rest');
    check('resolveTraining 開頭寫 state.lastActivity（休息也寫）', s2.lastActivity === 'rest', s2.lastActivity);
  }

  /* ---- 選單的結構化欄位（§22.2.1 三項並列，S39） ---- */
  // 訓練選項的三段資訊（體力增減／影響屬性／預期成功率）必須以機器欄位給 UI，
  // 不能再只有一條壓扁的字串；note 保留，且兩者必須同源（同一份計算結果）
  {
    const state = fresh('menu-s', { stamina: 90 });
    const menu = trainingMenu(state);
    check('選單只攤玩家能選的六項（復健不在其中）',
      menu.length === 6 && !menu.some((o) => o.id === 'rehab'), menu.map((o) => o.id).join('、'));
    for (const opt of menu) {
      const act = TRAINING_ACTIVITIES.find((a) => a.id === opt.id);
      // S47：staminaDelta 與效果同源——消耗活動走 trainCost（實扣），恢復活動走
      // recover 的實際量（cost × vitCoef 的 round）。鏡像 vitCostCoef 不能套負數：
      // 那會讓「高 vit 顯示恢復更少、實際恢復更多」方向顛倒
      const expected = act.cost < 0
        ? Math.round(-act.cost * vitCoef(state))
        : -trainCost(state, act.cost);
      check(`${act.id}：staminaDelta 與實際扣/回量同源（S47）`,
        opt.staminaDelta === expected, `${opt.staminaDelta} vs ${expected}`);
      if (act.kind === 'rest') {
        // §5.4：休息不分成敗，successRate 是 null 不是 100——填 100 等於在畫面上
        // 多出一個不存在的判定
        check(`${act.id}：休息不分成敗`, opt.successRate === null, String(opt.successRate));
        check(`${act.id}：休息有 attrs（屬性條高亮要亮得起來）`,
          JSON.stringify(opt.attrs) === JSON.stringify(Object.keys(act.weights)), JSON.stringify(opt.attrs));
      } else {
        check(`${act.id}：successRate 等於 expectedSuccess 的四捨五入（不重算）`,
          opt.successRate === Math.round(expectedSuccess(state, act) * 100),
          `${opt.successRate} vs ${expectedSuccess(state, act)}`);
        check(`${act.id}：attrs 就是活動的屬性鍵`,
          JSON.stringify(opt.attrs) === JSON.stringify(Object.keys(act.weights)), JSON.stringify(opt.attrs));
      }
    }
    // note 是同一份計算結果的另一種呈現——過寫入端的欄位重建一遍，不手抄字串
    // 重建走 effectText（結構化欄位），不手抄一份顯示字串——手抄只是把 bug 抄第二遍
    const study = menu.find((o) => o.id === 'study');
    const studyNote = `體力 −${-study.staminaDelta}　${study.effectText}　成功率 ${study.successRate}%`;
    check('note 與結構化欄位同源（重建後逐字相同）', study.note === studyNote, `${study.note} vs ${studyNote}`);
    const soloq = menu.find((o) => o.id === 'soloq');
    check('SOLO RANK 的 effectText 標了英雄池', soloq.effectText.endsWith('·英雄池'), soloq.effectText);
    const rest = menu.find((o) => o.id === 'rest');
    check('休息的 note 也走同一份欄位', rest.note === `體力 +${rest.staminaDelta}　${rest.effectText}`, rest.note);
    check('休息的 effectText 同時講恢復與屬性', rest.effectText.startsWith('恢復體力・'), rest.effectText);
  }

  log(`設施制訓練：${TRAINING_ACTIVITIES.filter((a) => a.menu !== false).length} 個選單活動`
    + `（＋復健預防隱藏 1）、${TRAINING_CARDS.length} 張訓練事件卡（S18 完整目錄）`);
}
