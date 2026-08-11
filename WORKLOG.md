# WORKLOG — 電競人生（esportlife）

## 2026-08-11 — v3.0.0：單檔 HTML 拆成分層 ES 模組，修掉一批致命錯誤

- **方向**：v2 是一個 987 行的 `index.html`，CSS／資料／規則／流程／DOM 全塞在同一個
  `<script>` 裡，而且實際上**在載入時就會崩潰**（`$` 定義成 `querySelector`，卻到處寫
  `$('log')` 少了 `#`）。目標是重新分層、讓規則可測，並把設計文件寫了卻沒實作的東西補齊。

- **改動**：
  - 架構拆成 `src/{core,data,engine,ui}`，依賴單向：`data ← engine ← ui`。零建置、原生 ESM。
  - 生涯流程由回呼金字塔改寫成 **generator 流程機**（`src/engine/game.js`），
    UI 透過 beat 協定（card／choice／alloc／checkpoint…）驅動。引擎完全不碰 DOM。
  - 新增 `tests/headless.mjs`：在 Node 裡跑 160 段完整生涯，驗種子決定論、不變式、
    評價分布、合成、版本落差方向、FA 分級、解散名單過濾。`node tests/headless.mjs`。
  - 修正的關鍵 bug（完整清單在 CHANGELOG）：載入即崩潰、`const` 重新賦值、
    每季旗標永不重置（季後賽冠軍／改寫史實／國際賽消耗）、版本補習方向寫反、
    海外選手 FA 被強制降級、史實解散可用時序漏洞繞過、「連續 3 次」不是連續、
    洗牌用隨機比較器破壞決定論、中路 OVR 漏算位置專屬能力。
  - 平衡：生涯評分重新校準（舊版人人「傳奇」）、年度獎項門檻收緊（舊版一段生涯堆 40 幾項榮譽）。
  - 新增：選手資料面板（隨時查能力／英雄池／版本落差／隊友／合約／素質）、存檔續玩、
    英雄池會成長、海外青訓路線真正可走、年度紀錄可折疊。
  - 文件：新增 `ARCHITECTURE.md`；改寫 `README.md`／`CHANGELOG.md`；
    `ESPORT-DESIGN.md` 更新數值並補〈規則對應表〉；`WIKI.md` 更新攻略。

- **更名整理**：移除多餘的 `yakyulife/` 巢狀資料夾（repo 內容移到根目錄，與 GitHub Pages
  實際服務的層級一致）、`YaKyoLife-WIKI.md` → `WIKI.md`、v2 改造計劃書移入 `docs/archive/`。
  GitHub repo 已由使用者改名為 `Vik1n9/esportlife`，本地 `origin` 已更新。

- **狀態**：完成。程式碼與文件都已就緒，headless 測試全綠，瀏覽器實跑過完整生涯
  （校園→青訓→主場→MSI→世界賽→退役結算→分享圖）無 console error。

- **下一步（未做，非阻塞）**：
  1. `leoggcat/yakyulife`（線上部署那份）尚未更名，README 的遊玩連結仍指向 `/yakyulife/`。
  2. 本次改動尚未 commit — 使用者未要求，故保留在工作區。
  3. 可再擴充的點：海外賽區的歷史解散事件、時代跨越時舊隊名的處置、更多事件卡。
