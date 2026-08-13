/**
 * 養成回合：一個月（V4 §3.2、§4）。
 *
 * V4 的回合單位是月，不是年。舊版一年只有一次「季初訓練」——擲一把骰、分配完就進賽季，
 * 玩家一整年只碰得到一個養成決策點；體力、休息、賽程壓力全部沒有施展的空間。這個檔是
 * 那個決策點的替代品：一年約八個，每一個都問同一件事——**這個月要練，還是要留體力**。
 *
 * §4 的七步序列：
 *
 *   1. 顯示當月狀態（體力、本月賽事預告）
 *   2. 玩家選擇一個行動（訓練活動／減量／休息／復健）
 *   3. 結算行動（體力消耗/恢復、屬性成長）
 *   4. 事件判定
 *   5. 若有事件：呈現→選擇→結算
 *   6. 若本月有常規賽：列出結果（不互動）→結算影響
 *   7. 推進到下一月
 *
 * 第 1 步刻意**不另開一張卡**：狀態列有月份、面板有體力，再加一張「現在是 5 月，體力
 * 62」的卡只會把敘事流洗掉——那些數字折進選單的標題與每個選項的註記裡，玩家在做決定
 * 的那一刻看得到，才是它該出現的位置。
 *
 * ⚠ 這一站只搭骨架，三處各自在等下一站：
 *   - 第 2、3 步的**訓練活動菜單與成長結算是 S16**（設施制，V4 §5）。這裡先用「全力／
 *     減量」兩級 ＋ 沿用既有的骰子加點介面。
 *   - 第 4 步的**觸發引擎是 S17**（條件優先、互斥、第二張，V4 §12.1）。這裡先用機率
 *     抽既有的事件卡。
 *   - 賽事期間的備賽戰術（§6.3 的「減少訓練」與「心態調整與休息」）是 S15。賽事序列
 *     的月份不排養成回合，所以 `inEvent` 這條路現在走不到——但規則的出處已經在
 *     `stamina.js`，S15 接上去時不必重新解讀規格書。
 */
import { clamp } from '../core/rng.js';
import { LEAGUES } from '../data/leagues.js';
import {
  MATCH_MONTH_COST, applyMonthAction, bandOf, consume, monthActions, noteMonth, staminaOf,
} from '../engine/stamina.js';
import { formatStatLine, simulateSeason } from '../engine/season.js';
import { currentLeagueKey } from '../engine/roster.js';
import { card, drawEvent, drawRoleplay, trainingBeats } from './shared.js';

export const kind = 'MONTH';

/**
 * 事件卡與扮演卡的**年度預算**，除以當年的養成回合數就是每個月的機率。
 *
 * 寫成年度預算而不是月機率，是因為養成回合數會隨賽段數浮動：業餘期一年一段（9 個
 * 養成回合），職業兩段（7 個），2025 起三段。固定月機率會讓業餘年平白多出一倍的
 * 事件卡——而事件卡會給屬性與特質，那等於偷偷加速了業餘期的成長。實測就是這樣：
 * 第一版讓「卡在青訓好幾年」那種生涯幾乎消失，`smoke.mjs` 的「五個等第都出現得到」
 * 因為最底層的等第空掉而紅。
 *
 * 數字沿用年回合時代的密度（每個賽段兩張、扮演卡一年一次）——**這一站換的是抽卡的
 * 時機（跟著月份走），不是內容密度**。密度是 S17／S18 的事。
 *
 * TODO(S17)：V4 §12.1 的觸發模型是「條件命中 → 取最高優先度 → 擲第二張並做互斥
 * 檢查」，固定 1 張、有機率 2 張。現在只有一個沒有條件的隨機池（`drawEvent`）。
 */
const EVENTS_PER_SPLIT = 2;
const ROLEPLAY_PER_YEAR = { PRO: 0.45, OTHER: 0.25 };

/** 年度預算 → 這個月的機率（百分比） */
const monthlyChance = (perYear, devMonths) => clamp((perYear / Math.max(1, devMonths)) * 100, 0, 100);

export function* run(g, phase) {
  const { state, rng } = g;

  // 復健年：整年沒有訓練決策，只有復健。月份照樣推進——體力不動的年份會讓下一年的
  // 節奏對不上（S13 交接筆記點名的缺口，這一站補上）
  if (state.skipSeason) {
    applyMonthAction(state, 'rehab');
    return;
  }

  /* ---- 1–2：狀態與選擇 ---- */
  const stamina = staminaOf(state);
  const band = bandOf(stamina);
  const preview = phase.matchWeight > 0 && !benched(g)
    ? `　<span class="muted">本月有${phase.split?.name || '例行賽'}</span>` : '';

  const picked = yield {
    type: 'choice',
    kind: 'month',
    month: phase.month,
    title: `${phase.month} 月　體力 ${Math.round(stamina)}（${band.label}）${preview}`,
    options: monthActions({ inEvent: false }).map((a) => ({
      id: a.id,
      label: a.label,
      main: a.id === 'train',
      note: `${a.cost >= 0 ? `體力 −${a.cost}` : `體力 +${-a.cost}`}　${a.note}`,
    })),
  };

  /* ---- 3：結算行動 ---- */
  const act = applyMonthAction(state, picked);
  // TODO(S16)：成長結算換成設施制（V4 §5.3 的成長公式＋§5.4 的成功率），骰子退場
  if (act.grow) yield* trainingBeats(g, act.grow);

  // 國際賽與事件卡發下來的能力點在這裡花掉。舊版為此在年曆上排了三次 `ALLOC` 階段，
  // 月回合之後不必了——下一個養成回合就是最近的出口
  if (state.pendingPoints > 0) {
    const points = state.pendingPoints;
    state.pendingPoints = 0;
    yield { type: 'alloc', mode: 'points', points, title: `能力點分配（${points} 點）` };
  }

  /* ---- 4–5：事件 ---- */
  const devMonths = phase.devMonths || 8;
  if (rng.chance(monthlyChance(EVENTS_PER_SPLIT * phase.splitCount, devMonths))) yield* drawEvent(g);
  const perYear = state.stage === 'PRO' ? ROLEPLAY_PER_YEAR.PRO : ROLEPLAY_PER_YEAR.OTHER;
  if (rng.chance(monthlyChance(perYear, devMonths))) {
    yield* drawRoleplay(g, state.stage === 'PRO' && rng.chance(50) ? 'coach' : 'daily');
  }

  /* ---- 6：本月常規賽 ---- */
  yield* regularSeason(g, phase);

  /* ---- 7：推進 ---- */
  // 自然恢復由主迴圈統一做（每個月都有，包括賽事月），這裡只記帳
  noteMonth(state, { rested: act.id === 'rest' });
}

/** 這個賽段有沒有被下放。名單在賽段開幕就定了（`phases/split.js`） */
const benched = (g) => (g.lineup ? g.lineup.share <= 0 : false);

/**
 * 本月的常規賽（第 6 步）。
 *
 * 舊版一個賽段一次結算、一張戰報。月回合下同一批比賽攤在賽段的每個常規賽月：戰報跟著
 * 月份出，體力也在同一個月扣——「這個月要不要硬練」之所以是決策，就是因為下一張戰報
 * 讀的是這個月結算完的體力。
 *
 * 手感讀的是**行動與比賽都扣完之後**的谷底，不是月初的值：S13 的 `advanceMonths` 取
 * 谷底平均，同一個理由——拿月底（自然恢復之後）的值會系統性地高估選手的狀態。
 */
function* regularSeason(g, phase) {
  const { state, rng } = g;
  if (!phase.matchWeight || state.seasonFactor <= 0) return;

  const share = clamp(g.lineup ? g.lineup.share : 1, 0, 1);
  consume(state, MATCH_MONTH_COST * share);
  if (share <= 0) return;   // 板凳／整段養傷：位子被別人拿走了，這個月沒有你的比分

  const leagueKey = currentLeagueKey(state);
  // 最後一個參數是「這個月佔整個賽段的比例」——賽段的手氣被攤成幾個月時，
  // 每個月的抽樣誤差要放大回去（`engine/season.js` 的 noiseScale）
  const batch = phase.split ? phase.matchWeight / phase.split.weight : 1;
  const stat = simulateSeason(state, rng, leagueKey, phase.matchWeight, share, staminaOf(state), batch);
  g.monthStats.push(stat);

  const label = phase.split && phase.splitCount > 1 ? `${phase.split.name} · ${phase.month} 月` : `${phase.month} 月`;
  yield card('', `${label}戰報`,
    `${state.team || LEAGUES[leagueKey].name}<div class="statline">${formatStatLine(stat)}</div>`);
}
