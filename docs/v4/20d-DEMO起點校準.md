# S20d · DEMO 起點校準

狀態：未開始
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

<!-- 做完由執行者回填。起始屬性的最終量法與實測分布、每一條校準線的新舊值與
     變動理由、AMATEUR 基準與 DEMO 小矩陣的分工 -->
