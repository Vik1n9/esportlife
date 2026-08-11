/**
 * 扮演卡只動心理值，不碰能力值。
 *
 * 這條界線是設計上的：能力值靠訓練，人格靠扮演。一旦扮演卡開始給能力點，
 * 玩家就會把它當成第二套加點系統來最佳化。
 */
import { ROLEPLAY_CARDS } from '../../src/data/roleplay.js';
import { MENTAL_KEYS } from '../../src/data/mental.js';

export const name = '扮演卡與心理維度的界線';

export async function run({ check }) {
  const allowed = new Set(MENTAL_KEYS);
  for (const c of ROLEPLAY_CARDS) {
    check(`${c.name} 有 2 個以上選項`, c.options.length >= 2);
    for (const o of c.options) {
      check(`${c.name}／${o.id} 不含 ability 欄位`, !o.ability);
      const keys = Object.keys(o.mental || {});
      check(`${c.name}／${o.id} 只寫心理維度`, keys.length > 0 && keys.every((k) => allowed.has(k)), keys.join(','));
    }
    check(`${c.name} 三種語氣齊備`, new Set(c.options.map((o) => o.tone)).size === c.options.length);
  }
}
