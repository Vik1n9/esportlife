/**
 * MSI 的史實與身分。
 *
 * 這一組斷言存在的理由：MSI 原本被寫成「國家隊徵召」——可以婉拒、資格看個人 OVR、
 * 打完累積傷病風險。那是棒球 WBC 的模型。MSI 是俱樂部賽事，門票發給戰隊。
 */
import { calendarFor } from '../../src/engine/calendar.js';
import { msiRuleOf } from '../../src/data/formats/msi.js';
import { msiSplitOf, splitsOf } from '../../src/data/regions/index.js';

export const name = 'MSI 史實與俱樂部身分';

const slotOf = (year, league) => calendarFor({ year }, league).find((p) => p.kind === 'MSI');

export async function run({ check }) {
  /* ---- 存在與否 ---- */
  check('2014 年沒有 MSI（2015 才創辦）', msiRuleOf(2014) === null);
  check('2015 年起有 MSI', msiRuleOf(2015) !== null);
  check('2020 年沒有 MSI（COVID-19 停辦）', msiRuleOf(2020) === null);
  check('2021 年恢復', msiRuleOf(2021) !== null);
  for (const y of [2014, 2020]) {
    check(`${y} 年的年曆不該出現 MSI`, !slotOf(y, 'LCK'), y);
  }
  for (const y of [2016, 2019, 2023, 2025]) {
    check(`${y} 年的年曆要有 MSI`, !!slotOf(y, 'LCK'), y);
  }

  /* ---- 參賽資格：發給戰隊，不是發給選手 ---- */
  check('2022 年只有賽段冠軍去得了', JSON.stringify(msiRuleOf(2022).accepts) === JSON.stringify(['champion']));
  check('2023 年起亞軍也去得了（主流賽區出兩隊）',
    msiRuleOf(2023).accepts.includes('final') && msiRuleOf(2023).majorSlots === 2);
  check('2022 年主流賽區只出一隊', msiRuleOf(2022).majorSlots === 1);

  /* ---- 賽制隨時代 ---- */
  check('2022 年是小組賽＋淘汰賽', msiRuleOf(2022).format === 'GROUP_KO');
  check('2023 年起改雙敗淘汰', msiRuleOf(2023).format === 'DOUBLE_ELIM');

  /* ---- 時序：MSI 在賽季中段，不在年末 ---- */
  for (const [year, league] of [[2016, 'HOME'], [2019, 'LCK'], [2023, 'LEC'], [2025, 'HOME']]) {
    const cal = calendarFor({ year }, league);
    const msi = cal.find((p) => p.kind === 'MSI');
    const splits = cal.filter((p) => p.kind === 'SPLIT');
    const last = splits[splits.length - 1];
    check(`${year} ${league}：MSI 在最後一個賽段之前（不是年末）`, msi.order < last.order,
      `MSI@${msi.order} vs 末段@${last.order}`);
    check(`${year} ${league}：MSI 在取資格的賽段之後`, msi.order > splits[msi.msiAfter - 1].order);
    check(`${year} ${league}：MSI 在世界賽之前`, msi.order < cal.find((p) => p.kind === 'WORLDS').order);
  }

  /* ---- 接在哪一段之後是賽區屬性，不是全球規則 ---- */
  {
    // 2023 年 LEC 有三賽段，MSI 仍接在春季賽（第二段）之後；同年 LCK 只有兩段，接在第一段之後。
    // 寫成全球的「第 n 賽段」會讓 LEC 抓到冬季賽冠軍去打 MSI
    const lecSplits = splitsOf(2023, 'EU').map((s) => s.name);
    const lckSplits = splitsOf(2023, 'KR').map((s) => s.name);
    check('2023 LEC 是三賽段', lecSplits.length === 3, lecSplits.join('/'));
    check('2023 LCK 是兩賽段', lckSplits.length === 2, lckSplits.join('/'));
    check('2023 LEC 的 MSI 接在春季賽之後（不是冬季賽）',
      lecSplits[msiSplitOf(2023, 'EU') - 1] === '春季賽', lecSplits[msiSplitOf(2023, 'EU') - 1]);
    check('2023 LCK 的 MSI 接在春季賽之後',
      lckSplits[msiSplitOf(2023, 'KR') - 1] === '春季賽', lckSplits[msiSplitOf(2023, 'KR') - 1]);
  }
  {
    // 2025 賽季重編：三賽段，MSI 移到第二段之後
    const names = splitsOf(2025, 'HOME').map((s) => s.name);
    check('2025 主場賽區的 MSI 接在第一賽段之後（開季盃不算）',
      names[msiSplitOf(2025, 'HOME') - 1] === '第一賽段', names[msiSplitOf(2025, 'HOME') - 1]);
  }

  /* ---- 每個有 MSI 的年份，取資格的賽段都必須真的存在 ---- */
  for (const region of ['HOME', 'KR', 'CN', 'EU', 'NA']) {
    for (let year = 2015; year <= 2030; year++) {
      if (!msiRuleOf(year)) continue;
      const after = msiSplitOf(year, region);
      const n = splitsOf(year, region).length;
      check(`${year} ${region}：MSI 取資格的賽段在範圍內`, after >= 1 && after <= n, `after=${after} n=${n}`);
    }
  }
}
