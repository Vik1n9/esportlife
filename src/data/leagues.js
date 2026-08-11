/**
 * 聯賽階梯。
 *
 * 業餘與青訓是「層級」而不是賽區，直接寫在這裡；有賽區的層級則由
 * `data/regions/*` 推導出來，所以新增一個賽區不必回頭改這個檔。
 *
 * - `par` 為該聯賽先發平均 OVR；`min` 為簽約門檻；`games` 為單季場次上限
 * - `bucket` 是生涯數據分區的鍵
 * - `baseSalary` 單位為「萬台幣」，會再乘上時代係數與合約係數
 */
import { REGIONS } from './regions/index.js';

const TIERS = {
  AMATEUR: { name: '網咖盃賽', par: 34, min: 30, games: 36, bucket: 'AMATEUR', tier: 0, baseSalary: 0 },
  AM2: { name: '青訓次級', par: 44, min: 41, games: 48, bucket: 'AM2', tier: 1, baseSalary: 60 },
};

export const LEAGUES = {
  ...TIERS,
  ...Object.fromEntries(Object.values(REGIONS).map((r) => [r.league, {
    name: r.name,
    par: r.par,
    min: r.min,
    games: r.games,
    bucket: r.bucket,
    tier: r.tier,
    baseSalary: r.baseSalary,
    region: r.key,
  }])),
};

/** 海外頂級賽區的聯賽鍵（母區以外的所有賽區） */
export const OVERSEAS_LEAGUES = Object.values(REGIONS)
  .filter((r) => r.bucket === 'OVERSEAS')
  .map((r) => r.league);

export const BUCKET_NAMES = { AMATEUR: '業餘', AM2: '青訓', HOME: '主場賽區', OVERSEAS: '海外賽區' };
