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

/* ---------------- 國際賽名次（S17b 增補：legend 底線門檻的來源） ---------------- */

/**
 * 世界賽生涯最佳名次（§12.3「世界賽名次 ≤ n」）。回傳越小越好：
 * 1 冠軍／2 亞軍／3 四強／4 八強／5 小組／6 入圍賽，沒打過回 99。
 *
 * 名次只記在 `milestones` 的事實流裡（`phases/worlds.js` 的 settle 統一補前綴），
 * 欄位計數器只有冠軍（worldsWins）與亞軍（worldsFinals）——「四強止步」沒有任何
 * 計數器，所以讀帳本而不翻欄位。
 */
const WORLDS_ORDER = { '世界賽 冠軍': 1, '世界賽 亞軍': 2, '世界賽 四強止步': 3, '世界賽 八強止步': 4, '世界賽 小組止步': 5, '世界賽 入圍賽出局': 6 };

export function worldsBest(state) {
  let best = 99;
  for (const m of state.milestones) {
    const at = WORLDS_ORDER[m.text];
    if (m.kind === 'intl' && at !== undefined) best = Math.min(best, at);
  }
  return best;
}

/** MSI 生涯最佳名次（同 worldsBest，1 冠軍／2 亞軍／3 四強，沒打過回 99） */
export function msiBest(state) {
  let best = 99;
  for (const m of state.milestones) {
    if (m.kind !== 'intl' || !m.text.startsWith('MSI')) continue;
    const at = m.text === 'MSI 冠軍' ? 1 : m.text === 'MSI 亞軍' ? 2 : m.text === 'MSI 四強' ? 3 : 99;
    best = Math.min(best, at);
  }
  return best;
}

/**
 * 生涯是否站上過國際賽四強以上（§14.2 底線門檻：世界賽四強／MSI 四強）。
 * 回 0/1 方便直接當條件式的數值謂詞用。
 */
export function intlSemis(state) {
  return worldsBest(state) <= 3 || msiBest(state) <= 3 ? 1 : 0;
}
