/**
 * 生涯軌跡帳本（V4 §14.3／§15.5，S17a）：
 * 純查詢函式的單元測試 ＋ 帳本不變式（40 段生涯抽驗）。
 */
import { createState } from '../../src/engine/state.js';
import { playCareer } from '../lib/harness.mjs';
import {
  assistsPerGame, distinctTeams, intlWinRate, longestTenure,
} from '../../src/engine/ledger.js';

export const name = '生涯軌跡帳本（S17a）';

/** 個人獎項的關鍵字——與 seasonEnd.js 的 award() 同一批。測 `awards` 一致性用 */
const AWARD_KEYS = ['例行賽 MVP', '最佳新人', '單殺王', '全明星'];
/** teamHistory 每一筆都必須有的欄位 */
const ENTRY_KEYS = ['team', 'league', 'fromYear', 'toYear', 'firstSeasonRating', 'teamAvgRating'];
/** milestone 允許的 kind（S17a 的記帳點全集） */
const MILESTONE_KINDS = new Set(['debut', 'move', 'fired', 'disband', 'intl', 'award']);

export async function run({ check }) {
  /* ---- 純查詢函式：單元 ---- */
  {
    const s = createState({ name: 'U', role: 'MID', seed: 'ledger-unit' });
    check('新角色 intlWinRate = 0（沒打過國際賽）', intlWinRate(s) === 0, `${intlWinRate(s)}`);
    check('新角色 assistsPerGame = 0', assistsPerGame(s) === 0);
    check('新角色 distinctTeams = 0', distinctTeams(s) === 0);
    check('新角色 longestTenure = 0', longestTenure(s) === 0);

    s.intlRecord = { W: 3, L: 7 };
    check('intlWinRate 回百分比（3/10 → 30）', intlWinRate(s) === 30, `${intlWinRate(s)}`);
    s.intlRecord = { W: 5, L: 5 };
    check('intlWinRate 平手 50', intlWinRate(s) === 50);

    s.stats = { home: { G: 40, A: 100 }, abroad: { G: 10, A: 20 } };
    check('assistsPerGame 跨分區合計（120/50 = 2.4）', assistsPerGame(s) === 2.4, `${assistsPerGame(s)}`);

    s.teamHistory = [
      { team: 'AAA', fromYear: 2014, toYear: 2016 },
      { team: 'BBB', fromYear: 2017, toYear: null },
    ];
    s.year = 2019;
    check('distinctTeams 數不同隊名（AAA 重複也只算一隊）', distinctTeams(s) === 2, `${distinctTeams(s)}`);
    check('longestTenure 未完成筆算到今年（BBB: 2017–2019 = 3）', longestTenure(s) === 3, `${longestTenure(s)}`);
    s.teamHistory[1].toYear = 2018;
    check('longestTenure 完成筆取最長（AAA: 3 年）', longestTenure(s) === 3, `${longestTenure(s)}`);
  }

  /* ---- 帳本不變式：40 段生涯 ---- */
  const SEEDS = 40;
  let intlRuns = 0;
  let intlGames = 0;          // 打過國際賽的生涯，intlRecord 總局數（W+L）
  const teamLen = [];
  const disbandDist = [];
  const awardDist = [];

  for (let i = 0; i < SEEDS; i++) {
    const { state } = playCareer({
      seed: `ledger-${i}`,
      role: i % 2 ? 'MID' : 'TOP',
      name: 'LEDGER',
      strategy: 'first',
      style: 'focus',
    });

    /* teamHistory 結構 */
    for (const e of state.teamHistory) {
      check(`teamHistory 欄位齊全（seed ${i}）`, ENTRY_KEYS.every((k) => k in e));
      check(`toYear ≥ fromYear（seed ${i}）`, e.toYear === null || e.toYear >= e.fromYear);
      if (e.firstSeasonRating !== null) {
        check(`首季評價成對（seed ${i}）`, typeof e.firstSeasonRating === 'number' && e.teamAvgRating !== null);
      }
      check(`league 非空（seed ${i}）`, typeof e.league === 'string' && e.league.length > 0);
    }
    const open = state.teamHistory.filter((e) => e.toYear === null).length;
    check(`未完成筆至多 1（seed ${i}）`, open <= 1, `${open}`);

    /* awards 與 honors 一致（不另外撈字串的驗證面） */
    const honorsAwards = state.honors.filter((h) => AWARD_KEYS.some((k) => h.includes(k))).length;
    check(`awards === honors 個人獎項數（seed ${i}）`, state.awards === honorsAwards,
      `awards ${state.awards}／honors ${honorsAwards}`);

    /* milestones 結構與記帳點一致 */
    const moves = [];
    let disbands = 0;
    for (const m of state.milestones) {
      check(`milestone 欄位齊全（seed ${i}）`, typeof m.year === 'number' && typeof m.kind === 'string' && typeof m.text === 'string');
      check(`milestone kind 合法（seed ${i}）`, MILESTONE_KINDS.has(m.kind), m.kind);
      if (m.kind === 'move' || m.kind === 'debut') moves.push(m);
      if (m.kind === 'disband') disbands += 1;
    }
    // 每筆 teamHistory 對應一個 debut／move 里程碑（進場事實流不缺筆）
    check(`debut+move 里程碑 === teamHistory.length（seed ${i}）`,
      moves.length === state.teamHistory.length, `${moves.length}/${state.teamHistory.length}`);
    // 解散危機：有解散流言就有解散里程碑，里程碑不會比流言多
    check(`disbandCrises ≥ disband 里程碑數（seed ${i}）`, state.disbandCrises >= disbands,
      `${state.disbandCrises}/${disbands}`);

    /* intlRecord：打過國際賽就一定有局數 */
    if (state.intlAppearances > 0) {
      intlRuns += 1;
      intlGames += state.intlRecord.W + state.intlRecord.L;
      check(`打過國際賽 → intlRecord 有局數（seed ${i}）`, state.intlRecord.W + state.intlRecord.L > 0,
        `W${state.intlRecord.W} L${state.intlRecord.L}`);
    }

    teamLen.push(state.teamHistory.length);
    disbandDist.push(state.disbandCrises);
    awardDist.push(state.awards);
  }

  /* ---- 分布收斂（給 S19c 校準 §14.3 門檻用的母體） ---- */
  {
    const avg = (arr) => Math.round(arr.reduce((t, v) => t + v, 0) / arr.length * 10) / 10;
    check('40 段都有職業效力紀錄（teamHistory ≥ 1）', teamLen.every((n) => n >= 1));
    // 國際賽門票是稀有事件（種子序＋賽段冠軍），低比例是引擎現況不是帳本漏記；
    // 這裡只驗證 intlRecord 記帳路徑有被走到
    check('至少 1 段生涯打過國際賽（記帳路徑有被驗證）', intlRuns >= 1, `${intlRuns}/40`);
    const disp = (label, arr) => `  ${label}: 平均 ${avg(arr)}、範圍 ${Math.min(...arr)}–${Math.max(...arr)}`;
    const log = [
      `40 段生涯帳本分布（S19c 校準 §14.3 門檻直接讀這裡）`,
      `  打過國際賽 ${intlRuns}/40，平均總局數 ${Math.round(intlGames / Math.max(1, intlRuns) * 10) / 10}`,
      disp('teamHistory 長度', teamLen),
      disp('disbandCrises', disbandDist),
      disp('awards', awardDist),
    ];
    for (const line of log) console.log(`  ${line}`);
  }
}
