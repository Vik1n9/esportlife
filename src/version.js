/**
 * 應用程式版號——玩家看得到的那一個（右上角徽章、結算分享圖右下角）。
 *
 * 獨立成檔而不是留在 `main.js`，是為了讓 Node 測試 import 得到：`main.js` 在
 * 模組頂層就摸 `location`／DOM，在 Node 裡 import 會炸，版號因此從來沒被任何
 * 東西比對過，一路從 v4.0.0 漂到規格書 v4.5.3 都沒人發現。
 *
 * ⚠ **升版時三處一起改**：本檔、`package.json` 的 `version`、
 * `ESPORT-DESIGN-V4.md` 檔頭（AGENTS.md 版本編號規則：規格書版本號與軟體版本
 * 共用同一套 `X.Y.Z`）。零建置專案的瀏覽器讀不到 `package.json`，所以這裡只能是
 * 字面值——守住一致性的是 `tests/kernel/version.mjs`，不是程式結構。
 */
export const APP_VERSION = 'v4.6.0';
