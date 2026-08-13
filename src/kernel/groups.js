/**
 * 小組循環賽與 Swiss 賽段。
 *
 * 世界賽的前半段不是淘汰賽，所以套不進 `runSeries`。舊版把整個世界賽壓成一次擲骰
 * （`roll < 25 → 入圍賽出局`），玩家看不到任何過程——一整年最大的舞台反而比聯賽
 * 季後賽粗糙。這裡把它還原成逐輪、逐局。
 *
 * 兩種賽制對應兩個時代：
 * - `runGroup` 2012–2022，四隊雙循環 BO1，前二晉級
 * - `runSwiss` 2023 起，三勝晉級／三敗淘汰，晉級與淘汰局打 BO3
 */
import { opponentStrength } from './strength.js';
import { gameChance, runSeries } from './series.js';
import { PRESSURE } from '../engine/psych.js';

/**
 * 小組賽：對每個對手各打兩場 BO1，勝場多者晉級。
 *
 * @param {number[]} oppRatings 同組對手的強度（LoL 小組賽是四隊，所以通常三個）
 * @param {number} advance 幾隊晉級
 * @returns {{wins:number, losses:number, games:{opp:number, win:boolean}[], advanced:boolean, note:string}}
 */
export function runGroup(state, rng, { oppRatings, advance = 2, seed = 0 }) {
  const games = [];
  // 雙循環：每個對手打兩次，這是 2014 起世界賽小組賽的實際場次
  for (const round of [0, 1]) {
    for (const oppRating of oppRatings) {
      games.push({ opp: oppRating, round, win: rng.chance(gameChance(state, oppRating, { seed })) });
    }
  }
  const wins = games.filter((g) => g.win).length;
  const losses = games.length - wins;

  // 晉級線：六場拿四勝穩過、三勝要看小分。三勝時再擲一次代表加賽
  const advanced = wins >= 4 || (wins === 3 && rng.chance(advance >= 2 ? 55 : 30));
  return {
    wins,
    losses,
    games,
    advanced,
    note: wins === 3 && advanced ? '同分加賽驚險出線' : '',
  };
}

/**
 * Swiss 賽段：勝場對勝場、敗場對敗場，先到三勝晉級、三敗淘汰。
 *
 * 對手強度隨戰績浮動——贏越多碰到的越硬，這正是 Swiss 的設計本意，也是它比小組賽
 * 好看的原因：不會有「小組死亡之組」這種抽籤決定的不公平。
 *
 * @param {number} par 賽區平均強度，用來推對手
 * @returns {{rounds:object[], wins:number, losses:number, advanced:boolean}}
 */
export function runSwiss(state, rng, { par, seed = 0, winsToAdvance = 3, lossesToExit = 3 }) {
  const rounds = [];
  let wins = 0; let losses = 0;

  while (wins < winsToAdvance && losses < lossesToExit) {
    // 戰績越好對手越強：+2.0 點 / 淨勝場（舊 1.6 × 1.25，§17.2 三）
    const oppRating = opponentStrength(par + (wins - losses) * 2.0 + rng.gauss(1.5));
    // 晉級局與淘汰局打 BO3，其餘 BO1——2023 起的實際規則
    const decisive = wins === winsToAdvance - 1 || losses === lossesToExit - 1;
    const bo = decisive ? 3 : 1;
    const res = runSeries(state, rng, { bo, oppRating, seed, pressure: PRESSURE.intl });

    if (res.win) wins += 1; else losses += 1;
    rounds.push({
      label: `${wins + losses} 輪`,
      record: `${wins}-${losses}`,
      bo,
      win: res.win,
      score: `${res.mine}-${res.theirs}`,
      decisive,
    });
  }

  return { rounds, wins, losses, advanced: wins >= winsToAdvance };
}
