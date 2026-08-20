# AGENTS.md — 電競人生（esportlife）專案規則

本檔只放「每個 session 都需要、且沒有更便宜表達方式」的內容。
**path-scoped 的工程規則在 `.opencodereview/rule.json`（單一來源），由審查閘門消費。
測試守得住的不變式在 `tests/`，本檔只指路。**

## 事實

零建置、零相依、純 ES modules。驗證：`npm test`（＝`node tests/run.mjs`，約 0.8 秒）。
依賴方向 `ui → engine/phases → kernel → data → core`，單向，phases 不 import `engine/game.js`。
架構全貌 `ARCHITECTURE.md`；現役規格書只有 `ESPORT-DESIGN-V4.md` 一份。

## 工具

- `rtk <指令>`：CLI 輸出過濾，命令鏈每一段都加。**未安裝時直接跑原指令，不要中斷。**
  （可改裝 `rtk init -g` 的自動改寫 hook，裝了就把這條刪掉。）
- `node docs/v4/next-station.mjs`：抓下一站。**與 `docs/v4/README.md` 狀態表同源**——
  狀態表或站結構一變動，腳本同一個 commit 同步更新。解析失敗當場修，不准人肉看 README 開工。
- `node scripts/station-review.mjs --station <站號>`：收尾審查閘門（委託模式，
  不呼叫 LLM、不需 API key）。**`ocr` 未安裝時跳過閘門，並在交接筆記註明未審。**

## 動工

說「動工」（或開工／接續下一站）即套用 `donggong` skill。一個 session 只做一站。

## 收尾（順序固定）

`npm test` → 回填該站交接筆記 → 更新 `docs/v4/README.md` 狀態表 →
`WORKLOG.md` 最上方加一筆 → 審查閘門 → commit → push。

做不完不要硬撐：進度寫進交接筆記、狀態改「進行中」、commit 現況，然後停。
改到存檔結構要把 `src/engine/state.js` 的 `SAVE_VERSION` 加一。

### 審查閘門

`--station <站號>` 出審查包 → host agent 逐檔審查、意見寫成 JSON →
`--station <站號> --comments <意見檔>` 進閘門。
**exit 2 ＝ 有 critical／high，禁 commit**：逐條修 → 重跑 `npm test` → 複審到 exit 0，
修正只聚焦 high／critical，不要順手重構。medium／low 修掉或記進交接筆記，
**不得無聲忽略**。已 commit 後補審用 `ocr delegate preview -c HEAD`。

### commit 拆法

- 站工作：`feat: S<id> <主題>——<一句話總結>`（一站一個）
- 審查修正：`fix: S<id> OCR review 修正——<改了什麼>`
- 只記不改：`docs: S<id> OCR review 補記——<N 條記入交接筆記>`

## WORKLOG 條目寫法

標題 `## YYYY-MM-DD — 主題：一句話總結`。第一段必寫**方向**（問題與解法，
讓不知道前因的人讀得懂）。有量測必寫**實測結論**（實際數字）。
收尾必寫**狀態**（`npm test` 實際項數、`SAVE_VERSION` 與關鍵常數變動）。
沒做的寫**未一起處理**並在程式碼留 TODO。純文件站註明「程式與測試未動」。
反直覺或會咬人的地方用 ⚠ 標記。

## 規格書

增訂一律併入 `ESPORT-DESIGN-V4.md`，併入後刪除獨立修訂文件，來源用內文
`（v4.x）`註釋與附錄決策紀錄編號標記。站間知識寫進各站說明書的交接筆記。

## 版本編號

`X.Y.Z` 適用全專案（規格書與軟體共用一套）。X：遊戲變動超過 50%。
Y：新增或移除概念、變動超過兩個章節。Z：一個章節以內的補充。
不確定落在哪一級時問使用者拍板。（`tests/kernel/version.mjs` 守規格書與 `package.json` 同號。）

## 規則寫在哪

任何約束先問能不能用測試守。能，就寫測試，本檔只留一行指路——
**本檔成本是「每 session × 每站」，測試成本是「壞掉時才付」。**
只在特定檔案適用的寫進 `.opencodereview/rule.json`。兩者都不行才留在本檔。

### 已經有守門的（本檔不重複，壞了會紅）

- 條件語言雙註冊表（`QUERIES`／`PREDICATES`、`COND_KINDS`／`COND_NODES`）：
  `tests/kernel/conditions.mjs`
- 效果鍵正向與反向死鍵掃描：`tests/kernel/traits.mjs`
- 教練戰力點平均 2.0（§11.1 硬約束）：`tests/kernel/coaches.mjs`
- 規格書與 `package.json` 版號一致：`tests/kernel/version.mjs`
- 條件語言、modifier、單一來源、零相依等 path-scoped 規則：`.opencodereview/rule.json`

## 回覆風格

技術精確前提下最小化 token。去冗言、短詞、無表格、無表情符號、無因果箭頭。
**否定詞（not／never／no／only）與數字單位絕不可省。**
禁自創縮寫（保留 DB／API／HTTP）。語言跟隨使用者；技術術語、程式碼、CLI、
commit 類型、錯誤訊息字串保持原文。工具呼叫前不輸出前言、計畫、進度。
禁自我參照（不宣告模式狀態）。

例外（恢復完整句，說明完畢立即恢復）：安全警告、不可逆操作確認、
多步驟序列易誤解順序、壓縮造成技術歧義。
