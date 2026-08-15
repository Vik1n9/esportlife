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
 * ⚠ 第 2、3 步的**訓練活動菜單與成長結算在 S16 落地**（設施制，V4 §5，`engine/training.js`）。
 * 賽事期間的備賽戰術（§6.3 的「減少訓練」與「心態調整與休息」）是 S15。賽事序列
 * 的月份不排養成回合，所以 `inEvent` 這條路現在走不到——但規則的出處已經在
 * `stamina.js`，S15 接上去時不必重新解讀規格書。
 * 第 4 步的事件判定在 S17 落地（`engine/eventTrigger.js`，V4 §12.1）——每月固定
 * 觸發 1 張、30% 觸發第二張。
 */
import { clamp } from '../core/rng.js';
import { ATTR_NAMES } from '../data/attributes.js';
import { EVENT_CARDS } from '../data/events.js';
import { LEAGUES } from '../data/leagues.js';
import {
  MATCH_MONTH_COST, bandOf, consume, noteMonth, staminaOf,
} from '../engine/stamina.js';
import { resolveTraining, trainingMenu } from '../engine/training.js';
import { formatStatLine, simulateSeason } from '../engine/season.js';
import { currentLeagueKey } from '../engine/roster.js';
import { eventTrigger } from '../engine/eventTrigger.js';
import { card, drawEvent, drawRoleplay } from './shared.js';

export const kind = 'MONTH';

/**
 * 扮演卡的**年度預算**，除以當年的養成回合數就是每個月的機率。
 *
 * 事件卡不走這條——V4 §12.1 是「每回合固定觸發 1 張，有機率觸發 2 張」，由
 * `engine/eventTrigger.js` 的四步演算法決定（條件優先、時段過濾、互斥），S17 接入
 * 後每月必出一張事件卡，第二張 30%。
 *
 * 扮演卡仍寫成年度預算而不是月機率，是因為養成回合數會隨賽段數浮動：業餘期一年
 * 一段（9 個養成回合），職業兩段（7 個），2025 起三段。固定月機率會讓業餘年平白
 * 多出一倍的扮演卡（S14 實測踩過，見檔頭註解）。
 */
const ROLEPLAY_PER_YEAR = { PRO: 0.45, OTHER: 0.25 };

/** 年度預算 → 這個月的機率（百分比） */
const monthlyChance = (perYear, devMonths) => clamp((perYear / Math.max(1, devMonths)) * 100, 0, 100);

export function* run(g, phase) {
  const { state, rng } = g;

  // 復健年：整年沒有訓練決策，只有復健。月份照樣推進——體力不動的年份會讓下一年的
  // 節奏對不上（S13 交接筆記點名的缺口，這一站補上）
  if (state.skipSeason) {
    resolveTraining(state, rng, 'rehab');
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
    options: trainingMenu(state),
  };

  /* ---- 3：結算行動（設施制訓練，V4 §5） ---- */
  yield* trainingResult(g, resolveTraining(state, rng, picked));

  // 國際賽與事件卡發下來的能力點在這裡花掉。舊版為此在年曆上排了三次 `ALLOC` 階段，
  // 月回合之後不必了——下一個養成回合就是最近的出口
  if (state.pendingPoints > 0) {
    const points = state.pendingPoints;
    state.pendingPoints = 0;
    yield { type: 'alloc', mode: 'points', points, title: `能力點分配（${points} 點）` };
  }

  /* ---- 4–5：事件（V4 §12.1，S17） ---- */
  // 每月固定觸發 1 張，30% 觸發第二張（互斥檢查在引擎內）。觸發引擎只選卡，
  // 呈現與結算留在 drawEvent
  const picks = eventTrigger(state, phase, EVENT_CARDS, rng);
  for (const ev of picks) yield* drawEvent(g, ev);
  // 扮演卡不走觸發引擎——它是另一套抽卡邏輯（依權重、不擲骰決定成敗，S20 重整），
  // 密度仍是「年度預算 ÷ 養成回合數」
  const devMonths = phase.devMonths || 8;
  const perYear = state.stage === 'PRO' ? ROLEPLAY_PER_YEAR.PRO : ROLEPLAY_PER_YEAR.OTHER;
  if (rng.chance(monthlyChance(perYear, devMonths))) {
    yield* drawRoleplay(g, state.stage === 'PRO' && rng.chance(50) ? 'coach' : 'daily');
  }

  /* ---- 6：本月常規賽 ---- */
  yield* regularSeason(g, phase);

  /* ---- 7：推進 ---- */
  // 自然恢復由主迴圈統一做（每個月都有，包括賽事月），這裡只記帳
  noteMonth(state, { rested: picked === 'rest' });
}

/* ================= 訓練結果敘事 ================= */

const TIER_LABEL = { great_success: '大成功', success: '成功', failure: '失敗', great_failure: '大失敗' };
const TIER_TONE = { great_success: 'good', success: '', failure: 'bad', great_failure: 'bad' };

/** 傷勢敘事（跟 `seasonEnd.js` 同一個語彙，避免兩處寫法漂開） */
function injuryText(injury) {
  if (!injury || injury.kind === 'none') return '';
  if (injury.kind === 'severe') return '手術 · 整季報銷';
  return `缺席約 ${injury.weeks} 週`;
}

/**
 * 把一次訓練活動的結算結果組成一張卡（§4 第 3 步）。
 *
 * 休息／復健沒有成敗，不印卡——它們的結果就是面板上的體力與受傷風險數字，
 * 再開一張「你休息了」的卡只會洗掉敘事流（跟 §4 第 1 步不另開狀態卡同一個理由）。
 * 訓練與英雄池練習才印：檔位、屬性成長、新英雄、心理箭頭、受傷。
 */
function* trainingResult(g, result) {
  const { activity, kind, tier, gains, heroes, mentalNotes, injury, buff, attrNotes, card: tcard } = result;
  if (kind === 'rest' || kind === 'rehab') return;

  const notes = [];
  for (const gain of gains) {
    notes.push(`${ATTR_NAMES[gain.attr]} <span class="up">+${gain.points}</span>`);
  }
  for (const gain of attrNotes) {
    const cls = gain.points > 0 ? 'up' : 'dn';
    notes.push(`${ATTR_NAMES[gain.attr]} <span class="${cls}">${gain.points > 0 ? '+' : ''}${gain.points}</span>`);
  }
  if (heroes.length) notes.push(`新英雄 <b class="hl">${heroes.join('、')}</b> 進入池`);
  notes.push(...mentalNotes);
  const inj = injuryText(injury);
  if (inj) notes.push(`<span class="dn">${inj}</span>`);
  if (buff) notes.push(`<span class="up">${buff.label}</span>（${buff.months} 個月）`);

  const body = `<span class="muted">${TIER_LABEL[tier]}</span>：${tcard.text}`
    + (notes.length ? `<br>（${notes.join('、')}）` : '');
  yield card(TIER_TONE[tier], activity.name, body);
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
