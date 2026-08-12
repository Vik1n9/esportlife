# S04 · 淨室重寫：`engine/market.js` ＋ `engine/career.js`

狀態：完成
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

**4. `phases/media.js` 與 `phases/salary.js`（A 批，6ec9575 搬自 game.js）**

`media.js`（12 行）是「PRO 且有 38% 機率抽媒體扮演卡」的路口；`salary.js`（21 行）
是年度薪資結算敘事。兩者都直接搬自 `engine/game.js` 的承袭段落——只看介面與
`drawRoleplay`／`annualSalary` 的行為，關掉原檔重寫。`phases/{msi,worlds}.js` 的
run 骨架（A 批殘留）如果順手碰到，一併處理，但**不要動**那兩個檔 2026-08 重寫的
敘事與賽制邏輯（B 批）。

### 不要做

- **不要改介面。** 呼叫端不該因為這一站需要修改
- **不要把 OVR 換成教練評價。** 那是 S11。這一站維持現有的 `effectiveOvr` 讀取
- **不碰 `core/rng.js`、`main.js`、`ui/board.js`、`styles.css`**（S03）
- **不碰 `data/regions/*`、`data/formats/*`**（S05）
- **不碰 `engine/imports.js`**（外援名額，`ef33e1b` 新寫，B 批）
- **不碰 `phases/{split,seasonEnd,shared}.js`**——A/B 但處置在 V4（S14/S15/S17），
  不是這一站
- **不要「順便改善」報價公式。** 平衡調整不在這一站，而且會讓行為等價驗不出來

---

## 要動的檔案

| 檔案 | 行數 | 動作 |
| --- | --- | --- |
| `src/engine/career.js` | 49 | 淨室重寫 |
| `src/engine/market.js` | 248 | 淨室重寫 |
| `src/phases/transfer.js` | 411（其中 A 批段落） | 依 S02 血緣表重寫指名段落 |
| `src/phases/media.js` | 12 | 淨室重寫（A 批，搬自 game.js） |
| `src/phases/salary.js` | 21 | 淨室重寫（A 批，搬自 game.js） |

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

S04 淨室重寫完成（2026-08-12）。

**做了什麼**：依 00 規則第二節五步法，關掉原檔重寫五個檔——
`engine/career.js`（單季貢獻抽成 `seasonScore`、榮譽加分表驅動）、`engine/market.js`
（候選賽區改表驅動、報價/續約拆小函式）、`phases/media.js`、`phases/salary.js`
（重寫敘事註解，行為不變）、`phases/transfer.js`（A 批段落重寫：run 骨架、
tickContract、academyStage、業餘三層出路、freeAgency 主體；`renewalOptions`/
`offerOptions` 自 freeAgency 抽出）。

**A/B 分界**：transfer.js 以 `ef33e1b` 為界——rumours／buyout／run 的 heat 段落／
freeAgency 外援名額卡是 B 批，逐字保留；其餘 6ec9575 從 game.js 搬來的 FA 模型主體
是 A 批，重寫。`phases/{msi,worlds}.js` 的 run 已被 a140b9e／3af552d 整段覆蓋，
沒有可單獨提取的 A 批骨架，故未動（符合血緣表「沿用」處置）。

**驗證**：`npm test` 8943 項全綠。golden 相對入口（S03 commit `eddbbd3`）零變動——
「160 段生涯與基準一致」逐位元通過。另做雙版本對比：160 段生涯 careerScore/
careerTier 全一致；market.js 全部匯出函式（含 generateOffers／clubVerdict／tryout／
academyOffer／signContract）輸出與 rng 流逐位一致。

**完成定義備註**：說明書寫的 `git diff v4-before -- tests/regression/golden.json`
在 S03 之後不再為空——S03 換 rng 時已重刷 golden（2666 行），v4-before 是舊 rng
基準。S04 的正確基準是 S03 commit（`eddbbd3`）：對它 diff，golden 為空、src/ 只動
本清單五個檔。

**留給下一站**：S05 淨室 regions/formats。S04 未碰 `data/regions/*`、`data/formats/*`、
`engine/roster.js` 的 A 批資料流（S05 依血緣表處理）。
