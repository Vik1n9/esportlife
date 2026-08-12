/** 自由市場：報價層級、挖角門檻、休息室與輿論的後果。 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { generateOffers, clubVerdict, SCOUT_BAR } from '../../src/engine/market.js';
import { driveUntil, isSigningOffer } from '../lib/harness.mjs';

export const name = '自由市場與挖角門檻';

export async function run({ check }) {
  {
    // 頂尖選手不該被強制降級
    const rng = new Rng('market');
    const state = createState({ name: 'M', role: 'TOP', seed: 'market' });
    state.stage = 'PRO'; state.league = 'LCK'; state.team = 'T1'; state.lastDelta = 4;
    for (const k of Object.keys(state.attr)) state.attr[k] = 94;
    const offers = generateOffers(state, rng, { excludeCurrentTeam: false });
    check('頂尖選手收到海外報價',
      offers.some((o) => ['LCK', 'LPL', 'LEC', 'LCS'].includes(o.league)),
      JSON.stringify(offers.map((o) => o.league)));
  }

  {
    // 只夠青訓的實力，不該收到一隊的邀約（舊版把打不到的選項擺出來騙人）
    const rng = new Rng('academy-only');
    const state = createState({ name: 'A', role: 'JG', seed: 'academy-only' });
    for (const k of Object.keys(state.attr)) state.attr[k] = 50;   // 介於青訓 45 與一隊 56 之間
    for (const k of Object.keys(state.potential)) state.potential[k] = 52;

    check('門檻層級由低到高', SCOUT_BAR.AM2 < SCOUT_BAR.HOME && SCOUT_BAR.HOME <= SCOUT_BAR.OVERSEAS,
      JSON.stringify(SCOUT_BAR));

    const choices = driveUntil(state, rng, {
      stop: (st) => st.stage !== 'AMATEUR',
      answer: (beat) => beat.options[0].id,
    });
    const offer = choices.find(isSigningOffer);
    check('這種實力會收到邀約', !!offer);
    check('只會是青訓二隊，不會有一隊選項',
      offer && offer.options.filter((o) => o.id.startsWith('sign-')).every((o) => /青訓二隊/.test(o.label)),
      offer && offer.options.map((o) => o.label).join(' / '));
    check('簽下後進入 AM2', state.stage === 'AM2', state.stage);
  }

  {
    // 休息室與輿論的後果，有冷卻不會變常態
    const rng = new Rng('verdict');
    const state = createState({ name: 'V', role: 'ADC', seed: 'verdict' });
    state.stage = 'PRO'; state.league = 'HOME'; state.contract = { years: 3, mult: 1 }; state.year = 2020;

    state.mental.chem = 50; state.mental.rep = 0;
    let fired = 0;
    for (let i = 0; i < 200; i++) { state.lastVerdictYear = null; if (clubVerdict(state, rng).kind !== 'none') fired++; }
    check('心理狀態正常時不會被開除', fired === 0, fired);

    state.mental.chem = 5;
    fired = 0;
    for (let i = 0; i < 400; i++) { state.lastVerdictYear = null; if (clubVerdict(state, rng).kind === 'rift') fired++; }
    check('默契崩到底會被迫轉隊', fired > 100, fired);

    state.lastVerdictYear = 2020;
    check('冷卻期內不會連續兩年被拆隊', clubVerdict(state, rng).kind === 'none');

    state.year = 2024;
    let recovered = false;
    for (let i = 0; i < 50; i++) { state.lastVerdictYear = 2020; if (clubVerdict(state, rng).kind !== 'none') recovered = true; }
    check('冷卻結束後恢復判定', recovered);
  }
}
