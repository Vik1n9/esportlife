/** 聯賽階梯的基本不變式：每個分區都有中文名、起點是無薪的網咖盃賽。 */
import { LEAGUES, BUCKET_NAMES } from '../../src/data/leagues.js';

export const name = '聯賽階梯與分區名稱';

export async function run({ check }) {
  const buckets = [...new Set(Object.values(LEAGUES).map((l) => l.bucket))];
  for (const b of buckets) check(`分區 ${b} 有對應名稱`, !!BUCKET_NAMES[b], `BUCKET_NAMES 缺 ${b}`);
  check('起點分區為 AMATEUR（網咖盃賽）', LEAGUES.AMATEUR?.name === '網咖盃賽', LEAGUES.AMATEUR?.name);
  check('起點無薪', LEAGUES.AMATEUR?.baseSalary === 0);
}
