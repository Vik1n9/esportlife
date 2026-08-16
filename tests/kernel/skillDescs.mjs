/**
 * 技能說明覆蓋（面板下拉用，v4.6.5）。
 *
 * `SKILL_DESC` 要與 `SKILL_WEIGHTS` 的十二技能一一對應——少了哪一項，玩家點開
 * 技能下拉就是一片空白。來源屬性不另存（面板直接讀權重表的鍵），不在此重複比對。
 */
import { SKILL_DESC, SKILL_WEIGHTS } from '../../src/data/skills.js';

export const name = '技能說明覆蓋（面板下拉）';

export async function run({ check }) {
  const keys = Object.keys(SKILL_WEIGHTS);

  check('十二技能每一項都有說明文字',
    keys.every((k) => SKILL_DESC[k] && SKILL_DESC[k].length > 0),
    `缺：${keys.filter((k) => !SKILL_DESC[k]).join('、')}`);
  check('說明表沒有權重表以外的技能',
    Object.keys(SKILL_DESC).every((k) => SKILL_WEIGHTS[k]));
}
