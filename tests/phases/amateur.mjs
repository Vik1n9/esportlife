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

export const name = '業餘起點與挖角時機';

/** 造一個天賦爆表的新人：一開局就遠超業餘水準 */
function prodigy(seed = 'prodigy') {
  const rng = new Rng(seed);
  const state = createState({ name: 'P', role: 'MID', seed });
  for (const k of Object.keys(state.attr)) state.attr[k] = 60;
  for (const k of Object.keys(state.potential)) state.potential[k] = 80;
  return { rng, state };
}

export async function run({ check }) {
  {
    const rng = new Rng('start-stage');
    const state = createState({ name: 'S', role: 'TOP', seed: 'start-stage' });
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
    // 數值不達標就不該有人上門
    const rng = new Rng('nobody');
    const state = createState({ name: 'N', role: 'SUP', seed: 'nobody' });
    for (const k of Object.keys(state.attr)) state.attr[k] = 25;
    for (const k of Object.keys(state.potential)) state.potential[k] = 30;   // 加點也漲不動

    const choices = driveUntil(state, rng, {
      stop: (st) => st.year >= 2014,
      answer: (beat) => beat.options[0].id,
    });
    check('沒達標就沒有星探', !choices.some(isSigningOffer), choices.map((c) => c.title).join(' / '));
    check('沒達標仍留在業餘', state.stage === 'AMATEUR', state.stage);
  }
}
