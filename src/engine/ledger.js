/**
 * 生涯軌跡帳本的純查詢層（V4 §14.3／§15.5，S17a）。
 *
 * S17b（生涯任務引擎）與 S21a（生涯傳記）都讀這裡——條件判斷不准直接翻
 * `state` 的原始欄位，改一次欄位要改三個地方。全部純函式，吃 state 回數字。
 *
 * S26 追加百分位門檻查詢（§23.5）：門檻常數住在 `data/npc/percentiles.js`
 * （生成器產出），這裡只負責「依玩家身分查表」——條件語言讀查詢層，不直接
 * 翻資料檔。
 */
import { finishOrder, NO_FINISH } from '../data/formats/finishes.js';
import { ASSIST_P90, PEAK_RATING_P50 } from '../data/npc/percentiles.js';

/** 國際賽勝率（%）：`intlRecord` 的 W ÷ (W+L)，沒打過國際賽回 0（§14.3「賽區統治者」） */
export function intlWinRate(state) {
  const { W, L } = state.intlRecord;
  if (W + L === 0) return 0;
  return Math.round((W / (W + L)) * 1000) / 10;
}

/**
 * 國際賽生涯累計局數（§24.4.4「國際賽老將」，S35）：`intlRecord` 的 W + L——
 * `recordIntlSeries`／`recordIntlGroup` 以「局」入帳（mine/theirs 與 wins/losses
 * 都是局數），帳本就是局數的唯一來源，不另存計數。
 */
export function intlGames(state) {
  return state.intlRecord.W + state.intlRecord.L;
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

/**
 * 單一筆戰績的 KDA 比值（(K+A)÷D，取一位小數）。轉播數據表的尺度。
 *
 * ⚠ D=0 不炸：零死亡時回 K+A（傳統播法），不會出現 Infinity 印上結算圖。
 */
export function kdaOf(stat) {
  if (!stat.D) return stat.K + stat.A;
  return Math.round(((stat.K + stat.A) / stat.D) * 10) / 10;
}

/** 生涯總 KDA：所有分區的 KDA 加總後再除一次（不是各分區比值的平均） */
export function careerKda(state) {
  const sum = { K: 0, D: 0, A: 0 };
  for (const s of Object.values(state.stats)) {
    sum.K += s.K;
    sum.D += s.D;
    sum.A += s.A;
  }
  return kdaOf(sum);
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

/* ---------------- 事件觸發旗標與計數（V4 §12.2 增訂） ---------------- */

/**
 * 一個事件旗標點亮了沒有。
 *
 * 旗標是**連續事件的記憶**：事件一結算時點亮，事件二的 `when` 讀它，跨月、跨賽季
 * 都記得。與 `phases/shared.js` 的 `chain`（同一個 beat 內立刻接演下一張卡）分工
 * 明確——chain 是「當場接著演」，旗標是「以後條件滿足了才來」。
 *
 * ⚠ 讀在這一層、寫在 `engine/eventTrigger.js`：條件式不准直接翻 `state` 的原始
 * 欄位（`AGENTS.md` 條件語言規則），而 `conditions.js` 反過來被 `eventTrigger.js`
 * import，讀取端放進寫入端會成環。缺欄位（v23 以前的存檔）一律回 false。
 */
export function eventFlagOn(state, key) {
  return !!(state.eventFlags || {})[key];
}

/**
 * 一個事件觸發計數現在是多少。
 *
 * 鍵有兩種來源，共用同一個命名空間（所以條件式只要一種節點就讀得到兩者）：
 *   - **卡 id**：每張卡出場一次自動 +1（`recordEventTrigger`），寫卡的人不用宣告。
 *   - **具名計數**：卡片結果的 `counters` 欄位宣告，跨卡累加（「賭了幾次」這種
 *     不屬於單一張卡的軌跡）。
 *
 * 兩者共用命名空間表示具名計數不得與任何卡 id 撞名——`tests/kernel/eventChain.mjs`
 * 有斷言在守（撞名會讓兩條軌跡互相灌水，而且靜默）。缺欄位回 0。
 */
export function eventCountOf(state, key) {
  return (state.eventCounts || {})[key] ?? 0;
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

/* ---------------- 百分位門檻（S26，§14.3 兩條 route 路線） ---------------- */

/**
 * 生涯場均助攻的 P90 門檻（玩家該位置的歷史母體，讀靜態表）。
 *
 * ⚠ fallback 語意：`percentiles.js` 的 `ASSIST_P90` 在母體樣本 < 100 時
 * `fallback: true`、p90 = 現行絕對門檻 2.5。這裡不用知道 fallback 的存在——
 * 直接讀 p90 就好，切換百分位的決定權在生成器（S30 視樣本狀況更新表）。
 */
export function assistP90(state) {
  return ASSIST_P90[state.role]?.p90 ?? 2.5;
}

/** 歷史母體 peakRating 中位數（不分位置的靜態門檻，§23.5） */
export function peakRatingP50() {
  return PEAK_RATING_P50.p50;
}
