/** 隱藏特質、史詩特質、合成配方。純資料。 */

/** 基礎特質（可被合成消耗） */
export const BASE_TRAITS = {
  genius:    { name: '天才操作', desc: '訓練骰固定 4 點以上' },
  iron:      { name: '鐵人', desc: '受傷機率大幅降低' },
  meta:      { name: '版本適應者', desc: '版本落差懲罰減半' },
  macroG:    { name: '營運鬼才', desc: '大局觀成長與勝率加成' },
  clutch:    { name: '大賽選手', desc: '季後賽與國際賽發揮加成' },
  composure: { name: '心態沉穩', desc: '低潮與逆風不易崩盤' },
  intlghost: { name: '國際賽之鬼', desc: '國際賽保底能力點' },
  laneking:  { name: '單殺王', desc: '單殺產出提升' },
  leader:    { name: '團隊領袖', desc: '隊友戰力 +5' },
  franchise: { name: '神主牌', desc: '續約優先、年薪係數保底' },
  popular:   { name: '人氣選手', desc: '代言收入與續約意願提升' },
  veteran:   { name: '老將', desc: '衰退減緩、退役上限 36' },
  disc:      { name: '自律', desc: '訓練骰有機率額外 +1' },
  single:    { name: '單身', desc: '可參與多條合成配方' },
  tilt:      { name: '心態崩盤', desc: '（負面）逆風時表現下滑' },
};

/** 史詩特質（合成產物，不可再被消耗） */
export const EPIC_TRAITS = {
  ageless:        { name: '不老傳奇', desc: '退役上限 40；衰退 ×0.5，反應/操作再 ×0.5' },
  godhand:        { name: '神之領域', desc: '成長 ×2；操作/反應上限 85；退役上限 38' },
  ultstage:       { name: '終極舞台', desc: '季後賽/國際賽 +15%；免疫心態崩盤' },
  prophet:        { name: '版本先知', desc: '版本落差懲罰歸零' },
  nationalace:    { name: '國家隊王牌', desc: '單殺 ×1.25；國際賽保底；免疫國際賽消耗' },
  indestructible: { name: '金剛不壞', desc: '免疫受傷、復原加速' },
  lockerroom:     { name: '更衣室傳奇', desc: '隊友 +6；續約年薪係數保底 1.15' },
  ascetic:        { name: '苦行僧', desc: '每訓練週期 +1 顆骰；免疫享樂負面' },
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
  { need: ['intlghost', 'laneking'], out: 'nationalace' },
  { need: ['iron', 'disc'], out: 'indestructible' },
  { need: ['leader', 'veteran'], out: 'lockerroom' },
  { need: ['single', 'disc'], out: 'ascetic' },
];

export function traitName(key) {
  return (BASE_TRAITS[key] || EPIC_TRAITS[key] || { name: key }).name;
}
