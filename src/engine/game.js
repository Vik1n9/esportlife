/**
 * 生涯流程機（引擎核心）。
 *
 * 這個檔現在只做三件事：跑年度迴圈、處理年初的例行公事、接住退役訊號。一年裡有哪些
 * 月份、每個月排什麼，由 `data/formats/calendar.js` 那張表 ＋ `engine/calendar.js`
 * 的展開決定；每個階段自己的邏輯與敘事住在 `phases/*.js`。
 *
 * 這樣切的理由是改動成本：舊版 1033 行把賽段、季後賽、獎項、MSI、世界賽、轉會、
 * 業餘出路全部寫在一起，於是改一個 MSI 要在 international.js（邏輯）、game.js
 * （敘事與選擇）、world.js（史實）三個檔之間來回。現在改 MSI 只開 `phases/msi.js`；
 * 搬動它在年曆上的位置只改 `data/formats/calendar.js` 的一列。
 *
 * ── S14：年回合 → 月回合 ──
 *
 * 舊的 `runYear` 是「季初訓練（擲一把骰）→ 跑完年曆上的賽事 → 年末」。V4 §3.2 的回合
 * 單位是月，所以主迴圈改成**逐月推進**：年曆展開成 12 個月，養成回合交給
 * `phases/month.js`，賽事序列交給既有的階段。主迴圈仍然不知道 MSI 或世界賽存在，
 * 它只知道「照 order 跑這些階段，月份換了就報一次月」。
 *
 * Beat 協定（yield 出去的東西）：
 *   {type:'card', tone, title, body}      純敘事，不等待
 *   {type:'divider', text}                年度分隔線
 *   {type:'month', year, month}           月份推進（狀態列的進度顯示）
 *   {type:'checkpoint'}                   建議存檔點（年初）
 *   {type:'choice', title, options[]}     → resume 以 option.id
 *   {type:'alloc', mode, dice|points}     → resume 以 undefined（UI 直接改 state）
 *   {type:'end'}                          生涯結束
 */
import { ATTR_NAMES } from '../data/attributes.js';
import { MONTHS_PER_YEAR, calendarFor } from './calendar.js';
import { careerTier, tierName } from './career.js';
import { disbandNoteFor } from './market.js';
import { driftMental } from './mental.js';
import { applyLifecycleDecline } from './lifecycle.js';
import { lookupTrait } from '../kernel/modifiers.js';
import { maintenanceLoss } from './progression.js';
import { RetireSignal } from './retire.js';
import { currentLeagueKey, stageLabel } from './roster.js';
import { monthlyDrift } from './stamina.js';
import { tickActiveEffects } from './training.js';
import { PHASES } from '../phases/index.js';
import { card, questBeats } from '../phases/shared.js';

// 舊入口：UI 與測試都從這裡拿階段顯示名
export { stageLabel };

/* ================= 主流程 ================= */

/**
 * @param {{state:object, rng:import('../core/rng.js').Rng}} g
 */
export function* careerFlow(g) {
  const { state } = g;

  /*
   * 開場卡依起點分兩種（S20d）：AMATEUR 是 2012 年網咖時代的 16 歲起點；PRO 是
   * DEMO 預設起點——19 歲出道新人，第一年就是職業賽季。兩種都只在「還沒打過任何
   * 賽季」時出現一次（讀檔回來的生涯不會重播開場）。
   */
  if (!state.seasonLog.length) {
    if (state.stage === 'AMATEUR' && state.age === 16) {
      yield card('info', '選手誕生',
        `${state.year} 年春天，這座島上還沒有「職業選手」這種身分。有的是網咖包台、` +
        `店家自己辦的盃賽，和一整排在排位上想證明自己的人。<br>` +
        `16 歲的 <b class="hl">${state.name}</b> 在 <b class="hl">${state.team}</b> 卡到一個位子。三年後的路，要自己選。`);
    } else if (state.stage === 'PRO') {
      yield card('info', '選手誕生',
        `${state.year} 年，<b class="hl">${state.name}</b> 被 <b class="hl">${state.team}</b> 簽下——` +
        `19 歲，職業第一年。賽段冠軍、MSI 門票、世界賽，從今年開始都跟你有關了。`);
    }
  }

  try {
    while (!state.done) {
      yield { type: 'checkpoint' };
      yield* runYear(g);
    }
  } catch (err) {
    if (!(err instanceof RetireSignal)) throw err;
    state.done = true;
    state.retireReason = err.reason;
  }

  // 生涯結束：進行中的任務先算一次達成（目標已滿足的照發），其餘以退役收束——
  // 生涯結束等於所有期限都到了，不該留下永遠掛著的卡（§12.3 期限語意）
  yield* questBeats(g, { forced: true });
  yield* retirement(g);
  yield { type: 'end' };
}

/**
 * 一年 ＝ 十二個月。
 *
 * 年初的例行公事跑完之後就完全交給年曆——主迴圈不知道 MSI 或世界賽存在，只知道
 * 「這個月排了哪些階段，照 order 跑」。`month` beat 一個月只報一次，所以同一個月裡的
 * 多個階段（名單 → 養成回合，或賽季結算 → 世界賽）不會把狀態列閃三次。
 */
function* runYear(g) {
  const { state } = g;
  yield { type: 'divider', text: `${state.year} 年 · ${state.age} 歲 · ${stageLabel(state)}` };
  yield* yearOpen(g);

  // 各賽段的原始數據放在執行脈絡而不是 state：它只活一年，存檔點又固定在年初，
  // 寫進 state 只會讓存檔多背一份永遠是空陣列的欄位
  g.splits = [];
  g.monthStats = [];
  g.lineup = null;
  // 賽段累計只在真的有打的年份重置——復健年沿用去年的紀錄，面板才不會整排空白
  if (!state.skipSeason) {
    state.splitLog = [];
    state.champPoints = 0;
    state.seedRank = 0;
    state.worldsSlotBonus = 0;
    state.wonSplitThisYear = false;
  }

  /*
   * 逐月推進。
   *
   * 月份的時鐘住在主迴圈，不住在階段裡：**每一個月都有自然恢復**，包括季後賽、MSI、
   * 世界賽那幾個沒有養成回合的月份。S14 第一版把恢復寫在 `phases/month.js` 裡，結果
   * 打進世界賽的年份平白少掉四個月的恢復——體力經濟被賽程長度偷偷改寫，而那是
   * 「打得越深越累」以外的另一種懲罰，沒有人設計過它。
   */
  const plan = calendarFor(state, currentLeagueKey(state));
  for (let month = 1; month <= MONTHS_PER_YEAR; month++) {
    state.month = month;
    yield { type: 'month', year: state.year, month };
    for (const phase of plan) {
      if (phase.month !== month) continue;
      const mod = PHASES[phase.kind];
      if (mod) yield* mod.run(g, phase);
    }
    // 生涯任務結算（§12.3，S17b）：每個結算點跑一次開卡／達成／失敗。
    // 排在該月階段之後——這個月發生的戰績與特質變化，當月就算進任務進度
    yield* questBeats(g);
    monthlyDrift(state);
    tickActiveEffects(state);
  }

  driftMental(state);
  state.age += 1;
  state.year += 1;
  state.stageYear += 1;
  state.month = 1;
}

/* ================= 年初：重置、衰退、流言 ================= */

/**
 * 一年的開場。
 *
 * S14 之前這裡叫 `phaseTraining`，因為那一把訓練骰是它的主體。骰子搬進養成回合之後
 * 剩下的都是**年度尺度**的事：每季重置的旗標、生命週期衰退、解散流言——它們
 * 一年只該發生一次，不能跟著月份跑。
 *
 * ⚠ v4.3：退役硬上限已廢除（§18.1）。沒有「年齡到頂就強迫退休」的檢查，衰退由生命
 * 週期曲線自然進行（§7.2），生涯由市場淘汰（`phases/transfer.js`）與退役事件收束。
 */
function* yearOpen(g) {
  const { state, rng } = g;

  // 每季重置——集中在一個地方，這是舊版最大的漏洞來源
  state.seasonFactor = 1;
  state.skipSeason = false;
  state.tempInjuryRisk = 0;
  state.wonPlayoffThisYear = false;
  state.wonWorldsThisYear = false;
  state.lastDelta = state.lastDelta || 0;

  // 生命週期衰退：曲線過峰後，屬性值被往下拉（§7.2 的衰退跟隨）。
  // 年界由月曆定位（S14），所以前置含 S14
  const declined = applyLifecycleDecline(state, rng);
  if (declined.length) {
    yield card('bad', '歲月',
      `體能已過巔峰，本季下滑：${declined.map((d) => `${ATTR_NAMES[d.key]} <b class="dn">−${d.amount}</b>`).join('／')}。`);
  }

  // 維持條件失效（§14.2）：單身交往、毒瘤洗白……特質被拿掉要有敘事 beat，
  // 不是無聲無息地消失
  const lostTraits = maintenanceLoss(state);
  for (const key of lostTraits) {
    const t = lookupTrait(key);
    yield card('info', '特質消逝', `<b class="hl">${t.name}</b> 已不再是你的標籤——<span class="muted">${t.desc}</span>`);
  }

  // 解散流言
  const note = state.stage === 'PRO' ? disbandNoteFor(state) : null;
  // 生涯軌跡帳本（S17a）：由 false→true 的那一次才累計（§14.3「不滅隊魂」的
  // 降級危機次數），不是每季都加——連兩年都有解散流言也只算一次危機
  if (note && !state.disbandThreat) state.disbandCrises += 1;
  state.disbandThreat = !!note;
  if (note) {
    yield card('bad', '休息室流言',
      `圈內開始傳 <b class="hl">${state.team}</b> 的財務狀況。「${note}」——如果是真的，這會是你在這裡的最後一季。` +
      `<br><span class="muted">除非……你們今年拿下世界賽冠軍。</span>`);
  }

  if (state.rehabYears > 0) {
    state.rehabYears -= 1;
    state.skipSeason = true;
    state.seasonFactor = 0;
    yield card('bad', '復健年', '手腕／背傷尚未痊癒，本季確定<b class="dn">報銷</b>。（整年只能復健，沒有訓練成長）');
    state.seasonLog.push({ year: state.year, age: state.age, team: state.team || stageLabel(state), line: '復健年 · 整季報銷', injured: true });
    /*
     * 復健年沒有養成回合——那一年的每個月都在復健（`phases/month.js` 的第一段），
     * 沒有可選的行動。舊制在這裡補 2 顆骰當「幾乎沒成長」的代價；設施制下復健活動
     * 本身就不漲屬性（只恢復體力＋降受傷風險），所以整年零成長、零決策，代價自然成立。
     */
  }
}

/* ================= 生涯結算 ================= */

function* retirement(g) {
  const { state } = g;
  yield card('bad', '職業生涯結束', state.retireReason);
  if (state.forcedRetire) yield card('bad', '被迫退役', '功勳老將在解散後無人接手，黯然退役。');

  if (state.pendingPoints > 0) {
    const points = state.pendingPoints;
    state.pendingPoints = 0;
    yield { type: 'alloc', mode: 'points', points, title: `最後的能力點分配（${points} 點）` };
  }

  const tier = careerTier(state);
  if (tier <= 1) {
    yield card('gold', '榮譽殿堂', `生涯評價 <b class="hl">${tierName(tier)}</b>，入選電競榮譽殿堂！`);
  } else {
    yield card('info', '生涯總結', `生涯評價：<b class="hl">${tierName(tier)}</b>。`);
  }

  yield { type: 'summary', tier };
}
