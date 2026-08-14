/**
 * 生涯軌跡帳本的純查詢層（V4 §14.3／§15.5，S17a）。
 *
 * S17b（生涯任務引擎）與 S21a（生涯傳記）都讀這裡——條件判斷不准直接翻
 * `state` 的原始欄位，改一次欄位要改三個地方。全部純函式，吃 state 回數字。
 */

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
