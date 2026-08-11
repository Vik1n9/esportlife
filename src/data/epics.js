/**
 * 史詩特質（合成產物，不可再被消耗）與合成配方。純資料。
 *
 * `effects` 的寫法見 `data/traits.js`。合成配方放在這裡而不是 traits.js，是因為
 * 配方的產物就是史詩特質——改配方時看的是這一張表。
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
 * 合成配方（完全隱藏，UI 不揭露）。
 * 命中即消耗基礎特質、賦予史詩特質。`老將`／`單身`／`自律` 會被多條配方爭奪，
 * 因此「追求長壽」與「追求團隊」無法兼得——這是設計上的取捨，不是 bug。
 *
 * 順序即優先序：先寫的先檢查。
 */
export const FUSIONS = [
  { need: ['veteran', 'disc', 'single'], out: 'ageless' },
  { need: ['genius', 'disc'], out: 'godhand' },
  { need: ['clutch', 'composure'], out: 'ultstage' },
  { need: ['meta', 'macroG'], out: 'prophet' },
  { need: ['intlghost', 'laneking'], out: 'soloking' },
  { need: ['iron', 'disc'], out: 'indestructible' },
  { need: ['leader', 'veteran'], out: 'lockerroom' },
  { need: ['single', 'disc'], out: 'ascetic' },
  { need: ['underdog', 'bigheart'], out: 'miracle' },
  { need: ['trashtalk', 'idol'], out: 'showman' },
];
