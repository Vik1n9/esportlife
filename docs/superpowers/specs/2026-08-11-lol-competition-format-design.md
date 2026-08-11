# LoL 賽制重寫：把棒球模型換成英雄聯盟

**日期**：2026-08-11
**狀態**：設計定案，待實作

## 問題

專案的賽制骨架承襲自棒球生涯模擬，但 LoL 的賽制與過程差距極大。最刺眼的一處是
MSI：程式把它寫成「國家隊徵召」，玩家可以婉拒，打完還會累積傷病風險。但 MSI 是
俱樂部賽事——門票發給戰隊，選手沒有發言權，也不會因為出賽而手腕受傷。

追查下去發現不只一處。棒球殘留分佈在整個年度流程：

| # | 殘留 | 位置 | 為什麼是棒球 |
|---|---|---|---|
| 1 | MSI 當國家隊徵召 | `international.js:9-25`、`game.js:673-679` | WBC／亞運模型 |
| 2 | MSI 資格看個人 OVR ≥ 52 | `international.js:7` | 真實條件是隊伍拿賽段冠軍 |
| 3 | 國際賽消耗提高受傷率 | `international.js:50`、`progression.js:14` | WBC 投手手臂磨損 |
| 4 | 特質掛在國家隊框架 | `traits.js:37` `nationalace` | — |
| 5 | MSI 跑在年末，與世界賽並列 | `game.js:666` | MSI 實際在賽季中段 |
| 6 | 世界賽門票是擲骰 | `international.js:65-73` | 種子序已算好卻再擲一次 |
| 7 | MSI／世界賽只擲一次骰 | `runMsi`、`runWorlds` | 季後賽已有 BO 系列，最大舞台反而沒有 |
| 8 | 席位數寫死不隨時代 | `international.js:70` | — |
| 9 | 體力決定出賽場次 | `season.js:9-17,44` | 棒球輪值／休養；LoL 是五個固定先發 |
| 10 | 重傷整季報銷 | `game.js:292` | 棒球開刀報銷；LoL 是缺席數週 |
| 11 | 合約到期才進市場 | `game.js:799-803` | 棒球 FA；LoL 每年底全賽區洗牌 |
| 12 | 沒有外援名額概念 | — | LoL 各賽區每隊上限 2 名 |

還有一個非賽制、但阻礙所有後續改動的結構問題：**特質與心理的效果散在 10 個檔案**。
`state.traits.*` 的消費點分佈為 `game.js` 12 處、`market.js` 10、`mental.js` 4、
`abilities.js` 4、`international.js` 3、`season.js` 2、`progression.js` 2、`team.js` 1、
`playoffs.js` 1、`ui/summary.js` 1；`state.epic.*` 同樣散在 10 個檔。

## 切分方法論

模組邊界不靠美感決定，靠**倒推測試**：拿真實的歷史 BUG 與已知的未來改動當測試集，
數每項要開幾個檔案。檔數低的切法勝出。

以下為評分結果（括號為新建檔數）。「§1 提案」是第一版按階段切的方案，「定案」是
被評分表推翻後的修正版。

| 改動 | 現況 | §1 提案 | 定案 |
|---|---|---|---|
| **歷史 BUG** ||||
| `intlLock` 永不更新 | 1 | 1 | 1 |
| 季後賽一次擲骰吐冠軍 | 2 (+1) | 2 | 2 |
| 獎項門檻年年拿滿 | 1 | 1 | 1 |
| 二隊隊名時代錯亂 | 1 | 1 | 1 |
| 簽約沒排除當年解散隊 | 1 | 1 | 1 |
| 復健年免費續約一年 | 1 | 1 | 1 |
| **本次機制** ||||
| MSI 改俱樂部身分 | 6 | 6 | **3** |
| MSI 歸位年中 | 1 | 1 | 1 |
| 世界賽門票改種子序 | 1 | 2 | **1** |
| MSI／世界賽改 BO 系列 | 2 | 2 | 2 |
| 席位數隨時代 | 1 | 1 | 1 |
| 先發／板凳 | 3 | 3 (+1) | 3 |
| 轉會窗口 | 3 | 4 | **3** |
| 外援名額 | 2 | 3 (+2) | 3 |
| **未來高頻** ||||
| 新增一個賽事（EWC） | 4 | 4 (+1) | **3** |
| 史實修正（2018 play-in） | 1 | 1 | 1 |
| 新增一個特質 | 2–5 | 2–5 | **1** |
| 新增一條心理軸 | 7 | 7 | **2** |
| 新增一個賽區 | 1 | 4 | **2** |

評分推翻了 §1 的三個決定：

**① 按階段切沒有碰到特質／心理。** 「MSI 改俱樂部身分」前後都是 6 檔，因為
`nationalace` 的單殺加成在 `season.js`、國際賽保底在 `international.js`、免疫消耗在
`progression.js`。修法是把效果變成資料（§3）。

**② 賽區是實體，按屬性切會拆散它。** 「新增一個賽區」在 §1 要開 4 個檔，比現況的
1 檔更差。改成一個賽區一個檔，屬性同居。

**③ 資料與邏輯分家要看改動頻率，不是一律分。** 席位數、play-in、Swiss 切換會被單獨
修正 → 值得分家；種子序換算門檻（155/110/70/40）是平衡數值，改它時必然同時在看賽制
邏輯 → 不分家。

**評分表的誠實結果**：六項歷史 BUG 全部平手。切分不會讓改一行的 BUG 少開檔案，它只
縮短找到那一行的距離（1033 行的 `game.js` vs 80 行的 `phases/awards.js`）。這個維度
檔案數量量不出來，但它是實際成本。

## 目標結構

```
src/
  core/rng.js

  data/
    regions/                  ← 按實體切：一個賽區一個檔
      index.js                註冊表
      home.js kr.js cn.js eu.js na.js
    formats/                  ← 全球性賽制史實（跨賽區）
      calendar.js             哪一年有哪些賽事、順序
      worlds.js               group / play-in / swiss 切換、種子序來源
      msi.js                  各年參賽資格與賽制
      playoffs.js             輪次 / BO 數 / 冠軍點數
    traits.js  epics.js       名稱 + 描述 + 效果（集中）
    mental.js                 軸定義 + 效果曲線（集中）
    roleplay.js  events.js  abilities.js
    teams.js  heroes.js  disband.js  coaches.js  eras.js

  kernel/                     ← 被多個階段共用，改動最少
    series.js                 BO 系列賽（含種子序換算）
    groups.js                 小組循環 / Swiss
    strength.js               隊伍強度
    modifiers.js              bonus / factor / flag 單一查詢入口

  phases/                     ← 一個賽事一個檔：邏輯 + 敘事 + 選擇同居
    index.js                  kind → 模組註冊表
    regular.js  playoffs.js  awards.js
    msi.js  worlds.js  firststand.js
    transfer.js  tryout.js  amateur.js

  engine/
    calendar.js               年份 + 賽區 → 階段序列（查表展開，不含史實）
    game.js                   driver：年度迴圈、退役判定、階段分發
    state.js  career.js  progression.js  abilities.js  market.js
    roster.js  lineup.js  imports.js  mental.js

  ui/                         不動
```

### 階段介面

每個 `phases/*.js` 只匯出兩個東西：

```js
export const kind = 'MSI';
export function* run(ctx, phase) { /* ctx = { state, rng, card, choice } */ }
```

`card` / `choice` 是 driver 注入的 yield helper。**階段不 import `game.js`，沒有循環
依賴。** 新增一個賽事＝寫一個 `phases/*.js`、在 `phases/index.js` 加一行、在
`data/formats/calendar.js` 加一列。三個動作，不動主迴圈。

階段的計數器存在 `state.records[kind]`，新增賽事不必改 `state.js`。

## 機制設計

### 1. 年曆

`data/formats/calendar.js` 一張表決定一年長什麼樣：

```js
export const EVENTS = [
  { kind: 'SPLIT',      order: 10, from: 2012, to: 9999 },
  { kind: 'FIRSTSTAND', order: 20, from: 2025, to: 9999 },
  { kind: 'MSI',        order: 30, from: 2015, to: 9999, skip: [2020] },
  { kind: 'WORLDS',     order: 40, from: 2012, to: 9999 },
  { kind: 'TRANSFER',   order: 50, from: 2012, to: 9999 },
];
```

`SPLIT` 依 `data/regions/<key>.js` 的賽段史展開。MSI 的 `order: 30` 讓它自然落在第一
賽段季後賽之後、第二賽段之前——時序問題變成一個排序數字，不必在主迴圈裡找位置。

`2020` 的 `skip` 是 COVID 停辦。`FIRSTSTAND` 是 2025 新設賽事，加一列即可。

### 2. MSI：從國家隊改成俱樂部

**資格改成隊伍成績。** 刪除 `MSI_CALLUP_OVR = 52`。

```js
// data/formats/msi.js
export const MSI_RULES = [
  { until: 2019, qualify: 'SPLIT1_CHAMPION', entrants: { major: 1, home: 1 }, format: 'GROUP_KO' },
  { until: 2022, qualify: 'SPLIT1_CHAMPION', entrants: { major: 1, home: 1 }, format: 'GROUP_KO' },
  { until: 2024, qualify: 'SPLIT1_TOP2',     entrants: { major: 2, home: 1 }, format: 'DOUBLE_ELIM' },
  { until: 9999, qualify: 'SPLIT2_TOP2',     entrants: { major: 2, home: 1 }, format: 'DOUBLE_ELIM' },
];
```

2023 起主流賽區出兩隊——賽段亞軍也去得了 MSI。現行程式沒有這段制度變更。

**沒有選擇路口。** 刪除「披上國家隊戰袍／以調整為由婉拒」與整套 `msiForced` /
`intlLock` 列管邏輯。俱樂部拿到門票就是全隊去。決策點換成 MSI 媒體日的扮演路口——
玩家決定的是在鏡頭前當什麼樣的人，比「要不要去」更貼近真實。

**刪除 `carryInjuryRisk`。** 連帶清掉 `progression.js:14` 的加總、`game.js:290` 的
重置、`state.js:81` 的欄位。打 MSI 不會讓人手腕受傷。

替代的真實後果：MSI 結束到下一賽段開打只有兩三週，賽區內其他隊多練一個版本 → 下一
賽段的**版本適配落後**，沿用既有的 `patchPenalty`，不新增概念。

**特質改名。** `nationalace 國家隊王牌` → `soloking 賽區之光`（隨隊出征國際賽的招牌
選手）。`intlghost 國際賽之鬼` 保留。效果一併搬進 `data/traits.js` 的 `effects`。

### 3. 世界賽：門票不再是擲骰

刪除 `rng.chance(worldsQualifyChance(state))`。改成確定性加資格賽：

```
seed ≤ 席位數 − 1   → 直接晉級
seed = 席位數        → 打地區資格賽（BO5，即 LCK Regional Finals / LCS Gauntlet）
seed > 席位數        → 沒有門票
```

第四種子那條線終於有實際內容：一場 BO5，不是一個 30% 的數字。

**席位數進賽區檔，隨時代走：**

```js
// data/regions/kr.js
worldsSlots: [{ until: 2016, n: 3 }, { until: 2022, n: 3 }, { until: 9999, n: 4 }],
// data/regions/home.js   GPL 1 → LMS 2 → PCS 2 → LCP 2
worldsSlots: [{ until: 2014, n: 1 }, { until: 9999, n: 2 }],
```

**種子序來源也隨時代切換**——現行程式完全沒有這段：

```js
// data/formats/worlds.js
{ until: 2012, seedFrom: 'REGIONAL_QUALIFIER' },
{ until: 2022, seedFrom: 'CHAMP_POINTS' },
{ until: 9999, seedFrom: 'FINAL_SPLIT_PLAYOFF' },
```

現行程式把冠軍點數套用到 2025 年，但那套制度 2022 年就廢止了。

### 4. 兩個舞台改用 BO 系列，逐輪出比分

| 賽制 | 年份 | 實作 |
|---|---|---|
| `GROUP_KO` | 2012–2022 | `runGroup` BO1 循環定出線 → `runSeries` BO5 淘汰賽 |
| `PLAY_IN` | 2017–2022 | 入圍賽 `runSeries` BO5 → 接 `GROUP_KO` |
| `SWISS` | 2023– | `runSwiss` 三勝晉級／三敗淘汰 → `runSeries` BO5 淘汰賽 |
| `DOUBLE_ELIM` | MSI 2023– | `runSeries` 敗部一條線 |

每一輪都出比分。現行的「`roll < 25` → 入圍賽出局」一句話帶過，玩家看不到過程——這是
「賽制與過程差距極大」最明顯的一處。

### 5. 國際賽的心理與扮演權重

LoL 玩家對 MSI／世界賽的關注度遠高於聯賽，這要反映在三個地方：

- **經驗累積心理素質**：每次國際賽出賽都給 `nerve`，依走多遠遞增。小組止步也給，只是
  少。多次世界賽常客的大心臟自然高於沒去過的人。現行程式只在奪冠時給。
- **扮演路口每輪都留**（聯賽季後賽只留進場輪與決賽兩個）。新增 `intl` 時機的扮演卡
  組——MSI 媒體日與世界賽記者會問的問題和聯賽不同。
- **外界反應加放大係數**：同一張扮演卡在世界賽打出去，`fame` 與 `rep` 的變動明顯大於
  聯賽。

### 6. 效果資料化（modifiers）

特質自己宣告效果，消費端只問一個函式：

```js
// data/traits.js
clutch: { name: '大賽選手', desc: '越大的舞台，你的手越穩',
          effects: { seriesGame: 4, seriesDecider: 6, intlRoll: 10 } },
iron:   { name: '鐵人',     desc: '受傷機率大幅降低',
          effects: { injuryRate: { mul: 0.5 } } },
```

```js
// kernel/modifiers.js
bonus(state, key)   // 加總所有 add
factor(state, key)  // 連乘所有 mul，預設 1
flag(state, key)    // 任一為 true
```

特質、史詩合成、心理軸共用同一組 key。心理軸是連續值，在 `data/mental.js` 宣告曲線，
由 `modifiers.js` 換算後併入同一個加總。

**key 目錄**（先定這些，不夠再加）：

| key | 消費端 | 語意 |
|---|---|---|
| `seriesGame` / `seriesDecider` | `kernel/series.js` | 系列賽單局／決勝局勝率 |
| `intlRoll` / `intlFloor` | `phases/msi,worlds` | 國際賽表現／名次保底 |
| `injuryRate` / `patchPenalty` | `engine/progression` | 受傷率／版本落差 |
| `soloRate` | `phases/regular` | 單殺倍率 |
| `growth` / `decline` | `engine/abilities` | 成長／衰退 |
| `salary` / `offerCount` | `engine/market` | 合約係數／報價數 |
| `teamLead` | `kernel/strength` | 隊友平均加成 |
| `benchRisk` | `engine/lineup` | 被下放機率 |
| `importExempt` | `engine/imports` | 免佔外援名額 |

**遷移風險**：約 40 處呼叫點，改壞了不會報錯，只會讓數值悄悄偏掉。用黃金種子回歸當
安全網（見測試）。

### 7. 先發／板凳

`staminaFactor` 從**場次**移除，同一條曲線改作用在 `perf`。體力低是手感下滑，不是不
出賽——LoL 是五個固定先發，隊伍打幾場就打幾場。

```js
// engine/lineup.js
lineupStatus(state, rng, split) → 'starter' | 'rotation' | 'benched'
```

下放條件為狀態加擲骰：上賽段 delta 遠低於 par、`chem` 見底、隊伍剛簽同位置的人、傷勢
缺席。機率走 `benchRisk` modifier。

- `benched` → 該賽段場次歸零、無季後賽、`fame` 下滑、觸發休息室扮演路口
- 連續兩賽段板凳 → 進 `clubVerdict` 的轉隊壓力

傷勢一併重寫：「重傷 · 整季報銷」→「缺席 N 週、替補頂上」，回歸後 `benchRisk` 上升。
LoL 沒有開刀報銷一整季這回事。

### 8. 轉會窗口與外援名額

`phases/transfer.js` **每年都跑**，不管合約剩幾年。三拍：

1. **傳聞** — 被幾支隊點名連結，數量由 `fame` 與上季表現決定。`rep` 低而 `fame` 高
   ＝傳聞滿天但沒有實際報價（鬼牧）。
2. **官宣** — 續約／被挖／買斷／掛交易名單。合約中途也可能被買斷。
3. **落定** — 隊友名單翻新，賽區其他隊同步變動。

**外援名額**（`engine/imports.js`）：海外賽區每隊 2 個名額，名額數在
`data/regions/*.js`。玩家是主場賽區出身，簽 LPL／LCK／LEC／LCS 都佔一個。名額滿了就
是簽不進去——不是數值不夠，是位子沒了。這是 Maple、SwordArt 出海時真實遇到的門檻。

## 測試

```
tests/
  run.mjs                  runner
  kernel/                  series / groups / modifiers / strength
  phases/                  msi / worlds / playoffs / transfer / lineup
  history/                 史實斷言
  regression/golden.mjs    黃金種子快照
```

`tests/headless.mjs`（23KB 單檔）拆進上述結構，新增階段即新增測試檔，不必在單檔裡
插隊。

**`history/` 是新增的一類**，直接斷言史實，因為賽制表最容易改錯：

- 2013 年不得出現 MSI；2020 年不得出現 MSI
- 2025 年的世界賽種子序不得使用冠軍點數
- 2022 年的世界賽不得使用 Swiss
- LMS／PCS 席位恆為 2；LCK 2023 起為 4
- 2013 年不得出現 `PSG Talon Academy`（既有 BUG 的回歸測試）

**`regression/golden.mjs`** 是 modifiers 遷移的安全網：固定 seed 跑 20 段生涯，快照
榮譽清單與生涯數據。modifiers 重構期間必須完全一致；賽制改動後重新 baseline，並在
commit 訊息說明差異來源。

## 實作順序

每一步結束時 `npm test` 必須全綠。

1. **測試骨架** — 建 `tests/run.mjs` 與目錄，把 `headless.mjs` 現有檢查搬進去。先做
   這步，後面每一步才有安全網。
2. **黃金種子基準** — 建 `regression/golden.mjs`，錄下當前行為的快照。
3. **modifiers** — 建 `kernel/modifiers.js`，特質／史詩／心理效果搬進資料。逐檔遷移
   40 處呼叫點，每檔遷移後跑黃金種子，必須完全一致。
4. **資料重切** — `world.js` 拆成 `data/regions/*` 與 `data/formats/*`，`traits.js`
   ／`epics.js` 就位。純搬移，行為不變，黃金種子必須一致。
5. **kernel** — `series.js`／`groups.js`／`strength.js` 就位。`playoffs.js` 的
   `runSeries` 搬過去，新增 `runGroup`／`runSwiss`。
6. **年曆與階段骨架** — `data/formats/calendar.js`、`engine/calendar.js`、
   `phases/index.js`，`game.js` 的年度迴圈改成 driver。既有階段（例行賽、季後賽、
   獎項）搬進 `phases/`。此步之後黃金種子會變（MSI 時序改變），重新 baseline。
7. **MSI 重寫** — `phases/msi.js` + `data/formats/msi.js`。刪 `carryInjuryRisk`、
   `msiForced`、`intlLock`、`MSI_CALLUP_OVR`。特質改名。
8. **世界賽重寫** — `phases/worlds.js` + `data/formats/worlds.js`。席位表、種子序來源
   切換、資格賽 BO5、逐輪比分。
9. **國際賽心理與扮演** — `nerve` 累積、`intl` 扮演卡組、放大係數。
10. **先發／板凳** — `engine/lineup.js`，`staminaFactor` 改作用在 `perf`，傷勢重寫。
11. **轉會窗口與外援名額** — `phases/transfer.js`、`engine/imports.js`。
12. **史實測試** — 補 `tests/history/`，重新 baseline 黃金種子，更新 `WORKLOG.md`
    與 `CHANGELOG.md`。

## 不做（YAGNI）

- **全賽區名單模擬**：每支隊伍五名有數值、會轉會老化退役的選手。最真實，但強度曲線
  難調，且 roster 演進與本次賽制問題無關。採輕量方案：隊友強度加賽區對手強度分布。
- **階段註冊表自動掃描**：瀏覽器 ESM 無法列舉目錄，仍需手動註冊一行。
- **兵役**：與賽制無關，留待後續。
- **`engine/state.js` 拆分**：它是 schema，切開會讓「一個 state 長什麼樣」失去單一
  入口。階段自己的計數器改放 `state.records[kind]`，不必動它。
