# S20d · DEMO 起點校準

狀態：完成（2026-08-16）
前置：S20c
預估：1~2 session
推理難度：高
建議模型：Opus 5（`claude-opus-5`）
理由：這一站要重洗 13 站累積的校準基準，而安全網只有 `invariants.mjs` ＋
`smoke.mjs`——**沒有 golden.json**（S09 已刪，`invariants.mjs:1-45` 的檔頭寫明
它就是 golden.json 的替代品）。頂端訊號那條的餘裕只有 **0.093**（實測 0.173 對
門檻 0.08），`smoke.mjs:80` 明文寫「不得放寬」。降級的風險是用放寬門檻的方式讓
測試變綠——那等於把 13 站的校準成果作廢掉，還沒有人會發現。

---

## 為什麼做這件事

S21 說明書要「起始狀態落在職業第一年」，並註明「起始屬性值用 S08 洞 3 定的」。
獨立查核發現這條指示**已經無法照字面執行**，有兩個各自獨立的原因。

### 一、`START_YEAR = 2012` 裝不下 DEMO 的那一年

實測各年主場賽區的年曆形狀：

| 年 | 賽段 | MSI | 世界賽席位 | 養成回合 |
| --- | --- | --- | --- | --- |
| **2012** | **賽季（單段）** | **無** | 1 | 9 |
| 2013 | 春季賽/夏季賽 | 無 | 1 | 8 |
| **2015** | 春季賽/夏季賽 | **有（5 月）** | 2 | 7 |
| 2020 | 春季賽/夏季賽 | 無（停辦） | 2 | 8 |
| 2025 | 開季盃/第一/第二賽段 | 有（6 月） | 2 | 6 |

S21 要「至少一個**春季**季後賽」與「MSI/世界賽事件序列（可強制出線供測試）」。
2012 兩者都沒有——MSI 的年曆列是 `from: 2015`（`data/formats/calendar.js`），
**那一年年曆上根本不排 MSI 階段**，force 出線開關寫在 `msi.js` 裡也永遠跑不到。

**已拍板改 2015**：春/夏兩段（對得上 §3.3 那張「兩賽段賽區」示例表）＋ MSI 5 月
＋ 世界賽 2 席 ＋ 7 個養成回合，且是 MSI 存在的最早年份。

### 二、§7.3 的起始屬性規格在 S15b 之後已經失效

§7.3 要求「位置加權起始評價 **58.0**（p10 54.2、p90 61.9）」，但那張驗算表是
**固定潛力時代**量的。v4.3 把底換成 `effective_potential`、S15b 又刻意把出生評價
壓到 29 好讓業餘期有爬升空間（規格書 :655-663 自己寫了這件事）。

實測套用現行公式（600 樣本 × 五路）：

```
age 16 → 29.1    age 18 → 34.9    age 20 → 41.0    age 22 → 46.6
```

**任何新秀年齡都到不了 58。** §7.3 自己掛著「待以生命週期系統重校（§21.2）」，
而 S15b 的重校只驗了 AMATEUR 路徑（巔峰比 0.754），沒有回頭驗 DEMO 起點——
這是一條**沒有閉環的交接**，`20b` 審查也沒抓到。

這不是美觀問題，是 DEMO 那一年存不存在的前提。實測 100 段 PRO 起點（2015 年）：

```
[出生值 OVR≈29] 撐過第一年 30/100   57× FLOOR_RATING 38 被迫退役、13× 解散無人接手
[拉到  OVR≈58] 撐過第一年 91/100
```

29 分的選手同時踩三條線：`transfer.js:55` `FLOOR_RATING = 38`、
`market.js` 位置需求門檻（`LEAGUES.HOME.min = 62`）、`clubVerdict` 的 par − OVR ≥ 8。

### 現成解：重用晉升管線，不要重寫公式

實測目前遊戲裡走完業餘期、真的晉升 PRO 的那一刻（200 段，**全數晉升**）：

```
age          平均 19.4（p10 18、p90 21、範圍 17–22）
coachRating  平均 59.0（p10 56、p90 62、範圍 56–66）   ← §7.3 目標 58.0（p10 54.2、p90 61.9）
league / contract / coach / mates / teamHistory / milestones   齊備率 200/200
```

既有的晉升管線**自己就落在 §7.3 的目標線上**，而且 `20b` 的 D2 那張「PRO 起點缺
欄位」表列的欄位**全部順帶填好**。所以 PRO 起點該**重用晉升管線**，不是照 §7.3 的
公式重寫一次——後者已經被證明產不出 58。

---

## 入口狀態

```bash
npm test
```

全綠（項數見 S20c 交接筆記）。S20c 必須已修完 `HONOR_POINTS` 比對——
本站要重量的評分分布建立在它之上。

---

## 範圍

### 要做

**1. 起始年份改 2015**（`src/data/eras.js` `START_YEAR`）

**2. 起點狀態重用晉升管線**

`market.js:302 tryout()` ＋ `market.js:254 signContract()` 一次呼叫就填好
league／team／contract／mates／coach／teamHistory／debut 里程碑。
既有的三個 PRO 進入點（`transfer.js:212`／`:227`／`joinAcademy`）是現成範本。

⚠ **`state.stage = 'PRO'` 必須在 `signContract` 之前設**——否則
`recordTeamEntry`（`market.js:277`）第一行 early-return，`teamHistory` 與 debut
里程碑都不會寫，傳記退化成 `amateurOnly`（`biography.js:83`、`:166`）。

⚠ **不要動 `birth` 亂數流的取數順序**。§1.4 把出生流的抽取順序寫死，一動就位移
所有既有種子的天賦；`tests/kernel/innate.mjs`／`lifecycle.mjs` 會紅，而那種紅燈
**看起來像校準漂移、實際是取數順序被動過**。用獨立的 `${seed}:debut` 流，
與 `state.js:39-43` 記載的「出生流 vs 人生流」分家原則一致。

**3. 起始屬性對齊實測晉升分布**（OVR≈58、age≈19）

回寫 §7.3：關掉「待以生命週期系統重校（§21.2）」那條懸置，寫明 S15b 之後
DEMO 起點的量法與新的驗算表，附錄記一筆決策紀錄。

**4. 順帶校準三項死內容**

- **N10 兩個拿不到的獎項**（實測各 **0/60**）：
  - `最佳新人`（`seasonEnd.js:122`）需 `delta ≥ 2.5`，但新秀簽在 `par − 4`，
    首季比 par 高 2.5 實質不可能（實測 1/60，且與 `age ≤ 20` 交集 0/60）
  - `單殺王`（`seasonEnd.js:129`）需 `clamp(1 + soloLaneBonus) × soloRate ≥ 1.5`；
    `soloLaneBonus = (lane − par) × 0.008` 只給 TOP/MID，極限 **1.272**，
    須另持 `one_man_army`（×1.3）才勉強跨線。這是 1–80 → 0–100 重校時
    `0.008` 除了 1.25、`1.5` 這個比值沒跟著換算留下的漂移。
    連帶擋住 `laneking` 的解鎖分支（`seasonEnd.js:132`）
- **N4**：S20c 修完比對後的評分位移（每座賽段冠軍 0 → 80 分）
- **N11**：三個有消費端、無任何特質宣告的 modifier 鍵——`importExempt`
  （`imports.js:21`，整個外援名額豁免機制無法觸發）、`benchRisk`
  （`lineup.js:44`，`factor()` 永遠回 1）、`decline_pull_mul`
  （`modifiers.js:99`，§7.2 六個生命週期窗口中**唯一**沒有內容的那個）
- **N12**：5/25 任務卡從未開卡（實測 60 段）——全是 legend、全是
  「兩個各自稀有的特質」合取觸發（例：`legend-showmaker` 需 `rare/star` 9/40
  **且** `common/trashtalk` 2/40）

**5. 重量 D1 點名的全部校準線**

| 檔案 | 檢查 | 目前實測 |
| --- | --- | --- |
| `invariants.mjs:172` | 巔峰比 ∈ [0.68, 0.82] | **0.755** |
| `invariants.mjs:403` | 頂端落差 ≥ 0.08 | **0.173**（餘裕 0.093，**不得放寬**） |
| `invariants.mjs:248` | 92% clamp ≤ 6% | **0/160** |
| `invariants.mjs:362` | 風格差 ≥ 0.0926 | **0.197** |
| `invariants.mjs:811` | 休息間隔 3–4 月 | **3.41** |
| `smoke.mjs:89` | 傳奇率 ≤ 30% | **6.3%** |
| `invariants.mjs:428` | 傳說持有 ≤ 50% | **17.5%** |
| `smoke.mjs:112` | 五等第都出現得到 | — |
| `ledger.mjs` | teamHistory 1.9／disbandCrises 0.6／awards 2.4 | S19c 的 §14.3 門檻**直接讀這裡** |

**完整生涯測試改構造 AMATEUR 狀態跑**，保住 13 站的校準基準；DEMO 起點另開小矩陣
冒煙。`tests/phases/amateur.mjs` 照 S21 說明書改直接構造狀態——十餘處既有測試
（`tests/phases/lineup.mjs:17`、`transfer.mjs:17`、`seriesEvent.mjs:22`、
`kernel/series.mjs:11` 等）已經是「`createState` 之後手動設 stage」的寫法，
可直接當範本。

交接筆記要寫明「**校準基準改以 AMATEUR 起點為準，DEMO 起點的分布另量**」。

### 不要做

- **不要用放寬門檻的方式讓測試變綠。** 門檻動了就要在交接筆記寫明「為什麼那條
  性質本來就該變」，並附新舊實測值。頂端落差那條 `smoke.mjs:80` 明文禁止放寬。
- **不要動 `birth` 亂數流的取數順序。**
- **不要刪業餘期的程式碼與內容**（S21 說明書的規則，這一站先套用）。
- 不要順手補退役事件或事件卡條件（S20e／S20f）。

---

## 要動的檔案

| 檔案 | 動作 |
| --- | --- |
| `src/data/eras.js` | `START_YEAR` → 2015、`START_AGE` |
| `src/engine/state.js` | `createState` 落在 PRO 第一年，重用 `signContract` |
| `src/phases/seasonEnd.js` | 最佳新人／單殺王門檻 |
| `src/data/traits.js`／`epics.js` | N11 三個無宣告的 modifier 鍵 |
| `src/data/quests.js` | N12 五張從未開卡的任務卡觸發 |
| `ESPORT-DESIGN-V4.md` | §7.3 回寫、附錄決策紀錄 |
| `tests/lib/harness.mjs` | AMATEUR 構造入口 ＋ DEMO 起點小矩陣 |
| `tests/regression/invariants.mjs`／`smoke.mjs` | 校準線重量 |
| `tests/phases/amateur.mjs` | 改直接構造狀態，不依賴 `createState` |

---

## 規則與不變式

- **完整生涯仍然跑得完**，160 段照跑（基準改以 AMATEUR 起點為準）。
- **業餘期程式碼可被喚醒**：從 AMATEUR 狀態起跑的測試要能走完整條階梯。
- **PRO 起點第一年存活率 ≥ 90/100**（修前 30/100）。
- 每一條被動到的門檻，交接筆記要有「舊值 → 新值 → 為什麼該變」三段。
- S07 不變式全綠。

---

## 完成定義

```bash
npm test
```

全綠。

```bash
node -e "import('./src/engine/state.js').then(m=>{const s=m.createState({name:'T',role:'MID',seed:'x'});console.log(s.stage,s.age,s.year,s.league,!!s.contract,!!s.coach)})"
```

印出 `PRO`、職業新秀年齡、`2015`、`HOME`、`true`、`true`。

以及：100 段 PRO 起點存活率量測 ≥ 90/100，數字進交接筆記。

---

## 交接筆記

> 執行：2026-08-16。`npm test` **19385 項全綠**（S20c 入口 19105 項；新增的
> N11 反向死鍵掃描與 `tests/regression/demo.mjs` 把項數推上去）。SAVE_VERSION
> 維持 **21**（本站沒加狀態欄位）。規格書 v4.5 → **v4.5.1**（§7.3 回寫＋附錄 #64）。

### 起點雙軌制

`createState({ name, role, seed, stage })`，`stage` 預設 `'PRO'`（`src/engine/state.js`）：

- **PRO（DEMO 起點）**：19 歲、2015 年、`stageYear 0`。起始屬性讀**固定潛力**
  × k_i（§7.3 原表 0.80／0.70、jitter ±0.03）——出道新人已打完業餘期，16 歲的
  天花板不再壓一次。出道隊由 `${seed}:debut` 流挑（`teamsOf(state,'HOME')`＋
  `signContract` 跳過試訓判定——已經是 PRO），出生流取數順序一個沒動。
  實測起始評價平均 **58.7**（p10 55／p90 64），與業餘路線實測晉升分布
  （58.9／56／62）對齊。
- **AMATEUR（校準基線）**：16 歲、2012 年。起始屬性讀 `effective_potential(16)`，
  與 S15b 以來完全相同——**13 站的校準基準全量在這條路線上**。

`eras.js`：`START_YEAR 2012 → 2015`、`START_AGE → 19`；新增
`AMATEUR_START_YEAR 2012`／`AMATEUR_START_AGE 16` 凍結業餘起點。
`tests/lib/harness.mjs` 的 `DEFAULT_STAGE = 'AMATEUR'`——完整生涯矩陣一律走業餘
基線；七個既有測試檔補上明確的 `stage: 'AMATEUR'`。
`src/engine/game.js` 開場卡照 `state.stage` 分文案（網咖 vs 出道隊）。

⚠ **校準基準改以 AMATEUR 起點為準，DEMO 起點的分布另量**——兩條線今後都要報，
混在一起量就是本站要修的那個錯誤。

### 常數變動（舊 → 新 → 為什麼該變）

| 項目 | 舊 | 新 | 理由 |
| --- | --- | --- | --- |
| 最佳新人（`seasonEnd.js`） | `delta ≥ 2.5` 且 `age ≤ 20` 且 `proYears ≤ 1` | `delta ≥ -1.5` 且 `proYears ≤ 1`（年齡門檻移除） | 舊門檻 0/160。菜鳥首個完整賽季的 delta 分位 p0 −0.4／p90 −8.4——「優於聯盟平均 2.5」對首年新人是空話；新秀的優秀是「沒被平均甩開」。年齡與 `proYears ≤ 1` 重複卡人 |
| 單殺王（`seasonEnd.js`） | 係數 ≥ **1.5** | 係數 ≥ **1.4** | 舊值 0/160（只有疊 one_man_army ×1.3 的極端個案跨線，裸係數上限 ≈ 1.27）——1–80 → 0–100 重校時 `0.008` 除了 1.25、比值沒跟著換算的漂移。1.4：頂級對線者加一項對線特質可觸及，仍稀有（實測 16/160 hit），同時解開 `laneking` 解鎖分支 |
| N11 三個死 modifier 鍵 | 有消費端、零宣告 | `franchise.benchRisk {mul:0.5}`、`veteran.decline_pull_mul {mul:0.7}`（`traits.js`）、`goat.importExempt true`（`epics.js`） | 鍵不存在時 `factor()` 永遠回 1／機制無法觸發（詳說明書範圍 4）。`tests/kernel/traits.mjs` 新增**反向死鍵掃描**：掃 `src/` 全部 `flag|factor|bonus|floorOf|capOf` 消費點，每個鍵必須被特質表宣告（先紅後綠驗證過） |
| N12 死任務卡 | 5 張 0 開卡 | 全 25 張皆有開卡（下表） | trigger 合取兩稀有素材、且撞引擎 legend 底線，詳下 |

### N12 死任務卡（規格點名 5 張）

| 卡 | 舊 trigger | 新 trigger／處置 | 實測開／達（160 段） |
| --- | --- | --- | --- |
| legend-late-game | `composure + lockerroom(epic)` | `composure + iron(common)`——lockerroom 材料鎖死在 ageless 互斥網，拿不到 | 2/1 |
| legend-record-breaker | `genius + machine(rare)` | `genius + disc(common)`——machine 是雙配方限量素材，太稀 | 6/3 |
| legend-heavenly | `laneking + composure` | `underdog + iron`——laneking 會被 soloking 融合吃掉、四強生涯只 5/30 持 composure；換 lonewolf 仍是 0（獨狼信任 −8，持有人到不了四強 0/30）。underdog＋iron 皆非配方素材，四強生涯共現 5/30；文案從「對線一穿三」改寫成「扛著系列賽逆轉」 | 11/9 |
| legend-rookie-king | `proYears ≤ 4 && splitTitles ≥ 1` | **重設計成 legend-breakout「更上一層樓」**（使用者拍板）：trigger = `intlSemis ≥ 1`（就是底線本身，首次國際四強即開卡），goal = 兩年內 MSI 冠軍戰（`msiBest ≤ 2`），failLabel 曇花一現。特質鍵 `rookie_king → breakout`（`epics.js` 同步，效果不變）。原因見下方結構性矛盾 | 30/8 |
| legend-showmaker | 未改 | N10／N11 修完後特質取得位移，自癒——不需動手 | 10/7 |

⚠ **傳奇卡的結構性矛盾（交接重點）**：引擎對所有 legend trigger AND 上
`LEGEND_BASELINE`（intlSemis ≥ 1，`engine/quests.js:66`），而實測首次 MSI 淘汰賽
最早落在**職業第 11 年**（p25 = 13）、首次國際四強 p25 = 職業第 13 年——**任何
「生涯前期視窗」的 legend trigger 與底線永遠錯身，結構性 0 開卡**。今後設計新的
legend 卡：trigger 視窗不得早於中後段生涯，或 trigger 自身蘊含底線（breakout 的
寫法）。

### 修後校準線（AMATEUR 160 段基線）

| 線 | 門檻 | 實測 |
| --- | --- | --- |
| 巔峰比 | [0.68, 0.82] | **0.719** |
| 頂端落差 | ≥ 0.08（不得放寬） | **0.186**（有冠 12） |
| 92% clamp ≤ 6% | ≤ 6% | 0/160 |
| 風格差 | ≥ 0.0926 | 通過（suite 內 `invariants.mjs`） |
| 休息間隔 | 3–4 月 | **3.38** |
| 傳奇率 | ≤ 30% | 通過（`smoke.mjs`） |
| 傳說持有 | ≤ 50% | **16.9%**（27/160） |
| 五等第 | 都出現 | 傳奇 9、歷史級 15、優秀 22、稱職 64、邊緣 50 |
| 老手傳奇 | ≤ 30% | 8/80 |

獎項（160 段 hit）：最佳新人 **5**（修前 0）、單殺王 **16**（修前 ≈0）、MVP 52、
全明星 76。晉升 40/40、age 平均 19.1、rating 平均 58.9（p10 56／p90 62）。

### DEMO 小矩陣（PRO 100 段，`tests/regression/demo.mjs`）

起始評價平均 58.7（p10 55／p90 64）；第一年存活 **98/100**（門檻 ≥ 90，修前
出生值起點只有 30/100）。欄位齊備檢查：league／contract／coach／mates／
teamHistory／debut 里程碑 100/100。

### 未一起處理

- **S20e／S20f**（三層退役事件、事件卡條件）照站序未動。
- **clutch 持有 0/160**：冠軍解鎖分支（`playoff.js:128`）沒咬到，與單殺王同類的
  門檻漂移嫌疑。超出本站 N10／N11／N12 清單，`playoff.js:128` 留了 TODO。
- **N4**（S20c 修完比對後的評分位移）由 S20c 本身修畢，本站重量的頂端落差
  （0.186）已反映。
- 業餘期程式碼與內容未動（S21 規則）。S20g／S20h 的冠軍登記與背景模擬照舊。
