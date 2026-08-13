/**
 * 賽段開幕：先發名單。
 *
 * LoL 的一年不是一次結算。依當年該賽區的真實賽制跑 1～3 個賽段，每段各自有例行賽、
 * 季後賽與冠軍點數。賽段變多的是決策點與事件，不是比賽場數——場次是切開來分的。
 *
 * ── S14：一個賽段從「一個階段」變成「一段月份」 ──
 *
 * 舊版這個檔一次做完「例行賽 → 休息室 → 季後賽 → 事件卡」，整個賽段是年曆上的一列。
 * 月回合制之後賽段攤在月份上：**開幕（這個檔）→ 常規賽的養成回合（`month.js`）→
 * 季後賽（`playoff.js`）**。
 *
 * 留在這裡的只有「這一段你打不打得到」——它必須在第一場比賽之前定案，而且整段共用
 * 同一個答案（名單一公布就是一整段的事，不是每個月重抽）。所以它住在賽段的開幕，
 * 結果放在執行脈絡 `g.lineup` 裡給那幾個月讀。
 */
import { lineupFor } from '../engine/lineup.js';
import { applyMental } from '../engine/mental.js';
import { card } from './shared.js';

export const kind = 'SPLIT';

export function* run(g, phase) {
  const { state, rng } = g;
  g.monthStats = [];
  if (state.skipSeason) { g.lineup = { status: 'injured', share: 0, missedWeeks: 0 }; return; }

  const { split } = phase;
  // 先決定這一段你打不打得到——LoL 少打只有兩個原因：被下放，或傷勢缺席
  const lineup = lineupFor(state, rng);
  g.lineup = lineup;
  state.returningFromInjury = lineup.missedWeeks > 0;
  state.benchedStreak = lineup.status === 'benched' ? (state.benchedStreak || 0) + 1 : 0;

  yield* lineupBeats(g, split, lineup);
}

/**
 * 出賽狀態的敘事。
 *
 * 坐板凳不是「數字變小」，是你的位子被別人拿走了——所以它要有一張自己的卡，
 * 而且會扣知名度：不出賽的人，鏡頭就不會在你身上。
 */
function* lineupBeats(g, split, lineup) {
  const { state } = g;
  if (state.stage !== 'PRO') return;

  if (lineup.status === 'benched') {
    const streak = state.benchedStreak || 1;
    applyMental(state, { fame: -8, trust: -4, comp: -3 });
    yield card('bad', `${split.name} · 板凳`,
      `名單公布，先發位置<b class="dn">沒有你</b>。整個賽段你坐在台下看替補打你的位子。` +
      (streak >= 2
        ? '<br><b class="dn">連續兩個賽段沒上場——再這樣下去，這裡不會有你的位子。</b>'
        : '<br><span class="muted">教練說再看看狀況。</span>'));
    return;
  }

  if (lineup.missedWeeks > 0) {
    applyMental(state, { fame: -3 });
    yield card('bad', `${split.name} · 傷勢缺席`,
      `手腕的狀況讓你缺席了<b class="dn">約 ${lineup.missedWeeks} 週</b>，替補頂上。` +
      `<br><span class="muted">回來之後，位子還在不在是另一回事。</span>`);
    return;
  }

  if (lineup.status === 'rotation') {
    yield card('', `${split.name} · 輪替`,
      `教練開始輪替你的位置，出賽時間被分掉一半。<br><span class="muted">每一場都是試鏡。</span>`);
  }
}
