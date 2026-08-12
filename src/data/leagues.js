/**
 * 聯賽階梯。
 *
 * 業餘與青訓是「層級」而不是賽區，直接寫在這裡；有賽區的層級則由
 * `data/regions/*` 的 `ladder` 屬性展開，所以新增一個賽區不必回頭改這個檔。
 *
 * - `par` 為該聯賽先發平均 OVR（0–100 刻度）；`min` 為簽約門檻，固定比 par 低 4；
 *   `games` 為單季場次上限
 *
 * ⚠ `par`／`min` 是 V4 §17.2 的權威值（舊 1–80 刻度 ×1.25）。**`games` 與
 * `baseSalary` 不跟著縮放**：一年打幾場是賽制事實、底薪的單位是錢，兩者跟屬性刻度
 * 沒有關係。等比草案曾經把 36/48/60/66/70 也乘成 45/60/75/82/88，那是類別錯誤。
 * - `bucket` 是生涯數據分區的鍵
 * - `baseSalary` 單位為「萬台幣」，會再乘上時代係數與合約係數
 */
import { REGIONS } from './regions/index.js';

const TIERS = {
  AMATEUR: { name: '網咖盃賽', par: 43, min: 38, games: 36, bucket: 'AMATEUR', tier: 0, baseSalary: 0 },
  AM2: { name: '青訓次級', par: 55, min: 51, games: 48, bucket: 'AM2', tier: 1, baseSalary: 60 },
};

export const LEAGUES = {
  ...TIERS,
  // 賽區層級：整包展開各賽區的 ladder 屬性，再加上顯示名與賽區鍵
  ...Object.fromEntries(Object.values(REGIONS).map((r) => [r.league, {
    name: r.name,
    ...r.ladder,
    region: r.key,
  }])),
};

/** 海外頂級賽區的聯賽鍵（母區以外的所有賽區） */
export const OVERSEAS_LEAGUES = Object.values(REGIONS)
  .filter((r) => r.ladder.bucket === 'OVERSEAS')
  .map((r) => r.league);

export const BUCKET_NAMES = { AMATEUR: '業餘', AM2: '青訓', HOME: '主場賽區', OVERSEAS: '海外賽區' };
