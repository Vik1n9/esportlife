/** 賽季模擬：場次、勝負、個人數據。純函式，不碰 state 以外的東西。 */
import { clamp } from '../core/rng.js';
import { STAT_BASELINE } from '../data/skills.js';
import { LEAGUES } from '../data/leagues.js';
import { blankSeasonStat } from './state.js';
import { effectiveCoachRating, skills } from './attributes.js';
import { opponentStrength, teamStrength } from '../kernel/strength.js';
import { factor } from '../kernel/modifiers.js';
import { consume, formFactor, seriesCost, staminaOf } from './stamina.js';
import { PRESSURE, mistakeFactor } from './psych.js';

/**
 * 每場陣亡數——**V4 §9.3 失誤系統唯一的可見出口**。
 *
 * 技能決定底線（走位好、視野好就少死），失誤係數決定「今天這個場合你守不守得住
 * 那條底線」。§9.3 要的是「因（心理）隱藏、果（陣亡）可見」：玩家永遠看不到抗壓
 * 是幾分，但看得到同一個人在例行賽 2.1 死、在生死戰 3.4 死——那個差額就是線索。
 *
 * 壓力係數只在這裡進遊戲。**它不進勝率**：抗壓進勝率的路是 §9.2 的發揮倍率
 * （每一場都算）與決勝局的 `clutchBonus`，再讓失誤也扣一次戰力就是三重計價，
 * 心理會從放大器變成決定器。失誤付出的代價是數據難看、獎項與估價跟著掉。
 *
 * @param {object} a 已折算好的十二技能值
 * @param {number} form 手感係數（體力）
 * @param {number} pressure 見 `psych.PRESSURE`
 */
export function deathsPerGame(state, a, par, form, rng, pressure = PRESSURE.regular, noise = 1) {
  const base = STAT_BASELINE[state.role];
  const raw = clamp(base.D - (a.pos - par) * 0.0064 - (a.vis - par) * 0.0032 + rng.gauss(0.15 * noise), 0.5, 3.0);
  // 體力透支最先反映在後期的失誤上，所以陣亡數反向吃 form
  return raw / form * mistakeFactor(state, pressure);
}

/**
 * 一輪 BO 系列賽打完的陣亡數，並記進 `pressure` 那一格。
 *
 * 跟例行賽走同一個模型、同一份技能，差別只在壓力係數——這是刻意的：兩邊要可比，
 * 玩家才看得出「同一個人在不同場合的落差」。季後賽與國際賽自己有一張數據，就是
 * §9.3 說的「失誤結果反映在可見數據」。
 *
 * 體力也在這裡扣（§6.3：所有比賽都消耗體力）。手感讀的是**打之前**的體力，扣款在
 * 結算之後——同一輪 BO 不會自己把自己打崩，但下一輪會感覺得到。賽事期間沒有休息
 * 可選（§6.3），所以季後賽或世界賽走得越深，帶進下一個賽段的身體狀況越差。
 *
 * @param {number} games 這一輪打了幾局
 * @param {number} pressure 見 `psych.PRESSURE`
 */
export function seriesDeaths(state, rng, games, pressure) {
  if (!games) return 0;
  const par = LEAGUES[state.league]?.par ?? 66;
  const deaths = Math.round(games * deathsPerGame(state, skills(state), par, formFactor(staminaOf(state)), rng, pressure));
  consume(state, seriesCost(games));
  recordDeaths(state, 'pressure', games, deaths);
  return deaths;
}

/**
 * 把一批比賽的陣亡數記進生涯統計，供玩家（與測試）比對不同場合的落差。
 *
 * 分兩格而不是一格：`regular` 是例行賽，`pressure` 是季後賽與國際賽。低抗壓的人
 * 兩格會拉開，高抗壓的人幾乎持平——這是玩家推測那個隱藏數字的主要依據。
 */
export function recordDeaths(state, bucket, games, deaths) {
  if (!games) return;
  const log = state.deathLog || (state.deathLog = { regular: { G: 0, D: 0 }, pressure: { G: 0, D: 0 } });
  const row = log[bucket];
  row.G += games;
  row.D += deaths;
}

/**
 * 模擬一批常規賽。
 *
 * `weight` 是這一批佔全年場次的比例。S14 之前的呼叫單位是「一個賽段」，月回合制之後
 * 是「一個月」——賽段的月份區間由年曆展開（`engine/calendar.js`），這裡只管「給我
 * 多少比重，我打完給你數據」。一年拆成三賽段不代表要打三倍的比賽，場次是切開來分的，
 * 變多的是決策點與事件，不是場次。
 *
 * **這個函式不再推進月份。** S13 時它自己呼叫 `advanceMonths` 走完賽段的月數，因為
 * 那時沒有別的東西在推進時間；現在推進時間的是月回合（`phases/month.js`），體力讀數
 * 由呼叫端帶進來。一個「模擬比賽」的函式偷偷把時鐘往前撥，正是月回合制最容易長出
 * 兩套時間軸的地方。
 *
 * @param {object} state
 * @param {import('../core/rng.js').Rng} rng
 * @param {string} leagueKey
 * 體力不再決定出賽場次——LoL 是五個固定先發，隊伍打幾場你就打幾場。體力低表現成
 * 手感下滑（`formFactor`），少打是另一回事：被下放板凳或傷勢缺席，由 `share` 帶進來。
 *
 * @param {number} [weight] 佔全年場次比例，預設 1（整年一段）
 * @param {number} [share] 實際出賽比例（板凳 0、輪替約 0.55、先發 1）
 * @param {number} [stamina] 打這批比賽時的體力（月回合結算後的谷底），預設讀當下值
 * @param {number} [batch] 這一批佔**一個賽段**的比例（1 = 整段一次算完）。見 `noiseScale`
 */
export function simulateSeason(state, rng, leagueKey, weight = 1, share = 1, stamina = staminaOf(state), batch = 1) {
  const league = LEAGUES[leagueKey];
  // 個人數據看的是技能（對線吃 CS、視野吃 VIS…），不是屬性——屬性要先折算過來
  const a = skills(state);

  const stat = blankSeasonStat();
  stat.years = 1;

  /*
   * 把一個賽段拆成幾個月來算，抽樣誤差要跟著放大 √n。
   *
   * 下面那幾個 `rng.gauss` 不是「每一場比賽的運氣」，是**這一段的手氣**——賽季狀態、
   * 對手抽籤、版本站不站在你這邊。舊版一個賽段抽一次；月回合若照抄，同一個賽段會抽
   * 三次再被平均掉，賽段層級的變異縮到 1/√3，於是每一年都長得差不多：實測生涯分數的
   * 標準差掉 13%，最爛的那一段生涯（一整個矩陣裡唯一的「邊緣選手」）被抬過門檻，
   * 「五個等第都出現得到」當場紅。放大 √n 之後賽段層級的變異與舊版一致——**這一站
   * 換的是結算的頻率，不是這個遊戲有多少運氣成分**。
   */
  const noise = 1 / Math.sqrt(Math.max(1e-6, Math.min(1, batch)));

  const par = league.par;
  const o = effectiveCoachRating(state);
  const delta = o - par;
  stat.delta = delta;

  if (state.seasonFactor <= 0 || share <= 0) { stat.G = 0; return stat; }

  // 體力進表現，不進場次
  const form = formFactor(stamina);
  stat.G = Math.max(1, Math.round(league.games * weight * share * state.seasonFactor * (0.95 + rng.next() * 0.06)));

  /*
   * ⚠ 底下每一個「(技能 − par) × 係數」都是 per-point 係數，0–100 重校時一律
   * **除以** 1.25（V4 §17.2 二）。理由是刻度放大之後，同一個相對差距會產出 1.25 倍
   * 的點數，係數不除就等於把整排數據對評價的靈敏度上調兩成。
   *
   * 不吃評價的項目不動：`(form − 1) × 1.6`（form 是比值）、勝率的 gauss、
   * `STAT_BASELINE`（每場平均數據，跟屬性刻度無關）、各種 clamp 上下界。
   */
  const winRate = clamp(
    0.5 + (teamStrength(state) - opponentStrength(par)) * 0.0096 + delta * 0.0048 + (form - 1) * 1.6 + rng.gauss(0.03 * noise),
    0.15, 0.92,
  );
  stat.W = Math.round(stat.G * winRate);
  stat.L = stat.G - stat.W;

  /*
   * 技能鍵在 S10 換成 V4 §8.1 的十二項，數據對映跟著重接。每一項對的是覆盤時真的
   * 會拿來解釋這個數字的那句話：
   *   陣亡  ← 走位（舊表接的是已被拆掉的「反應」，而 §8.1 明講走位失誤幾乎都是陣亡）
   *   助攻  ← 支援（舊「遊走」的直接後繼）
   * 其餘三條的鍵在新表裡本來就存在，語意也沒變：擊殺與 CS／SOLO 吃操作與對線、
   * 視野吃視野。
   * 係數一個都沒動——這一站換的是讀哪一項技能，不是數據對評價的靈敏度。
   */
  const base = STAT_BASELINE[state.role];
  const k = clamp(base.K + (a.op - par) * 0.008 + (a.lane - par) * 0.0064 + rng.gauss(0.2 * noise), 0.3, 3.2);
  stat.K = Math.round(stat.G * k * form);
  // 例行賽的壓力係數是 1.0——§9.3 的受迫性失誤在這裡幾乎不現形，要到季後賽才放大。
  // 這是刻意的：抗壓低的人平常看不太出來，玩家得從大賽的落差反推
  stat.D = Math.round(stat.G * deathsPerGame(state, a, par, form, rng, PRESSURE.regular, noise));
  recordDeaths(state, 'regular', stat.G, stat.D);
  stat.A = Math.round(stat.G * base.A * (1 + (a.gank - par) * 0.0032 + (a.vis - par) * 0.0032));
  stat.CS = Math.round(stat.G * base.CS * (1 + (a.lane - par) * 0.0048));
  stat.VIS = Math.round(stat.G * base.VIS * (1 + (a.vis - par) * 0.0064));
  stat.DMG = Math.round(clamp((base.DMG + delta * 0.32) * form + rng.gauss(1.5 * noise), 6, 45) * 10) / 10;

  const soloLaneBonus = (state.role === 'TOP' || state.role === 'MID') ? (a.lane - par) * 0.008 : 0;
  stat.SOLO = Math.round(stat.G * base.SOLO * clamp(1 + soloLaneBonus, 0.2, 2.2) * factor(state, 'soloRate'));
  stat.K = Math.round(stat.K * factor(state, 'killRate'));

  const mvpRate = clamp(0.03 + delta * 0.0032 + (stat.SOLO / Math.max(1, stat.G)) * 0.02, 0.005, 0.22);
  stat.MVP = Math.round(stat.G * mvpRate);

  return stat;
}

/**
 * 把同一年的多個賽段併成一份年度數據。
 * DMG% 是比例，取場次加權；delta 取全年平均。
 */
export function mergeSplits(splits) {
  const out = blankSeasonStat();
  out.years = 1;
  if (!splits.length) { out.delta = 0; return out; }
  for (const s of splits) {
    for (const k of ['G', 'W', 'L', 'K', 'D', 'A', 'CS', 'VIS', 'SOLO', 'MVP']) out[k] += s[k];
  }
  const totalG = out.G || 1;
  out.DMG = Math.round(splits.reduce((t, s) => t + s.DMG * s.G, 0) / totalG * 10) / 10;
  out.delta = Math.round(splits.reduce((t, s) => t + (s.delta || 0), 0) / splits.length * 10) / 10;
  return out;
}

/** 把單季數據累加進生涯分區統計 */
export function accumulate(state, bucket, stat) {
  const acc = state.stats[bucket] || blankSeasonStat();
  acc.years += 1;
  for (const k of ['G', 'W', 'L', 'K', 'D', 'A', 'CS', 'VIS', 'SOLO', 'MVP']) acc[k] += stat[k];
  // DMG% 是比例，取加權平均而非累加
  acc.DMG = Math.round(((acc.DMG * (acc.years - 1) + stat.DMG) / acc.years) * 10) / 10;
  state.stats[bucket] = acc;
  return acc;
}

export function formatStatLine(stat) {
  const parts = [
    `${stat.G} 場 ${stat.W}W-${stat.L}L`,
    `KDA ${stat.K}/${stat.D}/${stat.A}`,
    `CS ${stat.CS}`,
    `視野 ${stat.VIS}`,
    `SOLO ${stat.SOLO}`,
    `DMG ${stat.DMG}%`,
  ];
  if (stat.MVP) parts.push(`MVP x${stat.MVP}`);
  return parts.join('｜');
}
