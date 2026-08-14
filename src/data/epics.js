/**
 * 史詩特質（合成產物）與傳說特質（生涯任務卡發放）與合成配方。純資料。
 *
 * 史詩與傳說的 schema 與 `data/traits.js` 相同（tier／pool／effects／sideEffects／
 * sideEffectLevel／exclusiveWith／maintain），S19a 定案後由 S18a 編輯器統一驗證。
 *
 * 合成分四階，概念取自 LoL 的道具合成（小件疊成終極裝）：
 *   通用（traits.js）→ 稀有（traits.js）→ 史詩（本檔）→ 傳說（本檔）。
 * 每一階都只消耗下一階的特質，配方見 `FUSIONS`。
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
};

/**
 * 傳說特質（最高階，§13.4：唯一來源＝生涯任務卡達成，不由配方自動合成）。
 * 傳說特質住在 `state.legendary`，由 `kernel/modifiers.js` 統一查詢。
 *
 * S19a 維持 6 個（擴到 20 是 S19b）。效果全部重度副作用——傳說是「改寫生涯」的等級，
 * 代價必須大到玩家看得出取捨。
 */
export const LEGENDARY_TRAITS = {
  immortal: {
    // v4.3：退役上限／衰退偏移／衰退倍率／突破上限四個效果鍵作廢（§7.2 ＋ 掛載禁令）。
    // 長壽與成長改由窗口表達：成長 ×2（頂格）、衰退極慢、巔峰延後三年。
    name: '不死魔王', tier: 'legend', pool: 'career',
    desc: '成長 ×2、衰退極慢、巔峰延後三年；獨斷獨行，信任 −10、隊友都怕他，摩擦 +12',
    effects: { growth_rate_mul: { mul: 2 }, fall_k_mul: { mul: 0.5 }, peak_age_shift: 3 },
    sideEffects: { mental_trust: -10, verdictRiftRisk: 12 }, sideEffectLevel: 'heavy',
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
  },
  underdog_run: {
    name: '一穿五', tier: 'legend', pool: 'career',
    desc: '下剋上加成爆表、國際賽保底、世界賽大加成；沒有被逼到絕境就不會打球，自信 −8',
    effects: { underdogDepth: 3.2, intlFloor: { floor: 4 }, worldsRoll: 8 },
    sideEffects: { mental_conf: -8 }, sideEffectLevel: 'heavy',
  },
  prophet_king: {
    name: '版本之神', tier: 'legend', pool: 'career',
    desc: '版本懲罰歸零、成長 ×1.8；看透一切，失去普通選手的飢渴，動機 −8',
    effects: { patchImmune: true, growth_rate_mul: { mul: 1.8 } },
    sideEffects: { mental_drive: -8 }, sideEffectLevel: 'heavy',
  },
};

/**
 * 合成配方（完全隱藏，UI 不揭露）。
 *
 * 每一條配方消耗 `need` 指定的特質、賦予 `outTier` 階特質。`need` 是
 * `[tier, key]` 的配對，tier 為 `traits`(通用) / `rare`(稀有) / `epic`(史詩) /
 * `legendary`(傳說)。
 *
 * 四階概念取自 LoL 道具合成（小件疊終極裝）：
 *   通用 → 稀有：由 2 個「人格／媒體」類通用小件合成。
 *   通用 → 史詩：核心配方，沿用既有設計（史詩是生涯主力，保持可達）。
 *   史詩 + 稀有 → 傳說：神話終極裝，把史詩與稀有再往上疊。
 *
 * 兩池刻意不重疊：稀有吃「人格／媒體」類（persona），史詩吃「競技表現」類
 * （performance），稀有與史詩不會互相搶素材，兩條線都能成立。
 *
 * ⚠ **v4.3：具體配方已作廢，由 S18a 特質編輯器重建；這裡的 24 條是既有設計的
 * 佔位，S19c 重建時整表換掉。S19a 不動這張表**（鍵名與素材因此保持不變）。
 *
 * 同一階的特質會被多條配方爭奪，因此「追求長壽」與「追求團隊」無法兼得——
 * 這是設計上的取捨，不是 bug。
 *
 * 順序即優先序：稀有配方排在史詩配方之前，這樣一次 `checkFusions` 就能把樹走完。
 */
export const FUSIONS = [
  // ── 通用 → 稀有 ──
  { outTier: 'rare', need: [['traits', 'grinder'], ['traits', 'lonewolf']], out: 'machine' },
  { outTier: 'rare', need: [['traits', 'meme'], ['traits', 'popular']], out: 'traffic' },
  { outTier: 'rare', need: [['traits', 'popular'], ['traits', 'camera']], out: 'star' },
  { outTier: 'rare', need: [['traits', 'glue'], ['traits', 'guardian']], out: 'pillar' },
  { outTier: 'rare', need: [['traits', 'franchise'], ['traits', 'glue']], out: 'og' },
  { outTier: 'rare', need: [['traits', 'franchise'], ['traits', 'popular']], out: 'icon' },
  { outTier: 'rare', need: [['traits', 'meme'], ['traits', 'camera']], out: 'joker' },
  { outTier: 'rare', need: [['traits', 'lonewolf'], ['traits', 'guardian']], out: 'watchdog' },

  // ── 通用 → 史詩（核心配方，沿用既有設計）──
  { outTier: 'epic', need: [['traits', 'veteran'], ['traits', 'disc'], ['traits', 'single']], out: 'ageless' },
  { outTier: 'epic', need: [['traits', 'genius'], ['traits', 'disc']], out: 'godhand' },
  { outTier: 'epic', need: [['traits', 'clutch'], ['traits', 'composure']], out: 'ultstage' },
  { outTier: 'epic', need: [['traits', 'meta'], ['traits', 'macroG']], out: 'prophet' },
  { outTier: 'epic', need: [['traits', 'intlghost'], ['traits', 'laneking']], out: 'soloking' },
  { outTier: 'epic', need: [['traits', 'iron'], ['traits', 'disc']], out: 'indestructible' },
  { outTier: 'epic', need: [['traits', 'leader'], ['traits', 'veteran']], out: 'lockerroom' },
  { outTier: 'epic', need: [['traits', 'single'], ['traits', 'disc']], out: 'ascetic' },
  { outTier: 'epic', need: [['traits', 'underdog'], ['traits', 'bigheart']], out: 'miracle' },
  { outTier: 'epic', need: [['traits', 'trashtalk'], ['traits', 'idol']], out: 'showman' },

  // ── 史詩 + 稀有 → 傳說（神話終極裝）。史詩（競技）與稀有（人格）素材分屬兩池，必然不重疊 ──
  { outTier: 'legendary', need: [['epic', 'ageless'], ['rare', 'machine']], out: 'immortal' },
  { outTier: 'legendary', need: [['epic', 'godhand'], ['rare', 'star']], out: 'godslayer' },
  { outTier: 'legendary', need: [['epic', 'indestructible'], ['rare', 'pillar']], out: 'bulwark' },
  { outTier: 'legendary', need: [['epic', 'showman'], ['rare', 'icon']], out: 'showmaker' },
  { outTier: 'legendary', need: [['epic', 'miracle'], ['rare', 'og']], out: 'underdog_run' },
  { outTier: 'legendary', need: [['epic', 'prophet'], ['rare', 'traffic']], out: 'prophet_king' },
];
