# S25 缺隊清單 —— 給原站（S24c）看的內容

> 2026-08-17 由 S25 執行者記錄。S25 隊名對齊時發現 **118 隊**在
> `team_history.json` 缺失，262 名 CSV 選手、431 人次受影響。
> **已處理**：S24c 返工完成（2026-08-17），team_history.json 174→300 隊，
> 本清單 121 隊實體全部收齊（`node gen-clean.mjs` 重跑後 pending 159→38，
> 殘餘 38 隊經判讀解 16 隊，剩 22 隊真缺，見下「S25 續做」）。

## 返工範圍（缺隊影響的站點）

**需要返工的站只有一站：S24c（team_history.json 產生站，已完成）。**
缺 118 隊（下節清單）。補法：`gen-team-history-intl.mjs` 既有的人工表
（`ABBREVIATIONS_INTL`／`NAME_ALIASES`）加隊後重跑，冪等。

| 站 | 狀態 | 缺隊影響 |
| --- | --- | --- |
| S24a（target_players.csv） | 已完成 | **不受影響**——選手清單與隊無關 |
| S24b（raw_data 抓取） | 已完成 | **不受影響**——raw 檔已全（1347 檔） |
| S24c（team_history.json） | 已完成 | **返工**——缺 118 隊（根源站） |
| S24d（選手頁題映射） | 已完成 | **不受影響**——選手導向，與隊無關 |
| S25（資料清洗） | 進行中（暫停） | 不算返工——本就未完成，S24c 補隊後重跑 `gen-clean.mjs` 續做 |
| S26 以後（母體百分位／參數生成／引擎整合） | 未開始 | 不算返工——尚未做，補隊後照常 |

注意：S27（參數生成）吃 `cleaned_players.json` 的 career 名次算潛力——
S25 重跑後的輸出變動會流進 S27，屬「輸入更新」，非返工。

## 根因（S24c 收隊規則 vs split 頁名冊）

`team_history.json` 國際段（S24c）只收兩類隊：

1. Worlds／MSI 參賽隊（148 隊頁）
2. 已判定冠軍的 split 冠軍隊（79＋4 個）

但 **split 頁名冊（TeamCard／TeamRoster）涵蓋該季全部參賽隊**——不只冠軍隊。
S25 清洗時，這些「全參賽隊」的選手（很多是 CSV priority 1／2 選手生涯的
早期年份）在 `team_history.json` 找不到 `team_id`，名冊事件無法入帳
（S25 不變式：`team_id` 必須存在於 team_history）。例：`1xn`（TW 選手）
打 LPL 2023–2025 效力 ThunderTalk Gaming——TT 不在 team_history，1xn 的
LPL 年份全部丟失，`career` 為空。

## 缺隊清單（118 隊，× 受影響人次 [priority 分佈]）

```
18x	Hong Kong Esports	[p1:14 p2:4]
17x	FC Schalke 04 Esports	[p2:17]
13x	Team ROCCAT	[p2:13]
12x	Jin Air Green Wings	[p2:12]
11x	Ultra Prime	[p1:6 p2:5]
11x	Impunity	[p1:10 p2:1]
11x	Nongshim RedForce	[p2:11]
10x	Snake Esports	[p2:10]
9x	SANDBOX Gaming	[p2:9]
8x	West Point Esports	[p1:8]
8x	ThunderTalk Gaming	[p1:2 p2:6]
8x	Anyone's Legend	[p2:5 p1:3]
8x	OpTic Gaming	[p2:8]
8x	Rogue Warriors	[p1:2 p2:6]
8x	Elements	[p2:8]
7x	CJ Entus Blaze	[p2:7]
7x	CJ Entus	[p2:7]
7x	Berjaya Dragons	[p1:7]
7x	Rare Atom	[p2:5 p1:2]
7x	Victory Five	[p2:6 p1:1]
7x	Echo Fox	[p2:7]
6x	CJ Entus Frost	[p2:6]
6x	bbq Olivers	[p2:6]
6x	BRION	[p2:6]
6x	Excel Esports	[p2:5 p1:1]
5x	Ninjas in Pyjamas	[p2:5]
5x	Team King	[p2:5]
5x	Vici Gaming	[p2:5]
5x	Brion Esports	[p2:5]
5x	BOOM Esports	[p1:3 p2:2]
5x	Incredible Miracle	[p2:5]
5x	Dominus Esports	[p2:5]
4x	Assassin Sniper	[p2:1 p1:3]
4x	MVP	[p2:4]
4x	Team Bliss	[p2:3 p1:1]
4x	Energy Pacemaker	[p1:4]
4x	XDG Gaming	[p2:4]
4x	Masters 3	[p2:4]
4x	eStar Gaming	[p2:2 p1:2]
4x	MVP Ozone	[p2:4]
3x	Logitech G Snipers	[p2:3]
3x	Team EnVyUs	[p2:3]
3x	Copenhagen Wolves	[p2:3]
3x	Phoenix1	[p2:3]
3x	KCORP	[p2:3]
3x	NaJin Shield	[p2:3]
3x	Astralis	[p2:3]
3x	Nova Esports	[p2:3]
3x	NRG Esports	[p2:3]
3x	Meme Stream Dream Team	[p2:3]
3x	Vikings Esports	[p2:3]
3x	Team Coast	[p2:3]
3x	eXtreme Gamers	[p1:3]
3x	Apex Gaming	[p2:3]
2x	Mysterious Monkeys	[p2:2]
2x	Millenium	[p2:2]
2x	Xenics Blast	[p2:2]
2x	Singapore Sentinels	[p1:2]
2x	Throw Machine Gaming	[p2:2]
2x	ESC Ever	[p2:2]
2x	Newbee	[p2:2]
2x	MVP Blue	[p2:2]
2x	Resurgence	[p1:2]
2x	Ever8 Winners	[p2:2]
2x	FearX	[p2:2]
2x	Team Dragon Knights	[p2:2]
2x	HTICS	[p1:2]
2x	XL	[p2:2]
2x	SinoDragon Club	[p1:2]
2x	Jin Air Falcons	[p2:2]
2x	Winterfox	[p2:2]
2x	Gravity	[p2:2]
2x	Team Impulse	[p2:2]
2x	KT Rolster A	[p2:2]
2x	SUPA HOT CREW	[p2:2]
2x	Ground Zero Gaming	[p1:2]
2x	Gamtee	[p2:2]
2x	Rebels Anarchy	[p2:2]
2x	SBENU Sonicboom	[p2:2]
2x	Chunnam Techno University	[p2:2]
2x	Kongdoo Monster	[p2:2]
2x	Incredible Miracle 1	[p2:2]
1x	UP CN	[p1:1]
1x	NAVI	[p2:1]
1x	ALTERNATE aTTaX	[p2:1]
1x	Xenics Storm	[p2:1]
1x	Team Mist	[p1:1]
1x	Qiao Gu Reapers	[p2:1]
1x	Midas FIO	[p2:1]
1x	Team Hunters	[p1:1]
1x	SEM9 WPE	[p1:1]
1x	Snake eSports	[p2:1]
1x	AL CN	[p1:1]
1x	Sengoku Gaming	[p2:1]
1x	DAN Gaming	[p2:1]
1x	Energy Pacemaker.All	[p1:1]
1x	Game Talents	[p2:1]
1x	Unlimited Potential	[p1:1]
1x	Bigfile Miracle	[p2:1]
1x	APK Prince	[p2:1]
1x	Antic Esports	[p1:1]
1x	FEARX	[p2:1]
1x	DWG KIA	[p2:1]
1x	Team WE Academy	[p2:1]
1x	Cougar E-Sport	[p1:1]
1x	NaJin e-mFire	[p2:1]
1x	Meet Your Makers	[p2:1]
1x	Jin Air Green Wings Falcons	[p2:1]
1x	Positive Energy	[p2:1]
1x	GIANTX	[p2:1]
1x	NIP CN	[p2:1]
1x	SB	[p2:1]
1x	LSB	[p2:1]
1x	Secret Whales	[p1:1]
1x	Enemy	[p2:1]
1x	Saigon Fantastic Five	[p1:1]
1x	compLexity Gaming	[p2:1]
1x	Counter Logic Gaming Prime	[p2:1]
1x	MiG Frost	[p2:1]
1x	Good Game University	[p1:1]
1x	Manila Eagles	[p1:1]
```

## 給 S24c 重新處理的建議

- 優先補 **priority 1／2 選手撞到的隊**（上表 p1/p2 標記者），共約 30 隊
  影響 262 名 CSV 選手；其餘（純 p3 額外選手）可之後再議。
- 補法與 `gen-team-history-intl.mjs` 的既有人工表同構：`ABBREVIATIONS_INTL`
  或 `NAME_ALIASES` 加隊即可，重跑生成器疊加（冪等）。
- 二隊／姊妹隊（SK Telecom T1 K／KT Rolster Bullets 等）已由 S25 別名表
  歸到主隊（SKT／KT），不必各自成隊。
- 上表是「名冊出現的隊名」——S24c 若決定擴收隊範圍，要從 split 頁
  （109 頁）TeamCard 全隊名冊重新枚舉，不只上表 118 隊。

## S25 暫停狀態（腳本已就緒）

- `tools/npc/gen-clean.mjs` ＋ `tools/npc/clean/`（parse／align／llm）已可跑：
  重跑冪等，補隊後直接重跑即收斂。
- `clean/team_alias.json` 已含 33 筆執行者判讀別名（隊名變體→team_id，
  含 SKT 姊妹隊、KT 雙隊、KOI→MAD2、GE Tigers→KOO 等）。
- 尚未處理：13 筆未解消歧義（`unresolved_disambig_lp.tsv`）的候選判讀、
  MSI 2015 名次全缺（TeamPrizePool 無 Opponent、TeamCard 無 placement）。

## S25 續做（2026-08-17 S24c 返工後）

- 重跑後殘餘 38 隊 → 已由 S25 執行者判讀別名解 **16 隊**（`team_alias.json`
  現 54 筆）：AL CN→AL、TT CN→TT、UP CN→UP、NIP CN→NIP、Ninjas in
  Pyjamas.CN→NIP、KCORP 等頁題縮寫、NS RF→NS、Brion Esports→BRO、
  Fredit→BRO、Incredible Miracle 1／2→IM2、Jin Air Falcons／Green Wings
  Falcons／Stealths→JAG、Energy Pacemaker.All→EP、LSB→SB、QG
  Reapers→QG、EG.EU→EG2（Evil Geniuses）、Taipei J Team→JT。
- **重複隊修復**：S24c 把 Taipei J Team 誤建為獨立隊 `TJ`（與 `JT` 同隊），
  6 名選手（Hana／Lilv／Mission／Nestea／Rest／Woody）生涯被拆兩段——
  S25 直接併入 JT（`team_history.json` 刪 TJ 條目＋別名）。⚠ 若
  `gen-team-history-intl.mjs` 重跑會重建 TJ，建議 S24c 加排除規則。
- **殘餘 22 隊全部是真缺**（`pending_team_alias.json`，無別名可解，
  需 S24c 補進 team_history）：
  - LEC／LCK／LCS 近代名冊縮寫：HTICS（Team Heretics）、KCORP（Karmine
    Corp）、NAVI（Natus Vincere）、Dynamics（LCK 2020）、SHO（Seorabeol
    LCK 2020）、Shopify Rebellion（LCS 2023-25）、db（DragonBorns，2013
    EU LCS）
  - 2012-13 老隊：Azubu Blaze、MiG Blaze、MiG Frost、StarTale、
    SuperStar、Team OP、Team XD、Saint Club、RoMg、DDoL、GJR、Little
    Hippo、NEB、NeL、Hyper Youth Gaming
  - **受影響 CSV 選手 28 名、37 人次**（全部 priority 1／2）：Adam、
    Ambition、Bugi、Cabochard、Canna、Closer、CloudTemplar、deokdam、
    dexter1、Evi、Flakked、Jankos、Kaiser、Larssen、Lustboy、MadLife、
    Malrang、Perkz、RapidStar、Ryu、Sheo、Shushei、Targamas、Trymbi、
    Upset、WildTurtle、Woong、Wunder、Yike、Zeyzal。
- 補法與 `gen-team-history-intl.mjs` 的既有人工表同構：`ABBREVIATIONS_INTL`
  或 `NAME_ALIASES` 加隊（HTICS→Team Heretics 等）後重跑，冪等。