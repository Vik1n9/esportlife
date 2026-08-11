# WORKLOG — 電競人生（esportlife）

## 2026-08-11 — v3.1.0：起點改為「網咖盃賽」

- **方向**：S2（2012）的台灣沒有校隊、也沒有校際聯賽，「校園電競」這個起點是後來
  才有的東西，套在 2012 年開局上不成立。當年的業餘場景是網咖包台、網咖自辦盃賽、
  排位路人王，選手從網咖被看到再被找去試訓。
- **改動**：`LEAGUES.ACAD` → `LEAGUES.AMATEUR`（名稱「網咖盃賽」）、`stage` 同步改名、
  分區名「校園」→「業餘」、隊名改為網咖聯隊一類、新增 `AMATEUR_CUPS` 讓業餘階段的
  戰報掛上當年盃賽名稱、開場與路口敘述改寫。數值（par／min／games／薪資）全部未動。
  存檔 `SAVE_VERSION` 3 → 4（舊存檔的 `stage` 為 `'ACAD'`，直接失效重開）。
- **狀態**：完成。headless 測試全綠（新增 bucket 名稱與起始階段兩項檢查），
  瀏覽器實跑過完整生涯，結算表顯示「業餘」，無 console error。

## 2026-08-11 — v3.0.1：事件文本與論壇對話在地化

- **方向**：把固定的事件卡與退役留言從「制式敘述」改成更像 LOL 討論區（PTT／巴哈／
  虎噗）的語氣——事件卡加入版本答案、0/10/0、666、斗內、梗圖、宮鬥劇等 LOL 事件與梗，
  退役留言改成連串網民回覆，並放進盲僧、鱷魚、狐狸、VN、瑟雷西等英雄暱稱。
- **改動**：僅修改 `src/data/events.js` 的 `EVENT_CARDS` 敘述與 `FAN_QUOTES`；
  `id`／`name`／`kind`／`ability`／`flags` 完全未動，事件判斷與能力增減不受影響。
- **狀態**：完成。headless 回歸測試全綠。

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

- **部署**：已 commit 並 push 到 `Vik1n9/esportlife` 的 `main`。GitHub Pages 已啟用
  （來源 `main` 根目錄，強制 HTTPS），正式網址 <https://vik1n9.github.io/esportlife/>，
  線上實跑過完整生涯無 console error。舊網址 `leoggcat.github.io/yakyulife/` 是另一個
  帳號的舊部署，停留在 v2，不再更新。
  `Vik1n9/esportlife` 已解除 fork 關係（`fork: false`、`parent: null`），成為獨立專案。

- **下一步（未做，非阻塞）**：可再擴充的點——海外賽區的歷史解散事件、
  時代跨越時舊隊名的處置（例如球隊撐過賽區更名）、更多事件卡。
