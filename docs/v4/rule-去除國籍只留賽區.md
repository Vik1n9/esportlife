# 去除國籍、只保留賽區——規則書修訂記錄

> 2026-08-17 使用者提出：**隊伍與選手一律不看國籍，只看賽區區域**
> （例：HKA 國籍中國香港、賽區 LMS——資料處理去除國籍，只保留賽區）。
> 本檔記錄規則書與此規則的合規／不相合處。規則書由使用者自行修訂。

## 合規（不需改）

| 文件 | 位置 | 現況 |
| --- | --- | --- |
| 規格書 `ESPORT-DESIGN-V4.md` | 全文 | 無「國籍／country／nationality」字眼，賽區體系（regions）本來就不含國籍 |
| `docs/v4/23-NPC規格增訂.md` | schema | npc_roster 欄位無國籍 |
| `docs/v4/25-資料清洗.md` | 107-108 行 | 已明寫「不依國籍分 TW/HK/MO」「S25 對齊與 S27 生成勿用國籍」 |
| `docs/v4/24c-國際目錄.md` | 109 行 | 已寫「不依國籍分 TW/HK/MO——LoL 賽事認賽區名與國籍無關」 |

## 不相合（需修訂）

### 1. team_history.json 台港澳段 region 存國籍（資料＋生成器）

- **現況**：`team_history.json` 的 region 欄混兩種語義——台港澳段 42 隊
  （TW 37、HK 5）來自隊頁 Infobox 的 region／location 欄（國籍），國際段
  （LCS/LCK/LPL/LEC/PCS/LMS…）已是賽區。同一欄位兩種語義＝資料不一致。
- **根源**：`tools/npc/gen-team-history.mjs`（S24b 台港澳段生成器）檔頭
  「region 判定兩欄互補：先看 region 欄（taiwan/tw/jp/pacific/…），再看
  location 欄」——定義的就是國籍/地區。
- **需改成**：台港澳段 region 產出賽區（該隊主要賽區：LMS/PCS/LCP/GPL，
  例 HKA→LMS）。修訂 `docs/v4/24b-台港澳目錄與raw.md` 的 region 定義段落
  與 `gen-team-history.mjs` 判定邏輯後重跑。
- **注意**：一隊跨多賽區（ahq：GPL→LMS→PCS），單一 region 欄存「主要賽區」，
  實際賽區隨年份在 split 名冊（cleaned 的 career 事件帶 team_id，查表得賽區）。

### 2. S24a 説明書描述 raw 欄位含 country

- **現況**：`docs/v4/24a-探勘與管線.md` 64 行「選手頁：`Infobox player` 有
  `birth_date`／`country`／`roles`／`history`／`ids`」——只描述來源欄位。
- **需改成**：補一句「country 僅供頁題消歧義參考，清洗不保留」。

### 3. S24d 説明書描述選手頁 country 解析

- **現況**：`docs/v4/24d-國際raw.md` 127/144/160 行——頁題國籍後綴
  （`Uzi (Chinese player)`）與「`country=China` 解析」描述。
- **需改成**：頁題後綴是 Liquipedia 頁題標識（抓取消歧義用，與新規則不衝突），
  但「country 解析」應註明不進 cleaned_players.json（去除國籍）。

## 資料層現況（已合規）

- `cleaned_players.json`：選手層無 country 欄（parse 時讀過、組裝丟棄）✅
- `tools/npc/gen-clean.mjs`：career 事件只帶 team_id＋finishes，無國籍 ✅
- 台港澳 21 隊 region=null（gen-team-history.mjs 標 UNCLASSIFIED 人工補的殘留）：
  規則不衝突，但賽區缺值——修訂時可一併補（如 BT→GPL、BJK→TCL）。

## 待使用者拍板

1. 台港澳 42 隊的「主要賽區」判定標準（最後賽區？生涯主力賽區？）
2. 賽區值清單：LMS（2015-2019）／PCS（2020-2024）／LCP（2025）／GPL（2013-2014）
   在 team_history 是否併用，或統一以 split 名冊為準（cleaned 層）。