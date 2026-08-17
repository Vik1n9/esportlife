# S24c 返工計畫 —— team_history.json 國際段補缺隊

> 2026-08-17 由 S24c 執行者（返工）記錄。來源：S25 交接筆記＋
> `clean/missing_teams.md`（S25 隊名對齊時發現 **118 隊**缺失，262 名 CSV 選手、
> 431 人次受影響）。本站返工後，S25 重跑 `node gen-clean.mjs` 即可續做。

## 返工完成（2026-08-17）

- **`team_history.json`：174 → 300 隊**（台港澳段 42 不動，國際段 132 → 258）。
- 缺隊清單 121 隊實體全部收齊（含補抓的 26 頁賽段頁掃描）；重跑冪等
  （三次重跑新增 0 隊）。
- **region 一律賽區代碼**（LCK/LPL/LEC/LCS/PCS/LMS/LCP/GPL…），不依國籍分
  TW/HK/MO（2026-08-17 使用者拍板，見下「規則」）。
- `node gen-clean.mjs` 重跑：pending_team_alias 159 → **38 隊**（消 121）。
  殘餘 38 隊皆「頁題縮寫變體」（KCORP→Karmine Corp、TT CN→ThunderTalk
  Gaming…）或早期頁隊（2012 Champions 的 DDoL/StarTale…）——歸 S25
  別名層（`team_alias.json`）補映射，非隊缺失。
- `npm test` 22792 項全綠（純工具站，`src/`、`tests/` 未動）。

### 實作要點（踩過的坑，重跑或複用時注意）

1. **枚舉源擴充**：`teams_intl.txt` ∪ 全部已抓賽事頁 TeamCard 隊名 ∪
   `EXTRA_TEAMS`（LEC/LCK 2023+ 用縮寫 team= 且無 TeamCard，掃不到，人工補，
   帶人工 region）。
2. **NFC 正規化**：`NAME_ALIASES` 查詢 key 必須過 `normKey()`（NFC+lower）——
   組合字（İstanbul U+0130 vs i+U+0307）不一致會每輪重跑多收一隊
   （實測 IWC→IWC2→IWC3 無限膨脹）。
3. **existingNamesLower 比對也要過 applyAlias**：display_name（İstanbul
   Wildcats）與掃描收斂 key（wild cats）不同就會重複收隊。
4. **頁題縮寫不各自成隊**：LPL 2025 的 `TT CN`／`UP CN`／`AL CN`／`NIP CN`
   team= 是 Liquipedia 隊頁題縮寫，實體隊（ThunderTalk Gaming 等）已收，
   縮寫由 S25 別名層映射。
5. **region 訊號**：qualifier= 優先；沒有時退回頁題賽區前綴（`pageRegion`，
   slugify 後比對——Garena Premier League 開頭是 `garena_`，直接比原文會
   漏）。全數 qualifier 與頁題都無訊號才 UNCLASSIFIED（返工後 21 隊，皆
   Worlds/MSI 外卡隊）。

## 返工範圍（缺隊影響的站點）

| 站 | 狀態 | 缺隊影響 |
| --- | --- | --- |
| S24a（target_players.csv） | 已完成 | **不受影響**——選手清單與隊無關 |
| S24b（台港澳目錄與 raw） | 已完成 | **不受影響**——raw 檔已全（1349 檔） |
| S24c（team_history.json） | **返工（本站）** | 缺 118 隊（根源站） |
| S24d（國際 raw） | 已完成 | **不受影響**——選手頁題映射與隊無關 |
| S25（資料清洗） | 進行中（暫停） | 不算返工——S24c 補隊後重跑 `gen-clean.mjs` 續做 |
| S26 以後 | 未開始 | 不算返工——補隊後照常 |

注意：S27（參數生成）吃 `cleaned_players.json` 的 career 名次算潛力——
S25 重跑後的輸出變動會流進 S27，屬「輸入更新」，非返工。

## 根因（S24c 收隊規則 vs split 頁名冊）

`team_history.json` 國際段（S24c）只收兩類隊（`teams_intl.txt`）：

1. Worlds／MSI 參賽隊（148 隊頁）
2. 已判定冠軍的 split 冠軍隊（79＋4 個）

但 **split 頁名冊（TeamCard／TeamRoster）涵蓋該季全部參賽隊**——不只冠軍隊。
S25 清洗時，這些「全參賽隊」的選手（很多是 CSV priority 1／2 選手生涯的
早期年份）在 `team_history.json` 找不到 `team_id`，名冊事件無法入帳。
例：`1xn`（TW 選手）打 LPL 2023–2025 效力 ThunderTalk Gaming——TT 不在
team_history，1xn 的 LPL 年份全部丟失，`career` 為空。

LPL 2025 起 Liquipedia 隊頁題改縮寫（`TT CN`／`UP CN`／`AL CN`／`NIP CN`），
缺隊清單混入「頁題縮寫變體」，歸 S25 別名表收斂（見規則 2）。

## 返工內容（三件）

1. **枚舉源擴充**：`gen-team-history-intl.mjs` 枚舉源從 `teams_intl.txt`
   擴為「該清單 ∪ 全部已抓賽事頁 TeamCard 出現的隊」：
   - `events_champions.txt`（109 頁，含返工前補抓齊的 26 頁）
   - `events_worlds_msi.txt`（26 頁）
   - `events_twhkmo.txt`（31 頁，新增——PCS/LMS/LCP/GPL 賽事頁的外賽區隊，
     如 Berjaya Dragons、BOOM Esports、Hong Kong Esports）
2. **人工表擴充**（同構於既有表，重跑冪等）：
   - `ABBREVIATIONS_INTL` 補電競圈已知縮寫（TT/UP/AL/V5/RW/RA/XL/S04/ROC/
     CJ/CJB/CJF/MVP/SB/HKE/BOOM/GZ…，見腳本內）
   - `NAME_ALIASES` 收同隊跨年頁題變體（SKT 姊妹隊、KT 二隊、Jin Air
     Falcons/Stealths→JAG、DWG KIA→DWG、MiG Frost→Azubu Frost、
     NaJin Shield/e-mFire→NJW/NJS、Freecs→AF、KSV→GEN、DragonX→DRX 等）
3. **region 規則定案**（2026-08-17 使用者拍板）：**賽區身分一律認賽區代碼**
   （LCK/LPL/LEC/LCS/PCS/LMS/LCP/GPL…），**不依國籍分 TW/HK/MO**——LoL 賽事
   規則認賽區名，與選手／戰隊國籍無關。台港澳段（S24b）的 TW/HK/MO 標記是
   歷史產物，只代表抓取優先級分群，不當實體語意用。S25 起處理選手與隊伍
   資料時一律以此為準。

## 規則（返工期間不變式）

- **隊名層分工**：`team_history.json` 收「實體隊」（Liquipedia 顯示名／頁題）；
  「頁題縮寫變體」（TT CN、UP CN、XL、SB、LSB、DWG KIA…）**不各自成隊**，
  由 S25 的 `team_alias.json` 別名表收斂到實體隊 team_id（S25 續做時補別名）。
  二隊／姊妹隊（SKT K/S、KT Bullets…）同規則，不各自成隊。
- 每筆 `player_id` 唯一；`team_id` 必須存在於 `team_history.json`
- 台港澳段（S24b 已收 42 隊）**不動**；region 一律賽區代碼，不編造 ISO 國碼
- 純工具站：`npm test` 前後完全不變
- 重跑冪等：`node gen-team-history-intl.mjs` 只疊加新隊，不動既有內容

## 完成定義（驗證方式）

- `team_history.json` 國際段含全部 split 頁全參賽隊（含補抓的 26 頁）
- `missing_teams.md` 缺隊清單逐隊核對：實體隊全進 team_history；
  頁題縮寫變體（TT CN 等）確認對應實體隊已收、變體列進 S25 待補別名清單
- 重跑 `node gen-clean.mjs` 驗證缺隊數收斂（S25 續做動作，本站只驗證到
  缺隊來源消失為止；cleaned_players.json 的產出變動屬 S25 的活）
- `node docs/v4/next-station.mjs` 回報 **S25** 為下一站（狀態表同步）
- 純工具站：`npm test` 22757 項全綠（基線不變）

## 未一起處理

- `active_years` 近似值、`region=null` 隊（qualifier 訊號不足）、同隊頁題
  漂移未窮舉——維持 S24c 原裁決，不阻塞 S25
- 26 頁賽段頁抓取失敗（限流）已在 S24d 期間補抓齊（raw 檔實測全在），
  此返工不需再抓任何頁面
- LCP 2025 外賽區隊（DFM/SHG/GAM/MVK/TSW/GZ/GZA/ACK/SWPE，S24b 過濾出段）
  未全部在缺隊清單（S25 名冊未撞到），本返工不主動加；S25 撞到再補
