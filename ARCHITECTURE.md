# 架構說明（v4.5.3）

> v2 是一個 987 行的 `index.html`，CSS／資料／規則／流程／DOM 全部混在同一個 `<script>` 裡。
> v3 把它拆成「資料 → 引擎 → UI」三層。
> v4.0 再把賽制那一層拆開：**一個賽事一個檔，一年有哪些賽事由一張表決定**。
> v4.1–v4.5（V4 重建）把回合粒度從年換成月、成長模型從擲骰加點換成設施制訓練。

---

## 一、目錄結構

```
esportlife/               # repo 根目錄，GitHub Pages 直接服務這一層
├── index.html               # 只剩畫面骨架 + <script type="module">
├── src/
│   ├── main.js              # 進入點：開場、種子、續玩存檔
│   ├── styles.css           # 全站樣式（index.html 唯一外部樣式表）
│   ├── core/rng.js          # 種子化亂數（xorshift32＋FNV-1a 種子 hash）
│   │
│   ├── data/                # 純資料，零邏輯
│   │   ├── regions/         # ★ 一個賽區一個檔（實體切分）
│   │   │   ├── index.js     #   註冊表 + splitsOf / worldsSlotsOf / msiSplitOf …
│   │   │   └── home.js kr.js cn.js eu.js na.js
│   │   ├── formats/         # ★ 全球性賽制史實（跨賽區）
│   │   │   ├── calendar.js  #   一年有哪些階段、落在哪個月（月序）
│   │   │   ├── finishes.js  #   名次序位的單一來源（機器可讀鍵，S20c）
│   │   │   ├── msi.js       #   MSI 參賽資格與賽制
│   │   │   ├── worlds.js    #   種子序來源、入圍賽、席位
│   │   │   └── playoffs.js  #   輪次 / BO 數 / 冠軍點數
│   │   ├── attributes.js    # 六屬性（0–100，玩家唯一直接經營層）
│   │   ├── skills.js        # 十二技能 ＋ 屬性加權導出（§8.1／§8.2）
│   │   ├── mental.js reputation.js  # 隱藏心理六維（不可見）／聲量（可見有標籤）
│   │   ├── lifecycle.js     # 生命週期曲線參數（§7.2，六屬性 × 五參數）
│   │   ├── traits.js epics.js innate.js retireCards.js
│   │   │                   # 特質 / 史詩傳說 / 天生特質池 / 退役結局與選項卡
│   │   ├── events.js quests.js trainingCards.js roleplay.js
│   │   │                   # 事件卡 / 生涯任務卡 / 訓練事件卡 / 扮演卡
│   │   ├── biography.js     # 生涯傳記模板（§15.5，拼接非生成）
│   │   └── eras.js leagues.js teams.js coaches.js heroes.js disband.js
│   │
│   ├── kernel/              # ★ 被多個階段共用，改動最少
│   │   ├── series.js        #   BO 系列賽 + 種子序換算
│   │   ├── groups.js        #   小組循環 / Swiss
│   │   ├── strength.js      #   隊伍強度（§11.1，含 OPPONENT_SUPPORT）
│   │   ├── modifiers.js     #   特質效果的單一查詢入口
│   │   └── text.js          #   文本變數填值（{name} 等，卡片與傳記共用）
│   │
│   ├── phases/              # ★ 一個賽事一個檔：邏輯 + 敘事 + 選擇同居
│   │   ├── index.js         #   kind → 模組註冊表
│   │   ├── month.js         # ★ 養成回合（§4 的七步序列：選活動→成長→事件→戰報）
│   │   ├── split.js         #   賽段開幕（先發名單）
│   │   ├── playoff.js       #   賽段季後賽（逐輪 BO）
│   │   ├── seriesEvent.js   # ★ 賽事事件序列五拍共用 generator（§15.2）
│   │   ├── msi.js worlds.js #   國際賽（含衛冕者、force 出線開關）
│   │   ├── seasonEnd.js transfer.js media.js salary.js
│   │   └── shared.js        #   事件卡、扮演卡、特質授予共用敘事
│   │
│   ├── engine/              # 純規則。不 import ui/，不碰 document
│   │   ├── game.js          # ★ 月迴圈 driver（一年 12 個月，逐月分派階段；DEMO 期程檢查）
│   │   ├── demo.js          # ★ DEMO 期程單一來源（36 個月、demoMonth、demoExpiring）
│   │   ├── calendar.js      #   年曆展開成月份（查表，不含史實）
│   │   ├── state.js         #   建立狀態、序列化（SAVE_VERSION 23）
│   │   ├── training.js      # ★ 設施制訓練（§5：活動菜單、兩階段判定）
│   │   ├── stamina.js       #   §6 體力資源（消耗／恢復／懲罰曲線）
│   │   ├── lifecycle.js     #   生命週期曲線（effective_potential）
│   │   ├── attributes.js    #   教練評價、位置戰力、版本落差懲罰
│   │   ├── psych.js         #   §9.2 技能發揮公式 ＋ §9.3 失誤系統
│   │   ├── mental.js        #   心理六維與聲量（更新、結算）
│   │   ├── eventTrigger.js  # ★ 事件觸發引擎（§12.1 四步：時段→條件→第二張→隨機池）
│   │   ├── conditions.js    # ★ 條件語言 evalCond（任務卡／事件卡／特質／退役共用）
│   │   ├── quests.js        #   生涯任務卡狀態機（§12.3：開卡→達成→降階）
│   │   ├── ledger.js        # ★ 生涯軌跡帳本查詢層（謂詞一律讀這裡）
│   │   ├── biography.js     #   生涯傳記生成（§15.5）
│   │   ├── champion.js      #   世界賽冠軍登記表（titleHistory）與衛冕者
│   │   ├── lineup.js        #   先發／板凳／傷勢缺席
│   │   ├── imports.js       #   外援名額
│   │   ├── roster.js        #   隊友名單、隊名、階段顯示名
│   │   ├── season.js progression.js retire.js
│   │   ├── market.js career.js
│   │
│   └── ui/                  # 只負責畫面
│       ├── runner.js        #   把引擎 beat 翻譯成畫面
│       └── dom.js board.js log.js actions.js panel.js summary.js storage.js
├── tools/                   # 內容編輯器（事件卡／任務卡／特質／配方，開發者用）
│   ├── index.html editor.js editor.css schema.js README.md
└── tests/
    ├── run.mjs              # runner：自動掃描下列目錄
    ├── lib/harness.mjs      # 驅動生涯、加點與決策策略
    ├── kernel/ phases/ history/ regression/
```

依賴方向單向：`data ← kernel ← phases ← engine ← ui`。engine 不知道 DOM 存在，
所以整段生涯可以在 Node 裡跑完（`npm test` 實跑 160 段）。

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
距離，這個維度數不出來但成本真實存在。

---

## 三、年曆與階段

一年有哪些階段、落在哪個月，全部在 `data/formats/calendar.js` 一張表：

```js
export const EVENTS = [
  { kind: 'SPLIT',      at: 'SPLIT_OPEN',  from: 2012 },   // 賽段開幕（名單）
  { kind: 'MONTH',      at: 'EVERY_MONTH', from: 2012 },   // 養成回合
  { kind: 'PLAYOFF',    at: 'SPLIT_CLOSE', from: 2012 },   // 賽段季後賽
  { kind: 'MSI',        at: 'MSI_SLOT',    from: 2015 },
  { kind: 'SEASON_END', month: 10 },
  { kind: 'WORLDS',     month: 11 },
  { kind: 'TRANSFER',   month: 12, slot: SLOT.OFFSEASON + 2 },
];
```

V4 §3.2 的回合單位是月，所以 `order = 月 × 10 + 檔位`；符號位置（`SPLIT_OPEN`／
`MSI_SLOT`…）由 `engine/calendar.js` 依**當年該賽區的賽段數**展開成實際月份：賽段依序
吃掉 2–9 月、每段的最後一個月是季後賽、MSI 另外佔一個月、10–11 月是世界賽期間、
1 月與 12 月是休賽期。賽段多的年份每段就短——年份的形狀是算出來的，不是抄 §3.3 那張
兩賽段的表。賽事序列的月份不排養成回合（兩賽段＋MSI 年 7 個、兩賽段無 MSI 年 8 個、三賽段年 6 個）。

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
| `{type:'month', year, month}` | 推進到第 N 月（狀態列進度） | — |
| `{type:'checkpoint'}` | 建議存檔點（年初） | — |
| `{type:'choice', title, options}` | 等待選擇（每月訓練活動、備賽戰術、合約、退役選項…） | `option.id` |
| `{type:'alloc', mode:'points', points}` | 等待能力點分配（事件與國際賽發下來的點數；v4 之前是骰子加點，骰子已退場） | — |
| `{type:'summary', tier}` | 畫生涯結算 | — |
| `{type:'end'}` | 生涯結束 | — |

退役用 `RetireSignal`（`engine/retire.js`）向上拋，`careerFlow` 頂層攔截後走三層
退役事件（特殊結局 → 選項 → 結算，§18.2）。

---

## 四、種子：決定天賦，不決定人生

兩條亂數流：

| 流 | 種子來源 | 決定什麼 |
|---|---|---|
| **出生** | 玩家輸入或分享的種子字串 | 起始屬性、潛力天花板、**天生特質**、心理底色、初始英雄池、網咖隊、生命週期參數 |
| **人生** | 每次開新局隨機抽 | 事件卡、訓練成敗、勝負、傷病、報價、外界反應 |

引擎本身仍是 `(出生種子, 人生種子, 選擇)` 的確定性函式——**隨機的是「誰來決定人生
種子」，不是引擎**。存檔續玩要接回同一段人生，測試要能重現，兩者都需要引擎可重現。
遊戲每次開新局隨機抽，測試則明確指定。

出生流的抽取順序寫死在 `createState`（§1.4，不准插隊）：

```
潛力分佈 → 起始屬性 → 天生特質 → 心理六維 → fame → 英雄池 → 業餘隊伍 → 生命週期參數
```

> ⚠ 這是 §1.4 的設計順序；`createState` 實際取數把業餘隊伍放在第 3 位（潛力與
> 屬性 jitter 之後、天生特質之前，歷史遺留）。移動會位移全部既有種子的天賦輸出，
> 已記入 S22 交接筆記，待 S28 隊友與戰隊整合時一併對齊。

**天生特質（§1.4／§14.1）**：種子生成時擲骰決定 0／1／2 個（40／40／20%），同種子
必定生成同一組；池內 5 條（鐵人、玻璃體質、天生抗壓、天生領袖、夜貓子），歸入通用
特質池、可當合成素材。天生特質的心理偏置（`mentalBias`）與初始心理六維必須一致。

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
lifecycleWindows(state)   // 生命週期曲線的窗口修正（§7.2）
```

四種運算刻意不合成單一 `apply()`：不同消費點的組合順序不同，統一反而會把順序藏起來。
v4.3 起特質效果可自由掛載在任一層（§14.4 掛載點全景表），效果鍵由編輯器
（`tools/schema.js` 的 `EFFECT_KEYS`）與引擎測試共同鎖定。

---

## 六、測試

```bash
npm test                 # 全部
node tests/run.mjs kernel  # 只跑某一區
```

`tests/run.mjs` 自動掃描 `kernel/ phases/ history/ regression/`，加一個 suite 不必改 runner。

| 分區 | 內容 |
|---|---|
| `kernel/` | BO 系列、小組賽與 Swiss、modifiers、心理值、特質合成、訓練事件卡、條件語言 |
| `phases/` | 自由市場、業餘出路、先發板凳、轉會與外援名額、衛冕者 |
| `history/` | **史實斷言**：2020 無 MSI、2022 不得 Swiss、2025 不得用冠軍點數、席位數逐年、解散與簽約名單過濾 |
| `regression/` | 160 段生涯冒煙、評價分布、**平衡不變式（測試網）**、DEMO 期程驗證（36 個月上限、期滿收束） |

**決定論已廢（V4 §20.1），黃金種子快照隨之刪除。** 取而代之的是
`regression/invariants.mjs`：它不錄快照，改成守住「這個遊戲之所以是這個遊戲」的那幾條
性質——巔峰上界、打法差距、頂端才兌現、傳奇稀有度、位置身分、合成消耗、潛力衰減、
心理是放大器。門檻一律寫成**比例**（÷ 屬性上限），所以換刻度時不必重刷基準。
另有 `conditions.js` QUERIES 與 `tools/schema.js` PREDICATES 的鍵集合斷言——條件語言
的兩張註冊表脫節測試會直接抓。

---

## 七、開發

零建置。ES modules 需要 HTTP 協定：

```bash
npm run serve   # = python3 -m http.server 8080
```

內容編輯器（`tools/`）也要經這個伺服器開——它直接 import `src/data/*.js`，`file://`
會被 CORS 擋。

---

## 八、加東西的時候

| 想加什麼 | 改哪裡 | 檔數 |
|---|---|---|
| 新賽事（EWC、First Stand） | `data/formats/calendar.js` 加一列 ＋ `phases/x.js` ＋ `phases/index.js` 註冊 | 2 改 1 新 |
| 新賽區 | `data/regions/x.js` ＋ `regions/index.js` 註冊 | 1 改 1 新 |
| 賽制史實修正 | `data/formats/*.js` 一列（不必讀任何程式碼） | 1 |
| 新事件卡／訓練卡／任務卡 | `data/events.js` / `trainingCards.js` / `quests.js`（用編輯器，見 `tools/README.md`） | 1 |
| 新特質或配方 | `data/traits.js` / `epics.js`（用編輯器） | 1 |
| 新條件謂詞 | `engine/conditions.js` 的 QUERIES ＋ `tools/schema.js` 的 PREDICATES（同一個 commit） | 2 |
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
承襲程式碼。`phases/*` 不能用檔案建立日期判斷，要看內容是不是 `6ec9575`
從 `engine/game.js` 搬的。

> **V4 重建（S01–S22，2026-08-16）已全部收斂**：A 批承襲段落全部完成淨室重寫或
> 整段重寫，B 批原創沿用。下表「處置」欄標註的站號即為處理完成的位置；V4 完成後
> 本專案不含原作者程式碼。

| 檔案 | 血緣 | 依據 | 處置 |
| --- | --- | --- | --- |
| `core/rng.js` | A | a71ee13 建立，種子化亂數 | ✅ S03 淨室重寫（換 xorshift32＋FNV-1a） |
| `data/attributes.js` | B | 876c76b 新建，六大屬性（D&D 兩層） | ✅ 沿用（S09 起由 V4 改動） |
| `data/biography.js` | B | S21a 新建，生涯傳記模板 | ✅ 沿用 |
| `data/coaches.js` | A | e07427c 拆自 world.js（a71ee13） | ✅ S05 淨室重寫 |
| `data/disband.js` | A | e07427c 拆自 world.js | ✅ S05 淨室重寫 |
| `data/epics.js` | A/B | b2cdc80 拆自 traits.js（合成配方為 A）；`effects` 宣告為 B | ✅ V4 S19b/S19c 重寫 |
| `data/eras.js` | A | e07427c 拆自 world.js（START_YEAR／eraOf） | ✅ S05 淨室重寫 |
| `data/events.js` | A/B | a71ee13 建立（基礎事件卡）；7d19dce／e412b9b 大量新增 | ✅ V4 S17/S18 整段重寫（86 張） |
| `data/formats/calendar.js` | B | 6ec9575 新建年曆表；S14 改為月序 | ✅ 沿用（S14 調整） |
| `data/formats/finishes.js` | B | S20c 新建，名次序位單一來源 | ✅ 沿用 |
| `data/formats/msi.js` | B | a140b9e 新建，俱樂部賽事資料 | ✅ 沿用（S15 調整） |
| `data/formats/playoffs.js` | A | e07427c 拆自 world.js（PLAYOFF_ROUNDS／CHAMPIONSHIP_POINTS） | ✅ S05 淨室重寫 |
| `data/formats/worlds.js` | B | 3af552d 新建，種子序／席位／賽制資料 | ✅ 沿用（S15 調整） |
| `data/heroes.js` | A | e07427c 拆自 world.js（HEROES／PATCH_THEMES） | ✅ S05 淨室重寫 |
| `data/innate.js` | B | S19d 新建，天生特質池（5 條） | ✅ 沿用 |
| `data/leagues.js` | A | e07427c 拆自 world.js（LEAGUES） | ✅ S05 淨室重寫 |
| `data/lifecycle.js` | B | S15b 新建，生命週期曲線參數 | ✅ 沿用 |
| `data/mental.js` | B | 7d19dce 新建（心理五維），S12 整表換成 V4 §9 競技心理六維 | ✅ 沿用 |
| `data/quests.js` | B | S18 新建，生涯任務卡 25 張（20 legend＋5 route） | ✅ 沿用 |
| `data/reputation.js` | B | S12 新建，聲量層自 `mental.js` 拆出 | ✅ 沿用 |
| `data/regions/cn.js` | A/B | e07427c 拆自 world.js（隊名／薪資／賽段史為 A）；a140b9e 加 `msiAfter` 為 B | ✅ S05 重排結構 |
| `data/regions/eu.js` | A/B | 同上 | ✅ S05 重排結構 |
| `data/regions/home.js` | A/B | 同上 | ✅ S05 重排結構 |
| `data/regions/index.js` | A/B | e07427c 新建：資料承袭、查詢函式新寫；a140b9e 加 msiSplitOf | ✅ S05 重排結構 |
| `data/regions/kr.js` | A/B | 同 cn.js | ✅ S05 重排結構 |
| `data/regions/na.js` | A/B | 同 cn.js | ✅ S05 重排結構 |
| `data/retireCards.js` | B | S20e 新建，退役結局 5＋選項 4 | ✅ 沿用 |
| `data/roleplay.js` | B | 7d19dce 新建，23 張扮演卡 | ✅ 沿用（S20 重新對映） |
| `data/skills.js` | A/B → B | 876c76b 新建，曾演化自 abilities.js（A）；**S10 整表換成 V4 §8.1／§8.2** | ✅ 完成（承袭的表達已被 V4 規格取代） |
| `data/teams.js` | A | e07427c 拆自 world.js（隊名／MATE_NAMES）；0641189 更新為 B | ✅ S05 淨室重寫 |
| `data/traits.js` | A/B | a71ee13 建立（基礎特質）；b2cdc80 拆出 epics；e412b9b 四階合成 | ✅ V4 S19a 重寫 |
| `data/trainingCards.js` | B | S18 新建，訓練事件卡 60 張 | ✅ 沿用 |
| `engine/attributes.js` | A/B → B | a71ee13 建 abilities.js，876c76b rename＋技能導出層；**S11 換成 §10.2 教練評價與 §11.1 位置戰力** | ✅ 完成（S09/S10/S11 三站重寫） |
| `engine/biography.js` | B | S21a 新建，生涯傳記生成 | ✅ 沿用 |
| `engine/calendar.js` | B | 6ec9575 新建，年曆展開（只查表）；S14 展開成 12 個月 | ✅ 沿用 |
| `engine/career.js` | A | a71ee13 建立 | ✅ S04 淨室重寫 |
| `engine/champion.js` | B | S20g 新建，世界賽冠軍登記表與衛冕者 | ✅ 沿用 |
| `engine/conditions.js` | B | S17b 新建，條件語言 evalCond | ✅ 沿用 |
| `engine/demo.js` | B | S21b 新建，DEMO 期程（36 個月、isDemo、demoExpiring） | ✅ 沿用 |
| `engine/eventTrigger.js` | B | S17 新建，事件觸發引擎（§12.1 四步） | ✅ 沿用 |
| `engine/game.js` | A → B | a71ee13 建立；6ec9575 拆到 221 行；S14 主迴圈改為逐月推進 | ✅ 完成（S14 重寫） |
| `engine/imports.js` | B | ef33e1b 新建，外援名額（舊版無此概念） | ✅ 沿用 |
| `engine/ledger.js` | B | S17a 新建，生涯軌跡帳本查詢層 | ✅ 沿用 |
| `engine/lifecycle.js` | B | S15b 新建，生命週期曲線 | ✅ 沿用 |
| `engine/lineup.js` | B | 7604223 新建，先發／板凳 | ✅ 沿用 |
| `engine/market.js` | A | a71ee13 建立 | ✅ S04 淨室重寫 |
| `engine/mental.js` | B | 7d19dce 新建，S12 改寫為六維 ＋ 聲量 | ✅ 沿用 |
| `engine/progression.js` | A | a71ee13 建立 | ✅ V4 S16 設施制重寫 |
| `engine/psych.js` | B | S12 新建（§9.2 發揮公式、§9.3 失誤系統） | ✅ 沿用 |
| `engine/quests.js` | B | S17b 新建，任務卡狀態機 | ✅ 沿用 |
| `engine/retire.js` | A/B | 6ec9575 抽自 game.js（退役條件為 A）；RetireSignal 為 B | ✅ V4 重寫（S13 體力＋S20e 三層退役） |
| `engine/roster.js` | A/B | a71ee13 建 team.js，667ec4c／6ec9575 rename＋調整 | ✅ S05 同步調整 |
| `engine/season.js` | A | a71ee13 建立；S14 拿掉自行推進月份 | ✅ V4 S15 重寫 |
| `engine/stamina.js` | B | S13 新建（§6 體力資源） | ✅ 沿用（S16 接訓練成功率） |
| `engine/state.js` | A | a71ee13 建立（SAVE_VERSION） | ✅ V4 重寫（存檔結構） |
| `engine/training.js` | B | S16 新建（§5 設施制訓練） | ✅ 沿用 |
| `kernel/groups.js` | B | 667ec4c 新建（小組賽／Swiss，原專案無） | ✅ 沿用 |
| `kernel/modifiers.js` | A/B | b2cdc80 新建聚合機制（B）；效果值搬自 traits.js（A） | ✅ V4 S19a 重寫 |
| `kernel/series.js` | B | 667ec4c 搬自 engine/playoffs.js（7d19dce 新建） | ✅ 沿用 |
| `kernel/strength.js` | A → B | 667ec4c 搬自 engine/team.js（a71ee13）；S11 依 §11.1 重寫權重、加明星效應與對手支援換算 | ✅ 完成（S11 重寫） |
| `kernel/text.js` | B | S20h 新建，文本變數填值 | ✅ 沿用 |
| `main.js` | A | a71ee13 建立 | ✅ S03 淨室重寫 |
| `phases/index.js` | B | 6ec9575 新建註冊表（kind → 模組） | ✅ 沿用 |
| `phases/media.js` | A | 6ec9575 搬自 game.js（媒體採訪路口） | ✅ S04 重寫（承袭段落） |
| `phases/month.js` | B | S14 新建（§4 的七步養成回合）。`phases/alloc.js`（A 批）已刪除 | ✅ 沿用（S16 換成設施制選單） |
| `phases/msi.js` | A/B | 6ec9575 搬自 game.js（run 骨架）；a140b9e 整檔重寫為俱樂部賽事 | ✅ 沿用（重寫已覆蓋；S21 加 force 開關） |
| `phases/playoff.js` | A/B | S14 自 `split.js` 拆出（BO 主體是 B 批新寫，`run` 骨架承袭） | ✅ V4 S15 五拍重寫 |
| `phases/salary.js` | A | 6ec9575 搬自 game.js（薪資結算） | ✅ S04 重寫（承袭段落） |
| `phases/seasonEnd.js` | A | 6ec9575 搬自 game.js（種子序／獎項／傷病）；7604223／876c76b 小改為 B | ✅ V4 S11/S15 重寫 |
| `phases/seriesEvent.js` | B | S15 新建，五拍事件序列共用 generator | ✅ 沿用 |
| `phases/shared.js` | A/B | 6ec9575 搬自 game.js（事件卡／扮演卡／特質覺醒）；876c76b 改寫為 B | ✅ V4 S17 事件觸發引擎重寫 |
| `phases/split.js` | B | 6ec9575 搬自 game.js；7604223 先發板凳改寫為 B；S14 之後只剩賽段開幕名單判定 | ✅ 完成（S14 重寫） |
| `phases/transfer.js` | A/B | 6ec9575 搬自 game.js（FA 模型休賽期）；ef33e1b 加轉會窗口／外援為 B | ✅ S04 重寫 A 段 |
| `phases/worlds.js` | A/B | 6ec9575 搬自 game.js（run 骨架）；3af552d 整檔重寫為種子序制 | ✅ 沿用（重寫已覆蓋；S20g 衛冕者、S21 force 開關） |
| `styles.css` | A | a71ee13 建立 | ✅ S03 淨室重寫 |
| `ui/actions.js` | A | a71ee13 建立 | ✅ V4 S16 重寫（擲骰加點 → 設施制選單） |
| `ui/board.js` | A | a71ee13 建立 | ✅ S03 淨室重寫 |
| `ui/dom.js` | A | a71ee13 建立 | ✅ V4 UI 階段重寫（S16） |
| `ui/log.js` | A | a71ee13 建立 | ✅ V4 UI 階段重寫（S16） |
| `ui/panel.js` | A | a71ee13 建立；876c76b 加展開箭頭為 B | ✅ V4 UI 階段重寫（S16） |
| `ui/runner.js` | A | a71ee13 建立 | ✅ V4 UI 階段重寫（S16） |
| `ui/storage.js` | A | a71ee13 建立 | ✅ V4 UI 階段重寫（S16） |
| `ui/summary.js` | A | a71ee13 建立 | ✅ V4 UI 階段重寫（S16；S21 接生涯標籤） |

統計：`src/` 下 82 個 `.js`（12240 行）＋ 1 個 `.css`。`data/world.js` 已於 e07427c 拆成
`regions/*` 與 `formats/*`、`data/abilities.js` 已於 876c76b 拆成 `attributes.js`／
`skills.js`、`engine/abilities.js` 於 876c76b 更名 `attributes.js`、`engine/team.js`
於 667ec4c／6ec9575 更名 `roster.js`、`engine/international.js` 於 3af552d 併入
`formats/*` 與 `phases/*` 後刪除、`phases/alloc.js` 於 S14 刪除——已不在表內。