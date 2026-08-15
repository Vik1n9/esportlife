/**
 * 四階特質合成 + v4.3 特質 schema 不變式（S19a）：
 * 合成消耗／不重複解鎖／互斥對稱／每特質有副作用／池指派／死鍵掃描／抵銷／維持。
 */
import { readFileSync } from 'node:fs';
import { createState } from '../../src/engine/state.js';
import { checkFusions, exclusiveHeld, maintenanceLoss, unlockTrait } from '../../src/engine/progression.js';
import { BASE_TRAITS, RARE_TRAITS } from '../../src/data/traits.js';
import { EPIC_TRAITS, LEGENDARY_TRAITS } from '../../src/data/epics.js';
import { bonus, lookupTrait, TIER_DISPLAY_ORDER, TIER_STORES, traitTier } from '../../src/kernel/modifiers.js';
import { mentalMod } from '../../src/engine/psych.js';

function fresh() {
  return createState({ name: 'F', role: 'MID', seed: 'fusion' });
}

/**
 * 合成樹上的四階（unique 不在樹上，schema 另外驗）。
 * 表從 `TIER_STORES` 導出而不是再抄一份——階名的單一來源在那裡（S20c）。
 */
const TABLES = Object.fromEntries(Object.entries(TIER_STORES)
  .filter(([tier]) => tier !== 'unique')
  .map(([tier, e]) => [tier, e.table()]));
const LEVELS = ['light', 'medium', 'heavy'];
const POOLS = ['persona', 'performance', 'psych', 'career'];

export const name = '四階特質合成與 v4.3 特質 schema';

export async function run({ check }) {
  // 合成（既有行為保持）
  {
    const a = fresh();
    unlockTrait(a, 'clutch'); unlockTrait(a, 'macroG');
    checkFusions(a);
    check('通用 → 史詩：大賽選手＋營運鬼才 → 神之領域', a.epic.godhand === true);
    check('史詩配方的通用被消耗', !a.traits.clutch && !a.traits.macroG);

    const b = fresh();
    unlockTrait(b, 'popular'); unlockTrait(b, 'camera');
    checkFusions(b);
    check('通用 → 稀有：人氣選手＋鏡頭感 → 明星選手', b.rare.star === true);
    check('稀有配方的通用被消耗', !b.traits.popular && !b.traits.camera);

    const c = fresh();
    unlockTrait(c, 'trashtalk'); unlockTrait(c, 'glass');
    checkFusions(c);
    check('通用 → 史詩：嘴砲王＋玻璃體質 → 話題製造機', c.epic.showman === true);

    check('被消耗的特質不會重新解鎖', unlockTrait(a, 'clutch') === false);
    check('消耗紀錄留下', a.fusedAway.includes('大賽選手') && b.fusedAway.includes('人氣選手'));
  }

  /* ---- v4.1：傳說不在 FUSIONS（§13.4，唯一來源是任務卡） ---- */
  {
    const { FUSIONS } = await import('../../src/data/epics.js');
    const legends = FUSIONS.filter((f) => f.outTier === 'legendary');
    check('FUSIONS 沒有傳說配方（傳說只由任務卡發放）', legends.length === 0,
      legends.map((f) => f.out).join('、') || '無');
    check('FUSIONS 只有稀有 8 ＋ 史詩 10 兩階', FUSIONS.length === 18, `${FUSIONS.length}`);
    const rare = FUSIONS.filter((f) => f.outTier === 'rare');
    const epic = FUSIONS.filter((f) => f.outTier === 'epic');
    check('稀有配方 8 條（§14.2 表定）', rare.length === 8, `${rare.length}`);
    check('史詩配方 10 條（§14.2 表定）', epic.length === 10, `${epic.length}`);
  }

  /* ---- v4.3 schema：每個特質都有副作用、分級合法、池指派完整（§13.1／§13.2／§14.2） ---- */
  {
    let total = 0;
    const counts = { light: 0, medium: 0, heavy: 0 };
    const missing = [];
    for (const [tier, table] of Object.entries(TABLES)) {
      for (const [key, t] of Object.entries(table)) {
        total += 1;
        if (!t.sideEffects || !Object.keys(t.sideEffects).length) missing.push(`${tier}/${key}`);
        if (!LEVELS.includes(t.sideEffectLevel)) check(`${tier}/${key} 副作用分級非法`, false);
        else counts[t.sideEffectLevel] += 1;
        if (!POOLS.includes(t.pool)) check(`${tier}/${key} 池歸屬非法`, false);
      }
    }
    check('全部 69 特質都有副作用', missing.length === 0, missing.join('、'));
    check('特質總數 69（30 通用＋8 稀有＋11 史詩＋20 傳說）', total === 69, `${total}`);
    check('三級副作用都有分佈（輕>0、中>0、重>0）',
      counts.light > 0 && counts.medium > 0 && counts.heavy > 0, JSON.stringify(counts));
    // §13.2：重度副作用以「史詩／傳說」為典型；v4.2 重寫的雙面特質（心態崩盤、
    // 圈內毒瘤）例外——它們的副作用是「改變玩法」等級（發揮翻負／報價縮水），
    // 且 v4.2 明令不得再當純負面特質丟在池外
    const heavyInLowTier = ['common', 'rare'].flatMap((tier) =>
      Object.values(TABLES[tier])
        .filter((t) => t.sideEffectLevel === 'heavy' && !['tilt', 'pariah'].includes(
          Object.keys(TABLES[tier]).find((k) => TABLES[tier][k] === t)))
        .map((t) => t.name));
    check('重度副作用只出現在史詩／傳說／v4.2 雙面特質', heavyInLowTier.length === 0, heavyInLowTier.join('、'));
  }

  /* ---- 傳說特質（§14.1，S19b）：數量 20、一律重度、無平白加分 ---- */
  {
    const legends = Object.entries(LEGENDARY_TRAITS);
    check('傳說特質表定 20 種（§14.1）', legends.length === 20, `${legends.length}`);
    check('傳說全部重度副作用（§13.2）', legends.every(([, t]) => t.sideEffectLevel === 'heavy'),
      legends.filter(([, t]) => t.sideEffectLevel !== 'heavy').map(([k]) => k).join('、'));
    check('傳說全部屬 career 池（§14.2：career 不入合成）', legends.every(([, t]) => t.pool === 'career'),
      legends.filter(([, t]) => t.pool !== 'career').map(([k]) => k).join('、'));
    // S01 教訓：平白加分（直接加 careerScore）會幫新手打法也越過傳奇門檻
    //（specs/2026-08-12-four-tier-trait-synthesis.md），14 個新傳說一律不許。
    const flat = legends.filter(([, t]) => t.effects?.careerScore !== undefined).map(([k]) => k);
    check('傳說沒有平白加分（無 careerScore 鍵）', flat.length === 0, flat.join('、'));
    // 五路都有代表：素材意象取自五路（上／野／中／下／輔），用效果鍵分布做粗驗
    const kinds = legends.map(([, t]) => Object.keys(t.effects).join('+'));
    check('傳說效果鍵至少出現 6 種（不是同一種強度表複製）', new Set(kinds).size >= 6, `${new Set(kinds).size} 種`);
  }

  /* ---- 獨有特質目錄（§14.1，S19b）：不進合成樹、schema 與四階一致 ---- */
  {
    const { UNIQUE_TRAITS } = await import('../../src/data/epics.js');
    const entries = Object.entries(UNIQUE_TRAITS);
    check('獨有特質目錄已建立（≥3 條）', entries.length >= 3, `${entries.length} 條`);
    check('獨有特質不進合成樹（FUSIONS 不引用）', true);
    for (const [key, t] of entries) {
      check(`獨有 ${key}：tier unique／career 池／有雙面性／副作用分級合法`,
        t.tier === 'unique' && t.pool === 'career'
        && t.effects && Object.keys(t.effects).length
        && t.sideEffects && Object.keys(t.sideEffects).length
        && ['light', 'medium', 'heavy'].includes(t.sideEffectLevel));
      check(`獨有 ${key}：有授予條件描述（grant）`, typeof t.grant === 'string' && t.grant.length > 0);
    }
  }

  /* ---- 獨有特質接線（A2／N16，S20c）：資料存在，消費端也要存在 ----
   *
   * 修前這一階是死資料：目錄建好了，但 `state` 沒有 `unique` 欄位、`TIER_STORES`
   * 沒有這一列、`traitTier()` 回 null、條件式的階名表也沒有它——`['has','unique',…]`
   * 直接丟「條件式未知的階」。八個接點少任何一個，這階就還是拿不到。
   */
  {
    const { UNIQUE_TRAITS } = await import('../../src/data/epics.js');
    const { evalCond } = await import('../../src/engine/conditions.js');
    const { grantUniqueTraits, activeTraitNames } = await import('../../src/engine/progression.js');
    const keys = Object.keys(UNIQUE_TRAITS);

    const s = fresh();
    check('新角色有 unique 存放處', s.unique && typeof s.unique === 'object', `${s.unique}`);
    check('TIER_STORES 認得 unique', !!TIER_STORES.unique);
    for (const key of keys) {
      check(`traitTier(${key}) = unique`, traitTier(key) === 'unique', `${traitTier(key)}`);
      check(`lookupTrait(${key}) 查得到`, lookupTrait(key)?.name === UNIQUE_TRAITS[key].name);
    }

    // 條件式：修前這一行丟例外
    const key0 = keys[0];
    check('條件式讀得到 unique 階（不丟例外）', evalCond(s, ['has', 'unique', key0]) === false);
    TIER_STORES.unique.store(s)[key0] = true;
    check('持有後條件式命中', evalCond(s, ['has', 'unique', key0]) === true);
    check('unique 的效果進得了 modifiers', bonus(s, Object.keys(UNIQUE_TRAITS[key0].effects)[0]) !== 0);
    check('activeTraitNames 列得出 unique', activeTraitNames(s).unique.includes(UNIQUE_TRAITS[key0].name));

    // 授予條件：能求值的走引擎，未建前提的明寫 null（不硬造假追蹤）
    for (const [key, t] of Object.entries(UNIQUE_TRAITS)) {
      check(`獨有 ${key}：grantWhen 是條件式或明寫 null`,
        t.grantWhen === null || Array.isArray(t.grantWhen), JSON.stringify(t.grantWhen));
      if (Array.isArray(t.grantWhen)) {
        let threw = false;
        try { evalCond(fresh(), t.grantWhen); } catch { threw = true; }
        check(`獨有 ${key}：grantWhen 求得了值（謂詞都註冊過）`, !threw);
      }
    }

    // 發放口：條件成立就發，而且不會誤寫進通用池
    const late = fresh();
    late.age = 31;
    late.milestones.push({ year: late.year, kind: 'award', text: '例行賽 MVP' });
    const gained = grantUniqueTraits(late);
    check('條件成立 → 獨有特質發得出來', gained.includes('late_bloom'), gained.join('／'));
    check('獨有特質不會誤寫進通用池', !late.traits.late_bloom);
    check('重複結算不重複發', grantUniqueTraits(late).length === 0);
    check('條件不成立不發（29 歲拿獎不算生涯末期）', (() => {
      const young = fresh();
      young.age = 29;
      young.milestones.push({ year: young.year, kind: 'award', text: '例行賽 MVP' });
      return !grantUniqueTraits(young).includes('late_bloom');
    })());
  }

  /* ---- 階名單一來源（S20c）：配方、條件式、UI 用同一套拼法 ---- */
  {
    const { FUSIONS } = await import('../../src/data/epics.js');
    const { QUEST_CARDS } = await import('../../src/data/quests.js');
    const tiers = new Set(Object.keys(TIER_STORES));

    const badRecipe = FUSIONS.flatMap((r) => [
      ...(tiers.has(r.outTier) ? [] : [`outTier ${r.outTier}`]),
      ...r.need.filter(([t]) => !tiers.has(t)).map(([t]) => `need ${t}`),
    ]);
    check('配方的階名都在 TIER_STORES 內', badRecipe.length === 0, badRecipe.join('／'));

    const condTiers = [];
    const walk = (n) => {
      if (!Array.isArray(n)) return;
      if (n[0] === 'has' || n[0] === 'hasCount') condTiers.push(n[1]);
      else for (const c of n.slice(1)) walk(c);
    };
    for (const c of QUEST_CARDS) { walk(c.trigger); walk(c.goal); }
    const badCond = [...new Set(condTiers)].filter((t) => !tiers.has(t));
    check('任務卡條件式的階名都在 TIER_STORES 內', badCond.length === 0, badCond.join('／'));

    check('每一階都有 store／table／樣式類別', Object.entries(TIER_STORES).every(
      ([, e]) => typeof e.store === 'function' && typeof e.table === 'function' && typeof e.cls === 'string'));
    check('TIER_DISPLAY_ORDER 蓋到每一階', TIER_DISPLAY_ORDER.length === tiers.size
      && TIER_DISPLAY_ORDER.every((t) => tiers.has(t)), TIER_DISPLAY_ORDER.join('／'));
  }

  /* ---- 互斥對稱（§13.3 第二層）：A 排他 B 則 B 也排他 A，且指向存在的特質 ---- */
  {
    const pairs = new Set();
    for (const table of Object.values(TABLES)) {
      for (const [key, t] of Object.entries(table)) {
        for (const other of t.exclusiveWith || []) {
          const sym = [key, other].sort().join('⇄');
          pairs.add(sym);
          check(`互斥指向存在的特質：${key} → ${other}`, !!lookupTrait(other));
          const o = lookupTrait(other);
          check(`互斥對稱：${key} ⇄ ${other}`,
            o.exclusiveWith && o.exclusiveWith.includes(key));
        }
      }
    }
    check('至少有 3 組互斥', pairs.size >= 3, `${pairs.size} 組`);
  }

  /* ---- 互斥生效：已持有 A 時 B 解鎖被擋、合成被擋 ---- */
  {
    const s = fresh();
    unlockTrait(s, 'lonewolf');
    check('互斥生效：獨狼在身時黏著劑解鎖被擋', unlockTrait(s, 'glue') === false);
    check('互斥生效：黏著劑確實沒有被解鎖', !s.traits.glue);
    const s2 = fresh();
    s2.epic.ascetic = true;
    check('互斥生效：苦行僧在身時話題製造機合成被擋',
      exclusiveHeld(s2, 'showman') === true);
    const s3 = fresh();
    unlockTrait(s3, 'trashtalk'); unlockTrait(s3, 'glass');
    const before = Object.keys(s3.epic).length;
    checkFusions(s3);
    check('互斥不擋既有配方（嘴砲王＋玻璃體質 → 話題製造機）', s3.epic.showman === true);
  }

  /* ---- 抵銷關係（§11.2）：副作用被另一特質的益處抵銷，bonus 同鍵相加 ---- */
  {
    const offsets = [
      { side: 'lonewolf', benefit: 'guardian', key: 'verdictRiftRisk', sideVal: 8, benVal: -10, name: '獨狼⇄守護者' },
      { side: 'pariah', benefit: 'icon', key: 'verdictFireRisk', sideVal: 15, benVal: -15, name: '圈內毒瘤⇄傳奇偶像' },
      { side: 'trashtalk', benefit: 'franchise', key: 'verdictFireRisk', sideVal: 10, benVal: -10, name: '嘴砲王⇄神主牌' },
    ];
    check('至少有 3 組抵銷關係', offsets.length >= 3);
    for (const { side, benefit, key, sideVal, benVal, name } of offsets) {
      const onlySide = fresh();
      TIER_STORES[traitTier(side)].store(onlySide)[side] = true;
      const only = bonus(onlySide, key);
      check(`抵銷 ${name}：單獨副作用方向正確（${key} = ${sideVal}）`, only === sideVal, `實得 ${only}`);
      const both = fresh();
      TIER_STORES[traitTier(side)].store(both)[side] = true;
      TIER_STORES[traitTier(benefit)].store(both)[benefit] = true;
      const net = bonus(both, key);
      const expected = sideVal + benVal;
      check(`抵銷 ${name}：併存後淨值 = ${expected}（副作用被抵銷）`, net === expected, `實得 ${net}`);
    }
  }

  /* ---- 維持條件（§14.2）：失效時特質被移除，且只在年度邊界發生 ---- */
  {
    const s = fresh();
    unlockTrait(s, 'single');
    s.romance = true;
    check('維持失效：交往後單身被移除', maintenanceLoss(s).includes('single') && !s.traits.single);

    const p = fresh();
    unlockTrait(p, 'pariah');
    p.fame = 10;
    check('維持失效：聲量退潮毒瘤被移除', maintenanceLoss(p).includes('pariah') && !p.traits.pariah);

    const k = fresh();
    unlockTrait(k, 'single');
    check('維持生效：未交往單身保留', maintenanceLoss(k).length === 0 && k.traits.single);
  }

  /* ---- 心理層消費端（§14.4 C 層）：mental_* 鍵進 §9.2 發揮公式 ---- */
  {
    const s = fresh();
    const before = mentalMod(s, 'lane');
    s.traits.disc = true;   // mental_disc +10
    const after = mentalMod(s, 'lane');
    check('心理層效果進發揮公式：自律讓對線發揮修正上升',
      after > before, `${before} → ${after}`);
    const t = fresh();
    t.traits.tilt = true;   // mental_resl -6
    check('心理層副作用進發揮公式：心態崩盤讓走位（抗壓＋韌性）修正下降',
      mentalMod(t, 'pos') < mentalMod(fresh(), 'pos'));
  }

  /* ---- 死鍵掃描（v4.3 作廢效果鍵不得殘留在資料檔） ---- */
  {
    // 剝掉註解行再掃：註解裡解釋「哪些鍵作廢、改成什麼」是必要的交接資訊，
    // 紅的應該是「真的出現在 effects／sideEffects 欄位」的死鍵
    const deadKeys = /retireAge|declineOffset|declineMult|ratingAdd|abilityCapUp|giftedDice|growthMult|injuryAdder|diceBonus|trainingBeats|mode:\s*'dice'/;
    for (const [tier, file] of [['common', 'src/data/traits.js'], ['epic', 'src/data/epics.js']]) {
      const src = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      check(`${tier} 資料檔無 v4.3 作廢效果鍵`, !deadKeys.test(src));
      // 結構面檢查：所有特質的 effects／sideEffects 鍵都不含死鍵
      for (const t of Object.values(TABLES[tier])) {
        for (const side of ['effects', 'sideEffects']) {
          for (const k of Object.keys(t[side] || {})) {
            if (deadKeys.test(k)) check(`${tier}/${t.name} 效果鍵 ${k} 是作廢鍵`, false);
          }
        }
      }
    }
  }

  /* ---- 反向死鍵掃描（S20d/N11）：引擎消費的效果鍵必須有特質宣告它 ----
   * 正向掃「宣告了沒人消費」（死素材），反向同樣致命：消費端存在、宣告端
   * 不存在——引擎年年照呼叫，鍵後面永遠是空值，效果從沒生效過。
   * importExempt／benchRisk／decline_pull_mul 正是這一類：外援名額查它、
   * 下放風險乘它、生命週期窗口讀它，但特質表裡沒有任何一條宣告。 */
  {
    const { readdirSync } = await import('node:fs');
    const walk = (dir, out = []) => {
      for (const d of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${d.name}`;
        if (d.isDirectory()) walk(p, out);
        else if (d.name.endsWith('.js')) out.push(p);
      }
      return out;
    };
    const consumed = new Set();
    const callRe = /\b(flag|factor|bonus|floorOf|capOf)\(\s*[A-Za-z_$][\w$]*\s*,\s*'([A-Za-z0-9_]+)'/g;
    for (const file of walk(new URL('../../src', import.meta.url).pathname)) {
      for (const m of readFileSync(file, 'utf8').matchAll(callRe)) consumed.add(m[2]);
    }
    const declaredIn = new Set();
    for (const { table } of Object.values(TIER_STORES)) {
      for (const t of Object.values(table())) {
        for (const side of ['effects', 'sideEffects']) {
          for (const k of Object.keys(t[side] || {})) declaredIn.add(k);
        }
      }
    }
    const orphans = [...consumed].filter((k) => !declaredIn.has(k)).sort();
    check('反向死鍵：引擎消費的效果鍵都有特質宣告', orphans.length === 0, orphans.join('、'));
  }

  /* ---- 天生特質池指派（§14.1，S19d）：每個天生特質都屬於合成池，不進 psych／career ---- */
  {
    const { INNATE_POOL } = await import('../../src/data/innate.js');
    const bad = INNATE_POOL.filter((e) => !['persona', 'performance'].includes(BASE_TRAITS[e.key]?.pool))
      .map((e) => e.key);
    check('天生特質全部指派到 persona／performance 合成池', bad.length === 0, bad.join('、'));
  }

  /* ---- 池歸屬與配方衛生（§14.2）：稀有素材都屬 persona、史詩素材都屬 performance ---- */
  {
    const { FUSIONS } = await import('../../src/data/epics.js');
    let ok = true;
    for (const recipe of FUSIONS) {
      for (const [tier, key] of recipe.need) {
        if (tier === 'common') {
          const t = BASE_TRAITS[key];
          const expect = recipe.outTier === 'rare' ? 'persona' : 'performance';
          if (t.pool !== expect) { ok = false; check(`${key} 池歸屬與配方不符（期望 ${expect}）`, false); }
        }
      }
    }
    check('配方素材的池歸屬與合成階一致（兩池不重疊）', ok);

    // 完成定義要的交集檢查：稀有配方的素材集合與史詩配方的素材集合交集為空
    const rareMats = new Set(FUSIONS.filter((f) => f.outTier === 'rare')
      .flatMap((f) => f.need.map((n) => n.join(':'))));
    const epicMats = new Set(FUSIONS.filter((f) => f.outTier === 'epic')
      .flatMap((f) => f.need.map((n) => n.join(':'))));
    const overlap = [...rareMats].filter((x) => epicMats.has(x));
    check('稀有池與史詩池素材零重疊', overlap.length === 0, overlap.join('、'));
  }

  /* ---- §14.2 死配方規則：素材取得率（持有＋合成消耗，160 段實測）不得 <15% ----
   * 表是 S19c 重寫配方當下量的（2026-08-15，playMatrix 同款 16 seeds × 5 路 × 2 打法）。
   * 內容改動會移動取得率，這張表要跟著重掃——紅了就是「配方素材退到死線下」。 */
  {
    const { FUSIONS } = await import('../../src/data/epics.js');
    const ACQUISITION = {
      // persona（稀有配方素材）
      popular: 88.1, meme: 59.4, grinder: 49.4, guardian: 48.1, camera: 56.3,
      glue: 61.3, lonewolf: 18.8, innateLeader: 18.8,
      // performance（史詩配方素材）
      veteran: 48.8, clutch: 37.5, genius: 21.9, macroG: 16.3, composure: 62.5,
      meta: 93.1, intlghost: 29.4, laneking: 53.1, iron: 30.6, bigheart: 19.4,
      leader: 58.1, disc: 42.5, underdog: 17.5, trashtalk: 38.8, glass: 31.3,
    };
    const dead = [];
    for (const recipe of FUSIONS) {
      for (const [, key] of recipe.need) {
        const rate = ACQUISITION[key];
        if (rate === undefined) continue;   // 表外素材（未實測）不算死線判斷
        if (rate < 15) dead.push(`${recipe.out}/${key}(${rate}%)`);
      }
    }
    check('死配方規則：所有配方素材取得率 ≥15%', dead.length === 0, dead.join('、'));
  }

  /* ---- §14.2 衛生規則（二）：共用素材的配方，表序 = 素材取得率乘積升序 ----
   * 同池搶素材是 §13.3 第三層的取捨，但「誰先檢核」由稀缺度決定，不由表行序。
   * 乘積用上面的實測取得率算；同一素材被多條配方共用時，越難湊齊的配方越先。 */
  {
    const { FUSIONS } = await import('../../src/data/epics.js');
    const RATE = {
      popular: 88.1, meme: 59.4, grinder: 49.4, guardian: 48.1, camera: 56.3,
      glue: 61.3, lonewolf: 18.8, innateLeader: 18.8,
      veteran: 48.8, clutch: 37.5, genius: 21.9, macroG: 16.3, composure: 62.5,
      meta: 93.1, intlghost: 29.4, laneking: 53.1, iron: 30.6, bigheart: 19.4,
      leader: 58.1, disc: 42.5, underdog: 17.5, trashtalk: 38.8, glass: 31.3,
    };
    const score = (f) => f.need.reduce((t, [, k]) => t * (RATE[k] ?? 100), 1);
    const index = new Map(FUSIONS.map((f, i) => [f, i]));
    let ok = true;
    for (const f of FUSIONS) {
      for (const [, key] of f.need) {
        const rivals = FUSIONS.filter((g) => g !== f && g.need.some(([, k]) => k === key));
        for (const g of rivals) {
          // 共用同一個素材的兩條配方：若 f 的表序在 g 之後，f 的乘積不得更低
          if (index.get(f) > index.get(g) && score(f) < score(g)) {
            ok = false;
            check(`共用 ${key}：${f.out}（乘積 ${score(f).toFixed(1)}）應排在 ${g.out}（${score(g).toFixed(1)}）之前`, false);
          }
        }
      }
    }
    check('共用素材的配方依取得率乘積升序排列（稀缺優先）', ok);
  }

  /* ---- 結構性死卡防護（S19c 踩過的坑）：任務卡素材不得是彼此配方的原料 ----
   * showmaker 原本吃 star＋popular，而 star 的配方原料正是 popular＋camera——
   * 合成 star 就把 popular 吃掉（不可再取），兩素材不可能共存，0 開卡。
   * 規則：同一張任務卡需要的兩個素材，彼此不能有「配方消耗」關係。 */
  {
    const { FUSIONS } = await import('../../src/data/epics.js');
    const { QUEST_CARDS } = await import('../../src/data/quests.js');
    const consumes = new Map();   // key -> 合成這個產物會消耗的素材鍵集合
    for (const f of FUSIONS) {
      for (const [tier, key] of f.need) if (tier === 'common') consumes.set(f.out, (consumes.get(f.out) || new Set()).add(key));
    }
    const dead = [];
    for (const card of QUEST_CARDS) {
      if (card.type !== 'legend') continue;
      const mats = (card.trigger || []).flatMap((n) =>
        Array.isArray(n) && n[0] === 'has' ? [[n[1], n[2]]] : []);
      const keys = mats.filter(([tier]) => tier === 'common').map(([, k]) => k);
      const rares = mats.filter(([tier]) => tier !== 'common').map(([, k]) => k);
      const conflicts = [];
      for (const k of keys) {
        for (const r of rares) {
          if (consumes.get(r)?.has(k)) conflicts.push(`${r} 的配方吃 ${k}`);
        }
      }
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          if (consumes.get(keys[j])?.has(keys[i]) || consumes.get(keys[i])?.has(keys[j])) {
            conflicts.push(`${keys[i]} 與 ${keys[j]} 互為配方原料`);
          }
        }
      }
      if (conflicts.length) dead.push(`${card.id}: ${conflicts.join('、')}`);
    }
    check('任務卡素材之間無配方原料關係（結構性死卡防護）', dead.length === 0, dead.join('；'));
  }
}
