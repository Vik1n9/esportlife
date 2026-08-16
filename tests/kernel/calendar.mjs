/**
 * 月序年曆（V4 §3.3）。
 *
 * 這個 suite 守的是「一年的形狀」：12 個月不多不少、賽事序列的月份不排養成回合、
 * 一年的常規賽權重加總仍然是 1。S14 把 order 空間從賽段序換成月序，這三件事只要有
 * 一件破了，症狀都不是當場報錯——而是某個賽區某一年少打半個賽季，或多出一批比賽。
 *
 * ⚠ 月份是**算出來的**，不是照 §3.3 那張表抄的：那張表畫的是兩賽段賽區的樣子，而
 * 賽區各年的賽段數是 1~3。所以這裡逐賽區逐年掃，驗的是規則而不是某一年的答案。
 */
import { MONTHS_PER_YEAR, SPLIT_WINDOW, STAGE_KINDS, WORLDS_WINDOW, calendarFor, monthLayout, nextStageIn } from '../../src/engine/calendar.js';
import { splitsOf } from '../../src/data/regions/index.js';
import { LEAGUE_OF_REGION } from '../../src/data/regions/index.js';
import { msiRuleOf } from '../../src/data/formats/msi.js';

export const name = '月序年曆與賽段月份';

const REGIONS = ['HOME', 'KR', 'CN', 'EU', 'NA'];

export async function run({ check, log }) {
  let years = 0;
  const devCount = {};

  for (const region of REGIONS) {
    const league = LEAGUE_OF_REGION[region];
    for (let year = 2012; year <= 2031; year++) {
      years += 1;
      const tag = `${year} ${region}`;
      const cal = calendarFor({ year }, league);
      const months = cal.filter((p) => p.kind === 'MONTH');
      const playoffs = cal.filter((p) => p.kind === 'PLAYOFF');
      const opens = cal.filter((p) => p.kind === 'SPLIT');
      const splits = splitsOf(year, region);

      /* 一、每個賽段都要有開幕與季後賽，而且開幕在季後賽之前 */
      check('年曆：每個賽段各有一次開幕與一次季後賽',
        opens.length === splits.length && playoffs.length === splits.length,
        `${tag} 開幕 ${opens.length}／季後賽 ${playoffs.length}／賽段 ${splits.length}`);
      for (let i = 0; i < splits.length; i++) {
        check('年曆：賽段的季後賽排在它的開幕之後', opens[i].month <= playoffs[i].month,
          `${tag} 第 ${i + 1} 段 ${opens[i].month} 月開幕、${playoffs[i].month} 月季後賽`);
      }

      /* 二、賽事序列的月份不排養成回合 */
      const devMonths = new Set(months.map((p) => p.month));
      for (const p of playoffs) {
        check('年曆：季後賽的月份沒有養成回合（那個月在打比賽）',
          !devMonths.has(p.month), `${tag} ${p.month} 月`);
      }
      const msi = cal.find((p) => p.kind === 'MSI');
      if (msi) {
        check('年曆：MSI 的月份沒有養成回合', !devMonths.has(msi.month), `${tag} ${msi.month} 月`);
        check('年曆：MSI 排在取資格的賽段季後賽之後',
          msi.month > playoffs[msi.msiAfter - 1].month, `${tag} MSI ${msi.month} 月`);
        check('年曆：MSI 排在最後一個賽段之前（它在賽季中段，不是年末）',
          msi.month < playoffs[playoffs.length - 1].month, `${tag} MSI ${msi.month} 月`);
      }
      for (let m = WORLDS_WINDOW[0]; m <= WORLDS_WINDOW[1]; m++) {
        check('年曆：世界賽期間沒有養成回合（§3.3 的 10–11 月）', !devMonths.has(m), `${tag} ${m} 月`);
      }

      /* 三、12 個月每個月都有安排，而且沒有月份跑出界 */
      const covered = new Set([...devMonths, ...cal.map((p) => p.month)]);
      check('年曆：12 個月每個月都排得到東西', covered.size === MONTHS_PER_YEAR, `${tag} 只有 ${covered.size} 個月`);
      check('年曆：沒有月份跑出 1–12',
        cal.every((p) => p.month >= 1 && p.month <= MONTHS_PER_YEAR), tag);
      check('年曆：賽段只佔 2–9 月（1 月與 12 月是休賽期）',
        opens.every((p) => p.month >= SPLIT_WINDOW[0]) && playoffs.every((p) => p.month <= SPLIT_WINDOW[1]), tag);

      /* 四、全年的常規賽比重仍然是 1——月回合把比賽攤開，不是多打或少打 */
      const weight = months.reduce((t, p) => t + (p.matchWeight || 0), 0);
      check('年曆：全年常規賽比重加總為 1（攤成月份不會多打或少打）',
        Math.abs(weight - 1) < 1e-9, `${tag} 加總 ${weight.toFixed(6)}`);
      check('年曆：每個賽段至少有一個常規賽月',
        monthLayout(year, region).spans.every((s) => s.regular.length >= 1), tag);

      /* 五、養成回合的張數要跟事件預算的分母一致 */
      check('年曆：每個養成回合都知道當年有幾個養成回合（事件密度的分母）',
        months.every((p) => p.devMonths === months.length), `${tag} devMonths=${months[0]?.devMonths}／實際 ${months.length}`);
      devCount[months.length] = (devCount[months.length] || 0) + 1;

      /* 六、order 要照月份遞增，同一個月裡名單先於養成回合 */
      const sorted = cal.every((p, i) => i === 0 || cal[i - 1].order <= p.order);
      check('年曆：輸出依 order 遞增', sorted, tag);
      for (const open of opens) {
        const same = cal.filter((p) => p.month === open.month);
        check('年曆：同一個月裡先發名單排在養成回合之前',
          same[0].kind === 'SPLIT', `${tag} ${open.month} 月的第一檔是 ${same[0].kind}`);
      }
    }
  }

  /* 七、nextStageIn：狀態帶的「距下階段倒數」讀這裡（§22.1 標題列倒數） */
  for (const region of REGIONS) {
    const league = LEAGUE_OF_REGION[region];
    for (let year = 2012; year <= 2031; year++) {
      const tag = `${year} ${region}`;
      const cal = calendarFor({ year }, league);
      const stages = cal.filter((p) => STAGE_KINDS.has(p.kind));

      for (let month = 1; month <= MONTHS_PER_YEAR; month++) {
        const r = nextStageIn({ year, month, league });
        const due = stages.find((p) => p.month >= month);
        if (!due) {
          check('nextStageIn：當年已無下一階段時回 null（12 月必為 null）',
            r === null, `${tag} ${month} 月 回了 ${JSON.stringify(r)}`);
        } else {
          check('nextStageIn：回的是年曆上最近的一個階段',
            r && r.kind === due.kind && r.month === due.month,
            `${tag} ${month} 月 期 ${due.kind}@${due.month} 得 ${JSON.stringify(r)}`);
          check('nextStageIn：monthsAway 就是月份差',
            r && r.monthsAway === due.month - month, `${tag} ${month} 月 差 ${due.month - month}`);
        }
      }

      /* 季後賽當月：倒數歸零（S38 完成定義第 5 項） */
      const layout = monthLayout(year, region);
      for (const span of layout.spans) {
        const r = nextStageIn({ year, month: span.playoff, league });
        check('nextStageIn：季後賽當月回 PLAYOFF 且倒數為 0',
          r && r.kind === 'PLAYOFF' && r.month === span.playoff && r.monthsAway === 0,
          `${tag} ${span.playoff} 月 ${JSON.stringify(r)}`);
      }

      /* MSI 年與非 MSI 年（monthLayout 的 msiMonth 分支）：
         MSI 年，春季季後賽隔月就是 MSI；非 MSI 年同一位置直接看到夏季季後賽 */
      const hasMsi = !!msiRuleOf(year) && layout.msiMonth != null;
      if (!hasMsi) continue;
      const spring = layout.spans[layout.msiAfter - 1];
      check('nextStageIn：MSI 年，春季季後賽隔月的下一階段是 MSI',
        nextStageIn({ year, month: spring.playoff + 1, league })?.kind === 'MSI', tag);
      check('nextStageIn：MSI 年，MSI 當月倒數為 0',
        nextStageIn({ year, month: layout.msiMonth, league })?.monthsAway === 0, tag);
      const afterMsi = nextStageIn({ year, month: layout.msiMonth + 1, league });
      check('nextStageIn：MSI 年，MSI 隔月的下一階段是下一段開幕',
        afterMsi?.kind === 'SPLIT' && afterMsi.month > layout.msiMonth, tag);
    }
  }
  const noMsi2020 = monthLayout(2020, 'HOME');
  const spring2020 = noMsi2020.spans[0];
  const r2020 = nextStageIn({ year: 2020, month: spring2020.playoff + 1, league: LEAGUE_OF_REGION.HOME });
  check('nextStageIn：非 MSI 年（2020 停辦），春季季後賽隔月直接是夏季開幕（MSI 年同位置會是 MSI）',
    r2020?.kind === 'SPLIT', `2020 HOME ${JSON.stringify(r2020)}`);

  log(`月序年曆：掃過 ${years} 個賽區年，養成回合數分布 ${
    Object.entries(devCount).sort().map(([n, c]) => `${n} 個×${c}`).join('、')}`);
}
