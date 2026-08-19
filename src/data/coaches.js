/**
 * 教練風格：戰力點（隊伍強度加成）＋機制效果。純資料。
 *
 * 以陣列表達、附 `bonus` 欄位，取代「風格 → 加成」的物件——抽籤與查詢都從同一份
 * 清單走，順序即抽籤順序（`rng.pick` 依索引取，改順序會改到生涯結果）。
 *
 * ── S49 六選一 ──
 *
 * 舊版五個教練只有 `bonus` 一個數字，簽約時看到「教練體系：訓練狂」得不到任何
 * 資訊、也做不了任何判斷。S49 改成六種各有機制效果的教練：`effects`／`sideEffects`
 * 與特質同一套寫法（`kernel/modifiers.js` 的 `normalize` 簡寫照用），教練成為
 * modifier 系統的第五個效果來源。`desc` 是給 UI 的一句話效果說明（轉隊文案與
 * 隊伍面板讀它）——不印它，六種教練玩家分不出來。
 *
 * ⚠ **戰力點平均必須維持 2.0**（§11.1 硬約束）——§11.1 的驗算例把「教練 ＋ 體力」
 * 合計釘在 3.5 點、教練平均 2.0；動任何一個數字都要把平均補回 2.0，否則整個聯盟
 * 的強度集體位移（`kernel/strength.js` 檔頭講的就是這件事）。`tests/kernel/coaches.mjs`
 * 在守這條。
 *
 * ⚠ **戰力點與非戰鬥效果刻意反向**：給戰力的不給成長，給成長的不給戰力。沒有哪一個
 * 是嚴格最優，這是六選一有意義的前提。訓練狂帶副作用（消耗 ×1.10）是照 §13.1 的
 * 雙面性寫的——不該有純益的教練。
 *
 * ⚠ `offerPenalty: false` 是「免疫」寫法（`modifiers.js` 的 `normalize` 展開成
 * `{ immune: true }`）：取消同鍵旗標，只有 `immune()` 查詢讀它。
 */
export const COACHES = [
  { name: '戰術大師', bonus: 3.0, desc: '備賽戰術效果 ×1.3',
    effects: { tacticMul: { mul: 1.3 } } },
  { name: '版本先知', bonus: 2.5, desc: '版本落差懲罰減半',
    effects: { patchDebt: { mul: 0.5 } } },
  { name: '訓練狂', bonus: 1.5, desc: '訓練成長 ×1.15，訓練消耗 ×1.10',
    effects: { trainYield: { mul: 1.15 } },
    sideEffects: { trainCostMul: { mul: 1.1 } } },
  { name: '體能教練', bonus: 1.5, desc: '訓練消耗 ×0.85，恢復 ×1.15，受傷率 ×0.85',
    effects: { trainCostMul: { mul: 0.85 }, recoverMul: { mul: 1.15 }, injuryRate: { mul: 0.85 } } },
  { name: '心理輔導', bonus: 2.0, desc: '心理逐年回歸中性，下放風險 ×0.8',
    effects: { benchRisk: { mul: 0.8 }, mentalConverge: true } },
  { name: '經紀團隊', bonus: 1.5, desc: '代言收入 ×1.25，報價不縮水',
    effects: { endorsement: { mul: 1.25 }, offerPenalty: false } },
];
