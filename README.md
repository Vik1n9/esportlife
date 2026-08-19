# 電競人生：LoL 職業選手生涯模擬

純文字的 LoL 電競選手生涯養成遊戲。從 2015 年網咖出道，一路打進職業的完整生涯模擬，退役時生成專屬生涯傳記。

**[點我直接遊玩 Demo 版](https://vik1n9.github.io/esportlife/)** ·
**[點我直接遊玩Alpha 內測版](https://vik1n9.github.io/esportlife/alpha/)** ·
**[事件和特質內容編輯器](https://vik1n9.github.io/esportlife/tools/)**

| 版本 | 連結 | 說明 |
| --- | --- | --- |
| Demo | [vik1n9.github.io/esportlife](https://vik1n9.github.io/esportlife/) | 從職業，只有三年期程（36 個月）。期滿未觸發結局即以「DEMO 結束」收束，適合快速體驗核心玩法 |
| Alpha 內測 | [vik1n9.github.io/esportlife/alpha](https://vik1n9.github.io/esportlife/alpha/) | 從業餘開始的完整生涯。框架已架好，內容持續擴充中 |
| 內容編輯器 | [vik1n9.github.io/esportlife/tools](https://vik1n9.github.io/esportlife/tools/) | 事件卡／特質卡／任務卡／配方／天生特質的網頁編輯器。設計後可下載 `.js` 片段，歡迎PR給我 |

> 本專案**靈感來自** [YaKyuLife（棒球生涯模擬器）](https://github.com/LeoGGcat/yakyulife)，
> 但不含原作者程式碼，詳見「[授權與出處](#授權與出處)」。

## 遊戲特色

- **中度史實演進**：主場聯賽隨年份演進（LMS→PCS→LCP），賽段結構逐年（2015 春／夏→2025 三賽段），MSI（2015+，2020 停辦），世界賽賽制（小組賽→入圍賽→2023 起 Swiss），席位數與種子序制度隨年份切換。
- **MSI 與世界賽**：賽制依照過去歷史搭建。俱樂部賽事，門票發給戰隊——賽段冠軍去得了 MSI，世界賽看種子序，最後一張門票要打地區資格賽。衛冕者會真的出現在你的淘汰賽籤表裡。
- **月回合制**：一年十二個月，每月選一個訓練活動或休息。賽事月（季後賽／MSI／世界賽）不訓練，改走五拍賽事事件序列。
- **體力是資源**：0–100，訓練與出賽都會消耗，休息與每月自然恢復會回。低了訓練成功率下滑、大失敗風險提高。
- **賽事事件序列**：賽前敘事、備賽戰術、戰術結算、比分、賽後敘事與心理結算，每個 BO 系列五拍。
- **種子只決定天賦**：起始屬性、潛力天花板、天生特質（0／1／2 個）、性格底色與生命週期曲線由種子決定。同一個種子可以反覆玩出不同的人生。
- **天生特質**：種子生成時可能帶 0–2 個天生特質（鐵人、玻璃體質、天生抗壓等），是「出生即持有」的隱藏特質，可當合成素材。
- **先發不是必然**：打不到隊伍平均、默契見底、傷癒回歸位子被頂，都會被下放板凳。
- **老將長壽機制**：成長與衰退是同一條生命週期曲線的兩面，各屬性有自己的巔峰年齡與衰退速率；「老將靠意識吃飯」是參數的自然結果，不是寫死的特例。
- **市場淘汰制**：沒有退役硬上限——衰退曲線自然進行，自由市場沒人報價時就只剩退役，退役走三層事件（特殊結局→選項→結算）。
- **歷史解散與改寫**：真實在該年解散的隊伍，若玩家在隊且未帶隊奪世界冠，季末強制解散進入自由市場。
- **四階特質合成**：通用 → 稀有 → 史詩 → 傳說，概念取自 LoL 道具合成，越往上疊生涯天花板越高；稀有與史詩素材分屬兩池，可以同時養。傳說只能由生涯任務卡發放。
- **兩層養成**：玩家只經營六屬性（體能／靈巧／意識／技巧／默契／決斷，0–100，越接近潛力天花板長得越慢）；十二項技能由屬性加權導出、不能直接加點，位置身分決定哪些技能吃重。
- **十二技能**：對線／操作／視野／節奏／支援／資源控制／會戰／開團／保護／邊線／轉線／走位，依教練覆盤語彙設計。
- **隱藏心理六維**：抗壓／自信／動機／紀律／信任／韌性，不可見，只影響發揮穩定度與失誤率；玩家從事件結果與文本反推自己的心理狀態。
- **生涯任務卡**：傳說特質與替代性生涯路線的唯一發放口。跨回合目標與期限，legend 卡發傳說、route 卡（賽區統治者、流浪傭兵等五條路線）給平庸局明確的終點。
- **生涯傳記**：退役時依生涯事實自動拼接維基式總結，平庸局也有歷史定位。
- **五路養成**：上路／打野／中路／射手／輔助，搭配 8 隻真實英雄池、版本 Meta 與位置身分權重。
- **英雄池會成長**：出賽累積專精，池越深越吃得住版本大改動。
- **人生隨機事件**：86 張事件卡＋60 張訓練卡，取材自 LoL 社群與實況圈梗；條件命中優先，狀態對了該來就來。
- **細緻數據**：K/D/A、CS、視野、傷害占比、單殺、MVP，逐季累積結算。
- **隨時查閱選手資料**：六屬性與潛力刻度、位置技能、英雄專精、版本落差、隊友與教練、合約狀態、體力與已持有特質。
- **存檔續玩**：每年年初自動存檔，關掉分頁也接得回來。

## 遊玩方式

- 開局選擇 ID 與位置，可輸入自訂種子碼（同種子＝同天賦——含天生特質組合——但人生每次都不一樣）。
- 每月在健身房／團隊訓練賽／戰術覆盤／SOLO RANK／VOD 研究／休息之間選一個行動——六個選項對應六個基礎屬性，一主一副。訓練結果由訓練事件卡兩階段判定（成敗→檔位），成長幅度受體力、動機與潛力衰減影響；休息也給成長，越透支學得越多。
- 例行賽跟著月份出戰報，體力在同一個月扣。
- 季後賽／MSI／世界賽的每個系列賽，賽前在四項備賽戰術中選一項。
- 右上角 ☰ 隨時打開選手資料面板；↺ 重新開始。

## 授權與出處

本專案靈感來自 [YaKyuLife（棒球生涯模擬器）](https://github.com/LeoGGcat/yakyulife)，由 [LeoGGcat](https://github.com/LeoGGcat) 開發。最初的引擎骨架、事件卡與隱藏特質概念承袭自原版；該等承袭程式碼已在 S03–S05 全部淨室重寫完畢（血緣表見 `ARCHITECTURE.md`，重寫記錄見 `docs/v4/` 的 S02–S06），現今專案不含原作者程式碼。賽制、角色、數據與介面皆為 LoL 電競內容的原創改寫。

- 靈感來源：[LeoGGcat / yakyulife](https://github.com/LeoGGcat/yakyulife)
- 開發者：Vik1n9（esportlife）
- 授權：[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)（見 `LICENSE`）

### 授權說明

本專案以 **Creative Commons 姓名標示—非商業性—相同方式分享 4.0 國際版（CC BY-NC-SA 4.0）** 授權釋出。三個條件分別是：

- **姓名標示（BY）**：使用或改作本專案時，必須註明原作者（Vik1n9／esportlife）與出處，並標示是否修改過。
- **非商業性（NC）**：禁止以本專案或其衍生作品牟利。不得販售、接廣告、做商業代管或任何以商業優勢或金錢報酬為主要目的的利用。玩家之間免費分享、個人遊玩與學習改作都屬於允許範圍。
- **相同方式分享（SA）**：若改作或衍生本專案，衍生作品必須以相同授權（或 CC 認可的相容授權）釋出，不得換成更嚴格的條款。

過去曾以 MIT 授權釋出，於 2026 年改為本授權，兩者互不相容（MIT 允許商用），故以 `LICENSE` 內的現行條款為準。本專案本身為非營利粉絲致敬作品，此授權與 Riot Games 政策並無關聯，Riot 相關名詞的使用規範仍見下方「介面與素材」。

### 介面與素材

- 介面視覺語彙對齊 tftactics.gg：深藍色階、藍色動作、金色狀態、terracotta 階段底線，長文可讀性優先。
- 字型使用 OFL 授權的 Inter / Noto Sans TC（由 Google Fonts 載入，離線時自動回退系統字型）。
- 本專案為非營利粉絲致敬作品，依 Riot Games「Legal Jibber Jabber」政策使用相關名詞；未使用任何 Riot 旗下圖片、圖示或商標。Riot Games 並未背書或贊助本專案。詳細規範見 <https://www.riotgames.com/en/legal>。

依 Riot Games 政策規定，附英文聲明（English notice, as required by Riot Games' policies）：

> ESPORTLIFE was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
>
> ESPORTLIFE isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

## 本機開發

零建置、零相依。但 ES modules 需要 HTTP 協定（直接開 `file://` 會被 CORS 擋），所以請起一個靜態伺服器：

```bash
npm run serve
```

（＝`python3 -m http.server 8080`，然後開 <http://localhost:8080>。）

跑回歸測試（需要 Node 18+，不需要 `npm install`）：

```bash
npm test                   # 或 node tests/run.mjs
node tests/run.mjs kernel  # 只跑某一區（kernel／phases／history／regression）
```

引擎完全不依賴 DOM，所以這套測試會在 Node 裡實際跑完 160 段生涯，並驗證體力節奏、訓練事件卡、四階特質合成、條件語言、史實賽制、市場淘汰與退役結局。目前 19919 項檢查全綠。

## 文件

- 架構說明：`ARCHITECTURE.md`
- 完整設計規格：`ESPORT-DESIGN-V4.md`（v4.5.3，V4 重建定案版，與軟體版號同一套；舊版 `ESPORT-DESIGN.md` 已標記為被取代）
- 攻略：`WIKI.md`
- 更新記錄：`CHANGELOG.md`
- 開發日誌：`WORKLOG.md`
- v4 重建工作說明書（全表 53 站，主線 S01–S22 共 39 站完成，庚辛兩組 14 站未開工）：`docs/v4/README.md`
- 內容編輯器（事件卡／任務卡／特質／配方，開發者用）：`tools/README.md`
- v4 賽制設計稿：`docs/superpowers/specs/2026-08-11-lol-competition-format-design.md`
- v2 時期的改造計劃書（存查）：`docs/archive/改造計劃書-v2.1.md`

## 開發路線

V4 重建主線（2026-08-11～08-16，S01–S22 共 39 站）已全部完成：月回合制、設施制訓練、十二技能、隱藏心理六維、教練評價、生命週期曲線、體力系統、事件卡 86＋訓練卡 60＋任務卡 25、特質編輯器、三層退役、生涯傳記與 DEMO 組裝（三年期程）都已上線。

後續兩個大方向已定案在規格書：

| 方向 | 規格章節 | 內容 |
| --- | --- | --- |
| 庚 · NPC 選手與戰隊（S23–S30） | §23 | Liquipedia 資料目錄、逐選手對手模型、母體百分位，施工未開始 |
| 辛 · 賽事模擬與戰績參照（S31–S36） | §24 | 背景模擬引擎、微觀數據、玩家戰績參照系，施工未開始 |
