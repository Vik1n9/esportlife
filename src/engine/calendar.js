/**
 * 年曆展開：年份 ＋ 賽區 → 排好序的階段清單。
 *
 * 這個檔只做查表與展開，**不含任何史實判斷**——「哪一年有 MSI」「2020 停辦」
 * 「2025 多了 First Stand」全部住在 `data/formats/calendar.js`。所以新增或搬動一個
 * 賽事不會改到這裡。
 */
import { EVENTS } from '../data/formats/calendar.js';
import { msiRuleOf } from '../data/formats/msi.js';
import { LEAGUES } from '../data/leagues.js';
import { msiSplitOf, splitsOf } from '../data/regions/index.js';

/** 賽段 k（1 起算）在年曆上的位置。插在第 n 賽段之後的賽事取 10n+5。 */
export const splitOrder = (k) => k * 10;

/**
 * 展開某一年的階段清單。
 *
 * @param {object} state
 * @param {string} leagueKey 當年所屬聯賽
 * @returns {{kind:string, order:number, [k:string]:any}[]} 依 order 遞增
 */
export function calendarFor(state, leagueKey) {
  const year = state.year;
  const region = LEAGUES[leagueKey]?.region;
  const splits = splitsOf(year, region);

  const out = [];
  for (const ev of EVENTS) {
    if (year < ev.from || year > ev.to) continue;
    if (ev.skip?.includes(year)) continue;

    if (ev.order === 'PER_SPLIT') {
      splits.forEach((split, i) => {
        out.push({ ...ev, order: splitOrder(i + 1), split, splitCount: splits.length });
      });
      continue;
    }

    // MSI 插在它取資格的那個賽段之後。10n+5 保證落在賽段 n（10n）與 n+1（10n+10）之間。
    // 是「第幾段」由賽區決定，不是全球規則——見 data/regions/index.js 的 msiSplitOf
    if (ev.order === 'MSI_SLOT' || ev.order === 'MSI_SLOT_AFTER') {
      const after = msiRuleOf(year) && msiSplitOf(year, region);
      if (!after) continue;
      const base = splitOrder(after) + 5;
      out.push({ ...ev, order: ev.order === 'MSI_SLOT' ? base : base + 1, msiAfter: after, splitCount: splits.length });
      continue;
    }

    out.push({ ...ev, splitCount: splits.length });
  }

  return out.sort((a, b) => a.order - b.order);
}
