/**
 * 生涯任務卡的條件式求值器（V4 §12.3，S17b）。
 *
 * §12.3 明文：觸發條件是**條件式**，不是固定欄位。「1 史詩＋1 稀有」只是目前 20 張
 * legend 卡寫成的樣子，不是 schema 的形狀——寫死成 `needEpic`／`needRare` 兩個欄位，
 * 後續想寫「兩個稀有」「賽事成績＋一個稀有」「純軌跡不吃素材」的傳說就全部卡死，
 * 而且玩家也失去了「從電競邏輯推敲取得條件」的樂趣（§1.2 的隱藏探索）。
 *
 * 條件式是資料不是程式碼，求值器認得的節點：
 *
 *   ['and', ...]  ['or', ...]  ['not', x]
 *   ['has', 階, 鍵]        ['hasCount', 階, n]
 *   ['stat', 查詢函式名, 比較子, 值]
 *   ['eventFlag', 旗標鍵]  ['eventCount', 計數鍵, 比較子, 值]
 *   ['lastAct', 活動id]    ← S48：上一個養成回合選的訓練活動（含 rest）
 *   ['percentile', 指標名, 比較子, 百分位]   ← S26：讀歷史母體靜態門檻
 *   ['leaguePct', 指標名, 比較子, 百分位]    ← S34：讀當季模擬母體（§24.3.2）
 *
 * 比較子：lt | lte | eq | gte | gt | ne。`hasCount` 的語意是「持有數 ≥ n」。
 *
 * `eventFlag`／`eventCount` 是連續事件的兩個節點（§12.2 增訂）：事件一點亮旗標、
 * 事件二的 `when` 讀旗標，這才做得出「事件 1 觸發後，滿足條件才觸發事件 2」；計數
 * 回答「這件事發生過幾次」，讓「觸發 N 次後開新事件／授予特質」寫得出來。兩者
 * **不寫成 `stat` 謂詞**是因為它們要帶鍵——`QUERIES` 的謂詞是無參數的純量查詢，
 * 為每個旗標各加一行謂詞等於把資料寫進程式碼。
 *
 * 每一格 `stat` 謂詞都轉呼叫 S17a 的 `engine/ledger.js`（或既有的查詢函式），不直接
 * 翻 `state` 的原始欄位——加新謂詞就是加一行 QUERIES，不動求值器。v4.3 起隱藏心理
 * 六維可以當條件（§12.3 第三條約束已廢止），但同樣要經查詢層讀，不直接翻
 * `state.mental`。
 *
 * ⚠ 求值必須是純函式：跑幾次結果都一樣，不準有副作用。這是「同結算點按開卡時間
 * 排序、先開先吃」那條規則能成立的前提——求值順序不能影響結果。
 */
import { TIER_STORES } from '../kernel/modifiers.js';
import {
  assistsPerGame, assistP90, awardsThisYear, careerGames, distinctTeams, eventCountOf, eventFlagOn,
  intlGames, intlSemis, intlWinRate, lastActivityOf, lastFinish, longestTenure, msiBest,
  peakRatingP50, reigningChampion, worldsBest,
} from './ledger.js';
import { finishOrder } from '../data/formats/finishes.js';
import { careerScore } from './career.js';
import { coachRating } from './attributes.js';
import { fameTier } from '../data/reputation.js';
import { eraOf } from '../data/eras.js';
import { LEAGUES } from '../data/leagues.js';
import { MENTAL_KEYS } from '../data/mental.js';
import { ATTRS } from '../data/attributes.js';
import { ROLE_ATTR_WEIGHTS } from '../data/skills.js';
import { PERCENTILE_METRICS } from '../data/npc/percentiles.js';
import { LEAGUE_PCT_METRICS, leaguePercentile } from '../kernel/leagueStats.js';
import { effectiveParams } from './lifecycle.js';
import { staminaOf } from './stamina.js';

/**
 * 條件式的階名 → state 的存放處。**直接讀 `TIER_STORES`**，不再自己抄一份
 * （S20c）——修前這裡是第三份階名手抄本，`unique` 階漏在外面，
 * `['has','unique',…]` 會丟「未知的階」。缺欄位回空物件，舊存檔才不會炸。
 */
const storeOf = (tier) => {
  const entry = TIER_STORES[tier];
  return entry ? (s) => entry.store(s) || {} : null;
};

/**
 * 謂詞表：名字 → 純查詢函式。加新謂詞＝加一行，不動求值器。
 * 除心智六維外全部是「生涯軌跡帳本或既有引擎的查詢」——條件式永遠不直接讀
 * `state` 的原始欄位（§12.3 約束 2）。
 *
 * ⚠ 鍵集合必須與 `tools/schema.js` 的 `PREDICATES` 相同（`AGENTS.md` 條件語言
 * 規則：加謂詞＝加一行，但要同時加進兩張註冊表）。`tests/kernel/conditions.mjs`
 * 有斷言在守這件事——少一邊，編輯器與引擎就脫節。
 */
export const QUERIES = {
  age: (s) => s.age,
  proYears: (s) => s.proYears,
  splitTitles: (s) => s.splitTitles,
  awards: (s) => s.awards,
  disbandCrises: (s) => s.disbandCrises,
  fame: (s) => s.fame,
  careerScore,
  coachRating,
  intlWinRate,       // S17a：國際賽勝率（%）
  intlGames,         // S35（§24.4.4）：國際賽生涯累計局數（讀 intlRecord 查詢層）
  assistsPerGame,    // S17a：生涯場均助攻
  longestTenure,     // S17a：單一戰隊最長年數
  distinctTeams,     // S17a：效力過幾支不同戰隊
  worldsBest,        // 世界賽生涯最佳名次（序位見 data/formats/finishes.js，99 = 沒打過）
  msiBest,           // MSI 生涯最佳名次（同一把尺，99 = 沒打過）
  intlSemis,         // 底線門檻：站上過國際賽四強以上（0/1）
  careerGames,       // S20c：生涯累計出賽場次（獨有特質「千錘百鍊」的門檻）
  awardsThisYear,    // S20c：今年拿到幾個個人獎項（獨有特質「老來俏」的門檻）
  lastWorlds: (s) => finishOrder(lastFinish(s, 'worlds')),   // S20g：上屆世界賽名次序位（99 = 沒打過）
  lastMsi: (s) => finishOrder(lastFinish(s, 'msi')),         // S20g：上屆 MSI 名次序位
  isReigningChampion: (s) => (reigningChampion(s, 'worlds')?.isPlayer ? 1 : 0),  // S20g：上屆世界賽冠軍是不是玩家
  fameLevel: (s) => {
    const t = fameTier(s.fame ?? 0);
    return ['沒沒無聞', '小有耳聞', '有點知名度', '圈內名人', '全民認識'].indexOf(t);
  },
  era: (s) => eraOf(s.year).key,
  region: (s) => LEAGUES[s.league]?.region ?? 'amateur',
  role: (s) => s.role,
  // S20e：退役三層的結局條件（§18.2）。除 stage 外都是純查詢——
  // marketQuiet 是 FA 期「無報價」的事實（transfer.js 設），peakRating 是生涯最高
  // 教練評價，atPeak 是「位置加權的天花板峰值年還沒過」（生命週期語意）
  stage: (s) => s.stage,
  wonWorldsThisYear: (s) => (s.wonWorldsThisYear ? 1 : 0),
  benchedStreak: (s) => s.benchedStreak ?? 0,
  peakRating: (s) => s.peakRating ?? 0,
  intlAppearances: (s) => s.intlAppearances ?? 0,
  marketQuiet: (s) => (s.marketQuiet ? 1 : 0),
  atPeak: (s) => {
    const w = ROLE_ATTR_WEIGHTS[s.role] || {};
    const peak = ATTRS.reduce((t, k) => t + (w[k] || 0) * effectiveParams(s, k).peak_age, 0);
    return s.age <= peak ? 1 : 0;
  },
  ...Object.fromEntries(MENTAL_KEYS.map((k) => [k, (s) => s.mental?.[k] ?? 50])),
  // 六大屬性（S20g 遷移補上：舊 `whenHits` 的 `attr` 範圍條件）。缺欄位回 0，
  // 與心理六維同一套「缺欄位不炸」的寫法——舊存檔缺 attr 鍵時條件式照樣可求值
  ...Object.fromEntries(ATTRS.map((k) => [k, (s) => s.attr?.[k] ?? 0])),
  // S20f 事件卡條件補的三個謂詞：體力資源、版本落差、傷勢週數。stamina 走
  // `stamina.js` 的查詢（缺欄位當滿體力，與引擎其他消費端同一套讀法）；其餘兩個
  // 直接讀 raw field，與 `benchedStreak` 同一種寫法（無查詢層可走）
  stamina: (s) => staminaOf(s),
  patchDebt: (s) => s.patchDebt ?? 0,
  injuryWeeks: (s) => s.injuryWeeks ?? 0,
};

/**
 * 求值器認得的節點全集。**與 `tools/schema.js` 的 `COND_NODES` 是兩張註冊表**
 * （同 `QUERIES`／`PREDICATES` 的規矩）：少一邊，編輯器就答應得出引擎不認得的
 * 條件、或畫不出引擎認得的條件。`tests/kernel/conditions.mjs` 逐項求值後比對，
 * 不手抄預期字串。
 */
export const COND_KINDS = [
  'and', 'or', 'not', 'has', 'hasCount', 'stat', 'eventFlag', 'eventCount', 'lastAct',
  'percentile', 'leaguePct',
];

const OPS = {
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  eq: (a, b) => a === b,
  gte: (a, b) => a >= b,
  gt: (a, b) => a > b,
  ne: (a, b) => a !== b,
};

/** 求值一個條件式節點。純函式，無副作用。 */
export function evalCond(state, node) {
  if (node === true) return true;
  if (node === false) return false;
  switch (node[0]) {
    case 'and': return node.slice(1).every((n) => evalCond(state, n));
    case 'or': return node.slice(1).some((n) => evalCond(state, n));
    case 'not': return !evalCond(state, node[1]);
    case 'has': {
      const store = storeOf(node[1]);
      if (!store) throw new Error(`條件式未知的階：${node[1]}`);
      return !!store(state)[node[2]];
    }
    case 'hasCount': {
      const store = storeOf(node[1]);
      if (!store) throw new Error(`條件式未知的階：${node[1]}`);
      const held = Object.entries(store(state)).filter(([, v]) => v).length;
      return held >= node[2];
    }
    case 'stat': {
      const fn = QUERIES[node[1]];
      if (!fn) throw new Error(`條件式未知的謂詞：${node[1]}`);
      const op = OPS[node[2]];
      if (!op) throw new Error(`條件式未知的比較子：${node[2]}`);
      return op(fn(state), node[3]);
    }
    // 事件觸發旗標與計數（§12.2 增訂）。鍵是**自由字串**——旗標名由寫卡的人取，
    // 引擎不維護白名單；「條件讀的旗標沒有任何卡點得亮」（死卡）由工具與測試擋，
    // 不在求值器擋，否則新卡要先改引擎才寫得出來
    case 'eventFlag': return eventFlagOn(state, node[1]);
    case 'eventCount': {
      const op = OPS[node[2]];
      if (!op) throw new Error(`條件式未知的比較子：${node[2]}`);
      return op(eventCountOf(state, node[1]), node[3]);
    }
    // 上個月的訓練活動（S48，§12.1 隨機池傾向）。`['lastAct', 'soloq']`＝上個月
    // 選了 SOLO RANK——卡片作者用它寫死劇情連鎖（例如只在打完 SOLO RANK 之後
    // 才命中的開台事件）。帶鍵所以是節點不是謂詞（與 eventFlag 同一個理由）。
    // 值不在此處驗（編輯器的 `validateCond` 擋非法活動 id；引擎對未知 id 就是
    // 恆 false——寫錯只會少觸發，不會炸）
    case 'lastAct': return lastActivityOf(state) === node[1];
    // 百分位門檻（S26，§14.3 兩條 route 路線）：玩家某指標 op 歷史母體門檻。
    // `['percentile', 'assist', 'gte', 90]`＝生涯場均助攻 ≥ 同位置 P90。
    // ⚠ peakRating 百分位 S30 起沒有消費卡：網紅選手改走絕對門檻 fallback
    // （fame≥3 的 peakRating 下限高於母體 P90，百分位定義不可達，見 quests.js）；
    // 節點與門檻保留，等 S31 當季模擬母體接管（§24.1）。
    // 門檻常數住在 `data/npc/percentiles.js`（生成器產出），這裡只讀查詢層——
    // 遊戲執行時零百分位運算（§23.5）。fallback（母體 < 100 留絕對門檻）對
    // 消費端透明：查詢層直接回 p90 就好。
    case 'percentile': {
      if (!PERCENTILE_METRICS.includes(node[1])) throw new Error(`條件式未知的百分位指標：${node[1]}`);
      const op = OPS[node[2]];
      if (!op) throw new Error(`條件式未知的比較子：${node[2]}`);
      if (node[1] === 'assist') return op(assistsPerGame(state), assistP90(state));
      if (node[1] === 'peakRating') return op(state.peakRating ?? 0, peakRatingP50());
      return false;
    }
    // 聯賽百分位（S34，§24.3.2）：玩家當季在本賽區當季模擬母體中的同位置百分位。
    // 與上面的 `percentile`（歷史史實母體）物理隔離——兩個節點各自表達一種母體，
    // 拿錯節點寫不出目標條件（§24.1 第 2 條，混用即規格錯誤）。
    case 'leaguePct': {
      if (!LEAGUE_PCT_METRICS.includes(node[1])) throw new Error(`條件式未知的聯賽百分位指標：${node[1]}`);
      const op = OPS[node[2]];
      if (!op) throw new Error(`條件式未知的比較子：${node[2]}`);
      const p = leaguePercentile(state, node[1]);
      if (p === null) return false;   // 母體 < 20，樣本不足不勉強切分
      return op(p, node[3]);
    }
    default: throw new Error(`條件式未知的節點：${node[0]}`);
  }
}

/**
 * 一張卡的**正向**素材需求（§14.1「被條件式讀到的素材在達成時才消耗」）。
 *
 * 只收集正向的 `has`／`hasCount`：`not has` 讀到的特質是「必須沒有」，消耗一個你
 * 沒有的東西沒有意義，素材失效檢驗也不該拿它當依據。`has` 給具體鍵；`hasCount`
 * 只給階與數目（達成時消耗「任意 n 個」——鍵由當下持有者決定，S19c 寫卡時若不想
 * 吃任意素材，就改用 `has` 指名）。
 */
export function collectMaterials(node) {
  const mats = [];
  const walk = (n) => {
    if (!Array.isArray(n)) return;
    switch (n[0]) {
      case 'has': mats.push({ tier: n[1], key: n[2] }); break;
      case 'hasCount': mats.push({ tier: n[1], count: n[2] }); break;
      case 'not': break;   // 否定持有不是素材
      default: for (const c of n.slice(1)) walk(c);
    }
  };
  walk(node);
  return mats;
}

/** 一個素材需求現在還滿不滿足（素材失效檢驗用） */
export function materialHeld(state, mat) {
  const store = storeOf(mat.tier)(state);
  if (mat.key !== undefined) return !!store[mat.key];
  return Object.entries(store).filter(([, v]) => v).length >= mat.count;
}

/** 消耗一個素材需求。回傳實際被消耗的 `{tier, key}` 清單（log 用） */
export function consumeMaterial(state, mat) {
  const store = storeOf(mat.tier)(state);
  const eaten = [];
  if (mat.key !== undefined) {
    if (store[mat.key]) {
      delete store[mat.key];
      eaten.push({ tier: mat.tier, key: mat.key });
    }
    return eaten;
  }
  for (const key of Object.keys(store).slice(0, mat.count)) {
    if (store[key]) {
      delete store[key];
      eaten.push({ tier: mat.tier, key });
    }
  }
  return eaten;
}