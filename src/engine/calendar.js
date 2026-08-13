/**
 * 年曆展開：年份 ＋ 賽區 → 排好序的**月份**清單。
 *
 * 這個檔只做查表與展開，**不含任何史實判斷**——「哪一年有 MSI」「2020 停辦」
 * 「2025 多了 First Stand」全部住在 `data/formats/calendar.js`。所以新增或搬動一個
 * 賽事不會改到這裡。
 *
 * ── S14：粒度從賽段換成月 ──
 *
 * 舊版一年展開成「1~3 個賽段 ＋ 幾個年末階段」，機制對，粒度不對：V4 §3.2 的回合單位
 * 是月，一個賽段要攤成好幾個養成回合，玩家才有「這個月練什麼、要不要休」的決策。
 *
 * 展開之後每一列都帶 `month`，`order = month × 10 + slot`。兩類月份：
 *
 *   **養成回合**（`MONTH`）：玩家選一個行動；當月若有常規賽，比賽結果也在這裡出
 *   **賽事序列**：季後賽／MSI／世界賽自己佔一個月，那個月不排養成回合
 *
 * ⚠ **賽區差異要保住。** §3.3 那張表是「兩賽段賽區」的樣子，不能寫死：賽區各年的
 * 賽段數是 1~3（`splitsOf`），MSI 接在第幾段之後也因區而異（`msiSplitOf`）。所以
 * 月份是**由賽段數算出來的**——賽段多，每段就短，年份的形狀自己會跑對。
 */
import { EVENTS, SLOT } from '../data/formats/calendar.js';
import { msiRuleOf } from '../data/formats/msi.js';
import { LEAGUES } from '../data/leagues.js';
import { msiSplitOf, splitsOf } from '../data/regions/index.js';

/** 一年 12 個月（V4 §3.3）。休賽期也是月份，只是沒有比賽 */
export const MONTHS_PER_YEAR = 12;

/**
 * 賽段能用的月份區間（閉區間）與世界賽的窗口。
 *
 * 1 月與 12 月是休賽期的養成回合，10–11 月是世界賽期間（§3.3）——沒打進世界賽的人
 * 那兩個月也不排養成回合：賽季已經結束了，全世界都在看那個舞台。這幾個常數就是
 * §3.3 那張表的骨架，但**只有骨架**：2–9 月怎麼切給賽段是算出來的，不是列出來的。
 */
export const SPLIT_WINDOW = [2, 9];
export const WORLDS_WINDOW = [10, 11];

/**
 * 一年的月份佈局。
 *
 * 賽段依序吃掉 2–9 月；每個賽段的**最後一個月是季後賽**，前面的月份是常規賽的養成
 * 回合。MSI 若當年有辦，額外佔掉它那個賽段之後的一個月（所以賽段可用的月份少一個）。
 *
 * 餘數月份給後面的賽段：夏季賽本來就比春季賽長，而且 §3.3 的兩賽段例子正是
 * 「春季 2 個常規月、夏季 3 個」。
 *
 * @returns {{spans:{split:object, index:number, months:number[], playoff:number, regular:number[]}[],
 *            msiMonth:number|null, msiAfter:number|null, splitCount:number}}
 */
export function monthLayout(year, region) {
  const splits = splitsOf(year, region);
  const msiAfter = msiRuleOf(year) ? msiSplitOf(year, region) : null;
  const [from, to] = SPLIT_WINDOW;
  const usable = (to - from + 1) - (msiAfter ? 1 : 0);

  const size = Math.floor(usable / splits.length);
  const extra = usable % splits.length;

  const spans = [];
  let msiMonth = null;
  let m = from;
  splits.forEach((split, i) => {
    const n = Math.max(1, size + (i >= splits.length - extra ? 1 : 0));
    const months = [];
    for (let k = 0; k < n && m <= to; k++) months.push(m++);
    // 賽段只剩一個月時，那個月同時是常規賽與季後賽——現行資料最多三賽段，走不到這裡，
    // 但少了這一行，賽段數再多一級就會出現「有季後賽卻沒打過常規賽」的年份
    const regular = months.length > 1 ? months.slice(0, -1) : months.slice();
    spans.push({ split, index: i, months, playoff: months[months.length - 1], regular });
    if (msiAfter === i + 1 && m <= to) msiMonth = m++;
  });

  return { spans, msiMonth, msiAfter, splitCount: splits.length };
}

/**
 * 這個月屬於哪個賽段、要打多少比重的常規賽。
 *
 * 賽段的場次權重平均攤給它的常規賽月份——賽段變長不是多打比賽，是同一批比賽攤得比較
 * 開（`data/regions/index.js` 的 `weight` 已經是「佔全年的比例」）。
 */
function matchContext(month, spans) {
  for (const span of spans) {
    if (!span.regular.includes(month)) continue;
    return {
      split: span.split,
      splitIndex: span.index,
      matchWeight: span.split.weight / span.regular.length,
    };
  }
  return { split: null, splitIndex: -1, matchWeight: 0 };
}

/**
 * 展開某一年的階段清單。
 *
 * @param {object} state
 * @param {string} leagueKey 當年所屬聯賽
 * @returns {{kind:string, month:number, order:number, [k:string]:any}[]} 依 order 遞增
 */
export function calendarFor(state, leagueKey) {
  const year = state.year;
  const region = LEAGUES[leagueKey]?.region;
  const { spans, msiMonth, msiAfter, splitCount } = monthLayout(year, region);

  // 賽事序列的月份不排養成回合——那個月玩家在打比賽，不在練
  const eventMonths = new Set(spans.map((s) => s.playoff));
  for (let m = WORLDS_WINDOW[0]; m <= WORLDS_WINDOW[1]; m++) eventMonths.add(m);
  if (msiMonth) eventMonths.add(msiMonth);

  // 這一年有幾個養成回合。事件與扮演卡的密度是**年度預算**除以它——賽段數不同的
  // 年份養成回合數也不同（業餘期一段、2025 起三段），密度若寫成固定的月機率，
  // 同一份預算會隨賽段數浮動（業餘年會多出一倍的事件卡）
  let devMonths = 0;
  for (let m = 1; m <= MONTHS_PER_YEAR; m++) if (!eventMonths.has(m)) devMonths += 1;

  const out = [];
  const push = (ev, month, slot, extra) => out.push({
    ...ev, month, order: month * 10 + slot, splitCount, devMonths, ...extra,
  });

  for (const ev of EVENTS) {
    if (year < ev.from || year > ev.to) continue;
    if (ev.skip?.includes(year)) continue;

    if (ev.at === 'EVERY_MONTH') {
      for (let month = 1; month <= MONTHS_PER_YEAR; month++) {
        if (eventMonths.has(month)) continue;
        push(ev, month, SLOT.MONTH, matchContext(month, spans));
      }
      continue;
    }

    if (ev.at === 'SPLIT_OPEN' || ev.at === 'SPLIT_CLOSE') {
      const open = ev.at === 'SPLIT_OPEN';
      for (const span of spans) {
        push(ev, open ? span.months[0] : span.playoff, open ? SLOT.SPLIT_OPEN : SLOT.PLAYOFF,
          { split: span.split, splitIndex: span.index, weight: span.split.weight });
      }
      continue;
    }

    if (ev.at === 'MSI_SLOT') {
      if (!msiMonth) continue;
      push(ev, msiMonth, SLOT.MSI, { msiAfter });
      continue;
    }

    push(ev, ev.month, ev.slot);
  }

  return out.sort((a, b) => a.order - b.order);
}
