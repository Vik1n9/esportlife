/**
 * 四階特質合成 + v4.3 特質 schema 不變式（S19a）：
 * 合成消耗／不重複解鎖／互斥對稱／每特質有副作用／池指派／死鍵掃描／抵銷／維持。
 */
import { readFileSync } from 'node:fs';
import { createState } from '../../src/engine/state.js';
import { checkFusions, exclusiveHeld, maintenanceLoss, unlockTrait } from '../../src/engine/progression.js';
import { BASE_TRAITS, RARE_TRAITS } from '../../src/data/traits.js';
import { EPIC_TRAITS, LEGENDARY_TRAITS } from '../../src/data/epics.js';
import { bonus, lookupTrait, TIER_STORES, traitTier } from '../../src/kernel/modifiers.js';
import { mentalMod } from '../../src/engine/psych.js';

function fresh() {
  return createState({ name: 'F', role: 'MID', seed: 'fusion' });
}

const TABLES = { common: BASE_TRAITS, rare: RARE_TRAITS, epic: EPIC_TRAITS, legendary: LEGENDARY_TRAITS };
const LEVELS = ['light', 'medium', 'heavy'];
const POOLS = ['persona', 'performance', 'psych', 'career'];

export const name = '四階特質合成與 v4.3 特質 schema';

export async function run({ check }) {
  // 合成（既有行為保持）
  {
    const a = fresh();
    unlockTrait(a, 'genius'); unlockTrait(a, 'disc');
    checkFusions(a);
    check('通用 → 史詩：天才操作＋自律 → 神之領域', a.epic.godhand === true);
    check('史詩配方的通用被消耗', !a.traits.genius && !a.traits.disc);

    const b = fresh();
    unlockTrait(b, 'popular'); unlockTrait(b, 'camera');
    checkFusions(b);
    check('通用 → 稀有：人氣選手＋鏡頭感 → 明星選手', b.rare.star === true);
    check('稀有配方的通用被消耗', !b.traits.popular && !b.traits.camera);

    const c = fresh();
    c.epic.godhand = true; c.rare.star = true;
    checkFusions(c);
    check('史詩＋稀有 → 傳說：神之領域＋明星選手 → 弒神者', c.legendary.godslayer === true);
    check('傳說消耗史詩與稀有', !c.epic.godhand && !c.rare.star);

    check('被消耗的特質不會重新解鎖', unlockTrait(a, 'genius') === false);
    check('消耗紀錄留下', a.fusedAway.includes('天才操作') && b.fusedAway.includes('人氣選手'));
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
    check('全部 50 特質都有副作用', missing.length === 0, missing.join('、'));
    check('特質總數 50', total === 50, `${total}`);
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
    unlockTrait(s3, 'trashtalk'); unlockTrait(s3, 'idol');
    const before = Object.keys(s3.epic).length;
    checkFusions(s3);
    check('互斥不擋既有配方（嘴砲王＋全民偶像 → 話題製造機）', s3.epic.showman === true);
  }

  /* ---- 抵銷關係（§11.2）：副作用被另一特質的益處抵銷，bonus 同鍵相加 ---- */
  {
    const offsets = [
      { side: 'lonewolf', benefit: 'guardian', key: 'verdictRiftRisk', sideVal: 8, benVal: -10, name: '獨狼⇄守護者' },
      { side: 'pariah', benefit: 'icon', key: 'verdictFireRisk', sideVal: 15, benVal: -15, name: '圈內毒瘤⇄傳奇偶像' },
      { side: 'trashtalk', benefit: 'franchise', key: 'verdictFireRisk', sideVal: 10, benVal: -10, name: '嘴砲王⇄神主牌' },
    ];
    const STORE_OF = { lonewolf: 'traits', guardian: 'traits', pariah: 'traits', icon: 'rare', trashtalk: 'traits', franchise: 'traits' };
    check('至少有 3 組抵銷關係', offsets.length >= 3);
    for (const { side, benefit, key, sideVal, benVal, name } of offsets) {
      const onlySide = fresh();
      onlySide[STORE_OF[side]][side] = true;
      const only = bonus(onlySide, key);
      check(`抵銷 ${name}：單獨副作用方向正確（${key} = ${sideVal}）`, only === sideVal, `實得 ${only}`);
      const both = fresh();
      both[STORE_OF[side]][side] = true;
      both[STORE_OF[benefit]][benefit] = true;
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

  /* ---- 池歸屬與配方衛生（§14.2）：稀有素材都屬 persona、史詩素材都屬 performance ---- */
  {
    const { FUSIONS } = await import('../../src/data/epics.js');
    let ok = true;
    for (const recipe of FUSIONS) {
      for (const [tier, key] of recipe.need) {
        if (tier === 'traits') {
          const t = BASE_TRAITS[key];
          const expect = recipe.outTier === 'rare' ? 'persona' : 'performance';
          if (t.pool !== expect) { ok = false; check(`${key} 池歸屬與配方不符（期望 ${expect}）`, false); }
        }
      }
    }
    check('配方素材的池歸屬與合成階一致（兩池不重疊）', ok);
  }
}
