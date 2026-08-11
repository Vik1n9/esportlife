/** 年度薪資結算。 */
import { annualSalary, formatMoney } from '../engine/market.js';
import { currentLeagueKey } from '../engine/roster.js';
import { card } from './shared.js';

export const kind = 'SALARY';

export function* run(g) {
  const { state } = g;
  if (state.stage === 'AMATEUR' || !state.contract) return;

  const pay = annualSalary(state, currentLeagueKey(state), state.contract.mult);
  const extra = state.bonusSalary;
  state.bonusSalary = 0;
  state.salary += pay + extra;
  const remain = Math.max(0, state.contract.years - 1);

  yield card('', '年度結算',
    `本年度薪資：<b class="hl">${formatMoney(pay)}</b>${extra ? `　業外 <b class="hl">${formatMoney(extra)}</b>` : ''}` +
    `　生涯累計 <b class="hl">${formatMoney(state.salary)}</b>　合約剩 ${remain} 年`);
}
