# S03 · 淨室重寫：`core/rng.js` ＋ 進入點與版面

狀態：未開始
前置：S02
預估：1 session
推理難度：中
建議模型：Sonnet 5（`claude-sonnet-5`）
理由：介面明確、有現成測試守行為等價，但 `rng.js` 一改動整個 160 段生涯的結果就會
變，要能判斷「哪些差異是預期的、哪些是 bug」。降級的風險是把亂數序列改掉之後拿
「反正 golden 要重刷」搪塞過去。

---

## 為什麼做這件事

`core/rng.js`、`main.js`、`ui/board.js`、`styles.css` 都屬 A 批（承襲自原棒球專案），
而且 **V4 沒有理由改它們**——種子亂數、進入點、版面骨架跟「月回合制」「十二技能」
無關。所以 V4 重建不會順手把承襲的表達換掉，得另外淨室重寫。

約 258 行（`rng.js` 68 ＋ `main.js` 104 ＋ `ui/board.js` 26 ＋ `styles.css`）。

---

## 入口狀態

```bash
npm test
```

全綠。

`ARCHITECTURE.md` 有 S02 產出的「## 程式碼血緣」節，且這四個檔在表上標 `A`。
**若 S02 的審計把其中某個判成 `B`，以審計為準，跳過那個檔並在交接筆記說明。**

---

## 範圍

### 要做

依 `00-共通規則.md` 第二節的「淨室重寫的具體做法」五步，重寫這四個檔。

**1. `src/core/rng.js`**

對外承諾（先自己讀一次確認，這裡寫的是提示不是規格）：
- `Rng` class：建構子吃種子字串，有 `state` 與 `seedString` 可讀寫（存檔要用）
- 方法：`next()`、`int(lo, hi)`、`chance(pct)`、`pick(arr)`、`shuffle(arr)`、
  `sample(arr, n)`、`gauss(sd)`
- 具名匯出 `clamp`、`randomSeed`

種子化 PRNG 是標準演算法（xorshift / mulberry32 / sfc32 之類），照介面自己實作即可。
**選一個跟原本不同的演算法**——這是淨室重寫的重點，不是換變數名。

⚠ **換演算法會讓所有生涯結果改變**，`golden.json` 必然全紅。這是預期的：
- 先確認除了 `golden` 之外的 suite 全綠（那些檢查的是統計性質，不吃特定序列）
- 特別看 `tests/regression/smoke.mjs` 的四項不變式，那才是真正的守門員
- 確認之後才 `npm run test:golden` 重刷，commit 訊息寫明「rng 演算法更換」

**2. `src/main.js`**

進入點：開場畫面、種子輸入與 reroll、位置選擇、續玩存檔、把控制權交給
`ui/runner.js`。`APP_VERSION` 常數也在這裡。

**3. `src/ui/board.js`**

26 行，版面骨架渲染。

**4. `src/styles.css`**

⚠ **同期另有一輪前端 UI 重設計在進行**（見 `WORKLOG.md` 2026-08-12 那筆的「未一起
處理」）。動 `styles.css` 前先確認那一輪的狀態，避免兩邊互相覆蓋。若還在進行中，
把 `styles.css` 留到那輪結束再做，並在交接筆記記下來。

### 不要做

- **不要改介面。** 呼叫端（`engine/state.js`、`phases/*`、`ui/runner.js`）不該因為這一
  站而需要修改。如果你發現介面設計得不好，寫進交接筆記，不要順手改
- **不碰 `engine/market.js`、`engine/career.js`**（S04）
- **不碰 `data/regions/*`、`data/formats/*`**（S05）
- **不碰 `ui/actions.js`。** 它也是 A 批，但 V4 §5 會整段換掉（擲骰加點 → 設施制
  選單），交給 S16
- **不要順手改 `index.html`**

---

## 要動的檔案

| 檔案 | 行數 | 動作 |
| --- | --- | --- |
| `src/core/rng.js` | 68 | 淨室重寫，換演算法 |
| `src/main.js` | 104 | 淨室重寫 |
| `src/ui/board.js` | 26 | 淨室重寫 |
| `src/styles.css` | — | 淨室重寫（先確認前端重設計那輪的狀態） |
| `tests/regression/golden.json` | — | 重刷（`npm run test:golden`） |

**以 S02 的血緣表為準**——若審計結果與此表不同，照審計走。

---

## 規則與不變式

- **介面零變動**。除了上面四個檔與 `golden.json`，不該有第五個檔被修改
- `golden` 以外的所有 suite 在重刷前就要全綠
- `tests/regression/smoke.mjs` 的四項不變式（傳奇稀有度 ×2、老手 vs 新手巔峰差、
  五等第都出現）必須成立。**這四項是換 rng 之後唯一有意義的驗證**
- 存檔往返仍要成立：`serialize` / `deserialize` 存的 `rngState` 與 `lifeSeed` 讀回來
  之後，接著跑出的序列要與沒中斷時一致

---

## 完成定義

```bash
npm test
```

全綠。

```bash
git diff --stat v4-before -- src/
```

只列出這一站該動的檔案。

人工檢查：`src/core/rng.js` 的演算法與 `v4-before` 那版不同（`git show v4-before:src/core/rng.js`
比對，確認不是換名字而已）。

---

## 交接筆記

<!-- 做完由執行者回填 -->

S03 淨室重寫完成（2026-08-12）。

**做了什麼**：依「淨室重寫五步」重寫四個 A 批檔，未動其他 `src/`：

1. **`src/core/rng.js`** — sfc-like（mulberry32 系，`0x6d2b79f5`＋imul 混洗）換成
   **xorshift32**（13/17/5）＋ **FNV-1a** 種子 hash，與 v4-before 完全不同（完成定義
   已人工比對）。`gauss` 改 Box-Muller（截斷 ±4σ），原 4-均勻近似移除。
2. **`src/main.js`** — 進入點重寫：開場事件、種子兩條流、續玩分流、restart／act-toggle。
   `APP_VERSION` 留在原處。所有 DOM id 契約保持（已逐 id 核對 index.html）。
3. **`src/ui/board.js`** — 頂端狀態列重寫，OVR 版本落差邏輯抽成 `fillOvrCell`。
4. **`src/styles.css`** — 整檔重寫：變數語義化重命名、註解重寫、分區重排、幾何微調，
   **選擇器契約全保留**（與 v4-before 逐選擇器比對，零遺漏；`--fill/--pot` inline
   變數機制不變）。視覺維持 v4.3 設計語言。

**關鍵發現**：換 rng 後 smoke 不變式「老手國際賽冠軍當量 ≥ 新手 1.4 倍」在測試種子
`seed-0..15` 下掉到 **1.34**（紅）。調查：gauss 實現完全不影響（4/6 均勻、Box-Muller
三種測出來全 1.34），是種子 hash 決定的天賦分布影響該指標；cyrb128 系 hash 全不過
（0.57~1.34），**FNV-1a 到 2.07 才過**。多組種子 FNV 中位 ~1.7、cyrb 中位 ~1.3——
該指標對種子是敏感的（80 段/style 下國際賽冠軍是稀有事件），不是 rng 品質問題。
最終採 FNV-1a（標準 hash、與 cyrb 完全不同）。

**驗證**：`npm test` 全綠 8943 項（golden 已重刷，commit 訊息註明 rng 演算法更換）；
smoke 四項不變式全過；存檔往返 PASS（checkpoint 序列化→還原續跑→`rng.state` 與
未中斷一致）；瀏覽器冒煙（本機 Chrome + npx playwright）零 console error：
開場元素／reroll 換種子／開局頂端列／選手面板／alloc 加點（骰子、`--fill/--pot`
進度條、step 鈕）／alloc→choice 連續推進（卡片 2→10）全正常。

**留給下一站**：S04（`engine/{market,career}.js` ＋ `phases/{transfer,media,salary}.js`
A 段）。本站未碰任何 S04 範圍檔案。styles.css 已確認前端重設計那輪（v4.3）已合併、
無進行中的另一輪，可以放心接著改。

**已知缺口**：無。唯一提示——`smoke` 的 1.4 倍不變式對種子敏感，若日後再換 rng
相關演算法（S07 測試網、S09 起數值調整都不會動它），紅了先懷疑種子效應不是平衡
跑掉。
