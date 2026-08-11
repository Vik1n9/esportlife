# 架構說明（v3.0.0）

> v2 是一個 987 行的 `index.html`，CSS／資料／規則／流程／DOM 全部混在同一個 `<script>` 裡。
> v3 把它拆成「資料 → 引擎 → UI」三層，中間用一個明確的協定隔開。

---

## 一、目錄結構

```
esportlife/            # repo 根目錄，GitHub Pages 直接服務這一層
├── index.html            # 只剩畫面骨架 + <script type="module">
├── package.json          # type:module（給 Node 跑測試用；正式站不需要 npm）
├── src/
│   ├── styles.css
│   ├── main.js           # 進入點：開場畫面、種子、續玩存檔
│   ├── core/
│   │   └── rng.js        # 種子化亂數（全遊戲唯一隨機來源）
│   ├── data/             # 純資料，零邏輯、零 import 依賴（除了彼此）
│   │   ├── abilities.js  # 能力名稱、位置、OVR 權重、數據基線
│   │   ├── world.js      # 時代、聯賽、戰隊、解散表、英雄池
│   │   ├── traits.js     # 基礎／史詩特質、合成配方
│   │   └── events.js     # 事件卡、粉絲留言、生涯評價名稱
│   ├── engine/           # 純規則。不 import 任何 ui/，不碰 document
│   │   ├── state.js      # 建立狀態、序列化
│   │   ├── abilities.js  # OVR、成長成本、加點、年齡衰退、版本落差
│   │   ├── team.js       # 隊友、教練、隊伍強度、可簽隊伍名單
│   │   ├── season.js     # 賽季模擬與數據累加
│   │   ├── progression.js# 受傷、版本、英雄專精、特質解鎖與合成
│   │   ├── international.js # MSI／世界賽
│   │   ├── market.js     # 合約、薪資、自由市場、試訓、解散
│   │   ├── career.js     # 生涯評分與分級
│   │   └── game.js       # ★ 生涯流程機（generator）
│   └── ui/               # 只負責畫面。不 import 規則細節以外的東西
│       ├── dom.js  board.js  log.js  actions.js
│       ├── panel.js      # 選手資料面板
│       ├── summary.js    # 生涯結算與分享圖
│       ├── storage.js    # localStorage 存檔
│       └── runner.js     # 把引擎 beat 翻譯成畫面
└── tests/
    └── headless.mjs      # 在 Node 裡跑完整生涯的回歸測試
```

依賴方向是單向的：`data ← engine ← ui`。engine 不知道 DOM 存在，所以整段生涯可以在 Node 裡跑完。

---

## 二、核心設計：generator 流程機

v2 的一年是這樣串起來的：

```js
phaseEnd() → maybeMSI(() => maybeWorlds(() => offseason()))
offseason() → movement() → faFlow() → termChoice(..., cb) → advance()
```

回呼一層層往下傳，一年的時間順序被拆散在十幾個函式裡。後果是「每季開頭要重置哪些旗標」沒有任何一個地方看得到全貌，於是 `champThisTeam`、`injNext`、`disbandAverted` 全都忘了清除（見 CHANGELOG 的修正清單）。

v3 把流程寫成 generator：

```js
function* runYear(g) {
  yield { type: 'divider', text: `${state.year} 年 · ${state.age} 歲` };
  yield* phaseTraining(g);   // 這裡集中重置所有每季旗標
  yield* phaseSeason(g);
  yield* phaseOffseason(g);
  state.age++; state.year++;
}
```

需要玩家決策時 `yield` 一個 beat，runner 把答案 `next()` 回來：

```js
const picked = yield { type: 'choice', title: '合約到期', options: [...] };
if (picked === 'quit') retire('...');
```

程式碼由上而下就是一年的時間順序，看得到、也測得到。

### Beat 協定

| beat | 意義 | runner 回傳 |
|---|---|---|
| `{type:'card', tone, title, body}` | 敘事卡 | — |
| `{type:'divider', text}` | 年度分隔線（可折疊） | — |
| `{type:'phase', index}` | 0 訓練／1 賽季／2 休賽 | — |
| `{type:'checkpoint'}` | 建議存檔點（年初） | — |
| `{type:'choice', title, options}` | 等待選擇 | `option.id` |
| `{type:'alloc', mode, dice\|points}` | 等待加點 | — |
| `{type:'summary', tier}` | 畫生涯結算 | — |
| `{type:'end'}` | 生涯結束 | — |

退役用 `RetireSignal` 例外向上拋，在 `careerFlow` 頂層攔截後接生涯結算——不需要每個分支都手動 `return`。

---

## 三、決定論

「同種子＋同選擇＝同一段人生」靠三件事成立：

1. **唯一亂數來源**：`Rng` 實例只傳給 engine，UI 一律不呼叫。
2. **不用 `sort(() => rng() - 0.5)`**：v2 用隨機比較器洗牌，結果依賴 JS 引擎的排序實作，跨瀏覽器不一致。v3 改用 Fisher-Yates。
3. **狀態是純 JSON**：沒有函式、沒有 class 實例、沒有 DOM 參照，所以存檔就是 `JSON.stringify(state)` ＋ 亂數內部狀態。

`tests/headless.mjs` 直接驗這件事：同種子跑兩次，比對整顆 state 的 JSON 逐字相同。

---

## 四、存檔

存檔點固定在**年初**（`{type:'checkpoint'}`），存的是 `state` ＋ `rng.state`。
因為存檔點永遠在年度迴圈的開頭，讀檔就是「從那一年年初重新進入 `careerFlow`」，不需要序列化 generator 的執行位置。

---

## 五、開發

零建置。ES modules 需要 HTTP 協定（`file://` 會被 CORS 擋），本機起個靜態伺服器即可：

```bash
python3 -m http.server 8080
```

跑回歸測試（需要 Node 18+，不需要 `npm install`）：

```bash
node tests/headless.mjs
```

測試內容：160 段完整生涯的冒煙測試、種子決定論、生涯評價分布、特質合成、版本落差方向、自由市場分級、解散名單過濾。

---

## 六、加東西的時候

| 想加什麼 | 改哪裡 |
|---|---|
| 新事件卡 | `src/data/events.js` 加一筆；需要新副作用時在 `game.js` 的 `drawEvent` 處理 flag |
| 新戰隊／新解散事件 | `src/data/world.js` |
| 新特質或配方 | `src/data/traits.js`（配方命中由 `progression.js` 自動處理） |
| 調整數值平衡 | `src/data/`（權重、基線、聯賽 par）或對應的 `src/engine/*.js` |
| 新畫面元素 | `src/ui/`；需要引擎配合時新增一種 beat |

原則：**資料能表達的就不要寫成程式碼，規則能表達的就不要寫進 UI。**
