/**
 * Beat runner：把引擎 generator 吐出的 beat 翻譯成畫面。
 *
 * 引擎不知道 DOM 存在，這個檔案不知道遊戲規則存在——兩邊只靠 beat 協定溝通。
 */
import { careerFlow } from '../engine/game.js';
import { renderAttrBar } from './attrbar.js';
import { renderBoard } from './board.js';
import { askAllocation, askChoice, clearActions } from './actions.js';
import { renderCard, renderDivider } from './log.js';
import { refreshPanel } from './panel.js';
import { clearSave, saveGame } from './storage.js';
import { renderSummary } from './summary.js';
import { byId } from './dom.js';

export async function runCareer({ state, rng, seed, appVersion }) {
  const g = { state, rng };
  const flow = careerFlow(g);
  let month = state.month || 1;
  let input;

  const sync = () => { renderBoard(state, month); renderAttrBar(state); refreshPanel(); };

  for (;;) {
    const { value: beat, done } = flow.next(input);
    input = undefined;
    if (done) break;

    switch (beat.type) {
      case 'card':
        renderCard(beat);
        break;
      case 'divider':
        renderDivider(beat.text);
        break;
      case 'month':
        month = beat.month;
        break;
      case 'checkpoint':
        saveGame(state, rng);
        break;
      case 'choice':
        input = await askChoice(beat);
        break;
      case 'alloc':
        await askAllocation(state, beat, sync);
        break;
      case 'summary':
        clearActions();
        renderSummary({ state, rng, tier: beat.tier, seed, appVersion });
        break;
      case 'end':
        clearSave();
        byId('act-toggle').style.display = 'none';
        break;
      default:
        break;
    }
    sync();
  }
}
