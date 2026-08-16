/**
 * 生涯軌跡帳本（V4 §14.3／§15.5，S17a）：
 * 純查詢函式的單元測試 ＋ 帳本不變式（40 段生涯抽驗）。
 */
import { createState } from '../../src/engine/state.js';
import { playCareer } from '../lib/harness.mjs';
import {
  assistsPerGame, careerKda, distinctTeams, intlWinRate, kdaOf, lastFinish,
  longestTenure, msiBest, reigningChampion, worldsBest,
} from '../../src/engine/ledger.js';
import { recordIntlFinish } from '../../src/phases/shared.js';
import { FINISH_ORDER, finishOrder, NO_FINISH } from '../../src/data/formats/finishes.js';
import { WORLDS_RESULTS } from '../../src/data/formats/worlds.js';
import { MSI_RESULTS } from '../../src/data/formats/msi.js';
import { careerScore } from '../../src/engine/career.js';

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
    const s = createState({ name: 'U', role: 'MID', seed: 'ledger-unit', stage: 'AMATEUR' });
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

    check('kdaOf＝(K+A)/D 取一位小數', kdaOf({ K: 10, D: 6, A: 5 }) === 2.5,
      `${kdaOf({ K: 10, D: 6, A: 5 })}`);
    check('kdaOf D=0 不炸：回 K+A', kdaOf({ K: 3, D: 0, A: 5 }) === 8,
      `${kdaOf({ K: 3, D: 0, A: 5 })}`);
    s.stats = {
      HOME: { G: 10, K: 10, D: 5, A: 10 },
      OVERSEAS: { G: 10, K: 8, D: 0, A: 2 },
    };
    check('careerKda 跨分區合計後再除（(18+12)/5 = 6）', careerKda(s) === 6, `${careerKda(s)}`);
    s.stats = {};
    check('careerKda 沒打過不炸', careerKda(s) === 0, `${careerKda(s)}`);

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

  /* ---- 名次對照（N17，S20c）：每一個名次都查得到序位 ----
   *
   * 這一組是 A3／N3／N5 三個靜默 bug 的守門員。三個 bug 的形狀相同：某張查表的鍵
   * 必須與另一個檔案產生的字串逐字相同，而沒有任何測試在守。實測後果是真實的世界賽
   * 冠軍 `worldsBest()` 回 4、`'MSI 止步'` 回 99（等同沒打過）。
   *
   * ⚠ 斷言**必須過寫入端的實際運算式**（`recordIntlFinish`），不能手抄一份預期
   * 字串——手抄只是把 bug 抄第四遍。名次鍵入帳之後要驗的是「寫入端產生的 finish
   * 鍵都在名次表內」，而不是「文字對得上」。
   */
  {
    const fresh = () => {
      const s = createState({ name: 'F', role: 'MID', seed: 'finish-table', stage: 'AMATEUR' });
      s.year = 2018;
      return s;
    };

    check('沒打過國際賽 worldsBest = 沒打過', worldsBest(fresh()) === NO_FINISH, `${worldsBest(fresh())}`);
    check('沒打過國際賽 msiBest = 沒打過', msiBest(fresh()) === NO_FINISH, `${msiBest(fresh())}`);

    for (const finish of Object.keys(WORLDS_RESULTS)) {
      check(`世界賽名次 ${finish} 在名次表內`, FINISH_ORDER[finish] !== undefined, finish);
      const s = fresh();
      recordIntlFinish(s, 'worlds', finish);
      check(`世界賽 ${finish} 寫入端 → worldsBest 查得到序位`,
        worldsBest(s) === finishOrder(finish), `${worldsBest(s)} ≠ ${finishOrder(finish)}`);
      check(`世界賽 ${finish} 里程碑帶機器可讀欄位`,
        s.milestones[0].event === 'worlds' && s.milestones[0].finish === finish,
        JSON.stringify(s.milestones[0]));
    }

    for (const finish of Object.keys(MSI_RESULTS)) {
      check(`MSI 名次 ${finish} 在名次表內`, FINISH_ORDER[finish] !== undefined, finish);
      const s = fresh();
      recordIntlFinish(s, 'msi', finish);
      check(`MSI ${finish} 寫入端 → msiBest 查得到序位`,
        msiBest(s) === finishOrder(finish), `${msiBest(s)} ≠ ${finishOrder(finish)}`);
      check(`MSI ${finish} 里程碑帶機器可讀欄位`,
        s.milestones[0].event === 'msi' && s.milestones[0].finish === finish,
        JSON.stringify(s.milestones[0]));
    }

    // 兩個賽事互不污染：MSI 的名次不會被 worldsBest 讀到，反之亦然
    const mix = fresh();
    recordIntlFinish(mix, 'msi', 'champion');
    check('MSI 冠軍不會被 worldsBest 讀成世界賽冠軍', worldsBest(mix) === NO_FINISH, `${worldsBest(mix)}`);
    recordIntlFinish(mix, 'worlds', 'stage');
    check('世界賽小組止步不會被 msiBest 讀到', msiBest(mix) === finishOrder('champion'), `${msiBest(mix)}`);

    // 生涯最佳取最小序位，與寫入順序無關
    const many = fresh();
    for (const f of ['stage', 'champion', 'quarter']) recordIntlFinish(many, 'worlds', f);
    check('worldsBest 取生涯最佳（與寫入順序無關）', worldsBest(many) === 1, `${worldsBest(many)}`);
  }

  /* ---- 上屆名次與衛冕者查詢（S20g，§16.2） ---- */
  {
    const s = createState({ name: 'C', role: 'MID', seed: 'champ-query' });
    check('沒打過世界賽 lastFinish = none', lastFinish(s, 'worlds') === 'none');
    check('沒打過世界賽 reigningChampion = null', reigningChampion(s, 'worlds') === null);

    // 上屆名次導出自 milestones：最近一年的 finish 才是「上屆」
    s.milestones = [];
    recordIntlFinish(s, 'worlds', 'semi');
    s.milestones[0].year = 2018;
    recordIntlFinish(s, 'worlds', 'champion');
    s.milestones[1].year = 2019;
    check('lastFinish 回最近一年的名次鍵', lastFinish(s, 'worlds') === 'champion', lastFinish(s, 'worlds'));

    // 衛冕者導出自 titleHistory：玩家與 NPC 同一張表
    s.titleHistory = [
      { year: 2018, event: 'worlds', finish: 'champion', team: 'SKT', region: 'KR', isPlayer: false },
      { year: 2019, event: 'worlds', finish: 'champion', team: 'T1', region: 'KR', isPlayer: true },
    ];
    const champ = reigningChampion(s, 'worlds');
    check('reigningChampion 回最近一年的整筆 entry', champ && champ.team === 'T1' && champ.isPlayer === true, JSON.stringify(champ));
  }

  /* ---- 賽段冠軍入帳（N4，S20c）：每一座賽段冠軍在生涯評分裡都有份量 ----
   *
   * 修前 `career.js` 的 `HONOR_POINTS` 拿 `'季後賽冠軍'` 去比對，而 `playoff.js`
   * 產生的字串是 `'2020 PCS 夏季賽冠軍'`——25 段生涯 34 個以「冠軍」結尾的榮譽
   * 命中 0，每一座賽段冠軍在生涯評分裡值 0 分（該值 80）。
   */
  {
    const s = createState({ name: 'T', role: 'MID', seed: 'split-title' });
    const base = careerScore(s);
    s.splitTitles = 1;
    const one = careerScore(s);
    check('一座賽段冠軍在生涯評分裡值 80 分', one - base === 80, `${one - base}`);
    s.splitTitles = 3;
    check('賽段冠軍逐座計分', careerScore(s) - base === 240, `${careerScore(s) - base}`);
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
