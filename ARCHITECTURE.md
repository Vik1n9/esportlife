# 架構說明（v4.0.0）

> v2 是一個 987 行的 `index.html`，CSS／資料／規則／流程／DOM 全部混在同一個 `<script>` 裡。
> v3 把它拆成「資料 → 引擎 → UI」三層。
> v4 再把賽制那一層拆開：**一個賽事一個檔，一年有哪些賽事由一張表決定**。

---

## 一、目錄結構

```
esportlife/               # repo 根目錄，GitHub Pages 直接服務這一層
├── index.html               # 只剩畫面骨架 + <script type="module">
├── src/
│   ├── main.js              # 進入點：開場、種子、續玩存檔
│   ├── core/rng.js          # 種子化亂數
│   │
│   ├── data/                # 純資料，零邏輯
│   │   ├── regions/         # ★ 一個賽區一個檔（實體切分）
│   │   │   ├── index.js     #   註冊表 + splitsOf / worldsSlotsOf / msiSplitOf …
│   │   │   └── home.js kr.js cn.js eu.js na.js
│   │   ├── formats/         # ★ 全球性賽制史實（跨賽區）
│   │   │   ├── calendar.js  #   一年有哪些階段、照什麼順序跑
│   │   │   ├── msi.js       #   MSI 參賽資格與賽制
│   │   │   ├── worlds.js    #   種子序來源、入圍賽、席位
│   │   │   └── playoffs.js  #   輪次 / BO 數 / 冠軍點數
│   │   ├── traits.js epics.js   # 特質：名稱 + 描述 + 效果（集中）
│   │   ├── abilities.js mental.js roleplay.js events.js
│   │   └── eras.js leagues.js teams.js coaches.js heroes.js disband.js
│   │
│   ├── kernel/              # ★ 被多個階段共用，改動最少
│   │   ├── series.js        #   BO 系列賽 + 種子序換算
│   │   ├── groups.js        #   小組循環 / Swiss
│   │   ├── strength.js      #   隊伍強度
│   │   └── modifiers.js     #   特質效果的單一查詢入口
│   │
│   ├── phases/              # ★ 一個賽事一個檔：邏輯 + 敘事 + 選擇同居
│   │   ├── index.js         #   kind → 模組註冊表
│   │   ├── split.js         #   一個賽段（例行賽 + 季後賽 + 事件卡）
│   │   ├── seasonEnd.js msi.js worlds.js transfer.js
│   │   ├── media.js salary.js alloc.js
│   │   └── shared.js        #   事件卡、扮演卡、特質覺醒
│   │
│   ├── engine/              # 純規則。不 import ui/，不碰 document
│   │   ├── game.js          # ★ 年度迴圈 driver（221 行）
│   │   ├── calendar.js      #   年曆展開（查表，不含史實）
│   │   ├── state.js         #   建立狀態、序列化
│   │   ├── lineup.js        #   先發／板凳／傷勢缺席
│   │   ├── imports.js       #   外援名額
│   │   ├── roster.js        #   隊友名單、隊名、階段顯示名
│   │   ├── season.js abilities.js progression.js mental.js
│   │   ├── market.js career.js retire.js
│   │
│   └── ui/                  # 只負責畫面
│       ├── runner.js        #   把引擎 beat 翻譯成畫面
│       └── dom.js board.js log.js actions.js panel.js summary.js storage.js
└── tests/
    ├── run.mjs              # runner：自動掃描下列目錄
    ├── lib/harness.mjs      # 驅動生涯、加點與決策策略
    ├── kernel/ phases/ history/ regression/
```

依賴方向單向：`data ← kernel ← phases ← engine ← ui`。engine 不知道 DOM 存在，
所以整段生涯可以在 Node 裡跑完。

---

## 二、模組邊界是怎麼決定的

不靠美感，靠**倒推測試**：拿真實的歷史 BUG 與已知的未來改動當測試集，數每一項要
開幾個檔案。檔數低的切法勝出。

這個方法推翻了三個一開始覺得理所當然的決定：

**① 按階段切沒有碰到特質效果。** 「MSI 改俱樂部身分」前後都要開 6 個檔，因為
`state.traits.*` 有 40 個消費點散在十個引擎檔。修法是把效果變成資料（`kernel/modifiers.js`）。

**② 賽區是實體，按屬性切會拆散它。** 先前打算把 par 放 `leagues.js`、賽段放
`splits.js`、隊名放 `teams.js`、名額放 `imports.js`，結果「新增一個賽區」要開 4 個
檔，比原本擠在單一 `world.js` 的 1 個檔更差。改成一個賽區一個檔。

**③ 資料與邏輯分家要看改動頻率，不是一律分。** 席位數、play-in、Swiss 切換會被
單獨修正 → 值得分家；種子序換算門檻是平衡數值，改它時必然同時在看賽制邏輯 → 不分家。

誠實的結果：純粹改一行的 BUG，切分前後檔案數一樣。切分縮短的是「找到那一行」的
距離（1033 行的 `game.js` vs 119 行的 `phases/seasonEnd.js`），這個維度數不出來但成本真實存在。

---

## 三、年曆與階段

一年有哪些賽事、照什麼順序跑，全部在 `data/formats/calendar.js` 一張表：

```js
export const EVENTS = [
  { kind: 'SPLIT',      order: 'PER_SPLIT', from: 2012 },
  { kind: 'MSI',        order: 'MSI_SLOT',  from: 2015 },
  { kind: 'SEASON_END', order: 900 },
  { kind: 'WORLDS',     order: 905 },
  { kind: 'TRANSFER',   order: 907 },
];
```

賽段拿 10／20／30，所以任何「插在第 n 賽段之後」的賽事取 `10n+5` 就會落在正確的縫裡。
MSI 歸位（從年末搬到賽季中段）就是靠這個——改的是一列資料，不是主迴圈。

每個階段只匯出兩個東西：

```js
export const kind = 'MSI';
export function* run(g, phase) { /* g = {state, rng} */ }
```

階段不 import `game.js`，沒有循環依賴。**新增一個賽事＝寫一個檔、註冊一行、年曆加一列。**

### Beat 協定

| beat | 意義 | runner 回傳 |
|---|---|---|
| `{type:'card', tone, title, body}` | 敘事卡 | — |
| `{type:'divider', text}` | 年度分隔線 | — |
| `{type:'phase', index}` | 0 訓練／1 賽季／2 休賽 | — |
| `{type:'checkpoint'}` | 建議存檔點（年初） | — |
| `{type:'choice', title, options}` | 等待選擇 | `option.id` |
| `{type:'alloc', mode, dice\|points}` | 等待加點 | — |
| `{type:'summary', tier}` | 畫生涯結算 | — |
| `{type:'end'}` | 生涯結束 | — |

退役用 `RetireSignal`（`engine/retire.js`）向上拋，`careerFlow` 頂層攔截。

---

## 四、種子：決定天賦，不決定人生

兩條亂數流：

| 流 | 種子來源 | 決定什麼 |
|---|---|---|
| **出生** | 玩家輸入或分享的種子字串 | 起始能力、潛力天花板、性格底色、初始英雄池、網咖隊 |
| **人生** | 每次開新局隨機抽 | 事件卡、訓練骰、勝負、傷病、報價、外界反應 |

引擎本身仍是 `(出生種子, 人生種子, 選擇)` 的確定性函式——**隨機的是「誰來決定人生
種子」，不是引擎**。存檔續玩要接回同一段人生，回歸測試要能比對，兩者都需要引擎可重現。
遊戲每次開新局隨機抽，測試則明確指定。

存檔存 `state.seed`（出生）＋ `lifeSeed`（人生）＋ 人生流進度，存檔點固定在年初。

---

## 五、特質效果是資料

特質在 `data/traits.js`／`epics.js` 自己宣告效果，消費端只問 `kernel/modifiers.js`：

```js
clutch: { name: '大賽選手', effects: { seriesGame: 4, intlRoll: 10 } },
iron:   { name: '鐵人',     effects: { injuryRate: { cap: 10 }, injuryMinorChance: { mul: 0.5 } } },
```

```js
bonus(state, key)    // 加總所有 add
factor(state, key)   // 連乘所有 mul
floorOf(state, key, base)  capOf(state, key, base)  flag(state, key)
```

四種運算刻意不合成單一 `apply()`：不同消費點的組合順序不同，統一反而會把順序藏起來。
少數分段效果（終極舞台先保底再加值、心態崩盤把加成翻負）留在原處並標註原因。

---

## 六、測試

```bash
npm test                 # 全部
node tests/run.mjs kernel  # 只跑某一區
npm run test:golden      # 重新 baseline 黃金種子快照
```

`tests/run.mjs` 自動掃描 `kernel/ phases/ history/ regression/`，加一個 suite 不必改 runner。

| 分區 | 內容 |
|---|---|
| `kernel/` | BO 系列、小組賽與 Swiss、modifiers、心理值、特質合成 |
| `phases/` | 自由市場、業餘出路、先發板凳、轉會與外援名額 |
| `history/` | **史實斷言**：2020 無 MSI、2022 不得 Swiss、2025 不得用冠軍點數、席位數逐年、2013 不得出現 PSG Talon 二隊 |
| `regression/` | 160 段生涯冒煙、評價分布、種子界線、**黃金種子快照** |

黃金種子快照錄下 160 段生涯的 state 雜湊與可讀摘要。純重構必須逐位元一致；有意的
賽制改動則重新 baseline，並在 commit 訊息說明差異來源。

---

## 七、開發

零建置。ES modules 需要 HTTP 協定：

```bash
python3 -m http.server 8080
```

---

## 八、加東西的時候

| 想加什麼 | 改哪裡 | 檔數 |
|---|---|---|
| 新賽事（EWC、First Stand） | `data/formats/calendar.js` 加一列 ＋ `phases/x.js` ＋ `phases/index.js` 註冊 | 2 改 1 新 |
| 新賽區 | `data/regions/x.js` ＋ `regions/index.js` 註冊 | 1 改 1 新 |
| 賽制史實修正 | `data/formats/*.js` 一列（不必讀任何程式碼） | 1 |
| 新特質或配方 | `data/traits.js` / `epics.js` | 1 |
| 新事件卡／扮演卡 | `data/events.js` / `data/roleplay.js` | 1 |
| 新戰隊／新解散事件 | `data/regions/*.js` / `data/disband.js` | 1 |
| 新畫面元素 | `src/ui/`；需要引擎配合時新增一種 beat | 1–2 |

原則：**資料能表達的就不要寫成程式碼，規則能表達的就不要寫進 UI。**
