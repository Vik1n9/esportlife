/**
 * 生涯任務卡表（V4 §12.3，S18 內容站）。
 *
 * 兩種類型共用同一套 schema：
 *   - legend（20 張）：傳說特質的唯一發放口（§13.4）。觸發條件是**條件式**
 *     （§12.3），底線門檻「生涯至少一次國際賽四強以上」由引擎層 AND
 *     （`LEGEND_BASELINE`），不逐卡複製。達成結果＝傳說特質。
 *   - route（5 張）：替代性生涯路線（§14.3）。觸發只看生涯軌跡，不看素材——
 *     打不出冠軍的局照樣開得出來。達成結果＝史詩特質 ＋ 生涯標籤。
 *
 * 設計規則（§12.3／§14.2／§14.3）：
 *   - 觸發條件形狀是設計自由：一史詩＋一稀有、兩個稀有、賽事成績＋素材、
 *     純軌跡不吃素材全都合法。本表刻意多樣化——15 張吃素材、5 張純戰績／軌跡
 *     （worlds-king／grand_slam／goat／breakout／godslayer 戰績型）。素材分配
 *     由 S19c 重推供給算式時以實際卡表為準。
 *   - ⚠ 素材一律選 160 段實測「取得率 ≥15%」的特質（S19c 量測，見 19c 交接筆記）。
 *     死路檢驗（§14.2）的死線是 15%。
 *   - ⚠ S19c 死卡教訓：任務卡素材不得是配方原料（或至多 1~2 條配方吃）——v4.2
 *     規則一「素材失效即失敗」：開卡後素材被合成消耗 = 永久失敗（prophet-king
 *     開 4 達 0、bulwark／shotcaller／late-game 0 開卡的根因，全部已修）。
 *   - 達成目標全部以「160 段實測可達」為草案底線。
 *     goal 必須比 trigger 門檻高，否則開卡當下瞬間達成。
 *   - 素材在**達成時**才消耗（§14.1）；期限內失敗素材保留，可以走別條路。
 *   - deadline 以賽季計（null = 生涯結束前），數值由 S19c 實測校準。
 *
 * ⚠ 站間接口：新傳說的鍵名（heavenly 等 14 個）與 route 新史詩 `helper` 由本表
 * 定義意象與素材，特質本體（名稱／效果／副作用）由 S19b 補——tools 編輯器的
 * 「達成結果特質鍵不存在」紅燈在 S19b 完成後自然消。
 */
export const QUEST_CARDS = [
  // ══════════════ legend：素材型 12 張 ══════════════

  {
    id: 'legend-immortal',
    type: 'legend',
    name: '不死魔王',
    text: '他們說電競選手的保鮮期只有三年。你今年第六年，還站在決賽舞台中央——對面的中單，第一年打職業時的偶像是你。',
    trigger: ['and', ['has', 'epic', 'ultstage'], ['has', 'rare', 'machine']],
    goal: ['and', ['stat', 'splitTitles', 'gte', 2], ['stat', 'awards', 'gte', 3]],
    deadline: null,
    result: { tier: 'legendary', key: 'immortal' },
    failLabel: '魔王的殘響',
    goalText: '達成目標：生涯累計賽段冠軍 ≥ 2，且生涯獎項 ≥ 2',
    materialText: '所需素材：終極舞台（史詩）＋ 練功機器（稀有）',
  },
  {
    id: 'legend-godslayer',
    type: 'legend',
    name: '弒神者',
    text: '「誰能打敗他？」——那年世界賽，轉播鏡頭第一次沒有拍衛冕王，而是拍你。你沒有回答，只是在 BP 的最後一秒鎖下了那隻英雄。',
    trigger: ['stat', 'awards', 'gte', 2],
    goal: ['stat', 'awards', 'gte', 5],
    deadline: null,
    result: { tier: 'legendary', key: 'godslayer' },
    failLabel: '弒神未竟',
    goalText: '達成目標：生涯獎項 ≥ 5',
    materialText: null,
  },
  {
    id: 'legend-bulwark',
    type: 'legend',
    name: '銅牆鐵壁',
    text: '九千三百場正式比賽，你只崩過一次線。教練說你是戰隊的地基——地基不會閃光，但地基垮了的樓，沒有一座站得住。',
    trigger: ['and', ['has', 'common', 'guardian'], ['has', 'common', 'grinder']],
    goal: ['and', ['stat', 'splitTitles', 'gte', 2], ['stat', 'intlWinRate', 'gte', 35]],
    deadline: 2,
    result: { tier: 'legendary', key: 'bulwark' },
    failLabel: '鬆動的基座',
    goalText: '達成目標：生涯累計賽段冠軍 ≥ 2，且國際賽勝率 ≥ 30%',
    materialText: '所需素材：守護者（通用）＋ 肝帝（通用）',
  },
  {
    id: 'legend-showmaker',
    type: 'legend',
    name: '流量金身',
    text: '你的慶祝動作被做成梗圖，你的賽後採訪被剪成鬼畜影片。黑粉說你炒作——你只想知道，他們是不是在羨慕鏡頭為什麼不拍他們。',
    trigger: ['and', ['has', 'rare', 'star'], ['has', 'common', 'trashtalk']],
    goal: ['and', ['stat', 'fameLevel', 'gte', 4], ['stat', 'splitTitles', 'gte', 1]],
    deadline: 2,
    result: { tier: 'legendary', key: 'showmaker' },
    failLabel: '過氣話題',
    goalText: '達成目標：知名度達「全民認識」，且生涯累計賽段冠軍 ≥ 1',
    materialText: '所需素材：明星選手（稀有）＋ 嘴砲王者（通用）',
  },
  {
    id: 'legend-underdog-run',
    type: 'legend',
    name: '一穿五',
    text: '第四種子、零票看好、外媒預測欄全被打叉。賽前記者問你「目標是什麼」，你指了指那個沒人敢指的獎盃。',
    trigger: ['and', ['stat', 'worldsBest', 'lte', 4], ['stat', 'msiBest', 'lte', 4]],
    goal: ['and', ['stat', 'worldsBest', 'lte', 3], ['stat', 'msiBest', 'lte', 3]],
    deadline: null,
    result: { tier: 'legendary', key: 'underdog_run' },
    failLabel: '止步的黑馬',
    goalText: '達成目標：世界賽站上過四強，MSI 站上過四強',
    materialText: null,
  },
  {
    id: 'legend-prophet-king',
    type: 'legend',
    name: '版本之神',
    text: '每次版本改動，分析台都等著看你的反應。因為你上一次說「這英雄不能玩」，隔週版本更新就砍了它——這一次，你先閉上了嘴。',
    trigger: ['and', ['has', 'common', 'meta'], ['has', 'common', 'camera']],
    goal: ['and', ['stat', 'splitTitles', 'gte', 1], ['stat', 'awards', 'gte', 3]],
    deadline: 3,
    result: { tier: 'legendary', key: 'prophet_king' },
    failLabel: '過期的版本答案',
    goalText: '達成目標：生涯累計賽段冠軍 ≥ 1，且生涯獎項 ≥ 3',
    materialText: '所需素材：版本適應者（通用）＋ 鏡頭感（通用）',
  },
  {
    id: 'legend-heavenly',
    type: 'legend',
    name: '天神下凡',
    text: '世界賽淘汰賽，隊伍先丟兩局。第三局開始，你一個人扛著整個系列賽往前走——打滿五局，你的身體比對面五個人都硬。賽後韓網的標題只寫了一句——「不是五個人下凡，是一個人下來了」。',
    // S20d/N12：舊素材 laneking＋composure 實測 0/160——laneking 會被 soloking
    // 融合吃掉，composure 只有 5/30 的四強生涯持有。lonewolf 接手後仍是 0/160：
    // 獨狼信任 −8，持有人根本到不了四強（0/30）。改成 underdog＋iron——兩者
    // 都不是配方素材（iron 是天生的），四強生涯共現 5/30；文案同步從「對線
    // 一穿三」改寫成「扛著系列賽逆轉」。goal／deadline 不變
    trigger: ['and', ['has', 'common', 'underdog'], ['has', 'common', 'iron']],
    goal: ['and', ['stat', 'awards', 'gte', 3], ['stat', 'splitTitles', 'gte', 1]],
    deadline: 2,
    result: { tier: 'legendary', key: 'heavenly' },
    failLabel: '墜落的天神',
    goalText: '達成目標：生涯獎項 ≥ 3，且生涯累計賽段冠軍 ≥ 1',
    materialText: '所需素材：逆風翻盤（通用）＋ 鐵人（通用）',
  },
  {
    id: 'legend-shotcaller',
    type: 'legend',
    name: '運籌帷幄',
    text: '你的燈號是整支隊伍的心臟。隊友說：跟你打團，地圖永遠是亮的——對面五個人藏在哪裡，你比他們的輔助還清楚。',
    trigger: ['and', ['has', 'common', 'leader'], ['has', 'common', 'guardian']],
    goal: ['and', ['stat', 'splitTitles', 'gte', 2], ['stat', 'intlWinRate', 'gte', 30]],
    deadline: 2,
    result: { tier: 'legendary', key: 'shotcaller' },
    failLabel: '燈滅的指揮官',
    goalText: '達成目標：生涯累計賽段冠軍 ≥ 2，且國際賽勝率 ≥ 30%',
    materialText: '所需素材：團隊領袖（通用）＋ 守護者（通用）',
  },
  {
    id: 'legend-jungle-king',
    type: 'legend',
    name: '野區掌控',
    text: '對面打野的動向，你閉著眼睛都知道——因為你在他開局走進野區之前，就把他五分鐘後的位置想好了。',
    trigger: ['and', ['has', 'common', 'meta'], ['has', 'common', 'disc']],
    goal: ['and', ['stat', 'splitTitles', 'gte', 1], ['stat', 'awards', 'gte', 3]],
    deadline: 3,
    result: { tier: 'legendary', key: 'jungle_king' },
    failLabel: '失序的野區',
    goalText: '達成目標：生涯累計賽段冠軍 ≥ 1，且生涯獎項 ≥ 3',
    materialText: '所需素材：版本適應者（通用）＋ 自律（通用）',
  },
  {
    id: 'legend-one-man-army',
    type: 'legend',
    name: '一人成軍',
    text: '團戰打輸了，隊友全滅。畫面中央，只剩下你一個人的角色還亮著——然後，你的畫面向著五個人走去。',
    trigger: ['and', ['has', 'common', 'genius'], ['has', 'common', 'underdog']],
    goal: ['and', ['stat', 'awards', 'gte', 7], ['stat', 'splitTitles', 'gte', 1]],
    deadline: 2,
    result: { tier: 'legendary', key: 'one_man_army' },
    failLabel: '一人的孤軍',
    goalText: '達成目標：生涯獎項 ≥ 7，且生涯累計賽段冠軍 ≥ 1',
    materialText: '所需素材：天才操作（通用）＋ 逆風翻盤（通用）',
  },
  {
    id: 'legend-iron-king',
    type: 'legend',
    name: '全勤鐵人',
    text: '八年職業生涯，一千四百場正式比賽。你缺席過一次——那一次，是整個賽區強制停賽。全勤榜上第二名的選手，比你少上場三百場。',
    trigger: ['and', ['has', 'common', 'iron'], ['has', 'epic', 'ascetic']],
    goal: ['and', ['stat', 'proYears', 'gte', 12], ['stat', 'awards', 'gte', 3]],
    deadline: null,
    result: { tier: 'legendary', key: 'iron_king' },
    failLabel: '生鏽的鐵人',
    goalText: '達成目標：職業年資 ≥ 12 年，且生涯獎項 ≥ 3',
    materialText: '所需素材：鐵人（通用）＋ 苦行僧（史詩）',
  },
  {
    id: 'legend-late-game',
    type: 'legend',
    name: '後期之魔',
    text: '四十分鐘前的你叫「拖」，四十分鐘後的你叫「魔」。對面教練的戰術板角落寫著一行小字：「別跟他們拖後期」——但沒有一支隊做得到。',
    // S20d/N12：舊 trigger 吃史詩 lockerroom——它與 ageless 雙胞胎配方互相搶料，
    // 實際上只從 route-team-soul 發放，持有率近零（0/160 開卡）。拖後期要的是
    // 心態與身體：換成 composure＋iron（鐵人是天生特質，零配方消耗，素材永不失效）
    trigger: ['and', ['has', 'common', 'composure'], ['has', 'common', 'iron']],
    goal: ['and', ['stat', 'intlWinRate', 'gte', 30], ['stat', 'splitTitles', 'gte', 1]],
    deadline: 2,
    result: { tier: 'legendary', key: 'late_game' },
    failLabel: '破功的後期',
    goalText: '達成目標：國際賽勝率 ≥ 30%，且生涯累計賽段冠軍 ≥ 1',
    materialText: '所需素材：心態沉穩（通用）＋ 鐵人（通用）',
  },
  {
    id: 'legend-adc-king',
    type: 'legend',
    name: '團戰收割',
    text: '你站在陣型最後排，全場九個人的目光卻都在你身上——因為每一場團戰的結局，都寫在你往下一步的走位裡。',
    trigger: ['and', ['has', 'common', 'camera'], ['has', 'rare', 'machine']],
    goal: ['and', ['stat', 'msiBest', 'lte', 3], ['stat', 'awards', 'gte', 2]],
    deadline: 2,
    result: { tier: 'legendary', key: 'adc_king' },
    failLabel: '被切死的輸出',
    goalText: '達成目標：站上 MSI 四強，且生涯獎項 ≥ 2',
    materialText: '所需素材：鏡頭感（通用）＋ 練功機器（稀有）',
  },
  {
    id: 'legend-mr-clutch',
    type: 'legend',
    name: '關鍵先生',
    text: '小組賽的你只是「還不錯」。淘汰賽的你——對面教練在 BP 的第一手，ban 的就是你的本命角。他輸怕了。',
    trigger: ['and', ['has', 'common', 'laneking'], ['has', 'rare', 'star']],
    goal: ['and', ['stat', 'msiBest', 'lte', 3], ['stat', 'splitTitles', 'gte', 1]],
    deadline: 2,
    result: { tier: 'legendary', key: 'mr_clutch' },
    failLabel: '熄火的關鍵局',
    goalText: '達成目標：站上 MSI 四強，且生涯累計賽段冠軍 ≥ 1',
    materialText: '所需素材：單殺王（通用）＋ 明星選手（稀有）',
  },
  {
    id: 'legend-record-breaker',
    type: 'legend',
    name: '紀錄粉碎機',
    text: '每季結束，數據分析師都會來找你簽名——不是簽在週邊上，是簽在紀錄簿的下一行。你那行，括號裡寫著「前紀錄保持者」。',
    // S20d/N12：rare/machine（練功機器）是雙配方限產素材，與 genius 同持近乎
    // 不可能（0/160 開卡）。換成自律——紀錄型選手就是每天把訓練寫進紀錄簿的人
    trigger: ['and', ['has', 'common', 'genius'], ['has', 'common', 'disc']],
    goal: ['and', ['stat', 'awards', 'gte', 5], ['stat', 'msiBest', 'lte', 3]],
    deadline: 2,
    result: { tier: 'legendary', key: 'record_breaker' },
    failLabel: '停擺的紀錄',
    goalText: '達成目標：生涯獎項 ≥ 5，且 MSI 站上過四強',
    materialText: '所需素材：天才操作（通用）＋ 自律（通用）',
  },
  {
    id: 'legend-champion-maker',
    type: 'legend',
    name: '冠軍體制',
    text: '每一支你加入的戰隊，三年內都捧回了聯賽獎盃。俱樂部老闆說：簽你不是簽一個人——是簽一整套會贏球的體制。',
    trigger: ['and', ['has', 'common', 'leader'], ['has', 'common', 'glue']],
    goal: ['and', ['stat', 'splitTitles', 'gte', 2], ['stat', 'awards', 'gte', 3]],
    deadline: 2,
    result: { tier: 'legendary', key: 'champion_maker' },
    failLabel: '失傳的體系',
    goalText: '達成目標：生涯累計賽段冠軍 ≥ 2，且生涯獎項 ≥ 3',
    materialText: '所需素材：團隊領袖（通用）＋ 休息室黏著劑（通用）',
  },

  // ══════════════ legend：戰績型 4 張（不吃素材，S19c 校準難度） ══════════════

  {
    // S35（§24.4.4）：第 21 張傳說卡——MSI 冠軍里程碑連動。trigger 是 MSI 決賽
    // （msiBest ≤ 2），goal 比 trigger 嚴格一級：捧杯。baseline 的 intlSemis 由
    // MSI 決賽自身滿足，不另找素材。與 grand_slam 共用 MSI 冠軍這個目標但互不
    // 代替：這張是「季中之王」的單一成就，那張是滿貫長跑
    id: 'legend-midseason-king',
    type: 'legend',
    name: '季中王者',
    text: '季中邀請賽的獎盃不大，捧起來卻比聯賽獎盃重——因為它證明你不只是賽區的王。決賽第五局結束的那一晚，外媒的標題第一次用「統治」形容你。',
    trigger: ['stat', 'msiBest', 'lte', 2],
    goal: ['stat', 'msiBest', 'lte', 1],
    deadline: null,
    result: { tier: 'legendary', key: 'midseason_king' },
    failLabel: '季中之憾',
    goalText: '達成目標：奪下 MSI 冠軍',
    materialText: null,
  },
  {
    id: 'legend-worlds-king',
    type: 'legend',
    name: '世界賽之王',
    text: '世界賽對你來說不是考場，是主場。別人備戰是緊張，你備戰是倒數——你數的是自己還欠世界賽幾個獎盃。',
    trigger: ['and', ['stat', 'worldsBest', 'lte', 3], ['stat', 'awards', 'gte', 4]],
    goal: ['and', ['stat', 'worldsBest', 'lte', 3], ['stat', 'awards', 'gte', 9]],
    deadline: null,
    result: { tier: 'legendary', key: 'worlds_king' },
    failLabel: '決賽的常客',
    goalText: '達成目標：站上世界賽四強，且生涯獎項 ≥ 9',
    materialText: null,
  },
  {
    id: 'legend-grand-slam',
    type: 'legend',
    name: '國際滿貫',
    text: 'MSI 獎盃在你左邊的櫃子，賽段獎盃在右邊的櫃子。中間空著的那一格，全聯盟只有一個位置放得進去。',
    trigger: ['and', ['stat', 'msiBest', 'lte', 2], ['stat', 'splitTitles', 'gte', 1]],
    goal: ['and', ['stat', 'msiBest', 'lte', 1], ['stat', 'worldsBest', 'lte', 3], ['stat', 'splitTitles', 'gte', 2]],
    deadline: null,
    result: { tier: 'legendary', key: 'grand_slam' },
    failLabel: '差一座的滿貫',
    goalText: '達成目標：MSI 奪冠，世界賽站上過四強，且生涯累計賽段冠軍 ≥ 2',
    materialText: null,
  },
  {
    id: 'legend-goat',
    type: 'legend',
    name: '史上第一人',
    text: '所有人都在等你退役——因為你宣布退役的那一天，就是「歷史最佳」這四個字移交給下一個人的日子。而你還沒想好要不要交。',
    trigger: ['and', ['stat', 'splitTitles', 'gte', 2], ['stat', 'awards', 'gte', 5]],
    goal: ['and', ['stat', 'splitTitles', 'gte', 4], ['stat', 'awards', 'gte', 16]],
    deadline: null,
    result: { tier: 'legendary', key: 'goat' },
    failLabel: '歷史的注腳',
    goalText: '達成目標：生涯累計賽段冠軍 ≥ 4，且生涯獎項 ≥ 16',
    materialText: null,
  },
  {
    id: 'legend-breakout',
    type: 'legend',
    name: '更上一層樓',
    text: '第一次站上國際賽四強的那晚，你發現自己沒有怯場——那個舞台，好像本來就是留給你的。',
    // S20d/N12：前身「出道即巔峰」（rookie-king）結構性死卡——引擎對所有 legend
    // trigger AND 上 LEGEND_BASELINE（intlSemis ≥ 1，engine/quests.js:66），而實測
    // 160 段生涯裡首次 MSI 淘汰賽最早落在職業第 11 年（p25＝13），任何「生涯前期」
    // 視窗的 trigger 與底線永遠錯身，0/160 開卡。重設計成國際突破卡：trigger 就是
    // 底線本身（首次國際四強即開卡），goal 是兩年內殺進 MSI 冠軍戰。特質鍵隨之
    // 改名 rookie_king → breakout（epics.js 同步）
    trigger: ['stat', 'intlSemis', 'gte', 1],
    goal: ['stat', 'msiBest', 'lte', 2],
    deadline: 2,
    result: { tier: 'legendary', key: 'breakout' },
    failLabel: '曇花一現',
    goalText: '達成目標：兩年內殺進 MSI 冠軍戰',
    materialText: null,
  },

  // ══════════════ route：替代性生涯路線 5 張（§14.3，只看軌跡不看素材） ══════════════

  {
    id: 'route-region-ruler',
    type: 'route',
    name: '賽區統治者',
    text: '外戰一條蟲，內戰一條龍。國際賽的成績單一片慘綠，但只要回到自家聯賽，你就是那尊沒人撼得動的神。',
    trigger: ['and', ['stat', 'splitTitles', 'gte', 1], ['stat', 'intlWinRate', 'lt', 40]],
    goal: ['and', ['stat', 'splitTitles', 'gte', 2], ['stat', 'intlWinRate', 'lt', 40]],
    deadline: 3,
    result: { tier: 'epic', key: 'soloking', label: '賽區統治者' },
    failLabel: '差一步的賽區霸主',
    goalText: '達成目標：生涯累計賽段冠軍 ≥ 2，且國際賽勝率 < 40%',
    materialText: null,
  },
  {
    id: 'route-mercenary',
    type: 'route',
    name: '流浪傭兵',
    text: '四支戰隊，四座城市，四種語言的筆記本。每次轉會都有人說你「待不住」——直到你幫第四支隊，捧起他們建隊以來的第一座獎盃。',
    trigger: ['and', ['stat', 'distinctTeams', 'gte', 4], ['stat', 'coachRating', 'gte', 55]],
    goal: ['and', ['stat', 'distinctTeams', 'gte', 5], ['stat', 'coachRating', 'gte', 65]],
    deadline: 3,
    result: { tier: 'epic', key: 'ascetic', label: '流浪傭兵' },
    failLabel: '找不到家的浪人',
    goalText: '達成目標：生涯效力 ≥ 5 支不同戰隊，且教練評價 ≥ 65',
    materialText: null,
  },
  {
    id: 'route-team-soul',
    type: 'route',
    name: '不滅隊魂',
    text: '建隊元老走光了，教練換了三任，隊名換過一次。你還在——升降賽、保級、重建，每一年的頭條都是「這支隊要完了」，而每一年的春天，你都還在場上。',
    trigger: ['and', ['stat', 'longestTenure', 'gte', 7], ['stat', 'disbandCrises', 'gte', 1]],
    goal: ['stat', 'longestTenure', 'gte', 10],
    deadline: null,
    result: { tier: 'epic', key: 'lockerroom', label: '不滅隊魂' },
    failLabel: '離隊的元老',
    goalText: '達成目標：效力同一戰隊 ≥ 10 年',
    materialText: null,
  },
  {
    id: 'route-green-leaf',
    type: 'route',
    name: '究極綠葉',
    text: '你永遠不在賽後採訪裡，戰隊週邊沒有你的版本，但你名字後面那排助攻數字，從你出道那天起就沒從聯賽前三名掉下來過。',
    trigger: ['and', ['percentile', 'assist', 'gte', 90], ['stat', 'awards', 'eq', 0]],
    goal: ['and', ['percentile', 'assist', 'gte', 90], ['stat', 'proYears', 'gte', 7]],
    deadline: null,
    result: { tier: 'epic', key: 'helper', label: '究極綠葉' },
    failLabel: '被遺忘的綠葉',
    goalText: '達成目標：生涯場均助攻達同位置歷史前 10%，且職業年資 ≥ 7 年',
    materialText: null,
  },
  {
    id: 'route-influencer',
    type: 'route',
    name: '網紅選手',
    text: '你的對線成績普普通通，但你的高光剪輯播放量是全聯盟第一。贊助商指名要你，俱樂部把你當流量密碼——你說自己只是「順便打職業」。',
    // S30 重校：原「peakRating ≤ 歷史母體中位數（68）」與 fame≥3 結構性互斥——
    // 160／320 段量測 fame≥3 的 peakRating 下限 71，高於母體 P90（72），百分位
    // 定義不可達（S26 交接筆記點名，§23.5 授權 S30 依樣本狀況重校）。改走 §23.5
    // 最小樣本規則的 fallback：絕對門檻 76 ≈ fame≥3 分布的中段（量測 47 段裡
    // ≤76 有 10 段），語意仍是「有名但巔峰不突出」，不再對歷史母體。
    trigger: ['and', ['stat', 'fameLevel', 'gte', 3], ['stat', 'peakRating', 'lte', 76]],
    goal: ['and', ['stat', 'fameLevel', 'eq', 4], ['stat', 'awards', 'lte', 2], ['stat', 'peakRating', 'lte', 76]],
    deadline: null,
    result: { tier: 'epic', key: 'showman', label: '網紅選手' },
    failLabel: '過氣網紅',
    goalText: '達成目標：知名度達「全民認識」，且生涯獎項 ≤ 2、生涯巔峰評價 ≤ 76',
    materialText: null,
  },
];
