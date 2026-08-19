/**
 * 心理六維與聲量的讀寫，以及它們的衍生效果。
 *
 * 分工（V4 §9.4）：
 * - **隱藏心理六維**住在 `state.mental`，玩家看不到數字也看不到標籤，只能靠事件
 *   結算的箭頭與可見數據反推。發揮與失誤怎麼算在 `engine/psych.js`。
 * - **聲量 `state.fame`** 住在自己的欄位，玩家看得到、有分級標籤，讀它的是續約
 *   加薪、代言、轉會傳聞熱度與外援名額。
 *
 * 兩者分家不只是換個欄位：v3 把「大場面型」印在面板上，等於把抗壓值攤開給玩家
 * 最佳化。§9.1 要的是相反的東西——心理只能從結果推測，推測本身才是玩法。
 *
 * 這個檔只負責「值怎麼變、變完影響哪些場合」；「同一個技能在場上打不打得出來」
 * 是 `psych.js` 的事。
 */
import { clamp } from '../core/rng.js';
import { MENTAL_KEYS, MENTAL_NAMES, MENTAL_RANGE } from '../data/mental.js';
import { FAME_NAME, FAME_RANGE, fameTier } from '../data/reputation.js';
import { bonus, flag } from '../kernel/modifiers.js';

/** 六維在 `state.mental`，聲量在 `state.fame`——同一套讀寫介面，兩個儲存位置 */
function rangeOf(key) {
  return key === 'fame' ? FAME_RANGE : MENTAL_RANGE[key];
}

function readValue(state, key) {
  return key === 'fame' ? (state.fame ?? 0) : state.mental[key];
}

function writeValue(state, key, value) {
  if (key === 'fame') state.fame = value; else state.mental[key] = value;
}

/**
 * 邊際遞減。
 *
 * 一段生涯會經過四、五十個扮演路口，如果每次 +5 都照單全收，只要一路選同一種
 * 語氣，每一項都會在中期就頂到 100——性格就不是選擇而是打卡了。所以越極端的
 * 值越難再往同方向推，往回走則不打折：要變成另一種人，永遠比繼續當同一種人容易。
 */
function diminish(key, value, delta) {
  const [lo, hi] = rangeOf(key);
  const span = (hi - lo) / 2;
  const mid = (hi + lo) / 2;
  const away = (value - mid) / span;                 // -1（谷底）～ +1（頂點）
  const pushingOut = Math.sign(delta) === Math.sign(away || delta);
  if (!pushingOut) return delta;                      // 往回拉不打折

  const extreme = Math.abs(away);
  // 下限 0.05 而不是 0.2：0.2 的話，一次 +10 在最極端處仍然推得動 +2，
  // 累積十幾次照樣頂到天花板
  const factor = clamp(1 - extreme * 1.15, 0.05, 1);
  const scaled = Math.abs(delta) * factor;

  // 最後那一段不給保底。
  //
  // 舊版一律 `Math.max(1, ...)`，於是任何 ≥1 的變動永遠至少推 +1——邊際遞減在
  // 極端值等於失效，累積夠多次就一定爬到頂。國際賽開始逐次累積心理值之後這個
  // 缺陷就浮出來了：打過六次以上國際賽的人，抗壓清一色剛好 100，區別度歸零。
  // 現在 85% 以上的極端區間會四捨五入到 0，最後幾點是真的推不太動。
  const floor = extreme > 0.85 ? 0 : (Math.abs(delta) >= 1 ? 1 : 0);
  return Math.sign(delta) * Math.max(floor, Math.round(scaled));
}

/**
 * 調整一個心理維度或聲量，回傳實際變動量（夾在上下界內）。
 * @returns {number}
 */
export function adjustMental(state, key, delta) {
  if (!delta || !rangeOf(key)) return 0;
  const [lo, hi] = rangeOf(key);
  const before = readValue(state, key);
  writeValue(state, key, clamp(before + diminish(key, before, delta), lo, hi));
  return readValue(state, key) - before;
}

/**
 * 心理值一律不對玩家揭露數字——只給方向與強度的箭頭。
 *
 * 這是刻意的：屬性是「訓練成果」，看得到數字才知道要投哪裡；心理是「你把自己演成
 * 了什麼人」，攤開成數字之後玩家就會開始最佳化它，扮演就沒了。箭頭是 §9.1 允許的
 * 那條窄縫——「僅從文本與事件結果推測」，這就是那個結果。
 */
function arrow(applied) {
  const n = Math.abs(applied) >= 8 ? 3 : Math.abs(applied) >= 4 ? 2 : 1;
  const glyph = (applied > 0 ? '↑' : '↓').repeat(n);
  return `<span class="${applied > 0 ? 'up' : 'dn'}">${glyph}</span>`;
}

const labelOf = (key) => (key === 'fame' ? FAME_NAME : MENTAL_NAMES[key]);

/** 套用一整組心理／聲量變動，回傳給卡片用的中文說明片段（不含數字） */
export function applyMental(state, deltas) {
  const notes = [];
  for (const [k, v] of Object.entries(deltas || {})) {
    const applied = adjustMental(state, k, v);
    if (applied) notes.push(`${labelOf(k)} ${arrow(applied)}`);
  }
  return notes;
}

/**
 * 給 UI 的摘要——**只有聲量**。
 *
 * 舊版這裡回傳五個維度的粗略標籤，其中「大場面型」「一上大場面就抖」等於直接把
 * 抗壓值印在面板上。V4 §9.1／§9.4 把那條線劃掉了：可見且有標籤的只剩聲量一項，
 * 六維連標籤都沒有。
 */
export function reputeSummary(state) {
  return [{ key: 'fame', name: FAME_NAME, tier: fameTier(state.fame ?? 0) }];
}

/* ================= 衍生效果 ================= */

/**
 * ⚠ **這兩個係數是 S12 對 §9.2 讓出來的空間，不是調鬆。**
 *
 * §9.2 的發揮倍率讓抗壓與信任在**每一場**都乘進 `positionPower`（±15%），而這兩條
 * v3 留下來的加成（信任 → 隊友均值、抗壓 → 決勝局）吃的是同樣那兩維——重複計價。
 * 照舊值疊起來，心理全滿對全空在戰力持平時的勝率擺幅是 **35.3 個百分點**，直接撞破
 * S07「不超過 30」那條不變式：那正是「心理從放大器變成決定器」的樣子。
 *
 * 拆解（決勝局、第一種子、rookie 探針）：§9.2 佔 17.8 pp（規格書寫死，不准動）、
 * 信任 → 隊友 8.5 pp、抗壓 → 決勝局 9.0 pp。§9.2 那份動不了，所以讓路的是後兩者，
 * 各自砍到剩下「§9.2 表達不了的那一半」：
 *
 * - `TRUST_TEAM_COEF` 0.12 → 0.08：§9.2 的信任影響**你自己**打得如何，這一條影響的
 *   是**隊友**願意怎麼跟你打。後者留著，前者已經另有出口。
 * - `CLUTCH_COEF` 0.16 → 0.05：§9.2 是恆常的，這一條只需要負責「決勝局額外的那一
 *   份」。大心臟真正的份量改由特質層承擔（`bigheart` +5、終極舞台保底 4 再 +4），
 *   那本來就是它該在的地方——原始數值只給一點傾斜。
 *
 * 改完擺幅 28.5 pp。兩者都不是為了讓測試變綠而選的：先有「重複計價」這個判斷，
 * 才有砍哪一條、砍多少。
 */
const TRUST_TEAM_COEF = 0.08;
const CLUTCH_COEF = 0.05;

/**
 * 信任對隊伍強度的加減。50 為中性，兩端各 ±4 點戰力。
 *
 * 這是 `mateMorale` 的長期版本——士氣是單季的，信任是累積的。V4 §9.4 把舊的
 * 「隊友默契 chem」併進信任：默契是「你相不相信隊友會跟上」的**結果**，不是
 * 一個獨立的維度。
 */
export function trustBonus(state) {
  const raw = (state.mental.trust - 50) * TRUST_TEAM_COEF;
  // 分段效果：休息室傳奇把負值抹平再加值，獨狼則只吃得到負的那一半
  if (state.epic.lockerroom) return Math.max(raw, 0) + 2;
  // 獨狼：個人數據好看，但他從隊友身上拿不到任何加成
  if (state.traits.lonewolf) return Math.min(raw, 0);
  return raw;
}

/**
 * 決勝局與國際賽淘汰賽的抗壓加成，單位是勝率百分點。
 * 係數的由來見上面 `CLUTCH_COEF`。`心態崩盤` 會把加成整個翻負。
 */
export function clutchBonus(state) {
  let base = (state.mental.comp - 50) * CLUTCH_COEF + bonus(state, 'clutchAdd');
  // 這兩個是分段效果，不是單純加減：終極舞台先保底再加值，心態崩盤把加成整個翻負。
  // 寫不進特質資料表的 add/mul/floor/cap，所以留在這裡，順序也必須保持。
  if (state.epic.ultstage) base = Math.max(base, 4) + 4;
  if (state.traits.tilt) base = Math.min(base, 0) - 4;
  return clamp(base, -12, 12);
}

/**
 * 下剋上加成。
 *
 * 種子序越後面、心理素質越硬，加成越大——這是 DRX 2022（第四種子奪冠）與
 * TPA 2012（外卡出線奪冠）那種劇本能夠成立的唯一入口。第一種子拿不到任何加成，
 * 因為那不叫下剋上。
 *
 * 吃的兩維是抗壓與信任（舊的大心臟與默契）：一支沒人看好的隊要翻盤，靠的是手不抖
 * 加上五個人還願意一起賭。
 *
 * @param {number} seed 1 為第一種子
 */
export function underdogBonus(state, seed) {
  if (!seed || seed <= 1) return 0;
  const depth = seed - 1;                       // 第 2 種子 1、第 4 種子 3
  const grit = (state.mental.comp - 55) * 0.07 + (state.mental.trust - 55) * 0.05;
  const total = Math.max(0, grit) * depth * 0.35 + depth * bonus(state, 'underdogDepth');
  // 上限存在的理由：下剋上要是「有機會」，不是「換個種子序就變強隊」
  return clamp(total, 0, 11);
}

/**
 * 續約與報價的年薪係數加成：聲量大就得加薪留人。
 *
 * 舊版還有一項「風評 ±0.15」，V4 §9.4 把 `rep` 整條維度拿掉了——「圈內怎麼說你」
 * 改由教練評價表達（§10.2 的隱藏心理修正吃動機／紀律／抗壓，正是教練看得出來的
 * 那部分），不再有一個獨立的風評數值直接乘進薪水。
 */
export function marketMultBonus(state) {
  const fame = ((state.fame ?? 0) - 40) * 0.004;   // 滿聲量約 +0.24
  return Math.round(fame * 100) / 100;
}

/**
 * 自然回歸。
 *
 * §9.1 說六維「僅能透過事件卡選擇改變」，所以這裡**不把六維往中間拉**——那等於用
 * 時間抵銷玩家的選擇。唯二會自己走的是：
 *
 * - `trust` 信任：隊友是會換的，關係要重新建立，所以它往中性收。帶著嘴砲王或獨狼
 *   的人收不回來——V4 §9.4 把舊 `ego` 的放大器角色交給特質副作用，這是其中一處。
 * - `fame` 聲量：熱度本來就會退，不刷存在感就會被忘記。
 *
 * 例外（S49）：掛著 `mentalConverge` 旗標（心理輔導教練）時六維逐年向中性收斂
 * ±1——平常不拉六維是設計，請了心理輔導等於主動買這項服務。trust 本來就年年收斂，
 * 這裡再推一把（心理輔導最直接的工作就是隊內關係）；trashtalk／lonewolf 卡住的
 * 只有標準那一條，收斂迴圈照走——花錢請來的輔導就是來解這個的。值恰好在 50 的
 * 維度跳過，不讓它在中性兩側 ±1 振盪。
 */
export function driftMental(state) {
  const stuck = state.traits.trashtalk || state.traits.lonewolf;
  const trustDrift = state.mental.trust < 50 ? (stuck ? 0 : 1) : -1;
  adjustMental(state, 'trust', trustDrift);
  adjustMental(state, 'fame', (state.fame ?? 0) > 12 ? -2 : 0);

  if (flag(state, 'mentalConverge')) {
    for (const dim of MENTAL_KEYS) {
      const v = state.mental[dim] ?? 50;
      if (v === 50) continue;
      adjustMental(state, dim, v < 50 ? 1 : -1);
    }
  }
}
