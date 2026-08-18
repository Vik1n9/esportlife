/**
 * 聯賽百分位查詢層（§24.3.2／§24.4.3，S34）。
 *
 * 守四件事：百分位語意（母體內 ≤ 玩家者的比例，玩家本人計入母體）、母體 < 20
 * 判 null（樣本不足不勉強切分）、`percentileBand` 五檔詞條的邊界、`intlPercentile`
 * 讀的是 `intl` 段而不是 `splits`（兩個池物理分開，不能互相讀到對方的資料）。
 */
import { createState } from '../../src/engine/state.js';
import { PLAYER_STAT_ID } from '../../src/engine/leagueSim.js';
import {
  LEAGUE_PCT_METRICS, intlPercentile, leaguePercentile, percentileBand, splitPercentile,
} from '../../src/kernel/leagueStats.js';

export const name = '聯賽百分位查詢層（S34）';

const fresh = (extra = {}) => Object.assign(
  createState({ name: 'C', role: 'MID', seed: 'league-stats' }), extra,
);

/** 一組同位置母體：n 個 NPC 都比玩家弱，玩家穩居頂端 */
function poolOf(n, playerRow) {
  const stats = { [PLAYER_STAT_ID]: playerRow };
  for (let i = 0; i < n; i++) {
    stats[`npc-${i}`] = { role: playerRow.role, G: 10, K: 5, D: 20, A: 5, DPM: 1000, CSM: 40, VSPM: 5 };
  }
  return stats;
}

export async function run({ check, log }) {
  const playerRow = { role: 'MID', G: 10, K: 40, D: 10, A: 60, DPM: 5000, CSM: 80, VSPM: 15 };

  /* ---------------- 指標白名單 ---------------- */
  check('指標白名單只有四項（KDA／DPM／CSM／VSPM，24.3.2 定案）',
    LEAGUE_PCT_METRICS.length === 4 && ['kda', 'dpm', 'csm', 'vspm'].every((m) => LEAGUE_PCT_METRICS.includes(m)));

  /* ---------------- splitPercentile：語意與門檻 ---------------- */
  {
    const s = fresh();
    s.leaguePool = { [s.year]: { splits: { S1: { standings: [], stats: poolOf(19, playerRow) } }, intl: { stats: {} } } };
    check('母體 20 人（含玩家）、KDA 全場最高 → 百分位 100', splitPercentile(s, 'kda', 'S1') === 100);

    // 母體不足 20：19 個 NPC + 玩家 = 20 剛好過線，18 個則不足
    const thin = fresh();
    thin.leaguePool = { [thin.year]: { splits: { S1: { standings: [], stats: poolOf(18, playerRow) } }, intl: { stats: {} } } };
    check('母體 < 20（含玩家 19 人）→ null（樣本不足不勉強切分）', splitPercentile(thin, 'kda', 'S1') === null);

    check('查無賽段 key → null', splitPercentile(s, 'kda', null) === null);
    check('查無玩家本人資料 → null', splitPercentile(fresh(), 'kda', 'S1') === null);

    // 玩家墊底時百分位應該很低（母體內只有玩家自己 ≤ 自己）
    const weakPlayer = { role: 'MID', G: 10, K: 1, D: 30, A: 1, DPM: 100, CSM: 10, VSPM: 1 };
    const s2 = fresh();
    s2.leaguePool = { [s2.year]: { splits: { S1: { standings: [], stats: poolOf(19, weakPlayer) } }, intl: { stats: {} } } };
    const lowPct = splitPercentile(s2, 'kda', 'S1');
    check('KDA 墊底時百分位很低（只有自己 ≤ 自己）', lowPct !== null && lowPct <= 10, String(lowPct));
  }

  /* ---------------- leaguePercentile：從 state.month 反推當下賽段 ---------------- */
  {
    const s = fresh();
    s.month = 3;   // HOME 聯賽 S1 賽段月份（見 conditions.mjs 同款寫法）
    s.leaguePool = { [s.year]: { splits: { S1: { standings: [], stats: poolOf(19, playerRow) } }, intl: { stats: {} } } };
    check('leaguePercentile 從 state.month 反推賽段，結果與 splitPercentile 一致',
      leaguePercentile(s, 'kda') === splitPercentile(s, 'kda', 'S1'));

    const sOff = fresh();
    sOff.month = 1;   // 不在任何賽段內的月份
    sOff.leaguePool = s.leaguePool;
    check('不在賽段內的月份 → null', leaguePercentile(sOff, 'kda') === null);
  }

  /* ---------------- intlPercentile：讀 intl 段，與 splits 物理隔離 ---------------- */
  {
    const s = fresh();
    s.leaguePool = {
      [s.year]: {
        splits: { S1: { standings: [], stats: poolOf(19, { role: 'MID', G: 5, K: 1, D: 20, A: 1, DPM: 100, CSM: 10, VSPM: 1 }) } },
        intl: { stats: poolOf(19, playerRow) },
      },
    };
    check('intlPercentile 讀 intl 段，KDA 全場最高 → 100', intlPercentile(s, 'kda') === 100);
    check('intlPercentile 不讀 splits 段（兩池物理隔離，split 內玩家很弱不影響 intl 結果）',
      intlPercentile(s, 'kda') !== splitPercentile(s, 'kda', 'S1'));
  }

  /* ---------------- percentileBand：五檔詞條邊界 ---------------- */
  {
    check('百分位 null → band null（樣本不足時不顯示級距）', percentileBand(null) === null);
    check('百分位 100 → 宰制', percentileBand(100) === '宰制');
    check('百分位 80 → 宰制（含下界）', percentileBand(80) === '宰制');
    check('百分位 79.9 → 優異', percentileBand(79.9) === '優異');
    check('百分位 60 → 優異（含下界）', percentileBand(60) === '優異');
    check('百分位 40 → 中規（含下界）', percentileBand(40) === '中規');
    check('百分位 20 → 平庸（含下界）', percentileBand(20) === '平庸');
    check('百分位 0 → 劣位', percentileBand(0) === '劣位');
  }

  log(`splitPercentile／leaguePercentile／intlPercentile／percentileBand 全數驗過`);
}
