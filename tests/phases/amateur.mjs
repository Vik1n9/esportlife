/**
 * 業餘起點與被挖角的時機。
 *
 * 舊版一律要熬滿三年才給合約，天賦爆表的新人也一樣。現在改成數值達標就有人上門，
 * 婉拒沒有懲罰，第三年起才必須做決定。
 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { stageLabel } from '../../src/engine/game.js';
import { TEAMS_AMATEUR } from '../../src/data/teams.js';
import { driveUntil, isSigningOffer } from '../lib/harness.mjs';
import { effectiveCoachRating } from '../../src/engine/attributes.js';
import { SCOUT_BAR } from '../../src/engine/market.js';

export const name = '業餘起點與挖角時機';

/** 造一個天賦爆表的新人：一開局就遠超業餘水準 */
function prodigy(seed = 'prodigy') {
  const rng = new Rng(seed);
  const state = createState({ name: 'P', role: 'MID', seed, stage: 'AMATEUR' });
  for (const k of Object.keys(state.attr)) state.attr[k] = 75;
  for (const k of Object.keys(state.potential)) state.potential[k] = 100;
  return { rng, state };
}

export async function run({ check }) {
  {
    const rng = new Rng('start-stage');
    const state = createState({ name: 'S', role: 'TOP', seed: 'start-stage', stage: 'AMATEUR' });
    check('初始 stage 為 AMATEUR', state.stage === 'AMATEUR', state.stage);
    check('初始隊伍來自網咖名單', TEAMS_AMATEUR.includes(state.team), state.team);
    check('stageLabel 顯示網咖盃賽', stageLabel(state) === '網咖盃賽', stageLabel(state));
  }

  {
    const { rng, state } = prodigy();
    const choices = driveUntil(state, rng, {
      stop: (st) => st.stage === 'PRO',
      answer: (beat) => beat.options[0].id,      // 一律接受最好的那個
    });
    check('三年期滿前就收到職業隊合約', choices.some(isSigningOffer), choices.map((c) => c.title).join(' / '));
    check('第一年（2012）就轉職業', state.stage === 'PRO' && state.year === 2012, `${state.stage}@${state.year}`);
    check('轉職業後有合約', !!state.contract);
    check('轉職業後 stageYear 歸零', state.stageYear === 0, String(state.stageYear));
  }

  {
    // 同一個天才選擇婉拒 → 留在業餘，隔年應該再次被找上門
    const { rng, state } = prodigy();
    const choices = driveUntil(state, rng, {
      stop: (st) => st.year >= 2014,
      answer: (beat) => {
        if (!isSigningOffer(beat)) return beat.options[0].id;
        const wait = beat.options.find((o) => o.id === 'wait');
        return (wait || beat.options[0]).id;
      },
    });
    const offers = choices.filter(isSigningOffer);
    check('婉拒後隔年仍會被找上門', offers.length >= 2, `收到 ${offers.length} 次邀約`);
    check('婉拒選項在強制年之前一定存在', offers.every((c) => c.options.some((o) => o.id === 'wait')));
    check('婉拒不會被強制轉職業', state.stage === 'AMATEUR', state.stage);
  }

  {
    /*
     * 數值不達標就不該有人上門。
     *
     * ⚠ 斷言的是**規則**不是某一條軌跡（2026-08-17 改）：舊寫法固定低起始值與低潛力
     * （「加點也漲不動」）就假設這個人兩年後仍在門檻下——但潛力只讓成長變貴、
     * 不封頂（`investAttr` 的 cap 是 `attrCap`，effPot 只進 `stepCost`），事件卡兩年
     * 的 ±1 給予照樣把他推過 AM2 的 45。所以只要事件內容一改（本次是條件卡上閂，
     * 連續低潮不再反覆壓著同一個人），這條就假紅。改成逐次驗「收到邀約的那一刻，
     * 評價確實到了門檻」——這才是「沒達標就沒有星探」要守的東西，且不吃內容變動。
     */
    const rng = new Rng('nobody');
    const state = createState({ name: 'N', role: 'SUP', seed: 'nobody', stage: 'AMATEUR' });
    for (const k of Object.keys(state.attr)) state.attr[k] = 31;
    for (const k of Object.keys(state.potential)) state.potential[k] = 38;
    check('起手評價在 AM2 門檻之下', effectiveCoachRating(state) < SCOUT_BAR.AM2,
      `${effectiveCoachRating(state)} / ${SCOUT_BAR.AM2}`);

    // 邀約當下的評價：driveUntil 直接改同一顆 state，所以在 answer 裡量到的就是
    // 引擎決定要不要發邀約時的值
    const atOffer = [];
    driveUntil(state, rng, {
      stop: (st) => st.year >= 2014,
      answer: (beat) => {
        if (isSigningOffer(beat)) atOffer.push(effectiveCoachRating(state));
        return beat.options[0].id;
      },
    });
    check('沒達標就沒有星探（邀約當下一定過了門檻）',
      atOffer.every((r) => r >= SCOUT_BAR.AM2), atOffer.join('／'));
    check('沒收到邀約就仍在業餘',
      atOffer.length > 0 || state.stage === 'AMATEUR', `${atOffer.length} 次邀約／${state.stage}`);
  }
}
