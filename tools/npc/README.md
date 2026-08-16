# tools/npc —— 庚組 NPC 資料線

庚組（S24–S27）的抓取與生成工具。這條線的產出是「史實 NPC 選手與戰隊」的靜態
資料檔（`src/data/npc/*.js`，遊戲執行時只讀靜態檔）。

```
tools/npc/
├── crawl.mjs          Liquipedia 抓取工具（零相依，Node 18+）
├── README.md          本檔
└── raw_data/          整頁 Wikitext 原始抓取（進 repo，CC BY-SA 可稽）
    ├── manifest.jsonl 成功記錄（冪等／續傳的依據）
    └── crawl.log       缺頁／重定向／退避記錄
```

下游中間產物（`team_history.json`、`cleaned_players.json` 等）由後續站（S24b 起）
在此目錄生成；**遊戲資料**一律 ESM `.js`，JSON 只准住在 `tools/npc/` 內
（規格 §23.3）。

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