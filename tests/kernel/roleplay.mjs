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

export async function run({ check }) {
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
   * ⚠ 這一條是 S12 交接給 S19a／S20 的內容缺口，寫成檢查是為了讓它別被忘掉。
   *
   * S12 只做機械對映（§9.4 的 nerve→comp、chem→trust、ego→conf、rep 刪除），所以
   * 18 張卡碰得到的只有 comp／conf／trust／fame 四個。`disc`／`drive`／`resl` 三維
   * 目前只有出生的 ±10 天賦差——玩家沒有任何辦法改變它們。這不是壞掉，是內容還沒
   * 寫；S20 重新對映扮演卡、S19a 補特質副作用時要把這三維接進來。
   */
  const missing = MENTAL_KEYS.filter((k) => !touched.has(k));
  check('已知缺口：扮演卡碰不到 disc／drive／resl（S19a／S20 要補）',
    missing.join(',') === 'drive,disc,resl',
    missing.length ? `目前碰不到：${missing.join('／')}` : '三維都接上了——請更新這條檢查');
}
