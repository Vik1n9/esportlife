/**
 * 平衡不變式（測試網）。
 *
 * V4 §20.1 廢掉決定論，`golden.json` 到 S09 就會被刪——那是 `WORKLOG.md` 記載的兩次
 * 大改平衡時唯一的安全網。這個 suite 是它的替代品：不錄快照，改成守住「這個遊戲之所以
 * 是這個遊戲」的那幾條性質，讓 S09 之後每一站改數值時有東西會紅。
 *
 * ── 設計原則：低變異優先 ──
 *
 * 寫這個 suite 的時候先量過八組獨立種子（各 160 段生涯），結論是**生涯層級的稀有事件
 * 指標抖到不能當門檻**。同一份程式碼、只換種子字首，量到的是：
 *
 *   國際賽冠軍當量比（老手/新手）  1.15 – 4.37   ← smoke.mjs 現行門檻 1.4，八組裡有兩組不過
 *   平均巔峰 OVR 差（老手−新手）    1.43 – 4.91   ← smoke.mjs 現行門檻 1.5，八組裡有兩組貼線或不過
 *   老手傳奇率                      6.3% – 27.5%  ← 現行門檻 30%，過得去但餘裕只剩 2.5 個百分點
 *
 * 也就是說現行那兩條「打法差距」的門檻是**配著 `seed-*` 這一組樣本長出來的**，換一組
 * 種子就會誤報。這不是 smoke.mjs 的錯——它是在只有 80 段樣本的年代寫的——但拿它當
 * 丙丁戊組的守門員會出事：改完數值紅了，沒有人分得出是平衡跑掉還是換了種子。
 *
 * 所以這裡守同一件事，換成三種低變異的量法：
 *
 *   1. **微基準取代生涯統計**：把「加點是不是決策」從生涯雜訊裡抽出來——同一個出生
 *      種子、同一份骰子，只讓加點策略不同，直接比 OVR。八組種子量到的平均差是
 *      4.80–5.34（相對變異 5%），而同一件事在生涯層級是 1.43–4.91（變異 3.4 倍）。
 *   2. **比例取代絕對值**：所有與刻度有關的門檻都除以 `ATTR_CAP`。S09 把 1–80 換成
 *      0–100 時絕對值門檻會整批誤報，比例則原封不動——`WORKLOG.md` 記的教訓是換刻度
 *      必然通膨，這裡守的正是「通膨了沒有」而不是「數字是多少」。
 *      ⚠ **但「加點是不是決策」那條的分母不是上限，是可成長空間**（見 `styleGap`）：
 *      比例只對刻度免疫，對**起始值**不免疫，而 S09 依 §7.3 改起始值時正是踩到這一點。
 *      新增與刻度有關的門檻時先問一句：它量的東西是隨上限走，還是隨「還有多少可以長」走。
 *   3. **配對取代平均**：兩種打法跑的是同一個 seed／role，配對之後種子運氣會相消。
 *
 * ── 沿用與不沿用 ──
 *
 * `smoke.mjs` 那四項一律不動（S07 說明書：不得放寬現有門檻），這裡是加網子不是拆網子。
 * 其中「老手傳奇 ≤ 三成」與「五個等第都出現得到」變異夠低，原樣沿用；
 * 「國際賽冠軍當量 ≥ 1.4 倍」與「巔峰 OVR 差 ≥ 1.5」則改用上面的低變異版本重寫，
 * 舊版留在 smoke.mjs 不動。S09 若看到 smoke 紅而這裡綠，先懷疑種子效應。
 *
 * ── SKIP ──
 *
 * V4 新增的體力、潛力衰減、十二技能、事件互斥、六維心理都還沒實作。對應的檢查現在就
 * 寫好，用「機制不存在就跳過」的形式掛著，每個 SKIP 都指名在等哪一站；那一站做完之後
 * 這裡會自動生效，不必回頭補。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import {
  RATING_MENTAL_SPAN, attrCap, coachRating, investAttr, positionPower, skills,
} from '../../src/engine/attributes.js';
import { PERFORM_FLOOR, PERFORM_SPAN, PRESSURE, SKILL_MENTAL, mistakeFactor, performCoef, stability } from '../../src/engine/psych.js';
import { checkFusions, unlockTrait } from '../../src/engine/progression.js';
import { careerTier } from '../../src/engine/career.js';
import { gameChance } from '../../src/kernel/series.js';
import { opponentStrength, starEffect, teamStrength } from '../../src/kernel/strength.js';
import { TIER_STORES, traitName } from '../../src/kernel/modifiers.js';
import { ATTRS, ATTR_CAP } from '../../src/data/attributes.js';
import { MENTAL_BASE, MENTAL_KEYS, MENTAL_NAMES, MENTAL_RANGE } from '../../src/data/mental.js';
import { EVENT_CARDS, TIER_NAMES } from '../../src/data/events.js';
import { LEAGUES } from '../../src/data/leagues.js';
import { FUSIONS } from '../../src/data/epics.js';
import { OVR_WEIGHTS, ROLES, ROLE_ATTR_WEIGHTS, SKILL_WEIGHTS } from '../../src/data/skills.js';
import { allocate, growthRoom, playMatrix } from '../lib/harness.mjs';

export const name = '平衡不變式（測試網）';
export const order = 2;   // 排在冒煙測試之後，直接吃它跑好的 160 段樣本

/* ================= SKIP 機制 ================= */

/**
 * 「等某一站」的待生效檢查。
 *
 * 印出來的每一行都指名在等哪一站——後面的站接手時只要看這份清單，就知道自己該讓
 * 哪幾條轉為實際檢查。`when` 為真代表機制已經到位，檢查照跑。
 */
function pending(log) {
  const skipped = [];
  return {
    gate(label, station, present, why, body) {
      if (present) { body(); return; }
      skipped.push(`${label}（等 ${station}）`);
      log(`  SKIP  ${label} — 等 ${station}：${why}`);
    },
    report() {
      if (!skipped.length) { log('SKIP 清單：無，全部檢查都已生效'); return; }
      log(`SKIP 清單（${skipped.length} 項待生效）：${skipped.join('、')}`);
    },
  };
}

const mean = (a) => (a.length ? a.reduce((t, v) => t + v, 0) / a.length : 0);
const crowns = (s) => s.worldsWins * 2 + s.worldsFinals + s.msiWins;

/* ================= suite ================= */

export async function run({ check, log, shared }) {
  // 冒煙測試已經跑過同一份矩陣，直接接手；單獨跑這個 suite 時才自己生一份
  const runs = shared.runs || playMatrix({
    seeds: Array.from({ length: 16 }, (_, i) => `seed-${i}`), roles: ROLES,
  });
  const gate = pending(log);

  peakCeiling({ check, log, runs });
  coachRatingLayer({ check, log, runs });
  styleGap({ check, log, runs });
  topEndPayoff({ check, log, runs });
  legendRarity({ check, log, runs });
  roleIdentity({ check, log, gate });
  fusionConsumption({ check, log, runs });
  potentialDecay({ check, log, gate });
  mentalAmplifier({ check, log, gate });
  mistakeVisibility({ check, log, runs });
  staminaRhythm({ check, gate, log, runs });
  eventExclusion({ check, gate });

  gate.report();
}

/* ---------------- 巔峰上界（V4 §7.1 §10.2） ---------------- */

/**
 * 教練評價可以合法高過屬性硬上限多少。
 *
 * ⚠ v4.3（決策 #44）廢止 §10.2「不得直接加評價」的掛載禁令，連帶刪掉舊有的兩項直接
 * 加值（神之領域 +2、不老傳奇 30 歲後 +1）。所以現在這個數字是 0——只剩 §10.2 的隱藏
 * 心理修正（`RATING_MENTAL_SPAN`）還加在教練評價上。掃表保留：S19a 若重引入加法評價
 * 特質，這裡會自動跟著鬆，那是 review 該看到的訊號。
 */
const RATING_TRAIT_HEADROOM = Object.values(TIER_STORES).reduce((total, { table }) => total
  + Object.values(table()).reduce((t, tr) => {
    const e = tr.effects?.ratingAdd;
    return t + (typeof e === 'number' ? e : (e?.add ?? 0));
  }, 0), 0);

/**
 * 通膨守門員。
 *
 * 兩層：結構層看權重表（列和不是 1 就是在平白放大數值），分布層看 160 段的巔峰。
 * 分布層一律用「÷ ATTR_CAP」的比例——S09 要換成 0–100 刻度，×1.25 之後比例不變，
 * 明顯高於現值就是通膨（這正是 `09-屬性0-100.md` 說的及格線）。
 *
 * ⚠ **上界那條的母數在 S10 修過一次，這是換單位不是放寬**：它量的 `peakRating` 是
 * `coachRating()` 的輸出，而它除了屬性加權平均還加上 §10.2 的加法特質修正——母數卻
 * 只寫了屬性硬上限。舊表下沒人碰得到那條線（要六個屬性全滿），S10 之後 `vit` 的位置
 * 權重歸零，打野／輔助只剩三個屬性各佔九成七，神之領域持有者練滿就會拿到 99＋2＝101。
 * 這與 S09 為「加點是決策」換分母是同一類修正：門檻對權重表免疫，但對特質持有不免疫。
 * 通膨真正的守門員是上面那條平均值比例，它沒有動過。
 *
 * ⚠ **S12 把 §10.2 的隱藏心理修正（±3）加進母數了**：`coachRating()` 現在真的會加上
 * `(drive×0.40 + disc×0.35 + comp×0.25 − 50) × 0.06`，上界因此合法地多 3 點。那個 3
 * 是 `RATING_MENTAL_SPAN`，跟特質那份一樣**從程式匯入而不是手填**——有人改動 §10.2
 * 的量級時上界會跟著動，那是 review 該看到的訊號。
 */
function peakCeiling({ check, log, runs }) {
  for (const [key, w] of Object.entries(SKILL_WEIGHTS)) {
    const sum = Object.values(w).reduce((t, v) => t + v, 0);
    check('技能←屬性的權重列和為 1（否則技能值會被平白放大）',
      Math.abs(sum - 1) < 1e-9, `${key} 的和是 ${sum.toFixed(4)}`);
  }
  for (const role of ROLES) {
    const sum = Object.values(OVR_WEIGHTS[role]).reduce((t, v) => t + v, 0);
    check('位置權重的技能列和為 1（否則五路的教練評價不能互相比較）',
      Math.abs(sum - 1) < 1e-9, `${role} 的和是 ${sum.toFixed(4)}`);
  }

  const peaks = runs.map((r) => r.state.peakRating);
  const ratio = mean(peaks) / ATTR_CAP;
  // 八組獨立種子實測 0.739–0.776。上下各留約 6 個百分點：低於下界代表刻度縮水或成長
  // 被砍過頭，高於上界就是通膨
  check('巔峰上界：平均巔峰 ÷ 屬性硬上限落在 0.68–0.82（通膨／縮水都會紅）',
    ratio >= 0.68 && ratio <= 0.82, `平均巔峰 ${mean(peaks).toFixed(2)}／上限 ${ATTR_CAP} = ${ratio.toFixed(4)}`);
  const hardCeiling = ATTR_CAP + RATING_TRAIT_HEADROOM + RATING_MENTAL_SPAN;
  check('巔峰上界：沒有任何一段生涯超過硬上限＋§10.2 允許的加法特質與心理修正',
    Math.max(...peaks) <= hardCeiling,
    `最高 ${Math.max(...peaks)} > ${hardCeiling}（上限 ${ATTR_CAP} ＋特質 ${RATING_TRAIT_HEADROOM} ＋心理 ${RATING_MENTAL_SPAN}）`);

  for (const { state, seed, role } of runs) {
    const top = Math.max(...Object.values(skills(state)));
    check('巔峰上界：技能值不得高於屬性上限（技能是加權平均，超出代表權重表壞了）',
      top <= attrCap(state), `${seed}/${role} 最高技能 ${top} > ${attrCap(state)}`);
  }

  log(`巔峰教練評價：平均 ${mean(peaks).toFixed(2)}（÷上限 ${ratio.toFixed(3)}）、最高 ${Math.max(...peaks)}、最低 ${Math.min(...peaks)}`);
}

/* ---------------- 教練評價與明星效應（V4 §10 §11.1） ---------------- */

/**
 * §11.1 明星項的分段對照表。規格書自己列的值，一個字沒改——它同時驗係數 0.06、
 * 指數 1.35 與上界 6.0，比分別檢查三個常數更難含混過關。
 */
const STAR_TABLE = [[5, 0.53], [8, 0.99], [10, 1.34], [15, 2.32], [20, 3.42], [25, 4.63], [31, 6.0]];

/** 玩家戰力最超出隊友的那一成，才是「一個人打贏整隊」要盯的族群 */
const CARRY_SLICE = 0.1;
/**
 * 允許摸到 92% 上限的生涯比例。
 *
 * 四組獨立種子實測 0.6%–2.5%，全部是戰力高出隊友 15 點以上、而且幾乎都要靠決勝局的
 * 心理加成才推得上去的那幾段——那正是 §11.1 想要的 carry，不是失控。門檻取 6%，
 * 留 2.4 倍餘裕。
 *
 * ⚠ 這條是**失控警報，不是校準器**：故意把 `OPPONENT_SUPPORT` 歸零（＝不修正「拿一個
 * 選手比一支隊」那個單位錯位）會衝到 10.6% 而翻紅，但改成 3.5 只到 5.6%——擦邊而過。
 * 真正把 `OPPONENT_SUPPORT` 定在 6.5 的是世界冠軍人均那條實測（見 kernel/strength.js），
 * 不是這條檢查。後面的站要調頂端強度時，兩個都要看。
 */
const CLAMP_ALLOWANCE = 0.06;

/**
 * 教練評價、位置戰力與明星效應。
 *
 * 三件事綁在一起檢查，因為它們是同一次分家的三個面：§10.2 把「教練怎麼看你」與
 * §11.1 的「你在場上打得出多少」拆成兩個量，而明星項是後者才有的東西。
 */
function coachRatingLayer({ check, log, runs }) {
  // v4.3（#44）廢止 §10.2「不得直接加評價」的掛載禁令，舊有的「神之領域 +2 只進教練
  // 評價、不進位置戰力」檢查隨之刪除——現在沒有任何特質直接加評價，教練評價的加法只
  // 剩 §10.2 的隱藏心理修正。S19a 若重引入加法評價特質，這裡要再補「只進教練評價」的
  // 分家檢查。

  // 一、明星效應照 §11.1 的分段表
  const probe = createState({ name: 'S', role: 'MID', seed: 'star-probe' });
  probe.league = 'HOME';
  probe.mates = [];
  const par = LEAGUES.HOME.par;
  check('明星效應：戰力等於聯賽 par 時沒有明星項（沒有人需要被拉抬）',
    starEffect(probe, par) === 0, `${starEffect(probe, par)}`);
  for (const [over, want] of STAR_TABLE) {
    const got = starEffect(probe, par + over);
    check('明星效應：對得上 §11.1 的分段對照表',
      Math.abs(got - want) <= 0.01, `P−par = ${over} 時 ${got.toFixed(2)}，規格書 ${want}`);
  }
  check('明星效應：上界 6.0 點（＝勝率 +10.6 個百分點，一個人拉抬一支隊的天花板）',
    starEffect(probe, par + 200) === 6.0, `${starEffect(probe, par + 200)}`);

  // 二、明星效應不得讓 w_p = 0.60 失效：一個人不能打贏整隊
  const rows = [];
  for (const { state, seed, role } of runs) {
    if (!state.mates?.length || !state.league) continue;
    const gap = positionPower(state) - mean(state.mates.map((m) => m.rating));
    rows.push({ tag: `${seed}/${role}`, gap, best: bestGameChance(state) });
  }
  rows.sort((a, b) => b.gap - a.gap);
  const clamped = rows.filter((r) => r.best >= 92);
  check('明星效應：能把單局勝率推到 92% 上限的生涯不得超過 6%（一個人不能打贏整隊）',
    clamped.length <= rows.length * CLAMP_ALLOWANCE,
    `${clamped.length}/${rows.length} 段（${(clamped.length / rows.length * 100).toFixed(1)}%）`);

  const carry = rows.slice(0, Math.max(1, Math.round(rows.length * CARRY_SLICE)));
  check('明星效應：戰力遠高於隊友的那一成，確實拉得起勝率（carry 不能是裝飾）',
    mean(carry.map((r) => r.best)) > mean(rows.map((r) => r.best)) + 5,
    `前一成 ${mean(carry.map((r) => r.best)).toFixed(1)}% vs 全樣本 ${mean(rows.map((r) => r.best)).toFixed(1)}%`);

  // 三、教練評價不得出現在玩家可見的養成介面（V4 §10.1）
  const uiDir = new URL('../../src/ui/', import.meta.url);
  for (const file of readdirSync(uiDir)) {
    if (!file.endsWith('.js')) continue;
    const src = readFileSync(new URL(file, uiDir), 'utf8');
    check('教練評價是內部值：UI 不得讀取 coachRating／effectiveCoachRating（V4 §10.1）',
      !/\b(coachRating|effectiveCoachRating)\s*\(/.test(src), `src/ui/${file} 讀了教練評價`);
  }

  log(`明星效應：戰力高出隊友最多的一成（${carry[0].gap.toFixed(1)}–${carry[carry.length - 1].gap.toFixed(1)} 點）`
    + `最有利單局勝率 ${mean(carry.map((r) => r.best)).toFixed(1)}%，全樣本 ${mean(rows.map((r) => r.best)).toFixed(1)}%；`
    + `頂到 92% 的 ${clamped.length}/${rows.length} 段`);
}

/**
 * 這段生涯在**真的會發生的**對戰組合裡，最有利的一場單局勝率。
 *
 * 種子序決定從哪一輪打起、對手基準隨之定（`(種子−1)×1.5` 是同一條規則的另一半），
 * 所以不能把最低的對手基準配上最深的下剋上加成——那個組合不存在。
 */
function bestGameChance(state) {
  const par = LEAGUES[state.league]?.par ?? 66;
  const spots = [];
  for (let seed = 1; seed <= 4; seed++) {
    const steps = seed <= 2 ? [4.5, 7.5] : [2, 4.5, 7.5];
    for (const step of steps) spots.push({ seed, opp: opponentStrength(par + step + (seed - 1) * 1.5) });
  }
  spots.push({ seed: 1, opp: opponentStrength(Math.max(par, 72)) });   // MSI 地板
  spots.push({ seed: 1, opp: opponentStrength(Math.max(par, 74)) });   // 世界賽地板
  let best = 0;
  for (const s of spots) {
    for (const decider of [false, true]) best = Math.max(best, gameChance(state, s.opp, { decider, seed: s.seed }));
  }
  return best;
}

/* ---------------- 打法差距（微基準） ---------------- */

/**
 * 加點微基準。
 *
 * 生涯層級的「老手 vs 新手」被合約、傷病、隊友、國際賽門票一起攪過，八組種子量到的
 * 差距是 1.43–4.91——用它當門檻等於在量雜訊。這裡把加點單獨拉出來：同一個出生種子
 * 生兩份狀態，餵**完全相同**的骰子，只有分配策略不同，最後比 OVR。
 *
 * 沒有生涯、沒有事件、沒有勝負，所以剩下的差異只可能來自加點本身。
 *
 * 14 個週期是刻意的：短於 10 個週期時兩種策略都還沒碰到成長的遞減段，差距量不出來。
 *
 * ── 分母為什麼是「可成長空間」而不是「屬性上限」（S09 改的）──
 *
 * 原本寫的是 `領先 ÷ ATTR_CAP ≥ 0.0375`。那個寫法**對刻度免疫，但對起始值不免疫**：
 * 加點能賺到的差距與「出生到潛力天花板還有多遠」成正比，跟上限是幾分制無關。
 * S09 依 V4 §7.3 把起始值改成潛力的 0.80／0.70 之後，可成長空間從 0.405×上限掉到
 * 0.190×上限，於是同一個遊戲、同一套加點邏輯，這條門檻就整批誤報了（實測領先比值
 * 0.445，可成長空間比值 0.469——兩者一致到小數第二位，是純粹的分母問題）。
 *
 * **門檻的嚴格度一個字都沒放寬**，只是換了單位：舊制的可成長空間是 0.405×上限，
 * 所以 S07 的 `0.0375 × 上限` 就等於 `0.0375 ÷ 0.405 = 0.0926 × 可成長空間`。
 * 拿舊程式跑，兩種寫法給出的是同一個判定；差別只在換起始值時一個會漂、一個不會。
 *
 * 實測（可成長空間 ＝ Σ(位置權重 × 潛力) − 出生 OVR）：
 *   舊制 1–80：領先 4.67 ÷ 空間 32.41 = 0.144
 *   新制 0–100：領先 2.60 ÷ 空間 18.96 = 0.137　　（四組獨立種子 0.117–0.138）
 */
const BENCH_CYCLES = 14;
const BENCH_DICE = 5;
/** ＝ S07 的 0.0375×上限，換算成不受起始值影響的單位（0.0375 ÷ 0.405） */
const BENCH_MIN_GAP = 0.0926;

function styleGap({ check, log, runs }) {
  const diffs = [];
  const rooms = [];
  for (let i = 0; i < 16; i++) {
    for (const role of ROLES) {
      const seed = `bench-${i}`;
      const focus = createState({ name: 'F', role, seed });
      const spread = createState({ name: 'S', role, seed });
      rooms.push(growthRoom(focus));
      const rng = new Rng(`${seed}:bench`);
      for (let c = 0; c < BENCH_CYCLES; c++) {
        const dice = Array.from({ length: BENCH_DICE }, () => rng.int(1, 6));
        allocate(focus, { mode: 'dice', dice }, 'focus');
        allocate(spread, { mode: 'dice', dice }, 'spread');
      }
      diffs.push(coachRating(focus) - coachRating(spread));
    }
  }
  const avg = mean(diffs);
  const room = mean(rooms);
  const winRate = diffs.filter((d) => d > 0).length / diffs.length;

  check('打法差距：同一份骰子下，老手加點的平均 OVR 領先 ≥ 0.0926×可成長空間',
    avg / room >= BENCH_MIN_GAP,
    `平均領先 ${avg.toFixed(2)}／可成長空間 ${room.toFixed(2)} = ${(avg / room).toFixed(4)}`);
  check('打法差距：老手加點在九成以上的天賦上都不落後',
    winRate >= 0.9, `勝出 ${(winRate * 100).toFixed(1)}%（${diffs.filter((d) => d > 0).length}/${diffs.length}）`);

  // 生涯層級只留一條方向性的佐證——數值門檻交給上面的微基準，這裡只確認生涯沒有把
  // 加點的價值整個吃掉。⚠ S15b（生命週期曲線）把生涯層級的巔峰差打到約 0：兩種打法在
  // 夠長的生涯裡都會頂到同一道 `effective_potential(peak_age)` 天花板，所以「老手峰值
  // 更高」這個訊號消失了（16 組種子實測 focus−spread ≈ −1.76～+1.15，配對勝出率約四成）。
  // 加點的價值現在兌現在「更早摸到天花板」（微基準 0.255 對門檻 0.0926 仍強），所以這條
  // 只守「老手不會顯著劣於新手」——真門檻在微基準。
  const peakOf = (style) => mean(runs.filter((r) => r.style === style).map((r) => r.state.peakRating));
  const careerGap = peakOf('focus') - peakOf('spread');
  check('打法差距：生涯層級老手的平均巔峰不顯著低於新手（曲線讓兩者頂到同一道天花板）',
    careerGap / ATTR_CAP >= -0.02, `老手 ${peakOf('focus').toFixed(2)} vs 新手 ${peakOf('spread').toFixed(2)}（差 ${careerGap.toFixed(2)}）`);

  log(`加點微基準：${diffs.length} 組同骰對照，老手平均領先 ${avg.toFixed(2)} OVR（÷可成長空間 ${room.toFixed(1)} = ${(avg / room).toFixed(3)}）、勝出 ${(winRate * 100).toFixed(1)}%`);
}

/* ---------------- 頂端才兌現 ---------------- */

/**
 * 「加點準度在頂端兌現」的低變異版本。
 *
 * S01 換上的「國際賽冠軍當量 ≥ 1.4 倍」量的是兩種打法的比值，而國際賽冠軍在 160 段裡
 * 只有個位數到十幾次——八組種子量到 1.15–4.37，門檻抓不住。同一個主張換個問法就穩了：
 * **拿得到國際賽冠軍的生涯，巔峰是不是明顯比拿不到的高**。這問的是「頂端有沒有門檻」，
 * 而不是「兩種打法的比值是多少」，樣本兩邊都是幾十段，八組實測 0.129–0.202（÷上限），
 * 門檻取 0.08 留四成餘裕。
 *
 * ⚠ 這裡原本還有一條「同一天賦下老手的國際當量不劣於新手的比例 ≥ 0.65」（實測
 * 0.762–0.938）。**驗證時發現它抓不到東西就拿掉了**：160 段裡絕大多數配對兩邊都是
 * 0 冠，`0 >= 0` 成立，所以比例被平手灌滿。實際把老手策略改壞（只准投第一個屬性、
 * 巔峰從 62 掉到 35）之後，這個比例仍然是 0.81——一條在打法整個崩掉時還亮綠燈的檢查
 * 等於沒有檢查。後面的站不要再把它加回來。
 */
function topEndPayoff({ check, log, runs }) {
  const withCrown = runs.filter((r) => crowns(r.state) > 0).map((r) => r.state.peakRating);
  const without = runs.filter((r) => crowns(r.state) === 0).map((r) => r.state.peakRating);
  const gap = (mean(withCrown) - mean(without)) / ATTR_CAP;

  check('頂端才兌現：拿到國際賽冠軍的生涯，平均巔峰高出沒拿到的 ≥ 0.08×屬性上限',
    withCrown.length > 0 && gap >= 0.08,
    `有冠 ${mean(withCrown).toFixed(1)}（${withCrown.length} 段） vs 無冠 ${mean(without).toFixed(1)}（${without.length} 段），差 ${(gap * ATTR_CAP).toFixed(2)}`);

  log(`頂端門檻：有國際賽冠軍者平均巔峰 ${mean(withCrown).toFixed(1)}（${withCrown.length} 段），無冠者 ${mean(without).toFixed(1)}（${without.length} 段）`);
}

/* ---------------- 傳奇稀有度與等第涵蓋 ---------------- */

/**
 * 「傳奇」必須是少數，五個等第都要出現得到。
 *
 * 前者原樣沿用 smoke.mjs 的門檻（S07 說明書：不得放寬）。八組獨立種子實測老手傳奇率
 * 6.3%–27.5%，三成的門檻只剩 2.5 個百分點餘裕——S19b 要把傳說特質從 6 個加到 20 個，
 * 那是最容易把這條頂破的改動，所以另外加一條守傳說特質本身的稀有度（實測 40–41%）。
 */
function legendRarity({ check, log, runs }) {
  const perStyle = runs.length / 2;
  const tiers = { focus: new Array(TIER_NAMES.length).fill(0), spread: new Array(TIER_NAMES.length).fill(0) };
  for (const r of runs) tiers[r.style][careerTier(r.state)]++;

  check('傳奇稀有度：老手打法的傳奇不得超過三成',
    tiers.focus[0] <= perStyle * 0.3, `傳奇 ${tiers.focus[0]}/${perStyle} 段（${(tiers.focus[0] / perStyle * 100).toFixed(1)}%）`);

  const holders = runs.filter((r) => Object.values(r.state.legendary).some(Boolean)).length;
  check('傳奇稀有度：持有傳說特質的生涯不得超過一半',
    holders <= runs.length * 0.5, `${holders}/${runs.length} 段（${(holders / runs.length * 100).toFixed(1)}%）`);

  check('等第涵蓋：五個等第都出現得到',
    TIER_NAMES.every((_, i) => tiers.focus[i] + tiers.spread[i] > 0),
    TIER_NAMES.map((n, i) => `${n} ${tiers.focus[i] + tiers.spread[i]}`).join('、'));

  log(`傳奇率：老手 ${(tiers.focus[0] / perStyle * 100).toFixed(1)}%、新手 ${(tiers.spread[0] / perStyle * 100).toFixed(1)}%；傳說特質持有 ${(holders / runs.length * 100).toFixed(1)}%`);
}

/* ---------------- 位置身分（V4 §8.2 ＋ 鐵則二） ---------------- */

/**
 * 位置身分不准被平均掉。
 *
 * `WORKLOG.md` 2026-08-12 記過這個陷阱：第一版讓每項技能都沾到五、六個屬性，折疊後
 * 五路的屬性權重長得幾乎一樣，位置身分被平均掉。鐵則二要求把它做成不變式，不能只靠
 * 眼睛看。
 *
 * ⚠ **不要用「每路最高／最低權重的倍率」當門檻。** 現行表最扁的一路是 3.28 倍，看起來
 * 是個現成的門檻，但把 V4 §8.1／§8.2 的十二技能草案折疊起來算過之後是 **2.33 倍**
 * ——因為 V4 把體力抽出去當獨立資源（§6），vit 在每一路的權重都歸零，剩下五個屬性
 * 攤得比現在平。拿 3.28 當門檻會讓 S10 照著規格書做也紅，這就是說明書警告的
 * 「太緊在合理改動下誤報」。
 *
 * 換成三個對刻度與技能項數都不敏感的量法（括號內：現行值／V4 §8.2 草案值）：
 *   1. 任兩路的屬性權重 L1 距離   （0.114／0.110）→ 五路長不長得一樣
 *   2. 每路前二重屬性的合計佔比   （0.494／0.532）→ 每路有沒有重心
 *   3. 輔助的靈巧權重與射手的比值 （0.028、6.6 倍／0.000、∞）→ 鐵則二的原始例子
 */
function roleIdentity({ check, log, gate }) {
  const l1 = (a, b) => ATTRS.reduce((t, k) => t + Math.abs((a[k] || 0) - (b[k] || 0)), 0);

  let worst = { d: Infinity, pair: '' };
  for (let i = 0; i < ROLES.length; i++) {
    for (let j = i + 1; j < ROLES.length; j++) {
      const d = l1(ROLE_ATTR_WEIGHTS[ROLES[i]], ROLE_ATTR_WEIGHTS[ROLES[j]]);
      if (d < worst.d) worst = { d, pair: `${ROLES[i]}-${ROLES[j]}` };
    }
  }
  check('位置身分：任兩路的屬性權重 L1 距離 ≥ 0.10（五路不得長得一樣）',
    worst.d >= 0.10, `最接近的是 ${worst.pair}，距離 ${worst.d.toFixed(4)}`);

  let flattest = { share: Infinity, role: '' };
  for (const role of ROLES) {
    const sorted = ATTRS.map((k) => ROLE_ATTR_WEIGHTS[role][k] || 0).sort((a, b) => b - a);
    const share = sorted[0] + sorted[1];
    if (share < flattest.share) flattest = { share, role };
  }
  check('位置身分：每路前二重屬性合計 ≥ 0.45（每路都要有重心）',
    flattest.share >= 0.45, `最扁的是 ${flattest.role}，前二合計 ${flattest.share.toFixed(4)}`);

  const supAgi = ROLE_ATTR_WEIGHTS.SUP.agi || 0;
  const adcAgi = ROLE_ATTR_WEIGHTS.ADC.agi || 0;
  check('位置身分：靈巧對輔助幾乎沒有意義（權重 ≤ 0.06）',
    supAgi <= 0.06, `SUP 的 agi 權重 ${supAgi.toFixed(4)}`);
  check('位置身分：射手吃靈巧的程度至少是輔助的三倍',
    adcAgi >= supAgi * 3, `ADC ${adcAgi.toFixed(4)} vs SUP ${supAgi.toFixed(4)}`);

  log(`位置身分：最接近的兩路 ${worst.pair} L1=${worst.d.toFixed(3)}、最扁的一路 ${flattest.role} 前二佔 ${(flattest.share * 100).toFixed(1)}%`);

  // V4 §8.1 的十二技能鍵。到齊之後才驗得了「每位置核心 4 項＋次要 2 項」
  const V4_SKILLS = ['lane', 'op', 'vis', 'jg', 'gank', 'obj', 'tf', 'eng', 'peel', 'split', 'rotate', 'pos'];
  const twelve = V4_SKILLS.every((k) => SKILL_WEIGHTS[k]);
  gate.gate('位置身分 · 十二技能表結構', 'S10', twelve,
    `技能表還是現行的 ${Object.keys(SKILL_WEIGHTS).length} 項，V4 §8.1 的 ${V4_SKILLS.filter((k) => !SKILL_WEIGHTS[k]).join('／')} 尚未存在`,
    () => {
      check('位置身分：技能表就是 V4 §8.1 的十二項',
        Object.keys(SKILL_WEIGHTS).length === 12, `目前 ${Object.keys(SKILL_WEIGHTS).length} 項`);
      for (const role of ROLES) {
        const n = Object.keys(OVR_WEIGHTS[role]).length;
        check('位置身分：每位置核心 4 項＋次要 2 項（V4 §8.2）', n === 6, `${role} 有 ${n} 項`);
      }
    });
}

/* ---------------- 合成消耗（V4 §14.1） ---------------- */

/**
 * 被合成消耗掉的低階特質不可再取。
 *
 * 這條是四階合成的地基：素材若能反覆刷回來，配方就沒有取捨，「追求長壽」與「追求團隊」
 * 無法兼得的設計立刻失效。S19c 重製配方時最容易破的就是這裡。
 */
function fusionConsumption({ check, log, runs }) {
  let consumed = 0;
  for (const { state, seed, role } of runs) {
    consumed += state.fusedAway.length;
    for (const { store } of Object.values(TIER_STORES)) {
      for (const [key, held] of Object.entries(store(state) || {})) {
        if (!held) continue;
        check('合成消耗：已被合成吃掉的特質不得同時還在身上',
          !state.fusedAway.includes(traitName(key)), `${seed}/${role} 仍持有 ${traitName(key)}`);
      }
    }
  }

  // 直接探測解鎖入口：走一條真的配方，確認素材被移除且再也拿不回來
  const recipe = FUSIONS.find((r) => r.outTier === 'epic' && r.need.every(([tier]) => tier === 'traits'));
  const state = createState({ name: 'F', role: 'MID', seed: 'fusion-probe' });
  for (const [, key] of recipe.need) unlockTrait(state, key);
  const gained = checkFusions(state);
  check('合成消耗：配方命中時確實產出高階特質', gained.includes(recipe.out), `期望 ${recipe.out}，實得 ${gained.join('／') || '無'}`);
  for (const [tier, key] of recipe.need) {
    check('合成消耗：素材在合成後從該階的持有表移除',
      !TIER_STORES[tier].store(state)[key], `${traitName(key)} 仍在 ${tier}`);
    check('合成消耗：素材名稱進了 fusedAway',
      state.fusedAway.includes(traitName(key)), `${traitName(key)} 不在 fusedAway`);
    check('合成消耗：被消耗掉的素材不會再被解鎖',
      unlockTrait(state, key) === false && !TIER_STORES[tier].store(state)[key], `${traitName(key)} 又被解鎖了`);
  }

  log(`合成消耗：${runs.length} 段樣本共消耗 ${consumed} 個素材，無一與持有表衝突`);
}

/* ---------------- 潛力衰減（V4 §5.3 §7.1） ---------------- */

/** 同一份訓練點投在同一個屬性值上，只換潛力天花板，看成長差多少 */
function gainWith({ attr, potential, points }) {
  const state = createState({ name: 'P', role: 'MID', seed: 'decay-probe' });
  // 生命週期曲線讓 effective_potential = 潛力 × ceiling_curve(age)，16 歲只有一半。
  // 這個測試要量的是「天花板」本身的衰減，所以把年齡推到 tec 的 peak_age——
  // ceiling_curve = 1，effective_potential 才等於潛力，測試的前提才成立
  state.age = state.lifecycle.tec.peak_age;
  for (const k of ATTRS) { state.attr[k] = attr; state.potential[k] = potential; }
  state.carry = {};
  return investAttr(state, 'tec', points);
}

/**
 * 屬性越接近潛力天花板，同樣訓練的成長越少。
 *
 * 現行機制只有一個階梯式的「超過天花板成本 ×3」，天花板以下完全不看距離——實測屬性 45
 * 時潛力 60／70／80 的成長都是 +9。V4 §7.1 要的是連續的衰減係數，那是 S09 的事。
 * 所以這裡拆兩條：越過天花板會變慢（現在就成立，先守住），距離天花板越近越慢（等 S09）。
 */
function potentialDecay({ check, log, gate }) {
  const under = gainWith({ attr: 45, potential: 80, points: 20 });
  const over = gainWith({ attr: 45, potential: 40, points: 20 });
  check('潛力衰減：越過潛力天花板之後，同樣的訓練點換到的成長更少',
    over < under, `天花板以下 +${under}、天花板以上 +${over}`);

  // 天花板以下的距離是否影響成長——不影響就代表 V4 §7.1 的連續衰減還沒做
  const near = gainWith({ attr: 55, potential: 60, points: 12 });
  const far = gainWith({ attr: 55, potential: 90, points: 12 });
  gate.gate('潛力衰減 · 衰減單調性', 'S09', near !== far,
    `天花板以下的成長還不看距離（潛力 60 與 90 都是 +${near}），V4 §7.1 的連續衰減係數尚未實作`,
    () => {
      const steps = [[30, 100], [50, 100], [70, 100]].map(([a, p]) => gainWith({ attr: a, potential: p, points: 12 }));
      check('潛力衰減：同一天花板下，屬性越高成長越少（單調不遞增）',
        steps.every((v, i) => i === 0 || v <= steps[i - 1]), `依序 ${steps.join(' → ')}`);
      const gaps = [40, 25, 10].map((g) => gainWith({ attr: 60, potential: 60 + g, points: 12 }));
      check('潛力衰減：同一屬性值下，離天花板越近成長越少（單調不遞增）',
        gaps.every((v, i) => i === 0 || v <= gaps[i - 1]), `距離 40／25／10 → ${gaps.join(' / ')}`);
    });

  log(`潛力衰減：天花板以下 +${under}、以上 +${over}（同樣 20 點）`);
}

/* ---------------- 心理是放大器不是決定器（V4 §9.2） ---------------- */

/** 造一個帶隊友的乾淨狀態，讓 chemBonus 有作用點 */
function benchState(mentalFill) {
  const state = createState({ name: 'M', role: 'MID', seed: 'mental-probe' });
  state.league = 'LMS';
  state.mates = Array.from({ length: 4 }, () => ({ rating: 55 }));
  for (const k of MENTAL_KEYS) {
    const [lo, hi] = MENTAL_RANGE[k];
    state.mental[k] = mentalFill === 'max' ? hi : mentalFill === 'min' ? lo : Math.round((lo + hi) / 2);
  }
  return state;
}

/**
 * 心理值是放大器，不是決定器。
 *
 * V4 §9.2 的寫法是 `技能發揮 = 技能值 × (0.85 + 0.30 × 心理修正)`——心理只能在
 * ±15% 之間放大既有實力。那條公式要等六維心理（S12）才有得驗，但同一個主張現在就
 * 守得住，換成勝率的語言：**戰力差 15 點時，心理拉到極致也不該把劣勢方推回五成**，
 * 反過來領先 15 點時心理見底也不該掉到五成以下。心理能改變機會，不能改變誰是強隊。
 *
 * 用決勝局＋第四種子這個對心理最有利的組合來測，這樣過得了就是真的過得了。
 */
function mentalAmplifier({ check, log, gate }) {
  const GAP = 15;
  const neutral = teamStrength(benchState('mid'));

  const best = benchState('max');
  const behind = gameChance(best, neutral + GAP, { decider: true, seed: 4 });
  check('心理是放大器：落後 15 點戰力時，心理拉滿也回不到五成勝率',
    behind < 50, `決勝局＋第四種子＋心理全滿，勝率 ${behind.toFixed(1)}%`);

  const worst = benchState('min');
  const ahead = gameChance(worst, neutral - GAP, { decider: true, seed: 1 });
  check('心理是放大器：領先 15 點戰力時，心理見底也不會掉到五成以下',
    ahead > 50, `決勝局＋心理全空，勝率 ${ahead.toFixed(1)}%`);

  const swing = gameChance(best, neutral, { decider: true, seed: 1 }) - gameChance(worst, neutral, { decider: true, seed: 1 });
  check('心理是放大器：戰力持平時，心理造成的勝率擺幅不超過 30 個百分點',
    swing > 0 && swing <= 30, `擺幅 ${swing.toFixed(1)} 個百分點`);

  log(`心理擺幅：戰力持平時 ${swing.toFixed(1)} 個百分點；落後 15 點時心理全滿仍只有 ${behind.toFixed(1)}%`);

  // V4 §9.2 的六維（抗壓／自信／動機／紀律／信任／韌性）與 ±15% 帶寬
  const V4_MENTAL = ['comp', 'conf', 'drive', 'disc', 'trust', 'resl'];
  gate.gate('心理是放大器 · §9.2 發揮公式帶寬', 'S12',
    V4_MENTAL.every((k) => MENTAL_KEYS.includes(k)),
    `心理還是現行五維（${MENTAL_KEYS.join('／')}），V4 §9.2 的六維與發揮公式尚未存在`,
    () => performBandwidth({ check, log }));
}

/**
 * §9.2 的發揮公式帶寬：`技能值 × (0.85 + 0.30 × 心理修正)`。
 *
 * 這一組守的是「放大器不是決定器」的**定量**邊界，跟上面那三條（勝率語言）互補：
 * 那邊問「心理能不能改變誰是強隊」，這邊問「公式本身有沒有守在 ±15%」。兩邊都要，
 * 因為係數對了但被別的地方乘一次、或位置權重列和不是 1，勝率那三條不一定抓得到。
 */
function performBandwidth({ check, log }) {
  check('§9.2：兩個係數就是規格書寫的 0.85／0.30（不准改）',
    PERFORM_FLOOR === 0.85 && PERFORM_SPAN === 0.30, `${PERFORM_FLOOR}／${PERFORM_SPAN}`);

  for (const [skill, row] of Object.entries(SKILL_MENTAL)) {
    const sum = Object.values(row).reduce((t, v) => t + v, 0);
    check('§9.2：技能←心理的權重列和為 1（否則修正值不會落在 0–1）',
      Math.abs(sum - 1) < 1e-9, `${skill} 的和是 ${sum.toFixed(4)}`);
    check('§9.2：主導維度只能是六維之一',
      Object.keys(row).every((k) => MENTAL_KEYS.includes(k)), `${skill}：${Object.keys(row).join(',')}`);
  }
  check('§9.2：十二項技能都有主導心理維度',
    Object.keys(SKILL_MENTAL).length === Object.keys(SKILL_WEIGHTS).length,
    `${Object.keys(SKILL_MENTAL).length} / ${Object.keys(SKILL_WEIGHTS).length}`);

  const probe = (fill) => {
    const st = createState({ name: 'P', role: 'MID', seed: 'perform-probe' });
    for (const k of MENTAL_KEYS) st.mental[k] = fill;
    return st;
  };
  for (const skill of Object.keys(SKILL_MENTAL)) {
    check('§9.2：心理全空的發揮倍率恰好是 0.85',
      Math.abs(performCoef(probe(0), skill) - 0.85) < 1e-9, skill);
    check('§9.2：心理全滿的發揮倍率恰好是 1.15',
      Math.abs(performCoef(probe(100), skill) - 1.15) < 1e-9, skill);
    check('§9.2：心理 50 為基準，倍率恰好中性',
      Math.abs(performCoef(probe(MENTAL_BASE), skill) - 1) < 1e-9, skill);
  }

  // 折疊成位置戰力的乘法項之後帶寬必須守住——位置權重列和為 1 才成立，
  // 所以這條同時也是「有人動了 OVR_WEIGHTS 卻沒讓列和維持 1」的警報
  for (const role of ROLES) {
    const at = (fill) => {
      const st = probe(fill); st.role = role; return stability(st);
    };
    check('§9.2：位置戰力的心理乘法項落在 0.85–1.15',
      Math.abs(at(0) - 0.85) < 1e-9 && Math.abs(at(100) - 1.15) < 1e-9 && Math.abs(at(MENTAL_BASE) - 1) < 1e-9,
      `${role}：${at(0).toFixed(4)} / ${at(MENTAL_BASE).toFixed(4)} / ${at(100).toFixed(4)}`);
  }
  hiddenFromUi({ check });
  log(`§9.2 發揮帶寬：全空 ${PERFORM_FLOOR} ／ 心理 50 恰好 1.000 ／ 全滿 ${(PERFORM_FLOOR + PERFORM_SPAN).toFixed(2)}`);
}

/**
 * §9.1 的紅線：**六維連粗略標籤都不能出現在 UI**。
 *
 * 跟 S11 那條「UI 不得讀教練評價」同一個作法——掃 `src/ui/*.js` 的原始碼，因為這是
 * 一條「不准寫某種程式」的規定，跑測試跑不出來。
 *
 * 為什麼標籤比數字更該擋：v3 的面板印的是「大場面型」「一上大場面就抖」，看起來
 * 很含蓄，實際上等於把抗壓值分成五段公告出去。玩家一看到分段就會開始推門檻、
 * 然後最佳化它——§9.3 整套「因隱藏、果可見」的推測循環就是死在這裡。可見且有
 * 分級的只准剩聲量一項。
 */
function hiddenFromUi({ check }) {
  const uiDir = new URL('../../src/ui/', import.meta.url);
  // 六維的中文名 ＋ 舊版那五段抗壓／默契標籤。聲量的五段（全民認識…）刻意不列
  const leaks = [
    ...Object.values(MENTAL_NAMES),
    '大場面型', '一上大場面就抖', '容易緊張', '休息室核心', '關係破裂', '有摩擦',
  ];
  for (const file of readdirSync(uiDir)) {
    if (!file.endsWith('.js')) continue;
    const src = readFileSync(new URL(file, uiDir), 'utf8');
    check('心理六維不可見：UI 不得出現維度名稱或分級標籤（V4 §9.1）',
      !leaks.some((w) => src.includes(w)),
      `src/ui/${file} 出現了「${leaks.find((w) => src.includes(w))}」`);
    check('心理六維不可見：UI 不得讀取 MENTAL_NAMES／六維摘要（V4 §9.1）',
      !/\bMENTAL_NAMES\b|\bmentalTier\b|\bmentalSummary\b/.test(src), `src/ui/${file}`);
  }
}

/* ---------------- 失誤：因隱藏、果可見（V4 §9.3） ---------------- */

/**
 * §9.3 的整個設計目的是**讓玩家推測得出來**：心理隱藏，但失誤的後果印在數據上。
 * 所以這一組驗的不是「係數對不對」，是「看不看得出來」——一個抗壓低的人在季後賽
 * 與生死戰的陣亡數要顯著高於他自己的常規賽，否則這個循環根本沒成立。
 *
 * 用同一個角色比他自己（配對），種子運氣會相消。
 */
function mistakeVisibility({ check, log, runs }) {
  const probe = (mental) => {
    const st = createState({ name: 'X', role: 'MID', seed: 'mistake-probe' });
    Object.assign(st.mental, mental);
    return st;
  };
  const mid = { comp: 50, conf: 50, disc: 50, resl: 50 };
  const weak = probe({ ...mid, comp: 10, resl: 10 });
  const tough = probe({ ...mid, comp: 90, resl: 90 });

  check('§9.3：心理全中性在常規賽的失誤係數恰好是 1.0',
    Math.abs(mistakeFactor(probe(mid), PRESSURE.regular) - 1) < 1e-9,
    String(mistakeFactor(probe(mid), PRESSURE.regular)));

  const weakReg = mistakeFactor(weak, PRESSURE.regular);
  const weakHot = mistakeFactor(weak, PRESSURE.elimination);
  check('§9.3：抗壓低的人，壓力越大失誤越多（受迫項吃壓力係數）',
    weakHot > weakReg * 1.15, `常規 ${weakReg.toFixed(3)} → 生死戰 ${weakHot.toFixed(3)}`);

  const toughReg = mistakeFactor(tough, PRESSURE.regular);
  const toughHot = mistakeFactor(tough, PRESSURE.elimination);
  check('§9.3：抗壓高的人不會因為場合變大而拿到額外獎金（餘裕不吃壓力係數）',
    Math.abs(toughHot - toughReg) < 1e-9, `常規 ${toughReg.toFixed(3)} → 生死戰 ${toughHot.toFixed(3)}`);
  check('§9.3：抗壓高的人失誤本來就少', toughReg < 1, toughReg.toFixed(3));

  // 自信是雙向的：§9.3 明寫「自信過高 → 貪」也是失誤來源
  const cocky = mistakeFactor(probe({ ...mid, conf: 100 }), PRESSURE.regular);
  const steady = mistakeFactor(probe({ ...mid, conf: 60 }), PRESSURE.regular);
  check('§9.3：自信過高會增加非受迫性失誤（唯一一個越高越不好的維度）',
    cocky > steady, `自信 100 → ${cocky.toFixed(3)}，自信 60 → ${steady.toFixed(3)}`);

  check('§9.3：紀律低會增加非受迫性失誤',
    mistakeFactor(probe({ ...mid, disc: 10 }), PRESSURE.regular) > 1);

  // 失誤係數本身也要是放大器：再爛的心態不會讓陣亡數翻倍
  const worst = mistakeFactor(probe({ comp: 0, conf: 100, disc: 0, resl: 0 }), PRESSURE.elimination);
  check('§9.3：失誤係數有上界，心理再爛也不會讓陣亡數翻倍', worst < 2, worst.toFixed(3));

  /* ---- 果真的可見：160 段生涯裡，兩格的每場陣亡數要拉得開 ---- */
  const logs = runs.map((r) => r.state.deathLog).filter((d) => d && d.regular.G && d.pressure.G);
  check('§9.3：季後賽與國際賽的陣亡數真的有被記進可見數據',
    logs.length > runs.length * 0.5, `${logs.length}／${runs.length} 段有兩格資料`);

  const rate = (row) => row.D / row.G;
  const withComp = runs
    .filter((r) => r.state.deathLog?.regular.G && r.state.deathLog.pressure.G)
    .map((r) => ({ comp: r.state.mental.comp, gap: rate(r.state.deathLog.pressure) - rate(r.state.deathLog.regular) }));
  const lowComp = withComp.filter((x) => x.comp < 50);
  const highComp = withComp.filter((x) => x.comp >= 50);
  if (lowComp.length && highComp.length) {
    const lo = mean(lowComp.map((x) => x.gap));
    const hi = mean(highComp.map((x) => x.gap));
    check('§9.3：因隱藏果可見——低抗壓的人在大賽的每場陣亡數比自己的常規賽高得更多',
      lo > hi, `低抗壓 +${lo.toFixed(3)}／場，高抗壓 +${hi.toFixed(3)}／場`);
    log(`失誤可見度：大賽 − 常規賽的每場陣亡數，低抗壓 +${lo.toFixed(3)}、高抗壓 +${hi.toFixed(3)}（差 ${(lo - hi).toFixed(3)}）`);
  }
}

/* ---------------- 體力節奏（V4 §6.1） ---------------- */

/**
 * 保守玩法的平均休息間隔要落在 3–4 個月。
 *
 * S13 讓這條轉為實際檢查。驅動每月結算的還是 `engine/stamina.js` 的自動駕駛——
 * 月回合制（S14）接上玩家的選擇之後，量到的才是「玩家真的會怎麼玩」；在那之前
 * 這裡量的是「這組數值在保守策略下會長成什麼節奏」，仍然是守得住的東西：它抓的
 * 正是 §6.1 那組草案數字自己算出來只有 2.9 個月的那種偏差。
 *
 * 另外兩條是 §6.2 的兩個失敗模式，`13-體力系統.md` 指名要守：
 *   - 曲線太重 → 休息變無腦（休息佔掉一半以上的行動）
 *   - 恢復太快 → 體力變裝飾（透支區根本不會出現，壓力不存在）
 * 這兩個方向的錯誤都不會讓別的檢查變紅，所以要自己有網子。
 */
function staminaRhythm({ check, gate, log, runs }) {
  const has = runs.some((r) => typeof r.state.stamina === 'number');
  gate.gate('體力節奏 · 保守玩法每 3–4 個月休息一次', 'S13（數字驗證留 S14）', has,
    'state.stamina 尚未存在，體力系統與月回合制都還沒做',
    () => {
      const rests = runs.flatMap((r) => (r.state.restLog || []).map((x) => x.month));
      const gaps = rests.slice(1).map((m, i) => m - rests[i]).filter((g) => g > 0);
      check('體力節奏：保守玩法的平均休息間隔落在 3–4 個月',
        mean(gaps) >= 3 && mean(gaps) <= 4, `平均 ${mean(gaps).toFixed(2)} 個月`);

      const months = runs.reduce((t, r) => t + (r.state.staminaLog?.months || 0), 0);
      const restShare = rests.length / Math.max(1, months);
      const lowShare = runs.reduce((t, r) => t + (r.state.staminaLog?.low || 0), 0) / Math.max(1, months);
      check('體力節奏：休息不是多數行動（懲罰曲線沒有重到讓休息變無腦）',
        restShare < 0.5, `休息佔 ${(restShare * 100).toFixed(1)}% 的月份`);
      check('體力節奏：透支區（<30）在樣本裡真的出現得到（體力不是裝飾）',
        lowShare > 0.05, `透支月佔 ${(lowShare * 100).toFixed(1)}%`);
      log(`體力節奏：${months} 個體力月，休息 ${(restShare * 100).toFixed(1)}%、`
        + `透支月 ${(lowShare * 100).toFixed(1)}%，平均間隔 ${mean(gaps).toFixed(2)} 個月`);
    });
}

/* ---------------- 事件互斥（V4 §12.1） ---------------- */

/**
 * 同一回合的兩張卡不得屬於同一互斥群組。
 *
 * V4 §12.1 的觸發模型是「條件命中 → 取最高優先度 → 擲第二張並做互斥檢查」。現行事件
 * 卡沒有群組欄位，一個回合也只抽一張（`phases/shared.js` 的 `drawEvent`），所以互斥
 * 這件事還不存在。S17 做觸發引擎時這條會自動生效。
 */
function eventExclusion({ check, gate }) {
  const hasGroups = EVENT_CARDS.some((ev) => ev.group || ev.exclusive || ev.excl);
  gate.gate('事件互斥 · 同回合兩張卡不同群組', 'S17', hasGroups,
    `${EVENT_CARDS.length} 張事件卡都沒有互斥群組欄位，且目前一回合只抽一張`,
    () => {
      for (const ev of EVENT_CARDS) {
        check('事件互斥：每張卡都標了互斥群組', !!(ev.group || ev.excl), `${ev.id} 沒有群組`);
      }
    });
}
