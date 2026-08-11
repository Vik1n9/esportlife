/**
 * 小組循環賽與 Swiss 賽段。
 *
 * 這兩個賽制是為了讓世界賽逐輪出比分才存在的——舊版整個世界賽壓成一次擲骰
 * （`roll < 25 → 入圍賽出局`），一整年最大的舞台連一局比分都看不到。
 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { runGroup, runSwiss } from '../../src/kernel/groups.js';

export const name = '小組賽與 Swiss 賽段';

/** 造一個指定強度的職業選手 */
function player(seed, ovrValue) {
  const state = createState({ name: 'G', role: 'MID', seed });
  state.stage = 'PRO'; state.league = 'LCK';
  for (const k of Object.keys(state.ability)) state.ability[k] = ovrValue;
  state.mates = [1, 2, 3, 4].map((i) => ({ name: `M${i}`, ovr: ovrValue }));
  return state;
}

export async function run({ check }) {
  const rng = new Rng('groups');

  /* ---- 小組賽：四隊雙循環，六場 ---- */
  {
    const state = player('grp', 60);
    for (let i = 0; i < 200; i++) {
      const res = runGroup(state, rng, { oppOvrs: [58, 60, 62] });
      check('小組賽打滿六場（三個對手各兩次）', res.games.length === 6, res.games.length);
      check('勝敗場數加總等於場次', res.wins + res.losses === 6, `${res.wins}-${res.losses}`);
      check('每個對手都碰兩次', new Set(res.games.map((g) => g.opp)).size === 3);
      if (res.advanced) check('晉級至少要三勝', res.wins >= 3, res.wins);
      if (res.wins <= 2) check('兩勝以下不可能晉級', !res.advanced, res.wins);
      if (res.wins >= 4) check('四勝以上必定晉級', res.advanced, res.wins);
    }
  }

  /* ---- Swiss：三勝晉級、三敗淘汰 ---- */
  {
    const state = player('swiss', 60);
    let boThree = 0; let boOne = 0;
    for (let i = 0; i < 300; i++) {
      const res = runSwiss(state, rng, { par: 60 });
      check('Swiss 一定會結束在三勝或三敗', res.wins === 3 || res.losses === 3, `${res.wins}-${res.losses}`);
      check('勝場不超過三', res.wins <= 3, res.wins);
      check('敗場不超過三', res.losses <= 3, res.losses);
      check('晉級等價於三勝', res.advanced === (res.wins === 3), `${res.wins}-${res.losses} advanced=${res.advanced}`);
      // 3-0 最少三輪、2-2 之後還要一輪，最多五輪
      check('輪數在 3..5 之間', res.rounds.length >= 3 && res.rounds.length <= 5, res.rounds.length);
      check('每輪都有比分', res.rounds.every((r) => /^\d+-\d+$/.test(r.score)));
      for (const r of res.rounds) {
        check('晉級局與淘汰局打 BO3，其餘 BO1', r.bo === (r.decisive ? 3 : 1), `${r.record} bo${r.bo} decisive=${r.decisive}`);
        if (r.bo === 3) boThree++; else boOne++;
      }
    }
    check('兩種 BO 都出現得到', boThree > 0 && boOne > 0, `BO3 ${boThree}／BO1 ${boOne}`);
  }

  /* ---- 強度要能拉開晉級率，否則賽制等於擲硬幣 ---- */
  {
    const strong = player('strong', 72);
    const weak = player('weak', 48);
    const rate = (state, run) => {
      let n = 0;
      for (let i = 0; i < 300; i++) if (run(state).advanced) n++;
      return n / 300;
    };
    const gs = rate(strong, (s) => runGroup(s, rng, { oppOvrs: [60, 60, 60] }));
    const gw = rate(weak, (s) => runGroup(s, rng, { oppOvrs: [60, 60, 60] }));
    check('小組賽：強隊出線率明顯高於弱隊', gs > gw + 0.3, `強 ${gs.toFixed(2)} vs 弱 ${gw.toFixed(2)}`);

    const ss = rate(strong, (s) => runSwiss(s, rng, { par: 60 }));
    const sw = rate(weak, (s) => runSwiss(s, rng, { par: 60 }));
    check('Swiss：強隊出線率明顯高於弱隊', ss > sw + 0.3, `強 ${ss.toFixed(2)} vs 弱 ${sw.toFixed(2)}`);
  }
}
