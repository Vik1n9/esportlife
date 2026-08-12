# S04 · 淨室重寫：`engine/market.js` ＋ `engine/career.js`

狀態：未開始
前置：S02
預估：1 session
推理難度：中
建議模型：Sonnet 5（`claude-sonnet-5`）
理由：297 行加上 `phases/transfer.js` 裡搬過去的段落，跨檔耦合深（自由市場報價要讀
教練評價、心理、特質、解散狀態），要讀懂才動得了手。但正確答案是唯一的——行為等價
由現有測試守。降級的風險是漏掉 `phases/transfer.js` 那段搬過去的血緣。

---

## 為什麼做這件事

`engine/market.js`（248 行，自由市場報價與挖角門檻）與 `engine/career.js`
（49 行，生涯評分與等第）都是 `a71ee13` 從原棒球專案單檔拆出來的，屬 A 批。

V4 §18 保留轉會、FA、解散機制，只把讀取來源從 OVR 換成教練評價（S11 做）——所以
V4 不會順手把承襲的表達換掉，得另外淨室重寫。

`phases/transfer.js`（411 行）雖然是 2026-08-12 才建立的檔案，但它是
`6ec9575` 從 `engine/game.js`（A 批）拆出來的。**搬過去的段落一樣要處理**，
以 S02 血緣表標的為準。

---

## 入口狀態

```bash
npm test
```

全綠。

`ARCHITECTURE.md` 有 S02 的血緣表，且這幾個檔的標記與處置寫清楚了。

---

## 範圍

### 要做

依 `00-共通規則.md` 第二節的「淨室重寫的具體做法」五步。

**1. `src/engine/career.js`**（49 行，先做這個，比較小）

對外承諾：`careerTier(state)`、`careerScore(state)`、`tierName(i)` 之類。
等第名稱表 `TIER_NAMES` 目前住在 `data/events.js`（也是 A 批，但 V4 §12 會整段重寫，
不歸這一站）。

**2. `src/engine/market.js`**（248 行）

自由市場報價、挖角門檻、解散判定的資料側。先讀 `tests/phases/market.mjs` 與
`tests/phases/transfer.mjs`，那兩份界定了對外行為。

**3. `phases/transfer.js` 裡的 A 批段落**

依 S02 血緣表指名的函式重寫。**只重寫標 A 的那幾段**，2026-08 新寫的敘事與轉會窗口
邏輯（`ef33e1b`「轉會窗口每年都開，加上外援名額」）是 B 批，不要動。

### 不要做

- **不要改介面。** 呼叫端不該因為這一站需要修改
- **不要把 OVR 換成教練評價。** 那是 S11。這一站維持現有的 `effectiveOvr` 讀取
- **不碰 `core/rng.js`、`main.js`、`ui/board.js`、`styles.css`**（S03）
- **不碰 `data/regions/*`、`data/formats/*`**（S05）
- **不碰 `engine/imports.js`**（外援名額，`ef33e1b` 新寫，B 批）
- **不要「順便改善」報價公式。** 平衡調整不在這一站，而且會讓行為等價驗不出來

---

## 要動的檔案

| 檔案 | 行數 | 動作 |
| --- | --- | --- |
| `src/engine/career.js` | 49 | 淨室重寫 |
| `src/engine/market.js` | 248 | 淨室重寫 |
| `src/phases/transfer.js` | 411（其中 A 批段落） | 依 S02 血緣表重寫指名段落 |

**以 S02 的血緣表為準。**

---

## 規則與不變式

- **行為等價。** 這一站不換亂數演算法、不改公式，所以 `golden.json` **應該完全不變**。
  如果 golden 紅了，表示你改到了行為，回頭找出來——**不要用 `test:golden` 蒙混過去**
- 介面零變動
- `tests/phases/market.mjs`、`tests/phases/transfer.mjs`、`tests/history/disband.mjs`
  全綠

這一站與 S03 最大的差別：S03 換了 rng 演算法所以 golden 必紅，**S04 的 golden 必須
全綠**。這是最好用的驗證。

---

## 完成定義

```bash
npm test
```

全綠，**且 `golden` suite 沒有偏移**（輸出裡不會出現「160 段偏移」）。

```bash
git diff --stat v4-before -- tests/regression/golden.json
```

輸出為空（檔案沒被改）。

```bash
git diff --stat v4-before -- src/
```

只列出這一站與 S03 該動的檔案。

---

## 交接筆記

<!-- 做完由執行者回填 -->
