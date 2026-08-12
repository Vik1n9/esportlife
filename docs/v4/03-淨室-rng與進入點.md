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
