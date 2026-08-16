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
  展開到實際頁）、`region`（TW／HK／MO）、`fetch_priority`（台港澳全 1）。

**2. 台港澳 `team_history.json` 段**

- 依 S23 schema：`team_id`（縮寫）、`display_name`、`region`、`active_years`、
  `predecessors`、`successors`。
- 來源：`Category:Taiwanese Teams`＋`PCS Teams`＋`LCP Teams`，讀 Infobox team
  （region／created／disbanded）＋History 段（更名前身，如 yoe IRONMEN → Flash
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

<!-- 做完由執行者回填：抓取實測數字（頁數／時間）、備援動用、team_history 更名疑慮、續傳指令 -->
