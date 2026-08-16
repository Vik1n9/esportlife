/**
 * 退役結局的資料表（V4 §18.2，S20e）。
 *
 * 三層結構的「層」住引擎（engine/retire.js 的判定、engine/game.js 的流程），這裡
 * 只放資料：五張第一層特殊結局卡與第二層退役選項的條件式＋文案。
 *
 * ⚠ 條件一律寫 `conditions.js` 的 s-expression 條件式（AGENTS.md 條件語言規則：
 * 全專案只有一套），不寫 JS 函式——條件表才能被編輯器與工具驗證，也才不會冒出
 * 第二套判定語法。
 *
 * 文案變數限 `shared.js` 的 `cardVars` 恆有集（{name}／{team}／{year}／{age}）
 * 加上呼叫端額外供給的 {n}（王朝基石的賽段冠軍數／流星劃過的職業年資）——
 * `cardText` 對缺變數的模板會直接丟例外，佔位符進不了遊戲。
 *
 * ⚠ 不寫半形 `?`：`tests/kernel/biography.mjs` 的 MARKER 檢查（`/[{\?]|undefined/`）
 * 會把「?」當佔位符殘留掃出來。
 */
export const RETIRE_ENDINGS = [
  // 第一層特殊結局。依表序檢查，第一個命中即定——順序就是優先序（§18.2）
  {
    id: 'dynasty',
    name: '王朝基石',
    tone: 'gold',
    cond: ['and', ['stat', 'longestTenure', 'gte', 8], ['stat', 'splitTitles', 'gte', 3]],
    prompt: '你把整個職業生涯釘在一支隊上。{n} 座賽段冠軍，{team} 的隊史從此寫著你的名字——不是過客，是地基。',
  },
  {
    id: 'curtain',
    name: '冠軍謝幕',
    tone: 'gold',
    cond: ['stat', 'wonWorldsThisYear', 'eq', 1],
    prompt: '最後一季，最後一戰，世界冠軍。{year} 年你捧起那座獎盃，然後鞠躬下台——沒有比這更好的謝幕。',
  },
  {
    id: 'veteran',
    name: '不屈老將',
    tone: 'gold',
    cond: ['and', ['stat', 'age', 'gte', 32], ['stat', 'benchedStreak', 'eq', 0], ['stat', 'coachRating', 'gte', 62]],
    prompt: '{age} 歲，你仍然站在先發名單上。年輕選手換了一輪又一輪，教練還是把那格留給你。',
  },
  {
    id: 'shootingStar',
    name: '流星劃過',
    tone: 'gold',
    cond: ['and', ['stat', 'proYears', 'lte', 3], ['stat', 'peakRating', 'gte', 75]],
    prompt: '職業生涯只有 {n} 年，卻亮得讓整個聯賽記住了你。天才的火燒得最旺，也最短。',
  },
  {
    id: 'quietExit',
    name: '無聲告別',
    tone: 'bad',
    cond: ['and', ['stat', 'marketQuiet', 'eq', 1], ['stat', 'intlAppearances', 'eq', 0]],
    prompt: '沒有告別賽，沒有採訪，沒有轉播鏡頭。下季的名單上沒有你——就像你來過這件事，只有少數人記得。',
  },
];

/**
 * 第二層退役選項（未命中特殊結局時）。條件式回 false 的選項不出現在 choice 裡；
 * 「宣布退役」條件為 true（永遠出現，§18.2 明文）。
 *
 * `kind: 'continue'` 的選項（最後一搏）不結束生涯：引擎簽一年短約後回 false，
 * careerFlow 繼續跑下一季——其餘選項都是 `kind: 'leave'`（或省略），確定退役。
 */
export const RETIRE_OPTIONS = [
  {
    id: 'announce',
    label: '宣布退役',
    tone: '',
    kind: 'leave',
    cond: true,
    note: '結束職業生涯',
    prompt: '你把滑鼠收進背包，最後一次關掉訓練室的燈。職業生涯，到此為止。',
  },
  {
    id: 'lastHustle',
    label: '最後一搏',
    tone: 'info',
    kind: 'continue',
    cond: ['and', ['stat', 'marketQuiet', 'eq', 0], ['stat', 'age', 'lt', 35], ['stat', 'stage', 'ne', 'AMATEUR']],
    note: '再簽一年短約，繼續職業生涯',
    prompt: '你反悔了。{team} 願意再給你一年短約——那就，再打一年。',
  },
  {
    id: 'walkAway',
    label: '轉身離開',
    tone: 'gold',
    kind: 'leave',
    cond: ['and', ['stat', 'coachRating', 'gte', 75], ['stat', 'atPeak', 'eq', 1]],
    note: '評價仍在頂峰時急流勇退',
    prompt: '評價還站在頂峰，你卻先鬆手了。多年後記者問起，你說：不後悔。',
  },
  {
    id: 'coach',
    label: '轉型教練',
    tone: 'info',
    kind: 'leave',
    cond: ['and', ['stat', 'proYears', 'gte', 8], ['stat', 'awr', 'gte', 70], ['stat', 'dec', 'gte', 70]],
    note: '退役後轉入教練席',
    prompt: '你脫下隊服，走到戰術板前。下一批新人，將在你的注視下長大。',
  },
];

/** 特殊結局卡文案的 {n} 供給者：依結局讀對應的事實，供給者在 engine/game.js */
export const ENDING_N = {
  dynasty: (s) => s.splitTitles ?? 0,
  shootingStar: (s) => s.proYears ?? 0,
};