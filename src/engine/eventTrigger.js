/**
 * 事件觸發引擎（V4 §12.1）。
 *
 * 舊版觸發是「隨機不重複」：`rng.pick(availableEvents())`，最近 6 張不重抽，每個賽段
 * 抽 2 張。V4 改成**條件優先**——狀態符合條件時該來的事件會來，這是 rogue-like 的
 * build 探索能成立的前提：玩家練出某種狀態，就會看到回應那個狀態的事件，而不是把
 * 事件當成純隨機裝飾。
 *
 * §12.1 的四步演算法：
 *
 *   0. 時段過濾：排除時段標籤與當前生涯時段不匹配的卡（v4.2）。不匹配的卡連候選池
 *      都進不去，也不參與優先度排序——它是每張卡都要比對的粗篩，條件式是細算，
 *      分開寫的理由是成本與語意（§12.1）。
 *   1. 收集本月所有條件命中的事件卡
 *   2. 取最高優先度者為候選；多張同優先度 → 隨機抽一張（事件一只能有一張）
 *   3. 擲「第二張」機率（30%）：命中再取一張，優先從剩餘條件事件按優先度，無則
 *      隨機池；須與事件一做互斥檢查
 *   4. 候選為空：隨機池抽事件一，再擲第二張
 *
 * **連續事件**（§12.2 增訂）走的是同一個第 1 步：事件一的結果點亮旗標
 * （`setFlags`）或推進計數（`counters`），事件二的 `when` 用 `['eventFlag', 鍵]`／
 * `['eventCount', 鍵, 比較子, 值]` 讀它，於是「事件一觸發過、而且現在條件也滿足」
 * 才輪到事件二。旗標與計數的寫入函式在本檔下半（讀取端在 `engine/ledger.js`）。
 *
 * ⚠ 條件卡不受防重機制擋，所以**旗標亮著的期間那張卡每個月都會命中**——一段連鎖
 * 的收尾卡必須把旗標熄掉（`clearFlags`），否則它會霸佔往後每一個月的事件一。
 * `tests/kernel/eventChain.mjs` 有斷言在守「每個被讀的旗標都熄得掉」。
 *
 * 這個檔是純規則（可測），呈現留在 `phases/shared.js` 的 `drawEvent`——觸發回答
 * 「這個月出哪張卡」，呈現回答「出了之後玩家怎麼應對、結果長什麼樣」。分開之後
 * 觸發邏輯可以寫純函式測試，不必跑完整生涯。
 *
 * ⚠ 依賴方向：`phases → engine → kernel → data`。隨機池的「特質耗盡不放回」判斷
 * 需要 `kernel/modifiers.js` 的 `traitName`，所以 `FLAG_TRAIT`／`unlockableTraits`
 * 從 `phases/shared.js` 搬到這裡（shared 反過來 import）。
 */
import { clamp } from '../core/rng.js';
import { EVENT_CARDS } from '../data/events.js';
import { staminaOf, successMul } from './stamina.js';
import { traitName, flag } from '../kernel/modifiers.js';
import { skillValue } from './attributes.js';
import { evalCond } from './conditions.js';

/** 第二張事件的機率（%）。§12.1「每回合固定觸發 1 張，有機率觸發 2 張」的機率值 */
export const SECOND_EVENT_CHANCE = 30;

/* ================= 時段過濾（步驟 0，v4.2） ================= */

/**
 * 當下生涯時段的標籤集合（§12.2 時段標籤表）。
 *
 * 月度事件判定只發生在養成回合（`MONTH` phase），所以 PRO 階段實際只會落在
 * `offseason`（1、12 月）或 `regular`（2–9 月的常規賽月）——季後賽／MSI／世界賽
 * 月份不排養成回合，那些標籤的卡在月度判定永遠不會被抽到，由未來的賽事期觸發
 * （S18 內容端）承接。12 月同時是休賽期與轉會期，所以兩個標籤都給。
 *
 * 業餘與青訓階段一年沒有賽段，一律只取該階段的標籤（§12.2：「業餘與青訓不分賽段」）。
 * 降級／解散危機不分月份，`disbandThreat` 為真就掛 `crisis`。
 */
export function currentSlots(state, phase) {
  if (state.stage === 'AMATEUR') return new Set(['amateur']);
  if (state.stage === 'AM2') return new Set(['am2']);
  const slots = new Set();
  const month = phase?.month ?? state.month ?? 1;
  if (month === 1 || month === 12) {
    slots.add('offseason');
    if (month === 12) slots.add('transfer');
  } else {
    slots.add('regular');
  }
  if (state.disbandThreat) slots.add('crisis');
  return slots;
}

/** 一張卡與當下時段是否相容。沒標時段標籤的卡視為全時段（向後兼容） */
function slotHits(state, phase, ev) {
  const tags = ev.slot;
  if (!tags || !tags.length) return true;
  const cur = currentSlots(state, phase);
  return tags.some((t) => cur.has(t));
}

/* ================= 條件求值（步驟 1，v4.2 → S20g） ================= */

/**
 * 一般事件卡的觸發條件。
 *
 * S20g 起事件卡與任務卡共用**同一套條件語言**（`AGENTS.md` 條件語言規則）：
 * `when` 欄位是 s-expression（與任務卡的 `trigger` 同一種形狀），由
 * `conditions.js` 的 `evalCond` 求值，不再有第二個求值器。
 *
 * 舊的 `whenHits` 只支援 stage／minAge／maxAge／attr／trait／mental，且 trait 只讀
 * common 階、語意與文件相反——遷移後這三個缺陷自動消失（`evalCond` 的
 * `['has', 階, 鍵]` 四階都支援）。`when` 存在（非 `undefined`）的卡是**條件卡**，
 * 命中才進候選池；沒有 `when` 的卡是**隨機池成員**。
 *
 * ```js
 * when: ['and', ['stat', 'age', 'gte', 20], ['has', 'epic', 'godhand']]
 * ```
 *
 * ⚠ `slot`（時段過濾）不是條件——它是步驟 0 的粗篩，與 `when` 分開（§12.1）。
 */

/* ================= 隨機池與防重 ================= */

/** 隱藏素質相關的 flag——選了「安全牌」的選項時整批不生效（原在 shared.js，隨抽卡邏輯搬入）。
 * ⚠ S18 第二批補登 genius／clutch／intlghost／underdog：第一批的觸發卡把這四個旗標寫進
 * FLAG_TRAIT 卻漏了這張表，結果安全牌（traits:false）照樣解鎖特質——「安全牌不推向
 * 任何極端」（events.js 檔頭）的設計被打破，實測 last 策略下 clutch 持有高達 71%。 */
export const TRAIT_FLAGS = ['popular', 'composure', 'leader', 'laneking', 'macroPoint', 'tiltRisk',
  'grinder', 'meme', 'camera', 'guardian', 'genius', 'clutch', 'intlghost', 'underdog',
  'trashtalk', 'meta'];

/** flag 名稱 → 解鎖定義。事件卡的 trait 解鎖都走這張表，不逐條 if。 */
export const FLAG_TRAIT = {
  popular: { key: 'popular' },
  composure: { key: 'composure' },
  leader: { key: 'leader' },
  laneking: { key: 'laneking', need: (s) => s.age < 28 },
  // `營運鬼才` 的門檻原本掛在已被拆掉的「大局觀」上。十二技能表裡它的後繼是「轉線運營」
  // （舊 awr .55／dec .35／syn .10 對新 .50／.35／.15，同一批屬性同一個量級），所以
  // 門檻 75 原封不動搬過來，難度沒有跟著換表而鬆動
  macroPoint: { key: 'macroG', need: (s) => skillValue(s, 'rotate') >= 75 },
  grinder: { key: 'grinder' },
  meme: { key: 'meme' },
  camera: { key: 'camera' },
  guardian: { key: 'guardian' },
  tiltRisk: { key: 'tilt', chance: 25, blockIf: (s) => flag(s, 'tiltImmune') },
  // S18 補的觸發卡旗標（S19a 交接筆記第三節死配方清單：genius／clutch／intlghost／
  // underdog；iron 已由 S19d 天生池解、meta 有 seasonEnd 生涯條件，兩者不在此列）
  genius: { key: 'genius' },
  clutch: { key: 'clutch' },
  intlghost: { key: 'intlghost' },
  underdog: { key: 'underdog' },
  // S20c／N8：`賽前互嗆`（events.js `enemy_taunt`）與 `招牌被Ban`（`champion_ban`）
  // 兩張卡寫了旗標、編輯器也把它們列為可寫旗標，但這張表裡沒有——卡片承諾解鎖特質、
  // 實際零給予。不補的話 S20f 寫新卡時會被再寫一次
  trashtalk: { key: 'trashtalk' },
  meta: { key: 'meta' },
};

/** 一張事件卡所有選項／結果可能解鎖的特質鍵。純資料推導，不放邏輯。 */
function unlockableTraits(ev) {
  const set = new Set();
  const collect = (flags) => {
    if (!flags) return;
    for (const [f, def] of Object.entries(FLAG_TRAIT)) if (flags[f]) set.add(def.key);
  };
  collect(ev.good.flags); collect(ev.bad.flags);
  for (const o of ev.options) {
    collect(o.flags);
    if (o.on) { collect(o.on.good.flags); collect(o.on.bad.flags); }
  }
  return [...set];
}

/**
 * 目前「還抽得到」的事件卡（隨機池專用）。
 *
 * 類 roguelike：事件卡會**耗盡**。一張卡能解鎖的特質若全部都已取得（持有或已合成
 * 消耗），這張卡就摸不到了——玩家不會被同一張「最初教會他一招」的卡反覆餵食。
 * 純敘事卡（不解鎖任何特質）永遠在池裡。另外追蹤最近出過的卡，避免短時間內連著
 * 重複。兩層都只縮減「抽選範圍」，不會把池子抽空——耗盡後自動放回全池。
 *
 * ⚠ 條件卡（有 `when`）不走這條：它命中是因為狀態匹配，該來就來（§12.1 的「事件
 * 變成對玩家狀態的回應」），不被防重機制擋。
 */
function availableEvents(state, pool) {
  const base = pool.filter((ev) => {
    if (ev.when) return false;
    const traits = unlockableTraits(ev);
    if (!traits.length) return true;
    return traits.some((t) => !state.traits[t] && !state.fusedAway.includes(traitName(t)));
  });
  const recent = state.recentEvents || [];
  const fresh = base.filter((ev) => !recent.includes(ev.id));
  return (fresh.length ? fresh : base);
}

/* ================= 主流程 ================= */

/** 同優先度（最高）的候選中隨機抽一張 */
function pickTop(candidates, rng) {
  // 優先度沒寫的卡算 0；墊一個 0 是為了 `Math.max(0, ...)` 不吐出 NaN（全未寫優先度時）
  const top = Math.max(0, ...candidates.map((c) => c.priority ?? 0));
  const atTop = candidates.filter((c) => (c.priority ?? 0) === top);
  return rng.pick(atTop);
}

/** 與事件一同一互斥群組的卡排除後，再選第二張 */
function pickSecond(candidates, first, rng) {
  const allowed = candidates.filter((c) => c.id !== first.id && (first.excl == null || c.excl !== first.excl));
  if (!allowed.length) return null;
  return pickTop(allowed, rng);
}

function markRecent(state, ev) {
  const recent = state.recentEvents || [];
  state.recentEvents = [...recent, ev.id].slice(-6);
}

/**
 * 跑一次月度事件判定（§12.1 四步）。
 *
 * @param {object} state 遊戲狀態（條件、特質、體力都從這裡讀）
 * @param {object} phase 當月的階段資訊（`month`／`splitIndex`，時段過濾用）
 * @param {object[]} [pool] 事件卡庫，預設 `EVENT_CARDS`（測試可傳自訂池）
 * @param {object} rng 人生流亂數
 * @returns {object[]} 1~2 張卡（第二張 30% 機率，與事件一互斥檢查）
 */
export function eventTrigger(state, phase, pool, rng) {
  const cards = pool || EVENT_CARDS;

  /* 步驟 0：時段過濾——不匹配當下時段的卡連候選池都進不去 */
  const eligible = cards.filter((ev) => slotHits(state, phase, ev));

  /* 步驟 1：收集條件命中的卡 */
  const condHits = eligible.filter((ev) => ev.when && evalCond(state, ev.when));

  /* 步驟 2：取最高優先度為事件一；候選空（步驟 4）→ 隨機池 */
  const first = condHits.length
    ? pickTop(condHits, rng)
    : rng.pick(availableEvents(state, eligible));
  if (!first) return [];
  markRecent(state, first);

  /* 步驟 3：擲第二張——優先從剩餘條件事件按優先度，無則隨機池；互斥檢查。
   * 剩餘候選「全部被互斥排除」也算無（§12.1「無則隨機池」），所以先試候選、
   * 試不到再落回隨機池 */
  const rest = condHits.filter((c) => c.id !== first.id);
  let second = null;
  if (rng.chance(SECOND_EVENT_CHANCE)) {
    second = pickSecond(rest, first, rng);
    if (!second) second = pickSecond(availableEvents(state, eligible), first, rng);
  }
  if (second) markRecent(state, second);

  return second ? [first, second] : [first];
}

/* ================= 觸發旗標與計數（§12.2 增訂） ================= */

/**
 * 連續事件的兩個記憶體：**旗標**（發生過沒有）與**計數**（發生過幾次）。
 *
 * 沒有它們，事件之間就只有 `chain`（`phases/shared.js`：同一個 beat 內立刻接演
 * 下一張卡）這一條路——那是「一口氣演完的三聯幅」，做不出「這個月被挖角接觸，
 * 兩個月後對方才拿合約來」這種真正的連續事件，也答不出「這件事你已經幹過三次」。
 *
 * 三個寫入點都在事件卡的**結果**上（`good`／`bad`／選項的 `on`）與**選項**上：
 *
 *   `setFlags: ['poached']`    點亮旗標（下一段事件的 `when` 讀它）
 *   `clearFlags: ['poached']`  熄滅旗標（一段連鎖走完要熄，否則條件卡每月都命中）
 *   `counters: ['gamble']`     具名計數 +1（跨卡累加的軌跡）
 *
 * 逐卡計數不必宣告：每張卡出場一次由 `recordEventTrigger` 自動 +1，鍵就是卡 id。
 *
 * ⚠ **旗標不是特質旗標**（`flags` 欄位那一組）。`flags` 交給引擎解讀成屬性、體力、
 * 特質解鎖；這裡的旗標只是「這件事發生過」的記號，沒有數值效果，也**不受安全牌
 * （`traits: false`）過濾**——安全牌擋的是「被推向極端」，不是劇情的推進。
 *
 * ⚠ 讀取端在 `engine/ledger.js`（`eventFlagOn`／`eventCountOf`），條件式經它讀。
 * 寫在這裡、讀在那裡是為了不成環：`conditions.js` 被本檔 import。
 */

/** 點亮旗標。已亮的再點一次是 no-op（旗標是布林，不累加） */
export function setEventFlags(state, keys) {
  if (!keys || !keys.length) return;
  if (!state.eventFlags) state.eventFlags = {};
  for (const k of keys) state.eventFlags[k] = true;
}

/** 熄滅旗標。刪鍵而不是寫 false——存檔不留一堆死鍵，條件式讀缺鍵本來就是 false */
export function clearEventFlags(state, keys) {
  if (!keys || !keys.length || !state.eventFlags) return;
  for (const k of keys) delete state.eventFlags[k];
}

/**
 * **年度旗標的前綴**：以它開頭的旗標在年初重新上膛（`engine/game.js` 的 `yearOpen`
 * 呼叫 `rearmAnnualEventFlags`）。
 *
 * 閂有兩種壽命，差別只在鍵怎麼取名——不另開欄位，也不維護第二張表：
 *
 *   `xxx_done`         一次生涯一次（旗標永遠不熄）
 *   `annual_xxx_done`  一年一次（年初清掉，下一年重新來過）
 *
 * 「季中低潮」該是每個賽季都可能發生的事，但同一年裡月月重播就成了背景音——
 * 年度閂正是這兩件事之間的那條線。前綴當開關而不是加一個 `annualFlags` 欄位，
 * 是因為旗標本來就只有一個存放處，多一個欄位就多一種「寫進哪一格」的錯法。
 */
export const ANNUAL_FLAG_PREFIX = 'annual_';

/**
 * 年初重新上膛：清掉所有年度旗標（前綴 `annual_`），其餘旗標原封不動。
 *
 * ⚠ 只清旗標不清計數——計數是生涯累計的軌跡（「這件事你這輩子幹過幾次」），
 * 年度歸零會讓「觸發 N 次後」的門檻永遠到不了。
 *
 * @returns {string[]} 這次被清掉的旗標鍵（呼叫端要記 log 或出 beat 時用）
 */
export function rearmAnnualEventFlags(state) {
  if (!state.eventFlags) return [];
  const cleared = Object.keys(state.eventFlags).filter((k) => k.startsWith(ANNUAL_FLAG_PREFIX));
  for (const k of cleared) delete state.eventFlags[k];
  return cleared;
}

/** 具名計數 +1（同一張卡宣告兩次同鍵就 +2，寫卡的人自己負責） */
export function bumpEventCounters(state, keys) {
  if (!keys || !keys.length) return;
  if (!state.eventCounts) state.eventCounts = {};
  for (const k of keys) state.eventCounts[k] = (state.eventCounts[k] ?? 0) + 1;
}

/**
 * 記一次「這張卡出場了」：逐卡計數 +1，鍵就是卡 id。
 *
 * 呼叫點在 `drawEvent`（呈現的入口）而不是 `eventTrigger`（抽卡）——連鎖接演的卡
 * 不經過抽卡，記在抽卡端會漏掉它們，而玩家的認知是「這張卡出過幾次」。
 */
export function recordEventTrigger(state, ev) {
  bumpEventCounters(state, [ev.id]);
}

/**
 * 把一張卡的結果與選項寫的旗標／計數一次結算掉。
 *
 * 順序寫死**先熄後亮**：同一批裡兩邊都寫到同一個鍵時，以「亮」為準——一段連鎖的
 * 收尾卡常常是「熄掉上一段的旗標、亮起下一段的」，反過來會把剛點的旗標熄掉。
 *
 * @param {object} state
 * @param {...{setFlags?:string[], clearFlags?:string[], counters?:string[]}} sources
 *   結果與選項（順序不影響：三個欄位分別串接後一次套用）
 */
export function applyEventMarks(state, ...sources) {
  const pull = (key) => sources.flatMap((s) => (s && s[key]) || []);
  clearEventFlags(state, pull('clearFlags'));
  setEventFlags(state, pull('setFlags'));
  bumpEventCounters(state, pull('counters'));
}

/* ================= 成功判定（§12.2） ================= */

/**
 * 事件成敗判定（§12.2「成功判定 = f(體力, 相關屬性, 相關心理, 特質)」）。
 *
 * 舊版是固定的 `opt.odds`。新版跟訓練成功率同一套邏輯：乘上體力係數
 * （`successMul`，滿體力 = 1.0），低體力時事件也更容易失敗；再疊心理修正——
 * comp（抗壓）高的人在事件裡更穩，這是「因隱藏、果可見」：玩家看到自己的成功率
 * 比選單寫的基準高或低，反推出自己的抗壓。特質修正目前為 0（giftedDice 已隨
 * S19a 特質重整作廢），S19a 特質副作用站再掛。
 *
 * @param {object} state
 * @param {object} opt 事件卡的選項（`odds` 為基準成功率，0–100）
 * @returns {number} 0–100 的成功率
 */
export function eventOdds(state, opt) {
  const comp = state.mental?.comp ?? 50;
  const odds = (opt.odds ?? 50) * successMul(staminaOf(state)) + (comp - 50) * 0.3;
  return clamp(odds, 5, 95);
}
