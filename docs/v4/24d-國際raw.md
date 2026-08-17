# S24d · 國際 raw

狀態：完成（2026-08-17）
前置：S24c
預估：1 session（量大 4–10 小時，中斷續傳承接，可跨 session 續跑）
推理難度：中
建議模型：Sonnet 5（`claude-sonnet-5`）
理由：執行密集。國際量大（1500–2500 頁）但那是執行時間不是決策量——續傳＋冪等
就是為跨 session 續跑設計（附錄 #74），不靠拆站。

---

## 為什麼做這件事

S24 拆四站最終站（2026-08-16 工作細則修訂，附錄 #74）。把國際 `target_players.csv`
清單對應的 raw 全部抓下來，`raw_data/` 國際段齊備後，S24 全站完成、S25（資料清洗）
解鎖。raw 進 repo（S23 定案：管線可從零重現、CC BY-SA 出處可稽）。

---

## 入口狀態

```bash
node docs/v4/next-station.mjs
```

回報本站（S24d）為下一站。S24c 已完成：國際 `target_players.csv`＋國際隊
`team_history.json` 補段在案，交接筆記有國際枚舉方式與備援預估。

---

## 範圍

### 要做

**1. 國際 `raw_data/` 全量抓取**

- 目標：S24c 清單的全部 URL（國際選手頁＋國際隊頁＋歷屆 Worlds/MSI 賽事頁＋
  四大賽區賽段頁）。
- `crawl.mjs` 分批抓（2–5s 間隔、續傳、冪等、固定識別 UA），raw 落檔不解析。
- 覆蓋缺口 → 照 23.7 三級備援（Leaguepedia 補抓標 `data_source`；synthetic 是
  最後手段，僅填充、敘事 tag 不含史實指涉）。

**2. 覆蓋驗證**

- 對照 S24c 清單逐筆確認可抓／不可得；備援動用處與原因寫進交接筆記。
- 重跑腳本冪等驗證：已抓 URL 全數跳過。

**3. S24 全站收束**

- 全部 raw（台港澳＋國際）在案 → `docs/v4/README.md` 狀態表 S24d 改完成，
  S25 解鎖。

### 不要做

- **不解析、不清洗**（S25）
- **不呼叫 LLM**
- 不碰 `src/` 與 `tests/`
- 不「順便修正史實」

---

## 要動的檔案

| 檔案 | 動作 |
| --- | --- |
| `tools/npc/raw_data/` | 國際 raw 全量 |
| `tools/npc/` 下新增國際分片檔（如需） | S24d 自有的分片邏輯（不回頭改 `crawl.mjs`） |
| `docs/v4/README.md` | 狀態表 S24d 改完成（收尾） |

---

## 規則與不變式

- 抓取頻率不超過規範；重跑冪等
- 備援救回的每一筆照實標 `data_source`
- 純工具站：`npm test` 前後完全不變

---

## 完成定義

- 國際目標 URL 全部抓取完畢（或依備援規則標記不可得）
- 備援動用處與實測覆蓋數字寫進交接筆記
- S24 全站完成：`node docs/v4/next-station.mjs` 回報 **S25** 為下一站

---

## 交接筆記

> 2026-08-17 完成。**本站是 23.7 備援規則第一次真正動用**：Liquipedia 對本執行
> 環境的出口 IP 做了 IP 級封鎖，國際段 891 頁全部由 Leaguepedia 取得。

### Liquipedia 封鎖：不是限流抖動，是 IP 級封鎖

S24c 交接筆記把 26 頁抓不到判斷為「持續性限流」，本站確認**比那更硬**：
`api.php` 回 `HTTP 429`，body 是 Liquipedia 的 **Rate Limited 頁**——
「Your IP address has been temporarily blocked」＋ Cloudflare Turnstile CAPTCHA，
明寫解封要**人工過 CAPTCHA**，且列出「共用 IP 被別人打爆」「代理／VPN」為常見
成因（本環境正是走共用出口的代理）。`crawl.mjs` 的 5s／15s／45s 退避重試對它
無效——退避是為 429 限流設計的，CAPTCHA 牆退避幾次都一樣。

實測（記在 `raw_data/crawl.log`）：`probe Faker` 三輪退避後失敗；
`crawl crawl_intl_all.txt` 起手兩頁（`007x`、`100 Thieves`）各吃滿退避後 FAIL。
⚠ **不要為了確認而反覆重打**——封鎖頁明寫「重複觸發可能變成永久」。

### 備援：Leaguepedia（23.7 第二級）

觸發條件 (b) 成立（國際賽參賽隊陣容整段抓不到，23.4 實體化池非要它們不可），
照 23.7 順序降到第二級。新增 `tools/npc/crawl-lp.mjs`（`crawl.mjs` **一行未動**）：

- 端點 `https://lol.fandom.com/api.php`，授權同為 CC BY-SA 3.0。
- **批次取內容**：`action=query&prop=revisions&rvslots=main`，一次 20 頁。
  Liquipedia 那邊是逐頁 `action=parse`（限流嚴格），這邊 891 頁只花 **約 100 秒**
  ——說明書預估的「4–10 小時」是 Liquipedia 逐頁抓的量級，換源後不成立，
  跨 session 續跑沒有派上用場（續傳邏輯仍在，冪等照舊）。
- 落檔名一律用 **Liquipedia 頁題**的 slug，下游照同一把鍵查；檔頭與 manifest
  逐筆標 `data_source=leaguepedia` ＋ 實際來源 URL。

### 頁題對照：兩站命名規則不同，先 map 再 crawl

`map` 子命令批次驗證候選頁題，**命中 1021／1021、零缺頁**。規則寫在
`crawl-lp.mjs`（改表不改產出檔）：

| 類型 | Liquipedia | Leaguepedia |
| --- | --- | --- |
| 選手消歧義 | `Uzi (Chinese player)`（國籍） | `Uzi (Jian Zi-Hao)`（本名） |
| 世界賽 | `World Championship/2017` | `2017 Season World Championship` |
| MSI | `Mid-Season Invitational/2015` | `2015 Mid-Season Invitational` |
| 賽段 | `LCK/2020/Summer` | `LCK/2020 Season/Summer Season` |
| 早年賽段 | `LCS/Europe/2013/Spring` | `EU LCS/Season 3/Spring Season` |
| LCK 舊名 | `LCK/2015/Spring` | `Champions/2015 Season/Spring Season` |
| 決賽段 | `LEC/2024/Finals` | `LEC/2024 Season/Season Finals` |

規則推不出來的走人工表 `MANUAL_TITLES`（10 筆：`LaMiaZealot`→`LaMiaZeaLoT`、
`Dplus`→`Dplus Kia`、Infinity 三個變體→`INFINITY` 等）。

### 消歧義：94 頁抓回來是目錄頁，解掉 81

⚠ **這是換源最咬人的地方**：Liquipedia「唯一那個用裸頁題」，Leaguepedia 對同名 ID
一律給 `{{DisambigPage}}` 目錄頁。剝掉國籍後綴去抓 `Ghost`，抓回來的是十個 Ghost
的清單，不是選手頁。`resolve` 子命令用**既有資料**（零額外來源）評分解回單一候選：

- 頁題括號的國籍／本名（`Uzi (Chinese player)` → `country=China`）
- 本地 Liquipedia 賽事頁 TeamCard 的 `pNflag=` 國碼（同 ID 出現兩種國碼視同無訊號）
- TeamCard 的 `posN=` 位置 vs Leaguepedia `role=`（只加分不扣分——選手會換位置）
- `team_history.json` 的隊伍賽區 vs Leaguepedia `residency=`（同理只加分）
- 隊伍目標另走一條：`region` 關鍵字（LCK→`Korean Team`）＋ `active_years` 年份
  對頁題（`Lyon Gaming (2017 Latin America North Team)`）

結果：**94 頁消歧義 → 解掉 81、未解 13**。未解的 13 筆
（`Apex`／`Archer`／`Aria`／`Jay (Taiwanese player)`／`Jelly`／`Lonely`／`Lucky`／
`Mimic`／`Mountain`／`Naru`／`Noway`／`Steal`／`Style`）**沒有猜**：`<slug>.wiki`
誠實留著那張消歧義頁，**每個候選的選手頁另外落檔**（94 個），清單寫進
`tools/npc/unresolved_disambig_lp.tsv`（每行：目標＋所有候選頁題）交 **S25 實體
對齊**——材料備齊，判斷留給有清洗後欄位的那一站。

另有 **1 筆型別不符**：`Rogue (Australian player)` 剝掉後綴撞上同名歐洲戰隊
（Leaguepedia `Rogue` 重定向到戰隊頁），抓回來是 `Infobox Team`。已查證修正為
`Rogue (Jake Sharwood)`（country=Australia、residency=PCS、role=Support，
與 MSI 2019 TeamCard 相符）並寫進 `MANUAL_TITLES`；`resolve` 現在會自動報
`TYPE-MISMATCH`，同類問題下次當場現形。

### ⚠ slug 相撞會蓋掉主源 raw（踩過兩次，兩處都已修）

落檔名是頁題 slug（`toLowerCase()` ＋非英數轉底線），**不同頁題可能同 slug**：

1. **目標 vs 目標**：S24b 抓的是 `SwordArT`／`KaSing`／`Naz`／`Pk`／
   `Ahq e-Sports Club`，國際清單裡是 `SwordArt`／`kaSing`／`NAZ`／`PK`／
   `ahq e-Sports Club`——大小寫不同、slug 相同。`crawl` 原本的跳過條件是
   「檔案存在 **且** manifest 有這個 title」，manifest 查的是主源那個拼法，
   查不到 → 判定沒抓過 → **7 個台港澳段 Liquipedia raw 被 Leaguepedia 版覆蓋**。
   已 `git checkout` 還原、刪掉 9 筆假來源 manifest 記錄，跳過條件改成**只看檔案
   存在**（要重抓一律走 `--force`）。
2. **候選 vs 目標**：消歧義候選 `INFINITY` 撞上目標 `Infinity`，同樣把目標 raw
   蓋掉。候選落檔也改成只看檔案存在。

驗證方式：`git status` 有 `M`（modified）的 `raw_data/*.wiki` 就是踩到了——
純新增站不該修改任何既有 raw。

### 實測覆蓋

| 類型 | 目標 | Liquipedia | Leaguepedia |
| --- | --- | --- | --- |
| 國際選手頁 | 738 | 7 | 731 |
| ↳ CSV 是 744 列 | 6 列的 `wiki_url` 底線／百分號編碼寫法不同、反解後同頁題（`Viper (Korean player)` 等，24a 頁題陷阱第 3 點），去重後 738 | | |
| 國際隊頁 | 148 | 14 | 134 |
| Worlds／MSI | 26 | 26 | 0 |
| 四大賽區賽段 | 109 | 83 | 26 |
| **合計** | **1021** | **130** | **891** |

- `raw_data/`：**1347 檔、11 MB**（本站前 395 檔／3.4 MB），manifest 去重 1378 筆
  （Liquipedia 393、Leaguepedia 985，後者含 94 個消歧義候選頁）。全部進 repo
  （S23 定案）。
- **冪等重跑實測**：`node crawl-lp.mjs crawl map_intl_lp.tsv` → 待抓 0、跳過 1021。
- **零缺頁**：目標 1021 筆全部有檔，無 MISS、無 synthetic（23.7 第三級**未動用**）。
- `npm test` **22792 項全綠**（純工具站，`src/`／`tests/` 一行未動，測試數不變）。

### 續跑指令

```bash
cd tools/npc
node gen-crawl-list-intl.mjs                              # → crawl_intl_all.txt（1021 頁）
node crawl.mjs crawl crawl_intl_all.txt                   # 先試 Liquipedia（本環境全 429）
node crawl-lp.mjs map crawl_intl_all.txt --out map_intl_lp.tsv
node crawl-lp.mjs crawl map_intl_lp.tsv                   # 冪等：已抓的跳過
node crawl-lp.mjs resolve map_intl_lp.tsv --out map_intl_lp_disambig_all.tsv
node crawl-lp.mjs crawl map_intl_lp_disambig_all.tsv --force
```

### 留給 S25 的三件事（都是換源帶來的）

1. **兩種 wikitext 格式**：台港澳段＋Worlds/MSI＋83 個賽段是 Liquipedia
   （`{{TeamCard}}`／`{{Infobox player}}`），國際選手／隊／26 個賽段是 Leaguepedia
   （`{{TeamRoster}}`＋`{{TeamRoster/Line|player=|flag=|role=}}`／`{{Infobox Player}}`）。
   欄位名大小寫都不同（`Infobox player` vs `Infobox Player`），解析器要吃兩套。
2. **Leaguepedia 賽段頁有靜態名次**：`{{TournamentResults/Line|place=N|team=…}}`
   ——24a 判定「名次走 LPDB、靜態抓不到」的結論**只對 Liquipedia 成立**。
   ⚠ 但那是例行賽名次，該 split 的冠軍在另一頁（`…/Summer Playoffs`），
   **不在本站清單內**；要用它關掉 S24c 的 26 個 split 冠軍缺口，得先補抓 Playoffs
   子頁（Leaguepedia 沒被封，成本很低）。
3. **Leaguepedia 選手頁的戰績同樣是 Cargo 驅動**（`{{PlayerResults}}` 空模板），
   靜態 wikitext 只拿得到 Infobox 事實（country／residency／role／出生年／退役旗標）
   ＋Biography 散文。`career.finishes` 仍得從賽事頁的名冊／名次反推，兩站皆然。

### 未一起處理

- **OCR 審查閘門未跑**：本環境無 `ocr` CLI（與 8/17 手機版面站同樣情形），
  改以 `npm test` ＋上述覆蓋掃描代替，下次有環境時補審
  （`ocr review --audience agent -c HEAD`）。
- S24c 遺留的 26 個 split **冠軍判定**缺口**未關閉**：頁抓到了，但抓的是
  Leaguepedia 格式，`gen-target-intl.mjs` 的 qualifier 反推邏輯讀的是 Liquipedia
  `{{TeamCard|qualifier=}}`，**兩個生成器本站刻意沒重跑**（重跑不會多認出東西，
  只會把 Leaguepedia 格式當成沒有 TeamCard 的空頁）。關掉它的路子見上一節第 2 點。
- 未補抓 109 個賽段頁的 Leaguepedia 版本。Leaguepedia 的 `TeamRoster` 帶**消歧義
  後的正式頁題**（`player=Noah (Oh Hyeon-taek)`），對 S25 實體對齊價值很高、
  成本約 6 個請求——本站沒做是守著「只抓 S24c 清單」的範圍，S25 要就自己抓。
- `team_history.json`／`target_players.csv` **本站一字未動**（本站只抓 raw）。
