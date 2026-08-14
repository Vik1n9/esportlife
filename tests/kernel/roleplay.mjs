/**
 * 扮演卡只動心理值，不碰能力值。
 *
 * 這條界線是設計上的：能力值靠訓練，人格靠扮演。一旦扮演卡開始給能力點，
 * 玩家就會把它當成第二套加點系統來最佳化。
 */
import { ROLEPLAY_CARDS } from '../../src/data/roleplay.js';
import { MENTAL_KEYS } from '../../src/data/mental.js';
import { FAME_KEY } from '../../src/data/reputation.js';

export const name = '扮演卡與心理維度的界線';

export async function run({ check, log }) {
  // 六維 ＋ 聲量。V4 §9.4 把聲量拆成獨立一層，但扮演卡是同時動這兩層的唯一入口，
  // 所以它的 `mental` 欄位仍然收兩者——分家發生在 `applyMental` 的路由，不在資料層
  const allowed = new Set([...MENTAL_KEYS, FAME_KEY]);
  // 舊維度必須是真的消失，不是「還在資料裡但沒人讀」
  const retired = new Set(['nerve', 'chem', 'ego', 'rep']);
  const touched = new Set();

  for (const c of ROLEPLAY_CARDS) {
    check(`${c.name} 有 2 個以上選項`, c.options.length >= 2);
    for (const o of c.options) {
      check(`${c.name}／${o.id} 不含 ability 欄位`, !o.ability);
      const keys = Object.keys(o.mental || {});
      check(`${c.name}／${o.id} 只寫心理維度或聲量`,
        keys.length > 0 && keys.every((k) => allowed.has(k)), keys.join(','));
      check(`${c.name}／${o.id} 沒有殘留的舊維度`, !keys.some((k) => retired.has(k)), keys.join(','));
      for (const k of keys) touched.add(k);
    }
    check(`${c.name} 三種語氣齊備`, new Set(c.options.map((o) => o.tone)).size === c.options.length);
  }

  /*
   * S20 之後從「已知缺口」變成覆蓋檢查：disc（照流程／放縱）、drive（投入／倦怠）、
   * resl（輸後反彈／消極）各自由對應的行為選項接上，六維全數碰得到。任何一維從所有
   * 扮演卡消失，代表有人把對映做回去了。
   */
  const missing = MENTAL_KEYS.filter((k) => !touched.has(k));
  check('六維都被扮演卡碰得到', missing.length === 0,
    missing.length ? `碰不到：${missing.join('／')}` : '六維齊全');
  const counts = MENTAL_KEYS.map((k) => {
    const n = ROLEPLAY_CARDS.filter((c) => c.options.some((o) => o.mental?.[k])).length;
    return `${k}=${n}`;
  });
  log(`每維被幾張卡動到：${counts.join(' ')}`);
}
