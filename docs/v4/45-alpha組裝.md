# S45 · alpha 內測完整版組裝（§19.4）

狀態：未開始
前置：S21b S22 S42
預估：1 session
推理難度：低
建議模型：Sonnet 5（`claude-sonnet-5`）
理由：組裝為主。業餘期與完整生涯本來就是 160 段測試的基線，引擎零改動；
這一站只補「瀏覽器入口 + 開場文案 + 存檔隔離」。風險在 alpha 與 demo 共用的
`localStorage` 若不隔離，兩邊會互讀到對方存檔（起點語意不同）。

---

## 為什麼做這件事

V4 §19.4 的擴展路徑是「DEMO 驗證 → 補業餘期 → 補完整多年生涯」。S21／S21b 完成
DEMO（PRO 起點、三年期程）後，引擎裡其實已經有完整生涯（`createState` 的
`stage:'AMATEUR'`——16 歲 2012 網咖盃，一路打到市場淘汰退役，無年份上限），
而且它就是 13 站校準基線、160 段測試跑的路線。**缺的只有瀏覽器入口**：`main.js`
沒傳 `stage`，預設落到 PRO。

這一站把 AMATEUR 起點接成一個可分享的「alpha 內測版」，與 demo 並存、互不干擾。

---

## 入口狀態

```bash
npm test           # 全綠（22763 項，S44 之後）
```

`createState({stage:'AMATEUR'})` 已完整：`game.js` 開場卡（`:65` 的 16 歲網咖分支）、
`summary.js`（`demoEnded` 為 false → 「生涯檔案／退役」）、`biography.js`（正常退役
結局、「出身業餘賽事」對 AMATEUR 是正確用語）、`board.js`（`isDemo` false → 不印
DEMO 倒數）都已分支處理，不需要改。

---

## 範圍

### 要做

**1. 獨立目錄 `alpha/`（入口與文案）**

`alpha/index.html` 複製自根目錄 `index.html`，改三處：

- 路徑：`./src/styles.css` → `../src/styles.css`、`./src/main.js` → `../src/main.js`。
- 開場文案：標題／meta／og 加「alpha 內測」；hero sub 改「2012 網咖盃 → 業餘 →
  職業 → 退役完整生涯」；按鈕改「2012 春季」；seed-hint 移除 DEMO 字眼、
  標「ALPHA 內測：完整生涯，打到退役才結束」。
- 檔頭標記：`<script>window.__ESPORTLIFE_MODE__ = 'alpha';</script>`（inline
  classic script 在 deferred module 之前執行，保證 `main.js` 讀得到）。

demo 的根目錄 `index.html` 一字不動。

**2. `src/main.js` 讀模式**

`MODE = window.__ESPORTLIFE_MODE__ || 'demo'`；`createState` 傳
`stage: MODE === 'alpha' ? 'AMATEUR' : 'PRO'`。重開按鈕已走 `location.pathname`，
在 alpha 會正確回到 `/alpha/`，不需改。

**3. 存檔隔離（`src/ui/storage.js`）**

key 加 namespace：`esportlife.save.v4.alpha` vs `esportlife.save.v4.demo`。
`setSaveNamespace(ns)` 由 `main.js` 在摸任何存檔前呼叫一次。不隔離的話，
alpha 頁「繼續上次的生涯」會讀到 demo 的 PRO 存檔，反過來亦然。

### 不要做

- **不碰引擎、不改 `createState`、不動 `SAVE_VERSION`**——業餘期與完整生涯是既有
  基線，本站是組裝不是重建。
- **不刪 demo 的任何東西**（`index.html`、PRO 起點、三年期程全留）。
- **不引入建置工具**——維持純前端零建置 ESM，`alpha/` 只是多一個靜態入口。
- **不調平衡、不加內容**（事件卡／特質）。

---

## 要動的檔案

| 檔案 | 動作 |
| --- | --- |
| `alpha/index.html` | 新增（複製 index.html，改路徑＋文案＋mode 標記） |
| `src/main.js` | 讀 `__ESPORTLIFE_MODE__`、傳 `stage`、設存檔 namespace |
| `src/ui/storage.js` | key 加 namespace（`setSaveNamespace`） |
| `docs/v4/README.md` | 加 S45 列＋alpha 連結＋現況／站數更新；順帶補 S42b／S43／S44 |

版本 v4.6.5 → v4.6.6（Z 版）：`package.json`／`src/version.js`／規格書檔頭／
`CHANGELOG.md` 四處同號（`tests/kernel/version.mjs` 守門）。

---

## 規則與不變式

- **demo 行為不變**：根目錄 `index.html` 無 mode 標記 → `MODE='demo'` → PRO 三年期程，
  與本站開工前完全一致。
- **alpha 與 demo 存檔互不污染**：不同 key。
- **alpha 走完整生涯**：`demoEndYear` 為 null、`isDemo` 為 false，狀態帶／結算畫面
  不印任何 DEMO 字眼。
- 純前端零建置 ESM 不變。

---

## 完成定義

- `npm test` 全綠（本站不動引擎，測試數不變）。
- `node docs/v4/next-station.mjs` 解析 S45 正常（下一站仍為 S24c，不受影響）。
- 瀏覽器實測（playwright）：
  1. alpha（`/alpha/`）：開局即 AMATEUR——16 歲、2012 年、網咖盃賽；能跑完業餘盃
     賽／試訓／晉升，一路到退役結算；開場文案無 DEMO 字眼。
  2. demo（`/`）：仍 2015 出道、三年期程、「DEMO 結束」收束。
  3. 存檔隔離：demo 存一份、alpha 存一份，兩邊「繼續上次的生涯」各讀各的。

---

## 交接筆記

2026-08-17 施工完畢。`npm test` 22763 項全綠（本站零引擎改動，測試數不變）。
瀏覽器實測（playwright-cli，http://localhost:8080）：alpha 與 demo 逐項確認。

### 方向

本站把引擎既有的 AMATEUR 起點（`createState` 的 `stage:'AMATEUR'`）接成可分享的
alpha 內測入口，與 demo 並存。動的檔案：新增 `alpha/index.html`、改 `src/main.js`、
`src/ui/storage.js`。**引擎一行未改、`SAVE_VERSION` 不動**——業餘期與完整生涯本來
就是 160 段測試的基線，這一站是組裝不是重建。

### 實作細節

1. **入口與文案**：`alpha/index.html` 複製自根目錄 `index.html`，路徑改 `../src/*`、
   開場文案改 2012 業餘期（標題/meta/og 加「alpha 內測」、hero sub、按鈕「2012 春季」、
   seed-hint 移除 DEMO 字眼），檔頭標 `<script>window.__ESPORTLIFE_MODE__='alpha'</script>`
   （inline classic script 先於 deferred module 執行）。
2. **`main.js` 讀模式**：`MODE = window.__ESPORTLIFE_MODE__ || 'demo'`；`createState`
   傳 `stage: MODE === 'alpha' ? 'AMATEUR' : 'PRO'`。重開按鈕走 `location.pathname`，
   在 alpha 會正確回到 `/alpha/`，不需改。
3. **存檔隔離**：`storage.js` 的 key 加 namespace（`esportlife.save.v4.alpha` vs
   `…v4.demo`），`setSaveNamespace(ns)` 由 `main.js` 摸任何存檔前呼叫一次。不隔離
   的話 alpha 頁「繼續上次的生涯」會讀到 demo 的 PRO 存檔。
4. **版本**：v4.6.5 → v4.6.6（Z 版，四處同號：package.json／APP_VERSION／規格書
   檔頭／CHANGELOG）。

### 瀏覽器實測逐項確認

- ✅ alpha（`/alpha/`）開局即 AMATEUR：`16 歲 · 2012.1 · 網咖盃賽`，開場卡是
  「選手誕生」2012 網咖時代分支，**無 DEMO 字眼**；狀態帶不印 DEMO 倒數。
- ✅ demo（`/`）不變：`19 歲 · 2015.1 · LMS`，狀態帶「DEMO 1/36」，開場卡帶
  「DEMO 版本走 2015–2017 三個賽季」，hero sub 仍有 DEMO。
- ✅ 存檔隔離：同一瀏覽器兩頁各存一份，`localStorage` 出現
  `esportlife.save.v4.alpha` 與 `esportlife.save.v4.demo` 兩把 key，互不覆蓋。
- ✅ 開場文案：alpha 按鈕「開始生涯 ▸ 2012 春季」、seed-hint「ALPHA 內測：完整
  生涯，打到退役才結束（沒有年份上限）」。

### 狀態

完成。`npm test` 22763 項全綠（基線不變）。版號 v4.6.5 → v4.6.6；SAVE_VERSION
未動（23）；無常數變動。

### 未一起處理

- **S42b／S43／S44 仍未進狀態表**（既有漂移，非本站造成）：三站是壬組之後的線性
  UI 打磨、無後續站依賴，本站只在 README 現況塊註記、不補表格列（無說明書檔，
  補了會讓 next-station 解析到空連結）。若日後要有站依賴它們，再補列與說明書。
- **alpha 部署連結**（https://vik1n9.github.io/esportlife/alpha/）靠 GitHub Pages
  main 分支根目錄自動部署，push 後即生效，不需額外設定。
