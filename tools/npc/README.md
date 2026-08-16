# tools/npc —— 庚組 NPC 資料線

庚組（S24–S27）的抓取與生成工具。這條線的產出是「史實 NPC 選手與戰隊」的靜態
資料檔（`src/data/npc/*.js`，遊戲執行時只讀靜態檔）。

```
tools/npc/
├── crawl.mjs          Liquipedia 抓取工具（零相依，Node 18+）
├── gen-target-tw.mjs  target_players.csv 台港澳段生成器（S24b）
├── gen-team-history.mjs  team_history.json 台港澳段生成器（S24b）
├── gen-target-intl.mjs   target_players.csv 國際段生成器（S24c，冪等疊加）
├── gen-team-history-intl.mjs  team_history.json 國際段生成器（S24c，冪等疊加）
├── README.md          本檔
├── target_players.csv 選手清單（台港澳 S24b priority 1 ＋ 國際 S24c priority 2）
├── team_history.json  戰隊演變樹（台港澳 S24b ＋ 國際 S24c，同一份檔）
├── *.txt              分類枚舉／抓取清單（enum-cat 產出，可重跑再生）
└── raw_data/          整頁 Wikitext 原始抓取（進 repo，CC BY-SA 可稽）
    ├── manifest.jsonl 成功記錄（冪等／續傳的依據）
    └── crawl.log       缺頁／重定向／退避記錄
```

下游中間產物（`cleaned_players.json` 等）由後續站（S25 起）在此目錄生成；**遊戲資料**
一律 ESM `.js`，JSON 只准住在 `tools/npc/` 內（規格 §23.3）。

## 政策要點（違反會被整 IP 擋）

- **只走 MediaWiki API**：`https://liquipedia.net/leagueoflegends/api.php`。
  Liquipedia 使用條款明文禁止自動化存取非 API 的 HTML 頁面——不爬網頁版分類。
- **固定識別 UA**：`LiquipediaDataBot/1.0 (esportlife NPC data pipeline;
  github.com/Vik1n9/esportlife)`。UA 輪替違反政策，不要輪替；標頭只能 ASCII。
- **gzip 必帶**：漏掉 `Accept-Encoding` 回 406。Node 內建 fetch 自動送並解壓，
  不必手動處理。
- **速率**：每請求間 2–5 秒隨機延遲（內建）；429／5xx 自動退避重試
  （5s／15s／45s，尊重 `Retry-After`）。**不要並行跑多個 crawl.mjs 進程**——
  延遲是進程內狀態，多進程同時打會違反速率限制。
- **重用與快取**：已抓檔案重跑完全跳過（冪等），這是政策要求也是續傳機制。

## 用法

### 枚舉分類成員（→ 目標頁題清單）

```bash
node crawl.mjs enum-cat "Category:Taiwanese Players" --out 清單.txt
node crawl.mjs enum-cat "Category:Taiwanese Teams" "Category:PCS Teams" "Category:LCP Teams"
```

只列主命名空間（`cmnamespace=0`），自動分頁續傳，輸出排序去重。

### 批次存在性檢查（→ 覆蓋表）

```bash
node crawl.mjs check 候選清單.txt [--out 結果.tsv]
```

一次 50 個頁題，每行 `頁題<TAB>OK | MISS | REDIRECT→目標`。探勘覆蓋表與
S24b/c 的清單驗證都走這裡。

### 抓取（→ raw_data/）

```bash
node crawl.mjs crawl 清單.txt          # 已抓過的跳過（續傳）
node crawl.mjs crawl 清單.txt --force  # 重抓
```

每頁落 `raw_data/<slug>.wiki`（整頁 Wikitext，**不做任何解析**——解析是 S25 的活）。
檔頭寫來源 URL、抓取時間、CC BY-SA 3.0 註記。重定向自動跟隨，落檔名用輸入頁題、
manifest 記最終頁題與 `redirectTo`；缺頁記 `crawl.log`。

中斷續傳：抓到一半 Ctrl-C，重跑同一清單即只補缺的（判斷＝檔案存在且 manifest 有
記錄）。

### 其他

```bash
node crawl.mjs probe "頁題"        # 單頁元資料（存在／重定向／大小），不落檔
node crawl.mjs search "關鍵字"      # 全文搜尋找正確頁題（題名猜不到時）
```

## S24b 產物與重跑流程

`target_players.csv`（200 筆）與 `team_history.json`（42 隊）由 gen-*.mjs 從
枚舉清單＋raw 隊頁生成，全部可重現：

```bash
# 1. 重新枚舉分類（清單檔再生）
node crawl.mjs enum-cat "Category:Taiwanese Players" --out tw_players.txt
node crawl.mjs enum-cat "Category:Hong Kong Players" --out hk_players.txt
node crawl.mjs enum-cat "Category:Macau Players" --out mo_players.txt
node crawl.mjs enum-cat "Category:Taiwanese Teams" --out tw_teams.txt
node crawl.mjs enum-cat "Category:PCS Teams" --out pcs_teams.txt
node crawl.mjs enum-cat "Category:LCP Teams" --out lcp_teams.txt
# 2. 組隊清單＋全量抓取清單（選手/隊/賽事三分片合併）
cat tw_teams.txt pcs_teams.txt lcp_teams.txt | sort -u > teams_all.txt
node -e "讀 target_players.csv 的 player_id → players_twhkmo_final.txt"   # 或直接由 CSV 抽
cat players_twhkmo_final.txt teams_all.txt events_twhkmo.txt | sort -u > crawl_twhkmo_all.txt
# 3. 重新生成產物
node gen-target-tw.mjs            # → target_players.csv
node crawl.mjs crawl teams_all.txt  # 隊頁 raw（gen-team-history 的原料）
node gen-team-history.mjs --all   # → team_history.json（人工表 ABBREVIATIONS/RENAMES 已內建）
```

⚠ `gen-team-history.mjs` 的 `ABBREVIATIONS`（縮寫）與 `RENAMES`（更名/繼承）是
**人工維護的單一來源**（電競圈通用縮寫＋隊頁散文明示的繼承關係，2026-08-16 定案）。
重跑會用表內值覆寫輸出，不要改產出檔、要改表。`--all` 只影響警告輸出。
賽事頁清單（`events_twhkmo.txt`，31 頁）手寫維護：GPL 2012–2014 9 頁、
LMS 2015–2019 10 頁、PCS 2020–2024 10 頁、LCP 2025 3 頁（格式跨年不一，見
24a 頁題陷阱第 4 點）。

## S24c 產物與重跑流程

國際段（Worlds／MSI 全參賽隊＋LCK／LPL／LEC／LCS 歷年賽段冠軍隊）疊加進
`target_players.csv`（region=INTL、fetch_priority=2）與 `team_history.json`
（同一份檔）：

```bash
# 1. Worlds/MSI 賽事頁（26 頁，冪等）
node crawl.mjs crawl events_worlds_msi.txt
# 2. LCK/LPL/LEC/LCS 歷年賽段頁（109 頁，冪等——429 限流抓不齊時重跑只補缺的）
node crawl.mjs crawl events_champions.txt
# 3. 重新生成（都冪等：疊加進現有檔，不覆寫台港澳段／已有國際資料）
node gen-target-intl.mjs
node gen-team-history-intl.mjs
```

⚠ **冠軍判定不靠 MVP 猜測，靠 Worlds/MSI 頁 `qualifier=` 連結反推**（split 頁
本身的 `TeamPrizePool` 不含隊伍名、名次要靠 `{{ShowBracket}}` 走 LPDB，靜態
wikitext 抓不到，24a 已預警）——詳細判定邏輯與驗證見 `gen-target-intl.mjs` 檔頭
註解與 `docs/v4/24c-國際目錄.md` 交接筆記。`ABBREVIATIONS_INTL`／
`RENAMES_INTL`／`NAME_ALIASES` 是 `gen-team-history-intl.mjs` 內的人工維護表，
重跑改表不改產出檔。`team_history.json` 國際段的 `region` 是 Liquipedia 賽區
代碼（LCK/LPL/LEC/…），`active_years` 是已抓資料的年份窗近似值，**都不是**
Infobox 的權威欄位——精確值留給 S25 需要時另外抓。

## 探勘結論（S24a 實測，交接筆記全文在 docs/v4/24a-探勘與管線.md）

- **逐年覆蓋**：GPL 2012（Season 1／Opening Event）→ 2013–2014（Spring／Summer，
  2013 另有 Championship、2014 另有 Winter）；LMS 2015–2019 全；PCS 2020–2024
  全（**2019 無 PCS**，LMS 末代）；LCP 2025 三段（Season Kickoff／Mid Season／
  Season Finals）。
- **分類枚舉**：Taiwanese Players 143、Hong Kong Players 54、Macau Players 4、
  Taiwanese Teams 42、PCS Teams 13、LCP Teams 9。LMS 隊伍掛 Taiwanese Teams。
- **國際路徑**：賽事頁 `{{TeamCard}}` 模板直接內嵌參賽隊五位置隊員
  （p1–p6＋flag＋link 消歧義＋替補＋教練＋qualifier）——**「賽事頁 → 隊員」單頁
  可達**，S24c 國際枚舉不必逐隊展開。隊頁另抓（team_history：created／disbanded／
  更名）。
- **名次**：TeamCard 的 `placement=` 欄位手寫缺漏不可靠（2017 Worlds TSM 標錯、
  2012–2013 無欄、2025 無欄）——可靠來源是 `TeamPrizePool` Slot 與 Playoffs／
  Group Stage 子頁（`#section`）。
- **更名前身**：Infobox **無** predecessors 欄位；線索在 History 段散文
  （FW「founded as yoe IRONMEN」、G-Rex「接手 RG 席位」、Machi「接手 G-Rex
  席位」）與隊頁子 tab。隊頁 `FormerSquadAuto` 的 `name=` 是真實姓名——
  清洗時忽略（去姓名規則）。
- **備援**：探勘樣本 Liquipedia 全覆蓋，**未動用 Leaguepedia**（23.7 三觸發條件
  樣本內無一成立）；全量覆蓋表由 S24b／S24d 交接筆記補實測數字。

## 頁題陷阱（S24b／S24c 枚舉時注意）

- 頁題**首字母大小寫敏感**：`Ahq e-Sports Club`（小寫 ahq 會 MISS）。
- 消歧義後綴是正式頁題：`Maple (Taiwanese player)`、`Uzi (Chinese player)` 與
  `Uzi (Vietnamese player)` 是不同人（實體對齊關鍵）。
- link 格式空格／底線混用：`FATE (Korean player)` 與 `FATE_(Korean_player)` 都出現。
- 賽事頁題名跨年格式不一：`LMS/Summer/2017` vs `LMS/2018/Spring`。