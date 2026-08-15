/**
 * 名次的單一來源（S20c）。純資料。
 *
 * 為什麼有這個檔：名次的機器可讀鍵（`champion`／`semi`…）以前是**被丟掉的**——
 * 它只活在 `phases/worlds.js` 的區域變數裡，寫進 state 之前就轉成顯示字串
 * （`milestones[].text`）。於是查詢層只能反過來解析文字，而那些文字有兩種空格
 * 寫法，三份手抄本（`ledger.js` 的 `WORLDS_ORDER`、`msiBest` 的三元鏈、
 * `biography.js` 的 `INTL_SCORE`）各自解析、各自漏掉不同的名次：
 *
 * - `WORLDS_ORDER` 的冠亞軍鍵有空格 → 真實的世界賽冠軍在 `worldsBest()` 回 4
 * - `msiBest` 不認得 `'MSI 止步'` → 回 99（等同沒打過）
 * - 三份都在 18758 項全綠底下活了十幾站，因為沒有任何測試在守跨檔字串
 *
 * 現在名次以**鍵**入帳（`milestones[].finish`），這張表是序位的唯一來源，
 * 顯示字串由鍵導出（`intlMilestoneText`）。查詢層不再解析文字。
 *
 * 詞彙取三個賽事已經一致的前四名 `champion / final / semi / quarter`，
 * 再加各自的尾巴：世界賽 `stage`／`playin`、MSI `out`、季後賽 `none`。
 */

/**
 * 名次鍵 → 序位（越小越好）。序位是**跨賽事可比**的一把尺——`biography.js` 的
 * 「巔峰」段要在世界賽與 MSI 之間挑出真正最好的一次。
 *
 * ⚠ 序位刻意允許重複：MSI 的 `out`（小組／兩敗止步）與世界賽的 `quarter` 同為 4,
 * 這是 S21a 定下的對映，兩者在傳記裡份量相當。
 *
 * ⚠ `ro16` 是**保留位**：庚組 NPC 賽事模擬（S32–S33）用得到，玩家賽程現階段
 * 不產生它。留位子的理由是序位一旦發出去就不該再位移。
 */
export const FINISH_ORDER = {
  champion: 1,
  final: 2,
  semi: 3,
  quarter: 4,
  out: 4,        // MSI：小組止步／兩敗淘汰
  ro16: 5,       // 保留位（庚組 NPC 賽事模擬）
  stage: 6,      // 世界賽：小組賽／Swiss 賽段止步
  playin: 7,     // 世界賽：入圍賽出局
  none: 99,      // 沒打進／沒打過
};

/** 「沒打過」的序位。查詢層的預設回傳值 */
export const NO_FINISH = FINISH_ORDER.none;

/** 名次鍵的全集（測試與編輯器的可選值來源） */
export const FINISH_KEYS = Object.keys(FINISH_ORDER);

/** 名次鍵 → 序位。不認得的鍵一律回「沒打過」，不丟例外——查詢層要能吃舊資料 */
export function finishOrder(finish) {
  return FINISH_ORDER[finish] ?? NO_FINISH;
}

/**
 * 國際賽里程碑的顯示字串。**唯一的寫入口**——`text` 從鍵導出，不再有人手打。
 *
 * 兩個賽事的措辭本來就不同（世界賽講「止步」、MSI 講「四強」），差異留在這裡，
 * 不外流成查表的鍵。
 */
const INTL_TEXT = {
  worlds: {
    champion: '世界賽冠軍',
    final: '世界賽亞軍',
    semi: '世界賽四強止步',
    quarter: '世界賽八強止步',
    stage: '世界賽小組止步',
    playin: '世界賽入圍賽出局',
  },
  msi: {
    champion: 'MSI 冠軍',
    final: 'MSI 亞軍',
    semi: 'MSI 四強',
    out: 'MSI 止步',
  },
};

/** 國際賽的顯示名（傳記拼接用：『2019 年的{event}』） */
export const INTL_EVENT_NAMES = { worlds: '世界賽', msi: 'MSI' };

/**
 * 國際賽里程碑文字。查不到就大聲壞掉——寧可測試紅燈，也不要再寫進一個
 * 「查表查不到 → 回預設值 → 測試照樣全綠」的靜默缺口。
 */
export function intlMilestoneText(event, finish) {
  const text = INTL_TEXT[event]?.[finish];
  if (!text) throw new Error(`未知的國際賽名次：${event}／${finish}`);
  return text;
}
