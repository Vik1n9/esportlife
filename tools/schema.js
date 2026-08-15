/**
 * 內容編輯器（S18a）——七類資料的宣告式 schema 描述與驗證。
 *
 * 規格：V4 §14.7／§14.8（編輯指南）、§12.2（事件卡結構）、§12.3（任務卡 schema）、
 * §5.4（訓練事件卡結構）、§13／§14.1（特質卡）、§14.6（配方）、§14.1（天生特質）。
 *
 * 這個檔是工具的核心：editor.js 依這裡的欄位描述渲染表單、做即時驗證。schema 變了
 * 只改這一個檔。可選值（屬性鍵、心理維度、特質鍵、謂詞名、時段標籤……）全部從
 * `src/data/*` 與 `src/engine/*` 匯入，不手打——欄位名與可選值只寫一次。
 *
 * ⚠ 工具是 src/ 的唯讀消費者：這裡 import src 的資料模組只是「拿清單來填下拉」，
 * 不修改任何遊戲程式。
 */
import { ATTRS, ATTR_NAMES } from '../src/data/attributes.js';
import { MENTAL_KEYS, MENTAL_NAMES } from '../src/data/mental.js';
import { SKILL_NAMES } from '../src/data/skills.js';
import { BASE_TRAITS, RARE_TRAITS } from '../src/data/traits.js';
import { EPIC_TRAITS, LEGENDARY_TRAITS, FUSIONS } from '../src/data/epics.js';
import { EVENT_CARDS } from '../src/data/events.js';
import { TRAINING_CARDS } from '../src/data/trainingCards.js';
import { QUEST_CARDS } from '../src/data/quests.js';
import { INNATE_POOL } from '../src/data/innate.js';
import { LIFECYCLE_WINDOWS } from '../src/kernel/modifiers.js';

/* ================= 共用可選值 ================= */

/** 四池（§12.2 與 §14.2 同一套） */
export const POOLS = ['persona', 'performance', 'psych', 'career'];

export const POOL_LABELS = {
  persona: 'persona 人格／媒體（稀有素材）',
  performance: 'performance 競技表現（史詩素材）',
  psych: 'psych 心理層（不入合成）',
  career: 'career 生涯層（不入合成）',
};

/** 時段標籤（§12.2） */
export const SLOTS = ['amateur', 'am2', 'offseason', 'regular', 'playoffs', 'msi', 'worlds', 'qualifier', 'transfer', 'crisis'];

export const SLOT_LABELS = {
  amateur: '業餘期', am2: '青訓期', offseason: '休賽期（1、12 月）',
  regular: '常規賽期間', playoffs: '季後賽期間', msi: 'MSI 期間',
  worlds: '世界賽期間', qualifier: '生死戰', transfer: '轉會期',
  crisis: '降級／解散危機（不分月份）',
};

/** 子標籤（§12.2 子標籤表，依池分類） */
export const SUB_TAGS = ['transfer', 'media', 'life', 'team', 'training', 'match', 'body', 'pressure', 'crisis'];

export const SUB_LABELS = {
  transfer: '轉會', media: '媒體', life: '生活', team: '隊伍',
  training: '訓練', match: '賽事', body: '傷病', pressure: '壓力', crisis: '危機',
};

/** 生涯階段（when.stage） */
export const STAGES = ['AMATEUR', 'AM2', 'PRO'];

/** 特質階級（§14.7 種類歸屬） */
export const TIERS = ['common', 'rare', 'epic', 'legend', 'unique'];

export const TIER_LABELS = {
  common: 'common 通用', rare: 'rare 稀有', epic: 'epic 史詩',
  legend: 'legend 傳說', unique: 'unique 獨有',
};

/** 副作用分級（§13.2） */
export const SIDE_LEVELS = ['light', 'medium', 'heavy'];

export const SIDE_LABELS = {
  light: '輕度：小數值扣減', medium: '中度：明顯扣減',
  heavy: '重度：大幅扣減、改變玩法（只給史詩與傳說）',
};

/** 訓練事件卡檔位（§5.4） */
export const CARD_TIERS = ['great_success', 'success', 'failure', 'great_failure'];

export const CARD_TIER_LABELS = {
  great_success: '大成功（係數 1.5，可動心理）',
  success: '成功（係數 1.0）',
  failure: '失敗（係數 0.3）',
  great_failure: '大失敗（係數 0，可動心理、承擔受傷）',
};

/** 訓練卡池別（§5.4） */
export const CARD_POOLS = ['success', 'failure'];

export const CARD_POOL_LABELS = {
  success: 'success_pool 成功池', failure: 'failure_pool 失敗池',
};

/** 生涯任務卡類型（§12.3） */
export const QUEST_TYPES = ['legend', 'route'];

export const QUEST_TYPE_LABELS = {
  legend: 'legend 傳說任務卡', route: 'route 生涯路線卡',
};

/** 條件式的比較子（engine/conditions.js 的 OPS） */
export const COND_OPS = ['lt', 'lte', 'eq', 'gte', 'gt', 'ne'];

/** 條件式的階名（與 TIER_STORES 對齊） */
export const COND_TIERS = ['common', 'rare', 'epic', 'legendary'];

/**
 * 條件式可用的謂詞名（engine/conditions.js 的 QUERIES）。
 * ⚠ 加新謂詞＝在 engine/conditions.js 加一行，這裡要同步——工具靠它驗證
 * 「特質的觸發條件引用不存在的謂詞」。
 */
export const PREDICATES = [
  'age', 'proYears', 'splitTitles', 'awards', 'disbandCrises', 'fame',
  'careerScore', 'coachRating', 'intlWinRate', 'assistsPerGame',
  'longestTenure', 'distinctTeams', 'worldsBest', 'msiBest', 'intlSemis',
  'fameLevel', 'era', 'region', 'role',
  ...MENTAL_KEYS,
];

/** 心理維度鍵（隱藏六維，v4.3 起條件式可讀） */
export const MENTAL_DIMS = MENTAL_KEYS;

/* ================= 特質效果鍵 ================= */

/**
 * 引擎真正消費的效果鍵（從 src/ 掃 modifiers 的四個查詢入口＋窗口得來）。
 *
 * ⚠ 這是「效果鍵被引擎消費」檢查的依據：特質宣告的效果鍵不在這張表＝打錯鍵，
 * 特質會靜靜地沒有效果（§14.8 檢查表最後一項）。新增效果鍵要同時改
 * `src/kernel/modifiers.js` 的消費端與這張表。
 */
export const EFFECT_KEYS = [
  // 加法／乘法／保底／封頂共用鍵（kernel/modifiers.js 的 bonus/factor/floorOf/capOf）
  'benchRisk', 'careerScore', 'clutchAdd', 'coachMult', 'contractAdd',
  'contractCap', 'contractCapShort', 'contractFloor', 'endorsement',
  'importExempt', 'indulgentImmune', 'injuryImmune', 'injuryMinorChance',
  'injuryRate', 'intlFloor', 'intlRoll', 'killRate', 'offerPenalty',
  'patchDebt', 'patchImmune', 'seriesDecider', 'seriesGame', 'soloRate',
  'teamLead', 'tiltImmune', 'underdogDepth', 'verdictFireRisk',
  'verdictRiftRisk', 'verdictRiftShield', 'verdictShield', 'worldsRoll',
  // §7.2 六窗口（peak_age_shift 是加法、其餘五個是乘法）
  ...Object.keys(LIFECYCLE_WINDOWS),
  // 心理層效果（engine/psych.js 的 mentalMod 消費，§14.4 C 層）
  ...MENTAL_KEYS.map((k) => `mental_${k}`),
];

export const EFFECT_KEYS_LABELS = {
  benchRisk: '板凳風險', careerScore: '生涯評分', clutchAdd: '關鍵加成',
  coachMult: '教練評價倍率', contractAdd: '合約加分', contractCap: '合約係數封頂',
  contractCapShort: '短約係數封頂', contractFloor: '合約係數保底',
  endorsement: '代言收入', importExempt: '外援名額豁免', indulgentImmune: '享樂免疫',
  injuryImmune: '免疫受傷', injuryMinorChance: '小傷轉大傷機率',
  injuryRate: '受傷率封頂', intlFloor: '國際賽保底名次', intlRoll: '國際賽加成',
  killRate: '擊殺產出', offerPenalty: '報價縮水', patchDebt: '版本落差懲罰',
  patchImmune: '版本免疫', seriesDecider: '決勝局加成', seriesGame: '系列賽加成',
  soloRate: '單殺產出', teamLead: '隊友戰力', tiltImmune: '免疫心態崩盤',
  underdogDepth: '下剋上深度', verdictFireRisk: '切割風險',
  verdictRiftRisk: '休息室摩擦', verdictRiftShield: '免疫默契崩盤',
  verdictShield: '戰隊不切割', worldsRoll: '世界賽加成',
  peak_age_shift: '巔峰延後（年，加法）', rise_k_mul: '上升曲率倍率',
  fall_k_mul: '衰退速率倍率', fall_accel_mul: '衰退加速度倍率',
  decline_pull_mul: '跟隨速率倍率', growth_rate_mul: '成長倍率（窗口）',
  mental_comp: '心理·抗壓', mental_conf: '心理·自信', mental_drive: '心理·動機',
  mental_disc: '心理·紀律', mental_trust: '心理·信任', mental_resl: '心理·韌性',
};

/** 效果寫法（kernel/modifiers.js 四種＋窗口） */
export const EFFECT_OPS = ['add', 'mul', 'floor', 'cap', 'flag'];

export const EFFECT_OP_LABELS = {
  add: '加法（直接加減）', mul: '乘法（乘上倍率）',
  floor: '保底（取最大值）', cap: '封頂（取最小值）', flag: '旗標（true）',
};

/* ================= 欄位型別 ================= */

/**
 * 欄位型別：
 *   text / textarea / number / bool
 *   enum（單選）／multienum（複選）
 *   id（唯一鍵）
 *   cond（條件式：驗語法與謂詞名，不驗形狀）
 *   effect（效果物件：四種寫法＋窗口）
 *   when（事件卡觸發條件：stage/minAge/maxAge/attr/trait/mental）
 *   outcome（事件卡結果：text＋attr＋flags）
 *   option（事件卡選項：label/odds/gain/loss/traits/on/flags）
 *   list（子陣列，min/max 控選項數 2~4）
 */
export const FIELD_TYPES = [
  'text', 'textarea', 'number', 'bool', 'enum', 'multienum', 'id',
  'cond', 'effect', 'when', 'outcome', 'option', 'list',
];

/* ================= 特質鍵清單（四階共用命名空間） ================= */

export const ALL_TRAIT_KEYS = [
  ...Object.keys(BASE_TRAITS), ...Object.keys(RARE_TRAITS),
  ...Object.keys(EPIC_TRAITS), ...Object.keys(LEGENDARY_TRAITS),
];

export const TRAIT_KEY_LABELS = Object.fromEntries(ALL_TRAIT_KEYS.map((k) => [
  k, `${k}（${(BASE_TRAITS[k] || RARE_TRAITS[k] || EPIC_TRAITS[k] || LEGENDARY_TRAITS[k]).name}）`,
]));

/** 事件卡旗標鍵（engine/eventTrigger.js 的 FLAG_TRAIT＋其他引擎消費的旗標） */
export const FLAG_KEYS = [
  'popular', 'composure', 'leader', 'laneking', 'macroPoint', 'grinder',
  'meme', 'camera', 'guardian', 'tiltRisk', 'patchDebt', 'injuryRisk',
  'bonusSalary', 'romance', 'mateMorale', 'trashtalk', 'clutch', 'meta',
  'genius', 'intlghost', 'underdog',
];

export const FLAG_LABELS = {
  popular: '人氣', composure: '心態沉穩', leader: '團隊領袖', laneking: '單殺王',
  macroPoint: '營運鬼才', grinder: '肝帝', meme: '梗王', camera: '鏡頭感',
  guardian: '守護者', tiltRisk: '心態崩盤', patchDebt: '版本落差',
  injuryRisk: '受傷風險', bonusSalary: '加薪', romance: '交往',
  mateMorale: '隊友士氣', trashtalk: '嘴砲王', clutch: '大賽選手', meta: '版本適應者',
  genius: '天才操作', intlghost: '國際賽之鬼', underdog: '逆風翻盤',
};

/* ================= 五類資料的 schema ================= */

export const SCHEMAS = {
  event: {
    id: 'event',
    label: '一般事件卡',
    intro: '一般事件卡（§12.2）：四池＋子標籤＋時段標籤，選項 2~4、互斥成對。',
    source: EVENT_CARDS,
    keyOf: (c) => c.id,
    fields: [
      { key: 'id', label: 'id', type: 'id', required: true },
      { key: 'name', label: '名稱', type: 'text', required: true },
      { key: 'kind', label: '種類', type: 'enum', options: ['normal', 'indulgent', 'romance', 'patch'],
        labels: { normal: '一般', indulgent: '享樂', romance: '感情', patch: '版本' }, required: true },
      { key: 'pool', label: '分類池', type: 'multienum', options: POOLS, labels: POOL_LABELS, required: true },
      { key: 'sub', label: '子標籤', type: 'enum', options: SUB_TAGS, labels: SUB_LABELS },
      { key: 'slot', label: '時段標籤', type: 'multienum', options: SLOTS, labels: SLOT_LABELS },
      { key: 'excl', label: '互斥群組', type: 'text', hint: '同組卡互相排斥；solo_<id> 表示自成一格（必填，不填引擎會出錯）' },
      { key: 'when', label: '觸發條件', type: 'when', optional: true },
      { key: 'priority', label: '優先度', type: 'number', min: 0, optional: true },
      { key: 'prompt', label: '敘事文本', type: 'textarea', required: true },
      { key: 'options', label: '選項（2~4 個）', type: 'list', min: 2, max: 4,
        item: {
          fields: [
            { key: 'id', label: 'id', type: 'id' },
            { key: 'label', label: '選項文字', type: 'text', required: true },
            { key: 'odds', label: '成功基準（%）', type: 'number', min: 0, max: 100, required: true },
            { key: 'gain', label: '成功倍率', type: 'number', min: 0 },
            { key: 'loss', label: '失敗倍率', type: 'number', min: 0 },
            { key: 'main', label: '主推選項', type: 'bool' },
            { key: 'traits', label: '碰隱藏素質', type: 'bool', hint: 'false＝這條路不碰隱藏素質' },
            { key: 'flags', label: '旗標', type: 'multienum', options: FLAG_KEYS, labels: FLAG_LABELS, optional: true },
            { key: 'on', label: '自訂結果', type: 'outcome', optional: true },
          ],
        } },
      { key: 'good', label: '好結果', type: 'outcome' },
      { key: 'bad', label: '壞結果', type: 'outcome' },
    ],
  },

  trainingCard: {
    id: 'trainingCard',
    label: '訓練事件卡',
    intro: '訓練事件卡（§5.4）：檔位＋池別＋權重。大成功／大失敗才可動心理（§14.8.4）。',
    source: TRAINING_CARDS,
    keyOf: (c) => c.id,
    fields: [
      { key: 'id', label: 'id', type: 'id', required: true },
      { key: 'tier', label: '檔位', type: 'enum', options: CARD_TIERS, labels: CARD_TIER_LABELS, required: true },
      { key: 'pool', label: '池別', type: 'enum', options: CARD_POOLS, labels: CARD_POOL_LABELS, required: true },
      { key: 'weight', label: '權重', type: 'number', min: 0, required: true },
      { key: 'text', label: '敘事文本', type: 'textarea', required: true },
      {
        key: 'effects', label: '效果', type: 'effect', optional: true, required: false,
        fields: [
          { key: 'mental', label: '心理增減（僅大成功／大失敗，±3~5）', type: 'mentalMap', optional: true },
          { key: 'buff', label: '短期 buff', type: 'buff', optional: true },
          { key: 'injury', label: '受傷（大失敗承擔）', type: 'bool', optional: true },
        ],
      },
    ],
  },

  quest: {
    id: 'quest',
    label: '生涯任務卡',
    intro: '生涯任務卡（§12.3）：legend／route 共用同一套 schema。觸發與達成是條件式——驗語法與謂詞名，不驗形狀。',
    source: QUEST_CARDS,
    keyOf: (c) => c.id,
    fields: [
      { key: 'id', label: 'id', type: 'id', required: true },
      { key: 'type', label: '類型', type: 'enum', options: QUEST_TYPES, labels: QUEST_TYPE_LABELS, required: true },
      { key: 'name', label: '名稱', type: 'text', required: true },
      { key: 'text', label: '敘事文本', type: 'textarea', required: true },
      { key: 'trigger', label: '觸發條件（條件式）', type: 'cond', required: true },
      { key: 'goal', label: '達成目標（條件式）', type: 'cond', required: true },
      { key: 'deadline', label: '期限（賽季數；null＝生涯結束前）', type: 'number', min: 1, optional: true },
      { key: 'result', label: '達成結果', type: 'questResult', required: true },
      { key: 'failLabel', label: '未達成降階標籤', type: 'text', required: true },
      { key: 'goalText', label: '達成目標（玩家可見文本）', type: 'text', optional: true },
      { key: 'materialText', label: '所需素材（玩家可見文本）', type: 'text', optional: true },
    ],
  },

  trait: {
    id: 'trait',
    label: '特質卡',
    intro: '特質卡（§13／§14.1）：雙面性（益處＋副作用都有）、效果鍵被引擎消費、池歸屬、種類歸屬、互斥、維持、特質影響。',
    source: null,   // 四階分別取，見下面的 TRAIT_TABLES
    keyOf: (t) => t.key,
    fields: [
      { key: 'key', label: '特質鍵', type: 'id', required: true },
      { key: 'name', label: '名稱', type: 'text', required: true },
      { key: 'tier', label: '種類', type: 'enum', options: TIERS, labels: TIER_LABELS, required: true },
      { key: 'pool', label: '池歸屬', type: 'enum', options: POOLS, labels: POOL_LABELS, required: true,
        hint: '未指定預設 persona；psych／career 不入合成' },
      { key: 'innate', label: '天生特質', type: 'bool', optional: true, hint: 'true＝出生自帶（見天生特質分頁）' },
      { key: 'desc', label: '益處＋副作用文本', type: 'textarea', required: true },
      { key: 'effects', label: '益處（效果鍵）', type: 'effect', required: false },
      { key: 'sideEffects', label: '副作用（效果鍵）', type: 'effect', required: false },
      { key: 'sideEffectLevel', label: '副作用分級', type: 'enum', options: SIDE_LEVELS, labels: SIDE_LABELS, required: true },
      { key: 'exclusiveWith', label: '互斥特質鍵', type: 'multienum', options: ALL_TRAIT_KEYS, labels: TRAIT_KEY_LABELS, optional: true },
      { key: 'maintain', label: '維持條件', type: 'cond', optional: true, hint: '不寫＝恆真' },
      { key: 'when', label: '特質影響（時段/月份/年份條件）', type: 'when', optional: true },
    ],
  },

  fusion: {
    id: 'fusion',
    label: '合成配方',
    intro: '合成配方（§14.6）：稀有＝2 persona 素材；史詩＝2~3 performance 素材；傳說不進配方；素材分池不重疊。',
    source: FUSIONS,
    keyOf: (f) => `${f.outTier}/${f.out}`,
    fields: [
      { key: 'outTier', label: '產物階級', type: 'enum', options: ['rare', 'epic'], labels: { rare: '稀有（2 persona 素材）', epic: '史詩（2~3 performance 素材）' }, required: true },
      { key: 'out', label: '產物特質鍵', type: 'enum', options: ALL_TRAIT_KEYS, labels: TRAIT_KEY_LABELS, required: true },
      { key: 'need', label: '素材（[階, 鍵] 配對）', type: 'list', min: 2, max: 3,
        item: { fields: [{ key: 'tier', label: '素材階', type: 'enum', options: ['traits', 'rare', 'epic'], labels: { traits: '通用（traits）', rare: '稀有', epic: '史詩' }, required: true }, { key: 'key', label: '素材鍵', type: 'enum', options: ALL_TRAIT_KEYS, labels: TRAIT_KEY_LABELS, required: true }] } },
    ],
  },

  innate: {
    id: 'innate',
    label: '天生特質',
    intro: '天生特質（§14.1）：只收人格／體質類；mentalBias；必須指派素材池；池上限 5。',
    source: INNATE_POOL,
    keyOf: (t) => t.key,
    fields: [
      { key: 'key', label: '特質鍵', type: 'enum', options: ALL_TRAIT_KEYS, labels: TRAIT_KEY_LABELS, required: true },
      { key: 'mentalBias', label: '心理偏差', type: 'bias', optional: true, hint: '指定維度改抽有向區間；null＝不宣告；池內維度不得重複' },
    ],
  },
};

/* ================= 即時驗證（單筆級） ================= */

/** 條件式驗證：驗語法與謂詞名，不驗形狀（§12.3）。回傳錯誤清單 */
export function validateCond(node, errors, path) {
  if (!Array.isArray(node)) {
    errors.push(`${path}：條件式必須是陣列（['and', …]／['stat', 謂詞, 比較子, 值]…）`);
    return;
  }
  const [op, ...args] = node;
  switch (op) {
    case 'and':
    case 'or':
      if (args.length < 1) errors.push(`${path}：${op} 至少要有 1 個子條件`);
      args.forEach((c, i) => validateCond(c, errors, `${path}.${op}[${i}]`));
      break;
    case 'not':
      if (args.length !== 1) errors.push(`${path}.not：只接受 1 個子條件`);
      else validateCond(args[0], errors, `${path}.not`);
      break;
    case 'has':
      if (args.length !== 2) errors.push(`${path}.has：格式 ['has', 階, 鍵]`);
      else {
        if (!COND_TIERS.includes(args[0])) errors.push(`${path}.has：未知的階「${args[0]}」（可選 ${COND_TIERS.join('／')}）`);
        if (!ALL_TRAIT_KEYS.includes(args[1])) errors.push(`${path}.has：不存在的特質鍵「${args[1]}」`);
      }
      break;
    case 'hasCount':
      if (args.length !== 2) errors.push(`${path}.hasCount：格式 ['hasCount', 階, 數]`);
      else if (!COND_TIERS.includes(args[0])) errors.push(`${path}.hasCount：未知的階「${args[0]}」`);
      break;
    case 'stat':
      if (args.length !== 3) errors.push(`${path}.stat：格式 ['stat', 謂詞, 比較子, 值]`);
      else {
        if (!PREDICATES.includes(args[0])) errors.push(`${path}.stat：不存在的謂詞「${args[0]}」`);
        if (!COND_OPS.includes(args[1])) errors.push(`${path}.stat：未知的比較子「${args[1]}」`);
        if (typeof args[2] !== 'number') errors.push(`${path}.stat：比較值必須是數字`);
      }
      break;
    default:
      errors.push(`${path}：未知的條件式節點「${String(op)}」`);
  }
}

/** 效果驗證：鍵被引擎消費、寫法合法、窗口用窗口寫法。回傳錯誤清單 */
export function validateEffects(effects, errors, path) {
  if (!effects || typeof effects !== 'object') return;
  for (const [key, value] of Object.entries(effects)) {
    if (key === 'mental' || key === 'buff' || key === 'injury') continue; // 訓練卡效果欄的特殊子鍵
    if (!EFFECT_KEYS.includes(key)) {
      errors.push(`${path}.${key}：不是引擎消費的效果鍵（打錯鍵特質會靜靜地沒有效果）`);
      continue;
    }
    const windowKind = LIFECYCLE_WINDOWS[key];
    if (typeof value === 'number') {
      // 簡寫＝加法。但窗口鍵的多數是乘法，不允許簡寫
      if (windowKind && windowKind.kind !== 'add') {
        errors.push(`${path}.${key}：窗口 ${key} 是乘法，要用 { mul: n }`);
      }
      continue;
    }
    if (value === true) {
      if (windowKind) errors.push(`${path}.${key}：窗口 ${key} 不接受旗標寫法`);
      continue;
    }
    if (typeof value !== 'object') {
      errors.push(`${path}.${key}：效果值必須是數字（加法簡寫）、true（旗標）或 { add|mul|floor|cap }`);
      continue;
    }
    const ops = Object.keys(value);
    if (ops.length !== 1 || !EFFECT_OPS.includes(ops[0])) {
      errors.push(`${path}.${key}：效果物件必須恰好一個運算（${EFFECT_OPS.join('／')}）`);
      continue;
    }
    const op = ops[0];
    if (op === 'flag') {
      if (value.flag !== true) errors.push(`${path}.${key}：旗標寫法要 { flag: true }`);
      continue;
    }
    if (typeof value[op] !== 'number') {
      errors.push(`${path}.${key}：${op} 的值必須是數字`);
      continue;
    }
    if (windowKind) {
      if (windowKind.kind === 'add' && op !== 'add') errors.push(`${path}.${key}：窗口 ${key} 是加法，要用 { add: n }`);
      if (windowKind.kind === 'mul' && op !== 'mul') errors.push(`${path}.${key}：窗口 ${key} 是乘法，要用 { mul: n }`);
    }
  }
}

/** 事件卡選項數與互斥驗證（單筆級） */
export function validateEventCard(card, errors, allCards) {
  if (card.options && (card.options.length < 2 || card.options.length > 4)) {
    errors.push(`選項數必須 2~4 個（現在 ${card.options?.length ?? 0}）`);
  }
  const ids = new Set();
  for (const o of card.options || []) {
    if (ids.has(o.id)) errors.push(`選項 id 重複：${o.id}`);
    ids.add(o.id);
  }
  if (!card.excl) {
    errors.push('互斥群組（excl）必填：同組卡互相排斥，solo_<id> 表示自成一格');
  } else if (!card.excl.startsWith('solo_')) {
    const mates = allCards.filter((c) => c !== card && c.excl === card.excl);
    if (mates.length === 0) {
      errors.push(`互斥群組「${card.excl}」沒有其他同組卡——獨佔群組應寫成 solo_<id>`);
    }
  }
}

/* ================= 關係檢查（跨資料，§14.8 核心） ================= */

/**
 * 素材競態：一個素材被多條配方共用、且共用會造成搶素材。
 * §14.6：池內共用是取捨（同一階的多條配方會爭奪素材）、跨池共用是錯誤
 * （稀有吃 persona、史詩吃 performance，兩池不重疊）。
 * ⚠ 這裡的「池」指配方階級（rare 配方 vs epic 配方）——同一素材不可能同時
 * 出現在兩種階級的配方裡，出現就是跨池共用。
 */
export function checkMaterialConflicts() {
  const found = {};
  for (const f of FUSIONS) {
    for (const [tier, key] of f.need) {
      const sig = `${tier}/${key}`;
      (found[sig] ||= []).push(f);
    }
  }
  const conflicts = [];
  for (const [sig, fusions] of Object.entries(found)) {
    if (fusions.length > 1) {
      conflicts.push({
        material: sig,
        usedBy: fusions,
        level: 'warn',
        message: `素材 ${sig} 被 ${fusions.length} 條配方共用（${fusions.map((f) => `${f.outTier}/${f.out}`).join('、')}）——池內共用是設計上的取捨`,
      });
    }
  }
  return conflicts;
}

/**
 * 死配方：配方的素材沒有可達獲取路徑（§14.2 取得率 < 15% 為死）。
 *
 * 可達來源（S19a 交接筆記第三節）：
 *   - 事件卡（FLAG_TRAIT 表，src/engine/eventTrigger.js）
 *   - 扮演卡（PERSONA_RULES，src/phases/shared.js）
 *   - 生涯條件（veteran 28 歲／single 單身 4 年／disc 享樂連守 3 次，S19a 交接筆記）
 *   - 天生特質池（INNATE_POOL）
 *   - 其他配方產出（合成樹內可達）
 *
 * ⚠ 工具無法「實測」取得率，只能查「有沒有來源」——來源存在是取得率的前提。
 * 素材清單若有變動，要同步下面三張表（FLAG_TRAIT／PERSONA_RULES／生涯條件）。
 */
export function sourceOf(traitKey) {
  const sources = [];
  if (INNATE_POOL.some((t) => t.key === traitKey)) sources.push('天生特質池');
  if (EVENT_TRAIT_SOURCES.includes(traitKey)) sources.push('事件卡');
  if (PERSONA_TRAIT_SOURCES.includes(traitKey)) sources.push('扮演卡');
  if (CAREER_TRAIT_SOURCES.includes(traitKey)) sources.push('生涯條件');
  if (FUSIONS.some((f) => f.out === traitKey)) sources.push('合成配方產出');
  return sources;
}

/** 事件卡能解鎖的特質鍵（FLAG_TRAIT 表的 key，src/engine/eventTrigger.js） */
export const EVENT_TRAIT_SOURCES = [
  'popular', 'composure', 'leader', 'laneking', 'macroG', 'grinder', 'meme', 'camera', 'guardian', 'tilt',
  'genius', 'clutch', 'intlghost', 'underdog',
];

/** 扮演卡能定型的特質鍵（PERSONA_RULES 的 key，src/phases/shared.js） */
export const PERSONA_TRAIT_SOURCES = ['trashtalk', 'bigheart', 'glue', 'lonewolf', 'idol', 'pariah'];

/** 生涯條件能取得的特質鍵（S19a 交接筆記：veteran 28 歲／single 單身 4 年／disc 享樂連守 3 次） */
export const CAREER_TRAIT_SOURCES = ['veteran', 'single', 'disc'];

/** 死配方檢查：掃所有配方的素材，沒有來源的標紅 */
export function checkDeadRecipes() {
  const dead = [];
  for (const f of FUSIONS) {
    for (const [tier, key] of f.need) {
      if (sourceOf(key).length === 0) {
        dead.push({
          recipe: f,
          material: `${tier}/${key}`,
          level: 'error',
          message: `配方 ${f.outTier}/${f.out} 的素材 ${tier}/${key} 沒有任何取得路徑（事件卡／扮演卡／生涯條件／天生池／其他配方）——死配方`,
        });
      }
    }
  }
  return dead;
}

/**
 * 觸發斷裂：
 * 1. 事件卡產出的特質線索鍵不存在（FLAG_TRAIT 指向的特質資料不存在）
 * 2. 任務卡觸發條件的素材鍵不存在（特質鍵／謂詞名）
 */
export function checkTriggerBreakage() {
  const issues = [];
  // 事件卡旗標 → FLAG_TRAIT 對應的特質鍵
  for (const [flag, def] of Object.entries(FLAG_TRAIT_LENS)) {
    if (!ALL_TRAIT_KEYS.includes(def.key)) {
      issues.push({ level: 'error', message: `事件卡旗標 ${flag} → 特質鍵 ${def.key} 不存在` });
    }
  }
  // 任務卡條件式的素材鍵
  for (const q of QUEST_CARDS) {
    for (const [field, node] of [['trigger', q.trigger], ['goal', q.goal]]) {
      const errs = [];
      validateCond(node, errs, field);
      for (const e of errs) {
        issues.push({ level: 'error', message: `任務卡 ${q.id}：${e}` });
      }
    }
  }
  // 任務卡達成結果的特質鍵存在
  for (const q of QUEST_CARDS) {
    const key = q.result?.key;
    if (key && !ALL_TRAIT_KEYS.includes(key)) {
      issues.push({ level: 'error', message: `任務卡 ${q.id} 的達成結果特質鍵 ${key} 不存在` });
    }
  }
  return issues;
}

/**
 * 效果鍵被引擎消費：掃所有特質的效果鍵，不在 EFFECT_KEYS 的標紅。
 * ⚠ 特質的 `maintain`／`when` 不走效果鍵，跳過。
 */
export function checkEffectConsumption() {
  const issues = [];
  const allTraits = [
    ...Object.entries(BASE_TRAITS).map(([key, t]) => [key, t]),
    ...Object.entries(RARE_TRAITS).map(([key, t]) => [key, t]),
    ...Object.entries(EPIC_TRAITS).map(([key, t]) => [key, t]),
    ...Object.entries(LEGENDARY_TRAITS).map(([key, t]) => [key, t]),
  ];
  for (const [key, t] of allTraits) {
    for (const [side, effects] of [['effects', t.effects], ['sideEffects', t.sideEffects]]) {
      if (!effects) continue;
      for (const ekey of Object.keys(effects)) {
        if (!EFFECT_KEYS.includes(ekey)) {
          issues.push({
            level: 'error',
            message: `特質 ${key}.${side} 的效果鍵「${ekey}」不被引擎消費（modifiers 四查詢／六窗口／mental_* 都沒有讀它）`,
          });
        }
      }
    }
  }
  return issues;
}

/**
 * 池指派完整：
 * 1. 特質（含天生）都有池歸屬；未指定預設 persona（§14.7 功能 4）
 * 2. psych／career 不入合成（配方素材不得引用這兩個池的特質）
 */
export function checkPoolAssignment() {
  const issues = [];
  const allTraits = {
    ...BASE_TRAITS, ...RARE_TRAITS, ...EPIC_TRAITS, ...LEGENDARY_TRAITS,
  };
  for (const [key, t] of Object.entries(allTraits)) {
    if (!t.pool) {
      issues.push({ level: 'error', message: `特質 ${key} 沒有池歸屬（未指定預設 persona）` });
    }
  }
  for (const f of FUSIONS) {
    for (const [tier, key] of f.need) {
      const t = allTraits[key];
      if (t && (t.pool === 'psych' || t.pool === 'career')) {
        issues.push({
          level: 'error',
          message: `配方 ${f.outTier}/${f.out} 的素材 ${key} 屬 ${t.pool} 池——psych／career 不入合成（§14.2）`,
        });
      }
    }
  }
  return issues;
}

/** FLAG_TRAIT 透鏡（只在檢查用：旗標 → 特質鍵） */
const FLAG_TRAIT_LENS = {
  popular: { key: 'popular' },
  composure: { key: 'composure' },
  leader: { key: 'leader' },
  laneking: { key: 'laneking' },
  macroPoint: { key: 'macroG' },
  grinder: { key: 'grinder' },
  meme: { key: 'meme' },
  camera: { key: 'camera' },
  guardian: { key: 'guardian' },
  tiltRisk: { key: 'tilt' },
};

/** 天生特質池上限（§14.1） */
export const INNATE_POOL_MAX = 5;

/** 池上限檢查：天生特質池 ≤ 5 */
export function checkInnatePoolSize() {
  return INNATE_POOL.length > INNATE_POOL_MAX
    ? [{ level: 'error', message: `天生特質池 ${INNATE_POOL.length} 條超過上限 ${INNATE_POOL_MAX}（§14.1：0.8 ÷ N ≥ 15% 死線）` }]
    : [];
}

/* ================= 屬性名稱對照（表單標籤用） ================= */

export const ATTR_LABELS = Object.fromEntries(ATTRS.map((a) => [a, ATTR_NAMES[a]]));
export const MENTAL_LABELS = Object.fromEntries(MENTAL_KEYS.map((k) => [k, MENTAL_NAMES[k]]));
export const SKILL_LABELS = SKILL_NAMES;
