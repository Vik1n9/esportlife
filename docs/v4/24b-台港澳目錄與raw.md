# S24b · 台港澳目錄與 raw

狀態：未開始
前置：S24a
預估：1 session
推理難度：中
建議模型：Sonnet 5（`claude-sonnet-5`）
理由：執行密集，但 team_history 更名比對與備援判定有判斷點。台港澳量小
（~1000 頁、2–2.5 小時），單 session 可收斂，故不拆兩站（附錄 #74）。

---

## 為什麼做這件事

S24 拆四站第二站（2026-08-16 工作細則修訂，附錄 #74）。把台港澳的史實資料搬到
本地：`team_history.json` 台港澳段（S25 實體對齊與 UI 隊名顯示的單一來源）、
`target_players.csv` 台港澳清單（priority 1 全量）、`raw_data/` 台港澳全量
（S25 清洗原料）。依 §23.1 去姓名：只存選手 ID 與戰隊縮寫。

---

## 入口狀態

```bash
node docs/v4/next-station.mjs
```

回報本站（S24b）為下一站。S24a 已完成：探勘覆蓋表＋`crawl.mjs` 基建在案，
交接筆記有實測技術要點（API 政策、枚舉入口、Infobox 欄位）。

---

## 範圍

### 要做

**1. 台港澳 `target_players.csv`（priority 1 全量）**

- 枚舉入口（24a 探勘前置知識）：`Category:Taiwanese Players`＋`Hong Kong Players`＋
  `Macau Players` 三分類合併、去重、扣掉「Error」類的亂入條目。
- 欄位：`wiki_url`、`player_id`（Liquipedia 頁題，含消歧義後綴處理——REDIRECT
  展開到實際頁）、`region`（TW／HK／MO，**抓取優先級分群，非國籍語意**）、
  `fetch_priority`（台港澳全 1）。

**2. 台港澳 `team_history.json` 段**

- 依 S23 schema：`team_id`（縮寫）、`display_name`、`region`、`active_years`、
  `predecessors`、`successors`。
- `region` 存**生涯主力賽區**（GPL／LMS／PCS／LCP，2026-08-17 去除國籍定案後由
  `gen-team-history.mjs` 的 `LEAGUE_REGION` 人工表判定，非 Infobox region 國籍）。
- 來源：`Category:Taiwanese Teams`＋`PCS Teams`＋`LCP Teams`，讀 Infobox team
  （created／disbanded）＋History 段（更名前身，如 yoe IRONMEN → Flash
  Wolves）＋頁面重定向。
- 更名／合併比對有疑慮就寫交接筆記，不「順便修正史實」。

**3. 台港澳 `raw_data/` 全量**

- 目標：台港澳全選手頁＋台港澳隊頁＋LMS／PCS／LCP 歷年賽事頁。
- 用 `crawl.mjs` 分批抓（2–5s 間隔、續傳、冪等），raw 落檔不解析。
- 有覆蓋缺口 → 照 23.7 三級備援（Leaguepedia 補抓標 `data_source`）。

### 不要做

- **不解析、不清洗**（S25）
- **不列國際清單**（S24c）、**不抓國際 raw**（S24d）
- **不呼叫 LLM**
- 不碰 `src/` 與 `tests/`
- 不抓選手真實姓名（§23.1；Infobox `name` 欄在清洗層就忽略，本站只抓 raw）

---

## 要動的檔案

| 檔案 | 動作 |
| --- | --- |
| `tools/npc/target_players.csv` | 台港澳清單（新建） |
| `tools/npc/team_history.json` | 台港澳段（新建；S24c 補國際段） |
| `tools/npc/raw_data/` | 台港澳 raw 全量 |
| `tools/npc/` 下新增枚舉／分片檔 | S24b 自有的清單邏輯（不回頭改 `crawl.mjs`） |

---

## 規則與不變式

- `team_history.json` 的 `team_id` 縮寫與 `npc_roster.json`（S27）一致——S23 schema 是權威
- 抓取頻率不超過規範；重跑冪等（已抓 URL 全數跳過）
- 純工具站：`npm test` 前後完全不變

---

## 完成定義

- `target_players.csv` 台港澳全量齊全（三分類合併去重後逐筆可抓）
- `team_history.json` 台港澳段完成，更名／合併筆數與疑慮寫進交接筆記
- 台港澳目標 URL 全部抓取完畢（或依備援規則標記不可得），重跑全數跳過
- `node docs/v4/next-station.mjs` 回報 **S24c** 為下一站（S24c 前置僅 S24a，可能已並行解鎖）

---

## 交接筆記

2026-08-16 完成。純工具站，`src/` 與 `tests/` 未動，`npm test` **22757 項全綠**
（基線 19928 起只增不減）。

### 產出（全在 `tools/npc/`）

- **`target_players.csv`**：200 筆（TW 143＋HK 54＋MO 3），priority 全 1，無重疊、
  無 MISS。扣掉 Macau 分類的亂入條目「Error」1 筆。`gen-target-tw.mjs` 生成
  （吃三個分類枚舉清單，重跑冪等）。
- **`team_history.json`**：台港澳段 **42 隊**（含外賽區 9 隊被過濾出段，留給 S24c
  裁決）。`gen-team-history.mjs` 生成，縮寫表（`ABBREVIATIONS`）與更名表
  （`RENAMES`）是人工維護的單一來源，重跑改表不改產出檔。
  ⚠ 2026-08-17 返工後台港澳段為 **41 隊**，`region` 改存**生涯主力賽區**
  （GPL/LMS/PCS），見下「返工」。
- **raw_data/**：**283/283 全抓齊**（選手 200＋隊 52＋賽事 31），重跑全跳過
  （抓 0／跳過 283／缺頁 0／失敗 0），零 MISS、零空頁。1.6 MB。

### 實測數字（抓取）

- 全量抓取約 **1.5 小時**（283 頁），**非** S24a 預估的 2–2.5 小時——前半被 429
  拖慢（見下），後半約 15 分鐘 20 頁。
- **429 限流比預期嚴**：探勘與隊頁階段每 1–2 分鐘被 429 一次，單頁退避三級
  （5s／15s／45s）後仍 FAIL 的不少（首輪 31 頁失敗）。crawl.mjs 的退避＋冪等
  續傳扛住了：失敗頁重跑自動補上，**不需任何人工介入**。收尾時限流自然緩解
  （最後一頁單次成功）。
- 教訓寫進 README：大規模抓取直接 `nohup … crawl` 背景跑＋輪詢 manifest 筆數，
  不要前景等；多進程並行（含 enum-cat/check 交錯）會加重限流。

### 更名比對（team_history 的 RENAMES，全部散文明示）

| 鏈 | 依據 |
| --- | --- |
| Raise Gaming → G-Rex（2017-09 接手席位） | G-Rex 頁 |
| G-Rex → Machi Esports（2020 席位＋隊員） | Machi 頁 2020 tab |
| Alpha Esports → Hurricane Gaming（2022 更名） | Hurricane 頁「formerly known as Alpha Esports」 |
| Hurricane Gaming → Dewish Team（2022 席位） | Hurricane 頁 |
| Meta Falcon Team → HELL PIGS（2023-01 席位） | Meta Falcon 頁 |
| Ahq → Beyond Gaming（2021 席位） | Beyond Gaming 頁 |
| Flash Wolves ← yoe IRONMEN（2013-04→08） | FW 頁（前身無獨立頁題，不列陣列） |
| MachiX ← 17 Academy | MachiX 頁（同上） |
| PSG Talon ← Talon Esports／TALON | PSG Talon 頁（同上） |
| BUFF ← Afro Beast | BUFF 頁（同上） |

⚠ **Infobox 沒有 predecessors 欄位**（與 24a 探勘一致）；更名前身只在散文，
S25 若要自動化 parse 更名，以「founded as／formerly known as／acquired the spot
of」三句式為關鍵字。

### 疑慮與裁決（寫給 S25／S24c）

- **Liquipedia region 欄與 location 欄互相矛盾**（2026-08-16 實測，已由返工取代——
  見下「返工」：region 改由 `LEAGUE_REGION` 人工表判定，不再讀 Infobox 兩欄）。
  實測四例仍留作 Infobox 品質警告：G-Rex（location=Hong Kong、region=taiwan）、
  HKA（location=Hong Kong、region=Taiwan）、Machi/TPA（region=Southeast Asia、
  location=Taiwan）、F-Soul（location=Hong Kong、region=tw）。⚠ 教訓：
  **S25 清洗選手頁時別信單一欄位**；選手頁的 country 欄也有同樣風險，實體對齊時
  以分類＋頁題消歧義為主。
- **active_years 有兩隊 null**：Fireball、G-Rex Infinite——Infobox created/disbanded
  全空，散文無年份。留 null，S25 從 TimelineSquadAuto 補或記缺失。（Taiwan 代表隊
  原為第三隊，返工後移出台港澳段。）
- **8 頁有 `{{Want_to_Help}}` 缺漏標記**：全在 GPL 2012–2014 賽事頁（Season 1、
  Opening Event、2013 S/S/C、2014 S/S/W）——與 24a 探勘「GPL 早期頁面有缺漏」
  一致。S25 遇到時核對名次欄（TeamPrizePool Slot 是可靠來源）。
- **SillySilly Gaming active_years [2026,null]**：created=2026-04-08，現役 PCS 隊，
  不是資料錯誤。
- **LCP 2025 外賽區隊**（DFM/SHG/GAM/MVK/TSW/GZ/GZA/ACK/SEM9/SEM9 WPE，共 10 隊）
  被過濾出台港澳段，隊頁 raw 已抓（零浪費）——S24c 決定國際段是否收（LCP 區域隊不是
  Worlds/MSI 隊，但 LCP 賽事頁顯示需要它們的縮寫）。

### 未一起處理

- 台港澳選手**不分區段抓取**——200 頁一次抓完；國際（S24d）才需要分批續傳。
- `probe`/`search` 未動用（頁題陷阱靠 24a 交接筆記避開，實測零 MISS）。
- 選手頁的 Infobox `name`（真實姓名）照 §23.1 忽略——S25 清洗層處理。

### 返工（2026-08-17，去除國籍只留賽區）

**方向**：`team_history.json` 台港澳段 region 原本存 Infobox 的國籍（TW 37／HK 5），
與國際段（賽區代碼）同一欄位兩種語義，違反 2026-08-17「去除國籍只留賽區」定案
（見 `docs/v4/rule-去除國籍只留賽區.md`）。返工把 region 改存**生涯主力賽區**
（GPL/LMS/PCS），判定標準由使用者拍板＝**主力年代**（非最後賽區）。

**實作**：`gen-team-history.mjs` 刪掉 `regionOf`（讀 Infobox region/location 兩欄
互補的那套，含 HKA/F-Soul 例外表）與 `LOCATION_TO_REGION`，換成人工表
`LEAGUE_REGION`（display_name → 賽區）。產出 41 隊：LMS 20／PCS 18／GPL 3。

- **Taiwan（國家代表隊）移出台港澳段**：其 region 本為國籍 TW，代表隊無聯賽賽區，
  改 null 後被過濾（42→41）。`TWN` 未被任何清洗/別名引用，零下游影響。
- **判定基準**：主力年代佔比；GPL→LMS 交界隊以 LMS 為主（TPA 等 2015 起主聯賽）；
  純 GPL 隊（TPS／GB）與早期 TeSL/GPL 身分隊（Wayi Spider）留 GPL；PCS 2020+ 隊
  留 PCS（CFO/DCG/PSG 現役 LCP 但主力 PCS，使用者例 PSG→PCS 為準）。
- **順手修的連鎖**：重跑 `gen-team-history-intl.mjs` 會重建 S25 已併的 `Taipei J
  Team`（TJ）——已在 `NAME_ALIASES` 加 `taipei j team → j team` 封掉（S25 交接
  筆記「建議加排除」落地）。`crawl-lp.mjs` 的 `RESIDENCY`／`REGION_KEYWORDS` 已涵
  LMS/PCS/GPL，無需改；LCP 刻意不列（LCP 跨台日越澳，無法映射單一 residency）。
- 台港澳段 `target_players.csv` 的 TW/HK/MO **不動**——那是抓取優先級分群，非實體
  語意，規則不衝突。

**狀態**：完成。`npm test` 項數不變（純工具站，`src/`／`tests/` 未動）。
`node docs/v4/next-station.mjs` 仍回報 **S24c**（返工不改狀態表）。
