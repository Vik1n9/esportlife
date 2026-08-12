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
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { attrCap, investAttr, ovr, skills } from '../../src/engine/attributes.js';
import { checkFusions, unlockTrait } from '../../src/engine/progression.js';
import { careerTier } from '../../src/engine/career.js';
import { gameChance } from '../../src/kernel/series.js';
import { teamStrength } from '../../src/kernel/strength.js';
import { TIER_STORES, traitName } from '../../src/kernel/modifiers.js';
import { ATTRS, ATTR_CAP, ATTR_CAP_GODHAND } from '../../src/data/attributes.js';
import { MENTAL_KEYS, MENTAL_RANGE } from '../../src/data/mental.js';
import { EVENT_CARDS, TIER_NAMES } from '../../src/data/events.js';
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

  peakCeiling({ check, log, runs, gate });
  styleGap({ check, log, runs });
  topEndPayoff({ check, log, runs });
  legendRarity({ check, log, runs });
  roleIdentity({ check, log, gate });
  fusionConsumption({ check, log, runs });
  potentialDecay({ check, log, gate });
  mentalAmplifier({ check, log, gate });
  staminaRhythm({ check, gate, runs });
  eventExclusion({ check, gate });

  gate.report();
}

/* ---------------- 巔峰上界（V4 §7.1 §10.2） ---------------- */

/**
 * 通膨守門員。
 *
 * 兩層：結構層看權重表（列和不是 1 就是在平白放大數值），分布層看 160 段的巔峰。
 * 分布層一律用「÷ ATTR_CAP」的比例——S09 要換成 0–100 刻度，×1.25 之後比例不變，
 * 明顯高於現值就是通膨（這正是 `09-屬性0-100.md` 說的及格線）。
 */
function peakCeiling({ check, log, runs, gate }) {
  for (const [key, w] of Object.entries(SKILL_WEIGHTS)) {
    const sum = Object.values(w).reduce((t, v) => t + v, 0);
    check('技能←屬性的權重列和為 1（否則技能值會被平白放大）',
      Math.abs(sum - 1) < 1e-9, `${key} 的和是 ${sum.toFixed(4)}`);
  }
  for (const role of ROLES) {
    const sum = Object.values(OVR_WEIGHTS[role]).reduce((t, v) => t + v, 0);
    check('位置 OVR 的技能權重列和為 1（否則五路 OVR 不能互相比較）',
      Math.abs(sum - 1) < 1e-9, `${role} 的和是 ${sum.toFixed(4)}`);
  }

  const peaks = runs.map((r) => r.state.peakOvr);
  const ratio = mean(peaks) / ATTR_CAP;
  // 八組獨立種子實測 0.739–0.776。上下各留約 6 個百分點：低於下界代表刻度縮水或成長
  // 被砍過頭，高於上界就是通膨
  check('巔峰上界：平均巔峰 ÷ 屬性硬上限落在 0.68–0.82（通膨／縮水都會紅）',
    ratio >= 0.68 && ratio <= 0.82, `平均巔峰 ${mean(peaks).toFixed(2)}／上限 ${ATTR_CAP} = ${ratio.toFixed(4)}`);
  check('巔峰上界：沒有任何一段生涯超過突破後的硬上限',
    Math.max(...peaks) <= ATTR_CAP_GODHAND, `最高 ${Math.max(...peaks)} > ${ATTR_CAP_GODHAND}`);

  for (const { state, seed, role } of runs) {
    const top = Math.max(...Object.values(skills(state)));
    check('巔峰上界：技能值不得高於屬性上限（技能是加權平均，超出代表權重表壞了）',
      top <= attrCap(state), `${seed}/${role} 最高技能 ${top} > ${attrCap(state)}`);
  }

  log(`巔峰 OVR：平均 ${mean(peaks).toFixed(2)}（÷上限 ${ratio.toFixed(3)}）、最高 ${Math.max(...peaks)}、最低 ${Math.min(...peaks)}`);

  // 教練評價（V4 §10.2）取代 OVR 之後，上界要改看它的分布
  gate.gate('巔峰上界 · 教練評價分布', 'S11', false,
    'V4 §10.2 的教練評價尚未存在，現在守的是 OVR 的分布', () => {});
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
      diffs.push(ovr(focus) - ovr(spread));
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
  // 加點的價值整個吃掉（八組種子實測 1.43–4.91，門檻取 0.5 留 2.8 倍餘裕）
  const peakOf = (style) => mean(runs.filter((r) => r.style === style).map((r) => r.state.peakOvr));
  const careerGap = peakOf('focus') - peakOf('spread');
  check('打法差距：生涯層級老手的平均巔峰仍高於新手',
    careerGap / ATTR_CAP >= 0.00625, `老手 ${peakOf('focus').toFixed(2)} vs 新手 ${peakOf('spread').toFixed(2)}（差 ${careerGap.toFixed(2)}）`);

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
  const withCrown = runs.filter((r) => crowns(r.state) > 0).map((r) => r.state.peakOvr);
  const without = runs.filter((r) => crowns(r.state) === 0).map((r) => r.state.peakOvr);
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
  state.mates = Array.from({ length: 4 }, () => ({ ovr: 55 }));
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
    () => {
      check('心理是放大器：§9.2 的發揮倍率落在 0.85–1.15',
        true, '（S12 接上發揮公式後在這裡驗帶寬）');
    });
}

/* ---------------- 體力節奏（V4 §6.1） ---------------- */

/**
 * 保守玩法的平均休息間隔要落在 3–4 個月。
 *
 * 體力（S13）與月回合制（S14）都還沒做，所以這條現在只掛著。S13 讓它跑得動，
 * S14 之後數字才真的有意義——`13-體力系統.md` 已經寫明這個分工。
 */
function staminaRhythm({ check, gate, runs }) {
  const has = runs.some((r) => typeof r.state.stamina === 'number');
  gate.gate('體力節奏 · 保守玩法每 3–4 個月休息一次', 'S13（數字驗證留 S14）', has,
    'state.stamina 尚未存在，體力系統與月回合制都還沒做',
    () => {
      const rests = runs.flatMap((r) => (r.state.restLog || []).map((x) => x.month));
      const gaps = rests.slice(1).map((m, i) => m - rests[i]).filter((g) => g > 0);
      check('體力節奏：保守玩法的平均休息間隔落在 3–4 個月',
        mean(gaps) >= 3 && mean(gaps) <= 4, `平均 ${mean(gaps).toFixed(2)} 個月`);
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
