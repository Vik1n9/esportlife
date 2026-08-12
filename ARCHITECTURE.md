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
│   │   ├── attributes.js skills.js  # 六屬性 + 由屬性導出的十二項技能權重
│   │   ├── mental.js roleplay.js events.js
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
│   │   ├── season.js attributes.js progression.js mental.js
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
```

`tests/run.mjs` 自動掃描 `kernel/ phases/ history/ regression/`，加一個 suite 不必改 runner。

| 分區 | 內容 |
|---|---|
| `kernel/` | BO 系列、小組賽與 Swiss、modifiers、心理值、特質合成 |
| `phases/` | 自由市場、業餘出路、先發板凳、轉會與外援名額 |
| `history/` | **史實斷言**：2020 無 MSI、2022 不得 Swiss、2025 不得用冠軍點數、席位數逐年、2013 不得出現 PSG Talon 二隊 |
| `regression/` | 160 段生涯冒煙、評價分布、**平衡不變式（測試網）** |

**決定論已廢（V4 §20.1），黃金種子快照隨之刪除。** 取而代之的是
`regression/invariants.mjs`：它不錄快照，改成守住「這個遊戲之所以是這個遊戲」的那幾條
性質——巔峰上界、打法差距、頂端才兌現、傳奇稀有度、位置身分、合成消耗、潛力衰減、
心理是放大器。門檻一律寫成**比例**（÷ 屬性上限），所以換刻度時不必重刷基準。
尚未實作的機制（六維心理、體力、事件互斥）以 SKIP 掛著，各自指名在等哪一站。

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

---

## 九、程式碼血緣

S02 血緣審計的產出。原作者未回覆授權申請，以「未獲正式授權」處理——這張表記錄的是
**事實血緣**（哪個 commit 加的、內容從哪搬的），不是著作權判斷。

標記規則：

| 標記 | 意思 |
| --- | --- |
| `A` | 承襲：`a71ee13`（v3.0.0 從單檔拆模組）或更早加入，或內容從 A 批檔案搬過來 |
| `B` | 原創：2026-08-11 之後從零寫的 LoL 內容 |
| `A/B` | 混合：檔案裡同時有搬過來的段落與新寫的段落 |

判定原則：**有疑慮一律標 `A`**——誤標成 A 的代價是多寫一次，誤標成 B 的代價是留著
承襲程式碼。`phases/*` 不能用檔案建立日期（2026-08-12）判斷，要看內容是不是 `6ec9575`
從 `engine/game.js` 搬的。

| 檔案 | 血緣 | 依據 | 處置 |
| --- | --- | --- | --- |
| `core/rng.js` | A | a71ee13 建立，種子化亂數 | S03 淨室重寫（換演算法） |
| `data/attributes.js` | B | 876c76b 新建，六大屬性（D&D 兩層） | 沿用（S09 起由 V4 改動） |
| `data/coaches.js` | A | e07427c 拆自 world.js（a71ee13） | S05 淨室重寫 |
| `data/disband.js` | A | e07427c 拆自 world.js | S05 淨室重寫 |
| `data/epics.js` | A/B | b2cdc80 拆自 traits.js（合成配方為 A）；`effects` 宣告為 B | V4 S19b/S19c 重寫 |
| `data/eras.js` | A | e07427c 拆自 world.js（START_YEAR／eraOf） | S05 淨室重寫 |
| `data/events.js` | A/B | a71ee13 建立（基礎事件卡）；7d19dce／e412b9b 大量新增（88→329 行） | V4 S17/S18 整段重寫 |
| `data/formats/calendar.js` | B | 6ec9575 新建年曆表（機制新寫，史實為公開事實） | 沿用（S15 調整） |
| `data/formats/msi.js` | B | a140b9e 新建，俱樂部賽事資料 | 沿用（S15 調整） |
| `data/formats/playoffs.js` | A | e07427c 拆自 world.js（PLAYOFF_ROUNDS／CHAMPIONSHIP_POINTS） | S05 淨室重寫 |
| `data/formats/worlds.js` | B | 3af552d 新建，種子序／席位／賽制資料 | 沿用（S15 調整） |
| `data/heroes.js` | A | e07427c 拆自 world.js（HEROES／PATCH_THEMES） | S05 淨室重寫 |
| `data/leagues.js` | A | e07427c 拆自 world.js（LEAGUES） | S05 淨室重寫 |
| `data/mental.js` | B | 7d19dce 新建，心理五維 | 沿用（S12 擴充） |
| `data/regions/cn.js` | A/B | e07427c 拆自 world.js（隊名／薪資／賽段史為 A）；a140b9e 加 `msiAfter` 欄位為 B | S05 重排結構 |
| `data/regions/eu.js` | A/B | 同上 | S05 重排結構 |
| `data/regions/home.js` | A/B | 同上 | S05 重排結構 |
| `data/regions/index.js` | A/B | e07427c 新建：資料承袭、查詢函式（splitsOf 等）新寫；a140b9e 加 msiSplitOf | S05 重排結構（查詢函式沿用） |
| `data/regions/kr.js` | A/B | 同 cn.js | S05 重排結構 |
| `data/regions/na.js` | A/B | 同 cn.js | S05 重排結構 |
| `data/roleplay.js` | B | 7d19dce 新建，18 張扮演卡 | 沿用（S20 重新對映） |
| `data/skills.js` | A/B → B | 876c76b 新建，SKILL_NAMES／ROLE_SIGNATURE／OVR_WEIGHTS 曾演化自 abilities.js（A）；**S10 整表換成 V4 §8.1／§8.2，`ROLE_SIGNATURE` 已刪** | 完成（承袭的表達已被 V4 規格取代） |
| `data/teams.js` | A | e07427c 拆自 world.js（隊名／MATE_NAMES）；0641189 更新為 B | S05 淨室重寫 |
| `data/traits.js` | A/B | a71ee13 建立（基礎特質）；b2cdc80 拆出 epics；e412b9b 四階合成（54→174 行） | V4 S19a 重寫 |
| `engine/attributes.js` | A/B | a71ee13 建 abilities.js，876c76b rename＋技能導出層（ovr／effectiveOvr 等骨架承袭，skillValue 等新寫） | V4 S09/S10 重寫 |
| `engine/calendar.js` | B | 6ec9575 新建，年曆展開（只查表） | 沿用（S14/S15 調整） |
| `engine/career.js` | A | a71ee13 建立 | S04 淨室重寫 |
| `engine/game.js` | A | a71ee13 建立；6ec9575 拆到 221 行（主迴圈） | V4 S14 月回合制重寫 |
| `engine/imports.js` | B | ef33e1b 新建，外援名額（舊版無此概念） | 沿用 |
| `engine/lineup.js` | B | 7604223 新建，先發／板凳（舊版 staminaFactor 是棒球模型） | 沿用（S16 調整） |
| `engine/market.js` | A | a71ee13 建立 | S04 淨室重寫 |
| `engine/mental.js` | B | 7d19dce 新建 | 沿用（S12 擴充） |
| `engine/progression.js` | A | a71ee13 建立 | V4 S16 設施制重寫 |
| `engine/retire.js` | A/B | 6ec9575 抽自 game.js（退役條件為 A）；RetireSignal 例外機制為 B | V4 S13 體力系統重寫 |
| `engine/roster.js` | A/B | a71ee13 建 team.js，667ec4c／6ec9575 rename＋調整（隊名資料流承袭；解散過濾／二隊推導為 B） | S05 重排結構時同步調整 |
| `engine/season.js` | A | a71ee13 建立 | V4 S14/S15 重寫 |
| `engine/state.js` | A | a71ee13 建立（SAVE_VERSION） | V4 重寫（存檔結構） |
| `kernel/groups.js` | B | 667ec4c 新建（小組賽／Swiss，原專案無） | 沿用 |
| `kernel/modifiers.js` | A/B | b2cdc80 新建聚合機制（B）；效果值搬自 traits.js（A） | V4 S19a 重寫 |
| `kernel/series.js` | B | 667ec4c 搬自 engine/playoffs.js（7d19dce 新建，種子序門檻首見於 7d19dce） | 沿用 |
| `kernel/strength.js` | A | 667ec4c 搬自 engine/team.js（a71ee13）的三個強度函式 | V4 S10/S11 隨 OVR 重寫 |
| `main.js` | A | a71ee13 建立 | S03 淨室重寫 |
| `phases/alloc.js` | A | 6ec9575 搬自 game.js（能力點分配） | V4 S16 設施制重寫 |
| `phases/index.js` | B | 6ec9575 新建註冊表（kind → 模組） | 沿用 |
| `phases/media.js` | A | 6ec9575 搬自 game.js（媒體採訪 38% 路口） | S04 重寫（承袭段落） |
| `phases/msi.js` | A/B | 6ec9575 搬自 game.js（run 骨架）；a140b9e 整檔重寫為俱樂部賽事（149/178 行） | 沿用（重寫已覆蓋，殘留骨架隨 S04） |
| `phases/salary.js` | A | 6ec9575 搬自 game.js（薪資結算） | S04 重寫（承袭段落） |
| `phases/seasonEnd.js` | A | 6ec9575 搬自 game.js（種子序／獎項／傷病）；7604223／876c76b 小改為 B | V4 S11/S15 重寫 |
| `phases/shared.js` | A/B | 6ec9575 搬自 game.js（事件卡／扮演卡／特質覺醒）；876c76b 六屬性後改寫為 B | V4 S17 事件觸發引擎重寫 |
| `phases/split.js` | A/B | 6ec9575 搬自 game.js（例行賽→季後賽→事件卡）；7604223 先發板凳改寫為 B | V4 S14 月回合制重寫 |
| `phases/transfer.js` | A/B | 6ec9575 搬自 game.js（FA 模型休賽期）；ef33e1b 加轉會窗口／外援為 B | S04 重寫 A 段 |
| `phases/worlds.js` | A/B | 6ec9575 搬自 game.js（run 骨架）；3af552d 整檔重寫為種子序制（196/215 行） | 沿用（重寫已覆蓋，殘留骨架隨 S04） |
| `styles.css` | A | a71ee13 建立 | S03 淨室重寫 |
| `ui/actions.js` | A | a71ee13 建立 | V4 S16 重寫（擲骰加點 → 設施制選單） |
| `ui/board.js` | A | a71ee13 建立 | S03 淨室重寫 |
| `ui/dom.js` | A | a71ee13 建立 | V4 UI 階段重寫（S16） |
| `ui/log.js` | A | a71ee13 建立 | V4 UI 階段重寫（S16） |
| `ui/panel.js` | A | a71ee13 建立；876c76b 加展開箭頭為 B | V4 UI 階段重寫（S16） |
| `ui/runner.js` | A | a71ee13 建立 | V4 UI 階段重寫（S16） |
| `ui/storage.js` | A | a71ee13 建立 | V4 UI 階段重寫（S16） |
| `ui/summary.js` | A | a71ee13 建立 | V4 UI 階段重寫（S16） |

統計：61 個檔（`src/` 下 60 個 `.js` ＋ 1 個 `.css`）。`data/world.js` 已於 e07427c
拆成 `regions/*` 與 `formats/*`、`data/abilities.js` 已於 876c76b 拆成
`attributes.js`／`skills.js`、`engine/abilities.js` 於 876c76b 更名 `attributes.js`、
`engine/team.js` 於 667ec4c／6ec9575 更名 `roster.js`、`engine/international.js`
於 3af552d 併入 `formats/*` 與 `phases/*` 後刪除——已不在表內。
