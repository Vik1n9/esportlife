/**
 * 史詩特質（合成產物）與傳說特質（終極合成產物）與合成配方。純資料。
 *
 * `effects` 的寫法見 `data/traits.js`。合成配方放在這裡而不是 traits.js，是因為
 * 配方的產物就是高階特質——改配方時看的是這一張表。
 *
 * 合成分四階，概念取自 LoL 的道具合成（小件疊成終極裝）：
 *   通用（traits.js）→ 稀有（traits.js）→ 史詩（本檔）→ 傳說（本檔）。
 * 每一階都只消耗下一階的特質，配方見 `FUSIONS`。
 */
export const EPIC_TRAITS = {
  ageless: {
    name: '不老傳奇', desc: '退役上限 40；衰退 ×0.5，反應/操作再 ×0.5',
    effects: {
      retireAge: { floor: 40 }, declineOffset: { floor: 4 }, declineMult: { cap: 0.5 },
      careerScore: 120,
    },
    // 分段效果：30 歲後 OVR +1（年齡條件）、靈巧/技巧衰退再減半，寫在 engine/attributes.js
  },
  godhand: {
    name: '神之領域', desc: '成長 ×2；操作/反應上限 85；退役上限 38',
    effects: {
      abilityCapUp: true, ovrAdd: 2, growthMult: { mul: 2 },
      retireAge: { floor: 38 }, declineOffset: { floor: 2 }, giftedDice: true,
    },
  },
  ultstage: {
    name: '終極舞台', desc: '季後賽/國際賽 +15%；免疫心態崩盤',
    effects: { intlRoll: 8, tiltImmune: true },
    // 分段效果：抗壓加成先保底再加值，寫在 engine/mental.js
  },
  prophet: {
    name: '版本先知', desc: '版本落差懲罰歸零',
    effects: { patchImmune: true },
  },
  soloking: {
    name: '賽區之光', desc: '單殺 ×1.25；國際賽保底名次；世界賽發揮加成',
    effects: { soloRate: { mul: 1.25 }, intlFloor: { floor: 3 }, worldsRoll: 6 },
  },
  indestructible: {
    name: '金剛不壞', desc: '免疫受傷、復原加速',
    effects: { injuryImmune: true },
  },
  lockerroom: {
    name: '休息室傳奇', desc: '隊友 +6；續約年薪係數保底 1.15',
    effects: {
      teamLead: { floor: 6 }, coachMult: { mul: 1.3 },
      contractFloor: { floor: 1.15 }, verdictChemShield: true,
    },
    // 分段效果：默契加成只取正值再 +2，寫在 engine/mental.js
  },
  ascetic: {
    name: '苦行僧', desc: '每訓練週期 +1 顆骰；免疫享樂負面',
    effects: { diceBonus: 1, indulgentImmune: true },
  },
  miracle: {
    name: '奇蹟劇本', desc: '低種子加成大幅提升；決勝局不會崩',
    effects: { underdogDepth: 2.2 },
  },
  showman: {
    name: '話題製造機', desc: '知名度只漲不跌；風評下限保護',
    effects: { repShield: true },
    // 分段效果：扮演卡結算時知名度只進不退，寫在 game.js
  },
};

/**
 * 傳說特質（最高階，終極合成產物）。由兩個史詩特質合成，取得後該史詩即被消耗。
 * 傳說特質住在 `state.legendary`，由 `kernel/modifiers.js` 統一查詢。
 */
export const LEGENDARY_TRAITS = {
  immortal: {
    name: '不死魔王', desc: '退役上限 41；衰退 ×0.4；成長 ×3；突破上限',
    effects: {
      retireAge: { floor: 41 }, declineOffset: { floor: 5 }, declineMult: { cap: 0.4 },
      growthMult: { mul: 3 }, abilityCapUp: true,
    },
  },
  godslayer: {
    name: '弒神者', desc: '成長 ×3.5；突破上限',
    // 原本還帶 `ovrAdd: 4` 與 `seriesGame: 6`。那兩項是平白加分——不管你把點投得準不準
    // 都照領，於是「隨便練」的打法也吃得到頂端加成。四階合成的設計紀錄
    // （docs/superpowers/specs/2026-08-12-four-tier-trait-synthesis.md）已經記過同一件事：
    // 頂端加成要用「成長 ×N 與突破上限」，練得越準越吃得到。份量改由成長倍率承擔。
    effects: { growthMult: { mul: 3.5 }, abilityCapUp: true },
  },
  bulwark: {
    name: '銅牆鐵壁', desc: '免疫受傷；免疫默契崩盤；隊友 +8',
    effects: { injuryImmune: true, teamLead: { floor: 8 }, verdictChemShield: true },
  },
  showmaker: {
    name: '流量金身', desc: '代言 ×1.5；決勝局加成；續約保底 1.3',
    effects: {
      endorsement: { mul: 1.5 }, contractFloor: { floor: 1.3 }, seriesDecider: 4,
    },
  },
  underdog_run: {
    name: '一穿五', desc: '下剋上加成爆表；國際賽保底；世界賽大加成',
    effects: { underdogDepth: 3.2, intlFloor: { floor: 4 }, worldsRoll: 8 },
  },
  prophet_king: {
    name: '版本之神', desc: '版本懲罰歸零；成長 ×2.5；突破上限',
    effects: { patchImmune: true, growthMult: { mul: 2.5 }, abilityCapUp: true },
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
 * 兩池刻意不重疊：稀有吃「人格／媒體」類，史詩吃「競技表現」類，稀有與史詩不會
 * 互相搶素材，兩條線都能成立。傳說＝史詩＋稀有，素材一定分屬兩池。
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
