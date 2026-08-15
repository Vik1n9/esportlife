/**
 * 生涯軌跡帳本的純查詢層（V4 §14.3／§15.5，S17a）。
 *
 * S17b（生涯任務引擎）與 S21a（生涯傳記）都讀這裡——條件判斷不准直接翻
 * `state` 的原始欄位，改一次欄位要改三個地方。全部純函式，吃 state 回數字。
 */
import { finishOrder, NO_FINISH } from '../data/formats/finishes.js';

/** 國際賽勝率（%）：`intlRecord` 的 W ÷ (W+L)，沒打過國際賽回 0（§14.3「賽區統治者」） */
export function intlWinRate(state) {
  const { W, L } = state.intlRecord;
  if (W + L === 0) return 0;
  return Math.round((W / (W + L)) * 1000) / 10;
}

/** 生涯場均助攻：所有分區累計助攻 ÷ 出場數（§14.3「究極綠葉」） */
export function assistsPerGame(state) {
  let G = 0;
  let A = 0;
  for (const s of Object.values(state.stats)) {
    G += s.G;
    A += s.A;
  }
  return G > 0 ? Math.round((A / G) * 10) / 10 : 0;
}

/** 生涯效力過幾支不同戰隊（§14.3「流浪傭兵」：≥ 4 支） */
export function distinctTeams(state) {
  return new Set(state.teamHistory.map((e) => e.team)).size;
}

/** 待在單一戰隊最久的年數（§14.3「不滅隊魂」：效力同一戰隊 > 6 年） */
export function longestTenure(state) {
  let best = 0;
  for (const e of state.teamHistory) {
    const to = e.toYear ?? state.year;
    best = Math.max(best, to - e.fromYear + 1);
  }
  return best;
}

/* ---------------- 國際賽名次（S17b 增補：legend 底線門檻的來源） ---------------- */

/**
 * 某個賽事的生涯最佳名次（序位越小越好，沒打過回 `NO_FINISH`）。
 *
 * 名次只記在 `milestones` 的事實流裡——欄位計數器只有冠軍（worldsWins）與亞軍
 * （worldsFinals），「四強止步」沒有任何計數器，所以讀帳本而不翻欄位。
 *
 * ⚠ **讀 `finish` 鍵，不解析 `text`**（S20c）。修前這裡是兩份手抄本：`WORLDS_ORDER`
 * 的冠亞軍鍵多一個空格，永遠比不中；`msiBest` 的行內三元鏈不認得 `'MSI 止步'`。
 * 兩個都靜默——查表查不到就回「沒打過」，18758 項全綠底下活了十幾站。
 */
function bestFinish(state, event) {
  let best = NO_FINISH;
  for (const m of state.milestones) {
    if (m.kind !== 'intl' || m.event !== event) continue;
    best = Math.min(best, finishOrder(m.finish));
  }
  return best;
}

/**
 * 世界賽生涯最佳名次（§12.3「世界賽名次 ≤ n」）。序位見
 * `data/formats/finishes.js`：1 冠軍／2 亞軍／3 四強／4 八強／6 小組／7 入圍賽，
 * 沒打過回 99（5 是保留給 NPC 賽事模擬的 `ro16`）。
 */
export function worldsBest(state) {
  return bestFinish(state, 'worlds');
}

/** MSI 生涯最佳名次（同一把尺：1 冠軍／2 亞軍／3 四強／4 止步，沒打過回 99） */
export function msiBest(state) {
  return bestFinish(state, 'msi');
}

/**
 * 生涯是否站上過國際賽四強以上（§14.2 底線門檻：世界賽四強／MSI 四強）。
 * 回 0/1 方便直接當條件式的數值謂詞用。
 */
export function intlSemis(state) {
  return worldsBest(state) <= 3 || msiBest(state) <= 3 ? 1 : 0;
}

/* ---------------- 獨有特質的授予條件（§14.1，S20c 接線） ---------------- */

/** 生涯累計出賽場次（`千錘百鍊` 的門檻：≥ 1000 場） */
export function careerGames(state) {
  let G = 0;
  for (const s of Object.values(state.stats)) G += s.G;
  return G;
}

/**
 * 今年拿到幾個個人獎項（`老來俏` 的門檻：30 歲後單季獲獎）。
 *
 * 讀 `milestones` 的 award 事實流而不是 `state.awards`——後者是生涯總數，
 * 答不出「單季」。
 */
export function awardsThisYear(state) {
  return state.milestones.filter((m) => m.kind === 'award' && m.year === state.year).length;
}

/* ---------------- 衛冕者與上屆名次（S20g，V4 §16.2） ---------------- */

/**
 * 上屆同賽事的名次鍵（讀 `milestones` 導出，不另存）。
 *
 * 使用者 PR #16 要的「NPC 與玩家共用的上屆同賽事名次變數」——S20c 把名次以
 * 機器可讀鍵（`event`／`finish`）入帳之後，這條查詢就是一行：找里程碑裡同 event
 * 最近一年的 finish。沒打過回 `'none'`（`FINISH_ORDER.none` 的鍵）。
 *
 * ⚠ 名次鍵不是序位：要當條件式數值謂詞用，先過 `finishOrder`（見 conditions.js
 * 的 `lastWorlds`／`lastMsi`）。
 */
export function lastFinish(state, event) {
  let bestYear = -1;
  let finish = 'none';
  for (const m of state.milestones) {
    if (m.kind !== 'intl' || m.event !== event) continue;
    if (m.year > bestYear) { bestYear = m.year; finish = m.finish; }
  }
  return finish;
}

/**
 * 上屆同賽事的衛冕冠軍（讀 `titleHistory` 導出，不另存）。
 *
 * 回傳 `titleHistory` 裡該 event 最近一年的整筆 entry（`{year, event, finish,
 * team, region, isPlayer}`）；表是空的（遊戲第一年、或該賽事從沒打過）回 null。
 *
 * ⚠ 這是「NPC 與玩家共用」的資料面：玩家奪冠與合成 NPC 冠軍寫進同一張表，所以
 * 玩家奪冠的下一年，這一條查出來的就是玩家自己（`isPlayer: true`）——世界賽要用
 * 它判斷「玩家是不是衛冕者，不能把自己標成對手」。
 */
export function reigningChampion(state, event) {
  let best = null;
  for (const e of state.titleHistory) {
    if (e.event !== event) continue;
    if (!best || e.year > best.year) best = e;
  }
  return best;
}
