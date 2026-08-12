# S05 · 淨室重寫：`data/regions/*` ＋ `data/formats/*`

狀態：完成
前置：S02
預估：1 session
推理難度：中
建議模型：Sonnet 5（`claude-sonnet-5`）
理由：383 行的資料表，重排結構是機械的，但要分清楚「哪些是承襲的表格骨架、哪些是
這個專案原創的 LoL 史實」。降級的風險是連內容一起改，把已經查證過的賽制史實弄丟。

---

## 為什麼做這件事

`data/regions/*`（176 行）與 `data/formats/*`（207 行）是 `e07427c`
「world.js 依實體重切成 data/regions/ 與 data/formats/」從 `data/world.js` 拆出來的，
而 `data/world.js` 屬 A 批（`a71ee13` 建立）。

**但裡面的內容是原創的**：`a140b9e`「MSI 從國家隊徵召改成俱樂部賽事」、
`3af552d`「世界賽門票改成種子序決定」都是這個專案針對 LoL 重寫的，原棒球專案沒有
這些東西。

所以這一站要換的是**資料結構的排法**，不是內容。

---

## 入口狀態

```bash
npm test
```

全綠。

`ARCHITECTURE.md` 有 S02 的血緣表。

---

## 範圍

### 要做

**1. 讀清楚現有結構承諾什麼**

`data/regions/index.js`（80 行）是註冊表，對外給 `splitsOf(year, region)`、
`worldsSlotsOf(...)`、`msiSplitOf(year, region)` 等查詢函式。
`data/formats/` 的 `playoffs.js` 與 `data/{coaches,disband,eras,heroes,leagues,
teams}.js` 都是 `e07427c` 從 `data/world.js`（A 批）拆出來的。

⚠ 依 S02 血緣表：`data/formats/{calendar,msi,worlds}.js` 是 **B 批**（2026-08 的
LoL 改寫時新寫），**不在本範圍**——直接沿用，不要動。

呼叫端主要是 `engine/calendar.js`、`phases/msi.js`、`phases/worlds.js`、
`kernel/series.js`、`engine/roster.js`。

**2. 重排資料結構**

換一種組織方式表達同一批事實。可能的方向（擇一，不必全做）：
- 賽區與賽制從「每區一檔 ＋ 註冊表」改成「一張時間軸表 ＋ 查詢層」
- 年份區間的表達從 `{ until: 2022, ... }` 這種「最後適用年」改成明確的 `[from, to]`
- 隊名／薪資／賽段史從「每區一檔」的排法換成別的表達（`teams.js` 的 `MATE_NAMES`、
  `leagues.js` 的業餘／青訓層級、`eras.js` 的時代鍵都是同一批 world.js 事實）

⚠ **選之前先看 S14（月回合制）**——那一站要把 order 空間從賽段序改成月序。如果這裡
的重排能順便讓 S14 好做，就往那個方向排；但**不要提前實作月序**，那是 S14 的事。

**3. 內容一字不改**

賽區賽段數演進、MSI 年表（2015 創辦、2020 停辦、2023 起前兩名、各區 `msiAfter` 差異）、
Worlds 格式（小組賽→2023 起 Swiss）、聯賽 par 值、各賽區隊名與時代改名——這些是查證
過的公開事實，照抄。

**`msiAfter`／`worldsSlots`／`importSlots` 是 B 批欄位**（a140b9e／3af552d／e07427c
的 LoL 改寫新增），重排時沿用，不改語意。

### 不要做

- **不要改內容。** 任何一個年份、名次門檻、賽段數變動都算改內容
- **不要「順便修正史實」。** 如果你發現某條史實寫錯了，寫進交接筆記，不要自己改——
  改了會讓行為等價驗不出來
- **不要提前做月序**（S14）
- **不要動 V4 §16.1**。規格書那節寫的 MSI 規則比程式簡化，但**以程式為準**，
  改規格書是 S08 的事
- **不碰 `data/formats/{calendar,msi,worlds}.js`**——S02 血緣表判為 B 批，不在本範圍
- **不碰 `phases/*` 的敘事與 2026-08 新寫段落**（`ef33e1b` 轉會窗口、`a140b9e` MSI、
  `3af552d` 世界賽都是 B 批）。`phases/{msi,worlds}.js` 的 run 骨架是 A 批殘留，
  交給 S04

---

## 要動的檔案

| 檔案 | 行數 | 動作 |
| --- | --- | --- |
| `src/data/regions/index.js` | 80 | 重排結構（查詢函式為 B，沿用） |
| `src/data/regions/{home,kr,cn,eu,na}.js` | 96 | 重排結構（`msiAfter` 等 B 欄位沿用） |
| `src/data/formats/playoffs.js` | 14 | 重排結構 |
| `src/data/{coaches,disband,eras,heroes,leagues,teams}.js` | — | 重排結構（e07427c 拆自 world.js，A 批） |
| `src/engine/roster.js` | — | 隊名資料流承袭（A 段）；重排後呼叫端同步調整，解散過濾等 B 邏輯不動 |

若重排改變了查詢介面，`src/engine/calendar.js` 與 `src/phases/{msi,worlds}.js` 的
呼叫處要跟著改——那是允許的，但要在交接筆記寫明改了哪些呼叫端。

**以 S02 的血緣表為準。**

---

## 規則與不變式

- **行為等價。** 不改內容就不該改結果，`golden.json` **應該完全不變**。
  golden 紅了表示改到內容或邏輯，回頭找出來——**不要用 `test:golden` 蒙混**
- `tests/history/` 四份（`msi.mjs`、`worlds.mjs`、`splits.mjs`、`academy.mjs`）全綠。
  這幾份專門守史實，是這一站最重要的驗證
- 依賴方向不變：`data/` 仍然零邏輯，不 import `engine/` 或 `kernel/`

---

## 完成定義

```bash
npm test
```

全綠，**且 `golden` suite 沒有偏移**。

```bash
node tests/run.mjs history
```

四份 suite 全綠。

```bash
git diff --stat v4-before -- tests/regression/golden.json
```

輸出為空。

---

## 交接筆記

<!-- 做完由執行者回填 -->

S05 淨室重寫完成（2026-08-12）。

**做了什麼**（重排結構，內容一字未改）：

- **regions 五檔**：`{ until }` → `[from, to]` 閉區間；欄位分組為 `ladder`（聯賽
  靜態屬性）與 `timeline`（splits／worldsSlots／teams 時間軸）；home 的 `teamsByEra`
  與其他區的 `teams` 統一成同一張區間表（home 每時代一列帶 `era` 標記，其餘賽區單行
  不編造年份）。`regions/index.js` 查詢層改區間查詢，**五個查詢函式簽名與回傳結構
  全保留**（splitsOf／msiSplitOf／worldsSlotsOf／importSlotsOf／teamNamesOf）。
- **eras.js**：`eraOf` 的 if 鏈 → `ERAS` 區間表查表。**移除 `msi`／`worlds` 兩個
  廢棄欄位**——全 repo 無使用者（grep 過），史實已住在 `data/formats/{msi,worlds}.js`。
- **leagues.js**：REGIONS 推導改為展開 `r.ladder`（`...r.ladder`），LEAGUES 表結構不變。
- **playoffs.js**：`PLAYOFF_ROUNDS`＋`CHAMPIONSHIP_POINTS` 收進單一 `PLAYOFFS` 制度
  物件，兩個導出名保留，kernel/series.js 零改動。
- **disband.js**：巢狀物件 `DISBAND_HISTORY` → `DISBANDS` 陣列（一隊一列），
  `DISBAND_YEAR` 由陣列派生（導出保留）。
- **coaches.js**：物件 → 陣列（`{ name, bonus }`），順序＝原物件鍵順序（`rng.pick`
  依索引取，順序即生涯結果，不可亂）。
- **heroes.js**：`HEROES` 改陣列＋`HEROES_BY_ROLE` 派生索引；`PATCH_THEMES` 不變。
- **teams.js**：業餘兩張表（隊伍＋盃賽）聚合為 `AMATEUR_SCENE`，`TEAMS_AMATEUR`／
  `AMATEUR_CUPS` 導出名保留（tests/phases/amateur.mjs 依賴）；`MATE_NAMES` 不變。

**改了哪些呼叫端**（6 個）：`engine/market.js`（disbandNoteFor 改查 DISBANDS）、
`engine/roster.js`（`rng.pick(COACHES).name`）、`kernel/strength.js`
（`COACHES.find`）、`engine/state.js`／`engine/progression.js`／`ui/panel.js`
（`HEROES[role]` → `HEROES_BY_ROLE[role]`）。B 批邏輯（解散過濾、青訓推導、
外援名額）未動。

**為 S14 鋪路**：賽段史已是 `[from, to]` 閉區間——月回合制把賽段展開成月份區間時
不必再猜邊界，直接按區間分配月份即可。

**驗證**：`npm test` 8943 項全綠；`node tests/run.mjs history` 350 項全綠（四份
suite）；golden 對入口（S03 commit `eddbbd3`）零 diff；另做雙版本逐值對比——16 個
年份（含 2011／2012／2022／2023／2024／2025／9999／10000 邊界）× 8 個 region × 7 個
eraKey 的查詢函式全一致，LEAGUES／散表內容全一致。eraOf 的差異只有兩項且皆為預期：
新增 from/to 元數據、移除無使用者的 msi/worlds 欄位。

**完成定義備註**：`git diff v4-before -- golden.json` 在 S03 之後不再為空（S03 換
rng 重刷過 golden），正確基準是 S03 commit `eddbbd3`——對它 diff 為空。

**留給下一站**：S14 月回合制可直接吃 regions 的賽段區間表。`eraOf` 返回的 from/to
欄位是元數據，若 S14 想用可直接讀；不想用也不影響任何使用者。
