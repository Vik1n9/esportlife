/**
 * 史詩特質（合成產物）與傳說特質（生涯任務卡發放）與合成配方。純資料。
 *
 * 史詩與傳說的 schema 與 `data/traits.js` 相同（tier／pool／effects／sideEffects／
 * sideEffectLevel／exclusiveWith／maintain），S19a 定案後由 S18a 編輯器統一驗證。
 *
 * 合成分四階，概念取自 LoL 的道具合成（小件疊成終極裝）：
 *   通用（traits.js）→ 稀有（traits.js）→ 史詩（本檔）→ 傳說（本檔）。
 * 每一階都只消耗下一階的特質，配方見 `FUSIONS`。v4.1 起傳說**不由配方合成**——
 * 唯一來源是生涯任務卡達成（§13.4），所以配方只剩「通用 → 稀有」與
 * 「通用 → 史詩」兩段。
 *
 * 池歸屬：史詩一律 performance（§14.2 史詩＝2~3 個 performance 素材，且傳說任務卡的
 * 「史詩＋稀有」必然分屬兩池）；傳說不是配方素材、也不被合成消耗，池標 career。
 *
 * ⚠ 副作用分級（§13.2）：史詩「可」保留一個重度副作用作為代價，傳說則一律重度——
 * 愈強的益處配愈重的副作用，玩家要能從 desc 直接讀出「拿這個要付出什麼」。
 */
export const EPIC_TRAITS = {
  ageless: {
    // v4.3：退役上限／衰退偏移／衰退倍率三個效果鍵與「30 歲後 +1」已隨生命週期曲線
    // （§7.2）作廢。長壽改由 §7.2 的窗口表達：衰退極慢（fall_k_mul）＋ 巔峰延後
    // （peak_age_shift）。
    name: '不老傳奇', tier: 'epic', pool: 'performance',
    desc: '衰退極慢、巔峰延後兩年、生涯評分 +120；跟年輕隊友有代溝，信任 −8',
    effects: { careerScore: 120, fall_k_mul: { mul: 0.6 }, peak_age_shift: 2 },
    sideEffects: { mental_trust: -8 }, sideEffectLevel: 'heavy',
  },
  godhand: {
    // v4.3：突破上限／直接加評價／退役上限／衰退偏移四個效果鍵作廢——0–100 的 100
    // 就是頂，掛載禁令已廢。成長份量改由 growth_rate_mul 窗口承擔（clamp 上限 2.0，
    // ×2 就是頂格），上升期再靠 rise_k_mul 拉陡。
    name: '神之領域', tier: 'epic', pool: 'performance',
    desc: '成長 ×2、成長期更陡；單核天才，資源全給他，信任 −8、摩擦 +8',
    effects: { growth_rate_mul: { mul: 2 }, rise_k_mul: { mul: 1.15 } },
    sideEffects: { mental_trust: -8, verdictRiftRisk: 8 }, sideEffectLevel: 'heavy',
  },
  ultstage: {
    name: '終極舞台', tier: 'epic', pool: 'performance',
    desc: '季後賽／國際賽 +8、免疫心態崩盤；只在最大舞台發光，例行賽動力不足，動機 −6',
    effects: { intlRoll: 8, tiltImmune: true },
    sideEffects: { mental_drive: -6 }, sideEffectLevel: 'medium',
    // 分段效果：抗壓加成先保底再加值（clutchBonus），寫在 engine/mental.js
  },
  prophet: {
    name: '版本先知', tier: 'epic', pool: 'performance',
    desc: '版本落差懲罰歸零；逼全隊練新版本，隊友抱怨，摩擦 +8',
    effects: { patchImmune: true },
    sideEffects: { verdictRiftRisk: 8 }, sideEffectLevel: 'medium',
  },
  soloking: {
    name: '賽區之光', tier: 'epic', pool: 'performance',
    desc: '單殺 ×1.25、國際賽保底名次、世界賽發揮加成；揹著全賽區的期待，世界賽手軟，抗壓 −6',
    effects: { soloRate: { mul: 1.25 }, intlFloor: { floor: 3 }, worldsRoll: 6 },
    sideEffects: { mental_comp: -6 }, sideEffectLevel: 'medium',
  },
  indestructible: {
    name: '金剛不壞', tier: 'epic', pool: 'performance',
    desc: '免疫受傷、復原加速；一路順遂，少了危機感，動機 −6',
    effects: { injuryImmune: true },
    sideEffects: { mental_drive: -6 }, sideEffectLevel: 'medium',
  },
  lockerroom: {
    name: '休息室傳奇', tier: 'epic', pool: 'performance',
    desc: '隊友 +6、教練評價 ×1.3、續約保底、默契不會崩；花時間當心靈導師，自己練得少，訓練成效 −10%',
    effects: {
      teamLead: { floor: 6 }, coachMult: { mul: 1.3 },
      contractFloor: { floor: 1.15 }, verdictRiftShield: true,
    },
    sideEffects: { growth_rate_mul: { mul: 0.9 } }, sideEffectLevel: 'medium',
    // 分段效果：信任加成只取正值再 +2（trustBonus），寫在 engine/mental.js
  },
  ascetic: {
    name: '苦行僧', tier: 'epic', pool: 'performance',
    // v4.3：骰子加成（diceBonus）作廢，苦行的價值改由成長窗口＋紀律承接
    desc: '成長 ×1.15、紀律 +8、免疫享樂負面；苦行僧與世隔絕，信任 −8、摩擦 +6',
    effects: { growth_rate_mul: { mul: 1.15 }, mental_disc: 8, indulgentImmune: true },
    sideEffects: { mental_trust: -8, verdictRiftRisk: 6 }, sideEffectLevel: 'heavy',
    exclusiveWith: ['showman'],
  },
  miracle: {
    name: '奇蹟劇本', tier: 'epic', pool: 'performance',
    desc: '低種子加成大幅提升、決勝局不會崩；沒被逼到絕境就不會打球，自信 −4',
    effects: { underdogDepth: 2.2 },
    sideEffects: { mental_conf: -4 }, sideEffectLevel: 'medium',
  },
  showman: {
    name: '話題製造機', tier: 'epic', pool: 'performance',
    desc: '知名度只漲不跌、戰隊不會因為你的言行切割你；忙著製造話題，紀律 −8',
    effects: { verdictShield: true },
    sideEffects: { mental_disc: -8 }, sideEffectLevel: 'medium',
    exclusiveWith: ['ascetic'],
    // 分段效果：扮演卡結算時知名度只進不退，寫在 shared.js
  },
  helper: {
    // S19b 新增：route「究極綠葉」的達成產物（§14.3）。助攻王、零個人獎項——
    // 讓隊友發光的綠葉。效果強度刻意低於傳說：平庸局的終點是有名字的結局，
    // 不是補一張強牌（§14.2 的史詩持有率驗收線會跑掉）。
    name: '綠葉潤物', tier: 'epic', pool: 'performance',
    desc: '隊友戰力 +4、系列賽加成；默默無聞地奉獻，自己動力 −4、自信 −4',
    effects: { teamLead: { floor: 4 }, seriesGame: 4 },
    sideEffects: { mental_drive: -4, mental_conf: -4 }, sideEffectLevel: 'medium',
  },
};

/**
 * 傳說特質（最高階，§13.4：唯一來源＝生涯任務卡達成，不由配方自動合成）。
 * 傳說特質住在 `state.legendary`，由 `kernel/modifiers.js` 統一查詢。
 *
 * S19a 重建既有 6 個；S19b 擴到 20（§14.1 表定 20 種，取自 20 名最知名選手的
 * 軼事／榮譽的「打法意象」，鍵名與意象由 S18 的任務卡定義，本表只補特質本體）。
 * 效果全部重度副作用——傳說是「改寫生涯」的等級，代價必須大到玩家看得出取捨。
 *
 * ⚠ S01 教訓（docs/superpowers/specs/2026-08-12-four-tier-trait-synthesis.md）：
 * 傳說一律不准用平白加分（直接加 careerScore 那類）——平白加分會幫「隨便練」的
 * 打法也越過傳奇門檻，S07 的「傳奇要罕見」會破。本表所有益處都是成長窗口、
 * 比賽加成、隊友戰力、心理這類「練得越準越吃得到」的形式。
 */
export const LEGENDARY_TRAITS = {
  immortal: {
    // v4.3：退役上限／衰退偏移／衰退倍率／突破上限四個效果鍵作廢（§7.2 ＋ 掛載禁令）。
    // 長壽與成長改由窗口表達：成長 ×2（頂格）、衰退極慢、巔峰延後三年。
    name: '不死魔王', tier: 'legend', pool: 'career',
    desc: '成長 ×2、衰退極慢、巔峰延後三年；獨斷獨行，信任 −10、隊友都怕他，摩擦 +12',
    effects: { growth_rate_mul: { mul: 2 }, fall_k_mul: { mul: 0.5 }, peak_age_shift: 3 },
    sideEffects: { mental_trust: -10, verdictRiftRisk: 12 }, sideEffectLevel: 'heavy',
    exclusiveWith: ['iron_king'],
  },
  godslayer: {
    // v4.3：突破上限與直接加評價作廢，成長份量全由窗口承擔（growth ×2 ＋ 上升期極陡）
    name: '弒神者', tier: 'legend', pool: 'career',
    desc: '成長 ×2、成長期極陡；自認天下無敵，過自信（自信 −10）、不屑訓練（紀律 −8）',
    effects: { growth_rate_mul: { mul: 2 }, rise_k_mul: { mul: 1.5 } },
    sideEffects: { mental_conf: -10, mental_disc: -8 }, sideEffectLevel: 'heavy',
  },
  bulwark: {
    name: '銅牆鐵壁', tier: 'legend', pool: 'career',
    desc: '免疫受傷、免疫默契崩盤、隊友 +8；太穩太保守，決勝局綁手綁腳，關鍵加成 −6',
    effects: { injuryImmune: true, teamLead: { floor: 8 }, verdictRiftShield: true },
    sideEffects: { clutchAdd: -6 }, sideEffectLevel: 'heavy',
  },
  showmaker: {
    name: '流量金身', tier: 'legend', pool: 'career',
    desc: '代言 ×1.5、決勝局加成、續約保底 1.3；流量包袱極重，世界賽怕輸掉粉（抗壓 −10）、忙著經營人設（紀律 −8）',
    effects: {
      endorsement: { mul: 1.5 }, contractFloor: { floor: 1.3 }, seriesDecider: 4,
    },
    sideEffects: { mental_comp: -10, mental_disc: -8 }, sideEffectLevel: 'heavy',
    exclusiveWith: ['underdog_run'],
  },
  underdog_run: {
    name: '一穿五', tier: 'legend', pool: 'career',
    desc: '下剋上加成爆表、國際賽保底、世界賽大加成；沒有被逼到絕境就不會打球，自信 −8',
    effects: { underdogDepth: 3.2, intlFloor: { floor: 4 }, worldsRoll: 8 },
    sideEffects: { mental_conf: -8 }, sideEffectLevel: 'heavy',
    exclusiveWith: ['showmaker'],
  },
  prophet_king: {
    name: '版本之神', tier: 'legend', pool: 'career',
    desc: '版本懲罰歸零、成長 ×1.8；看透一切，失去普通選手的飢渴，動機 −8',
    effects: { patchImmune: true, growth_rate_mul: { mul: 1.8 } },
    sideEffects: { mental_drive: -8 }, sideEffectLevel: 'heavy',
    exclusiveWith: ['jungle_king'],
  },
  // ── S19b 新增 14 個（鍵名與取材意象由 S18 任務卡定義，五路都有代表）──

  heavenly: {
    // TheShy「河道劍魔」：極限操作、一打多。副作用走傷病——高風險打法要身體還債。
    name: '天神下凡', tier: 'legend', pool: 'career',
    desc: '系列賽與關鍵局加成、擊殺產出 ×1.4；極限操作高風險，小傷變大傷機率 ×1.4、紀律 −8',
    effects: { seriesGame: 6, clutchAdd: 6, killRate: { mul: 1.4 } },
    sideEffects: { injuryMinorChance: { mul: 1.4 }, mental_disc: -8 }, sideEffectLevel: 'heavy',
    exclusiveWith: ['iron_king'],
  },
  shotcaller: {
    // Mata「視野指揮」：燈號是隊伍的心臟。副作用走指揮權威——說一不二就沒人敢頂嘴。
    name: '運籌帷幄', tier: 'legend', pool: 'career',
    desc: '隊友戰力 +6、國際賽加成；指揮官說一不二，隊友不敢頂嘴，信任 −8、摩擦 +8',
    effects: { teamLead: { floor: 6 }, intlRoll: 8 },
    sideEffects: { mental_trust: -8, verdictRiftRisk: 8 }, sideEffectLevel: 'heavy',
    exclusiveWith: ['adc_king'],
  },
  jungle_king: {
    // Karsa「野區雷達」：對面打野的位置閉著眼都知道。副作用走輕敵——算路太精，正面變粗心。
    name: '野區掌控', tier: 'legend', pool: 'career',
    desc: '隊友戰力 +5、系列賽加成；算得太精開始輕敵，過自信（自信 +8）、動機 −6',
    effects: { teamLead: { floor: 5 }, seriesGame: 5 },
    sideEffects: { mental_conf: 8, mental_drive: -6 }, sideEffectLevel: 'heavy',
    exclusiveWith: ['prophet_king'],
  },
  one_man_army: {
    // Uzi／Rookie「一神帶四腿」：全隊資源傾斜給一人。副作用走資源黑洞——隊友陪練。
    name: '一人成軍', tier: 'legend', pool: 'career',
    desc: '擊殺產出 ×1.6、單殺 ×1.3；全隊資源傾斜給一人，隊友陪練，信任 −8、摩擦 +10',
    effects: { killRate: { mul: 1.6 }, soloRate: { mul: 1.3 } },
    sideEffects: { mental_trust: -8, verdictRiftRisk: 10 }, sideEffectLevel: 'heavy',
    exclusiveWith: ['champion_maker'],
  },
  iron_king: {
    // Faker／Clearlove 全勤紀錄：八年一千四百場。副作用走規律——機器容不下鬆懈。
    name: '全勤鐵人', tier: 'legend', pool: 'career',
    desc: '成長 ×1.3、衰退加速度 ×0.7；容不得隊友鬆懈（摩擦 +6）、熱情被規律磨平（動機 −8）',
    effects: { growth_rate_mul: { mul: 1.3 }, fall_accel_mul: { mul: 0.7 } },
    sideEffects: { verdictRiftRisk: 6, mental_drive: -8 }, sideEffectLevel: 'heavy',
    exclusiveWith: ['heavenly', 'immortal'],
  },
  late_game: {
    // Deft「後期之魔」：四十分鐘後的他是另一個人。副作用走前期——前四十分鐘他還在睡覺。
    name: '後期之魔', tier: 'legend', pool: 'career',
    desc: '決勝局與系列賽加成；前期隱形，扛不住前期的壓力，抗壓 −8',
    effects: { seriesDecider: 6, seriesGame: 6 },
    sideEffects: { mental_comp: -8 }, sideEffectLevel: 'heavy',
    exclusiveWith: ['mr_clutch'],
  },
  adc_king: {
    // Uzi／GALA「團戰收割」：陣型最後排的裁判。副作用走逆風——輸出環境被保慣了。
    name: '團戰收割', tier: 'legend', pool: 'career',
    desc: '關鍵加成 +8、擊殺產出 ×1.3；輸出環境靠人保，逆風就毛躁，韌性 −8',
    effects: { clutchAdd: 8, killRate: { mul: 1.3 } },
    sideEffects: { mental_resl: -8 }, sideEffectLevel: 'heavy',
    exclusiveWith: ['shotcaller'],
  },
  mr_clutch: {
    // Bengi「決勝局保障」：小組賽只是還不錯。副作用走例行賽——沒到關鍵時刻不興奮。
    name: '關鍵先生', tier: 'legend', pool: 'career',
    desc: '決勝局 +8、國際賽加成；例行賽心不在焉，動機 −8、紀律 −6',
    effects: { seriesDecider: 8, intlRoll: 10 },
    sideEffects: { mental_drive: -8, mental_disc: -6 }, sideEffectLevel: 'heavy',
    exclusiveWith: ['late_game'],
  },
  record_breaker: {
    // 數據型選手：簽名簽在紀錄簿的下一行。副作用走疏離——眼裡只有數據就沒有隊友。
    name: '紀錄粉碎機', tier: 'legend', pool: 'career',
    desc: '成長 ×1.25、擊殺產出 ×1.2；眼裡只有數據與紀錄，信任 −8、摩擦 +6',
    effects: { growth_rate_mul: { mul: 1.25 }, killRate: { mul: 1.2 } },
    sideEffects: { mental_trust: -8, verdictRiftRisk: 6 }, sideEffectLevel: 'heavy',
  },
  champion_maker: {
    // Doinb「冠軍體系」：簽的不是一個人，是一整套會贏球的體制。副作用走自我犧牲。
    name: '冠軍體制', tier: 'legend', pool: 'career',
    desc: '隊友戰力 +8、教練評價 ×1.25；時間都花在帶體系，成長 ×0.9、動機 −6',
    effects: { teamLead: { floor: 8 }, coachMult: { mul: 1.25 } },
    sideEffects: { growth_rate_mul: { mul: 0.9 }, mental_drive: -6 }, sideEffectLevel: 'heavy',
    exclusiveWith: ['one_man_army'],
  },
  worlds_king: {
    // Ruler「世界賽主場」：世界賽不是考場，是主場。副作用走等待——世界賽之外都是煎熬。
    name: '世界賽之王', tier: 'legend', pool: 'career',
    desc: '世界賽 +10、國際賽加成；世界賽之外都是等待，動機 −8、抗壓 −6',
    effects: { worldsRoll: 10, intlRoll: 8 },
    sideEffects: { mental_drive: -8, mental_comp: -6 }, sideEffectLevel: 'heavy',
  },
  grand_slam: {
    // Meiko「國際滿貫」：獎盃櫃只剩一格。副作用走成就後遺症——滿貫到手，例行賽沒意義。
    name: '國際滿貫', tier: 'legend', pool: 'career',
    desc: '國際賽 +10、關鍵局加成；滿貫在手，例行賽失去意義（動機 −6）、輸不起（韌性 −6）',
    effects: { intlRoll: 10, clutchAdd: 4 },
    sideEffects: { mental_drive: -6, mental_resl: -6 }, sideEffectLevel: 'heavy',
  },
  goat: {
    // Faker「史上第一人」：歷史最佳移交日。副作用走壓力——萬人盯著的只有你。
    name: '史上第一人', tier: 'legend', pool: 'career',
    desc: '世界賽 +10、國際賽 +10、決勝局 +6；揹著歷史的目光，抗壓 −10、紀律 −6',
    effects: { worldsRoll: 10, intlRoll: 10, seriesDecider: 6 },
    sideEffects: { mental_comp: -10, mental_disc: -6 }, sideEffectLevel: 'heavy',
  },
  rookie_king: {
    // Caps／Rookie「出道即巔峰」：開局站在別人爬五年才到的地方。副作用走少年得志。
    name: '出道即巔峰', tier: 'legend', pool: 'career',
    desc: '上升曲率 ×1.4、國際賽加成；少年得志，過自信（自信 +8）、練得少了（紀律 −8）',
    effects: { rise_k_mul: { mul: 1.4 }, intlRoll: 8 },
    sideEffects: { mental_conf: 8, mental_disc: -8 }, sideEffectLevel: 'heavy',
  },
};

/**
 * 獨有特質目錄（§14.1，S19b 建立）。
 *
 * 五種特質之一：**不可合成、不能當任何配方的素材、不進合成樹**，來源只有
 * 生涯條件直接授予（例如某個史實成就）。存在理由是給「配方以外」留一條取得
 * 管道——不走合成路線的 run 也有東西可拿。池歸屬一律 career（§14.2：career
 * 池＝獨有特質／生涯標籤專用）。
 *
 * S20c 接線：`state.unique` 存放、`TIER_STORES.unique` 消費、授予口是
 * `progression.js` 的 `grantUniqueTraits`，年度結算跑一次。
 *
 * - `grant` 是給人讀的設計描述（史實成就的由來），不參與求值。
 * - `grantWhen` 是**可求值的授予條件**，與任務卡、事件卡同一套 `evalCond`
 *   （`AGENTS.md` 條件語言規則）。原本三條 `grant` 都是自然語言字串，餵不進
 *   求值器——資料存在、消費端不存在，就是 A2 那一類死資料。
 * - `grantWhen: null` 代表**前提還沒建好**，本站不硬造一個假追蹤。
 */
export const UNIQUE_TRAITS = {
  late_bloom: {
    name: '老來俏', tier: 'unique', pool: 'career',
    desc: '生涯末段大賽加成；年輕時錯過的，老了加倍討回來，動機 −4',
    effects: { clutchAdd: 4, intlRoll: 4 },
    sideEffects: { mental_drive: -4 }, sideEffectLevel: 'medium',
    grant: '生涯末期（30 歲後）單季拿下個人獎項——史實成就：暮年爆發的傳奇',
    grantWhen: ['and', ['stat', 'age', 'gte', 30], ['stat', 'awardsThisYear', 'gte', 1]],
  },
  thousand_games: {
    name: '千錘百鍊', tier: 'unique', pool: 'career',
    desc: '小傷轉大傷機率 ×0.6；打過一千場的人知道怎麼保護自己，例行賽提不起勁（動機 −4）',
    effects: { injuryMinorChance: { mul: 0.6 } },
    sideEffects: { mental_drive: -4 }, sideEffectLevel: 'medium',
    grant: '職業生涯累計出賽 ≥ 1000 場——史實成就：全勤的紀錄',
    grantWhen: ['stat', 'careerGames', 'gte', 1000],
  },
  torch_bearer: {
    name: '火炬手', tier: 'unique', pool: 'career',
    desc: '國際賽加成；親手擊敗上一任世界冠軍，之後看誰都覺得不過如此（自信 +6）',
    effects: { intlRoll: 6 },
    sideEffects: { mental_conf: 6 }, sideEffectLevel: 'medium',
    grant: '世界賽淘汰現任世界冠軍——史實成就：世代交替的那一手',
    // ⚠ S20g 接：遊戲裡目前沒有「現任世界冠軍」這個東西——`worlds.js` 的對手全文
    // 是一個浮點數，且玩家沒奪冠的年份不記錄誰奪冠。要先建對手身分層與冠軍登記表，
    // 不是把條件硬寫成一個近似值（那是把 A2 換個地方再犯一次）
    grantWhen: null,
  },
};

/**
 * 合成配方（完全隱藏，UI 不揭露）。
 *
 * 每一條配方消耗 `need` 指定的特質、賦予 `outTier` 階特質。`need` 是
 * `[tier, key]` 的配對，tier 為 `common`(通用) / `rare`(稀有) / `epic`(史詩)。
 *
 * ⚠ 階名以 `kernel/modifiers.js` 的 `TIER_STORES` 為準（S20c 收斂）。這裡原本
 * 寫 `traits`、任務卡條件式寫 `common`，同一階兩套拼法。
 *
 * 四階概念取自 LoL 道具合成（小件疊終極裝）：
 *   通用 → 稀有：由 2 個「人格／媒體」類通用小件合成。
 *   通用 → 史詩：核心配方，沿用既有設計（史詩是生涯主力，保持可達）。
 * 傳說不進配方（§13.4：唯一來源是生涯任務卡達成）——`outTier` 只剩
 * `rare`／`epic` 兩階，留 `legendary` 的配方就是讓傳說繞過任務卡的第二條
 * 發放路徑（v4.1 的漏洞，S19c 移除）。
 *
 * 兩池刻意不重疊：稀有吃「人格／媒體」類（persona），史詩吃「競技表現」類
 * （performance），稀有與史詩不會互相搶素材，兩條線都能成立。
 *
 * S19c 重寫（v4.3：具體配方由編輯器重建後的落檔）：
 *   1. **素材全過 §14.2 死配方線**（取得率 = 持有＋合成消耗，160 段實測 ≥15%）。
 *   2. **任務卡素材優先保留給開卡**：S18 的 25 張任務卡吃 guardian、grinder、
 *      glue、camera、meta、composure、leader、laneking、underdog、disc、
 *      trashtalk、iron、genius、meme。v4.2 規則一「素材失效即失敗」：開卡後
 *      素材被合成消耗 = 永久失敗。所以配方素材盡量選任務卡零用的（popular、
 *      lonewolf、innateLeader、veteran、clutch、bigheart、macroG、glass、
 *      intlghost），任務卡素材（guardian、glue、grinder、camera、meme、disc、
 *      laneking、composure）每素材至多 1~2 條配方——否則開卡窗口直接消失
 *      （S19c 量到 bulwark／shotcaller／late-game 0 開卡的根因）。
 *   3. **表序 = §14.2 衛生規則（二）**：同一素材被多條配方共用時，依「素材
 *      取得率乘積」升序排——稀缺素材讓給最難湊的配方先檢核，不由表行序決定。
 *      每組共用素材的相對順序由 `tests/kernel/traits.mjs` 鎖住。
 *
 * 同一階的特質會被多條配方爭奪，因此「追求長壽」與「追求團隊」無法兼得——
 * 這是設計上的取捨，不是 bug。
 */
export const FUSIONS = [
  // ── 通用 → 稀有（persona 素材；產物 star／machine／traffic 是任務卡素材，
  //    產能優先）──
  { outTier: 'rare', need: [['common', 'lonewolf'], ['common', 'guardian']], out: 'watchdog' },
  { outTier: 'rare', need: [['common', 'meme'], ['common', 'lonewolf']], out: 'joker' },
  { outTier: 'rare', need: [['common', 'innateLeader'], ['common', 'glue']], out: 'og' },
  { outTier: 'rare', need: [['common', 'popular'], ['common', 'innateLeader']], out: 'icon' },
  { outTier: 'rare', need: [['common', 'glue'], ['common', 'grinder']], out: 'pillar' },
  { outTier: 'rare', need: [['common', 'grinder'], ['common', 'popular']], out: 'machine' },
  { outTier: 'rare', need: [['common', 'camera'], ['common', 'popular']], out: 'star' },
  { outTier: 'rare', need: [['common', 'meme'], ['common', 'popular']], out: 'traffic' },

  // ── 通用 → 史詩（performance 素材，2 個；產物 ultstage／soloking／ascetic／
  //    lockerroom 是任務卡素材，配方素材刻意不與其他史詩配方共用，保產能）──
  { outTier: 'epic', need: [['common', 'macroG'], ['common', 'bigheart']], out: 'miracle' },
  { outTier: 'epic', need: [['common', 'glass'], ['common', 'bigheart']], out: 'indestructible' },
  { outTier: 'epic', need: [['common', 'clutch'], ['common', 'macroG']], out: 'godhand' },
  { outTier: 'epic', need: [['common', 'veteran'], ['common', 'macroG']], out: 'prophet' },
  { outTier: 'epic', need: [['common', 'disc'], ['common', 'bigheart']], out: 'ascetic' },
  { outTier: 'epic', need: [['common', 'trashtalk'], ['common', 'glass']], out: 'showman' },
  { outTier: 'epic', need: [['common', 'intlghost'], ['common', 'laneking']], out: 'soloking' },
  { outTier: 'epic', need: [['common', 'veteran'], ['common', 'clutch']], out: 'ageless' },
  { outTier: 'epic', need: [['common', 'clutch'], ['common', 'veteran']], out: 'lockerroom' },
  { outTier: 'epic', need: [['common', 'clutch'], ['common', 'composure']], out: 'ultstage' },
];
