/**
 * 技能說明與關係派生（面板下拉用，v4.6.5）。
 *
 * 守的是單一來源規則：`SKILL_DESC` 要覆蓋十二技能，`SKILL_LINKS` 的三組關係
 * 必須與 `SKILL_WEIGHTS`／`OVR_WEIGHTS` 逐字一致——斷言重算源表，不手抄預期值。
 */
import { ATTRS } from '../../src/data/attributes.js';
import {
  OVR_WEIGHTS, ROLE_SKILLS, ROLES, SKILL_DESC, SKILL_LINKS, SKILL_WEIGHTS,
} from '../../src/data/skills.js';

export const name = '技能說明與關係派生（面板下拉）';

export async function run({ check }) {
  const keys = Object.keys(SKILL_WEIGHTS);

  check('十二技能每一項都有說明文字',
    keys.every((k) => SKILL_DESC[k] && SKILL_DESC[k].length > 0),
    `缺：${keys.filter((k) => !SKILL_DESC[k]).join('、')}`);
  check('說明表沒有權重表以外的技能',
    Object.keys(SKILL_DESC).every((k) => SKILL_WEIGHTS[k]));

  for (const k of keys) {
    const link = SKILL_LINKS[k];
    check(`${k}：attrs 就是權重表的屬性鍵`,
      Object.keys(SKILL_WEIGHTS[k]).join() === link.attrs.join(),
      `${Object.keys(SKILL_WEIGHTS[k])} vs ${link.attrs}`);
    check(`${k}：attrs 都是合法的屬性鍵`,
      link.attrs.every((a) => ATTRS.includes(a)), `${link.attrs}`);

    const related = keys.filter((o) => o !== k
      && Object.keys(SKILL_WEIGHTS[k]).filter((a) => SKILL_WEIGHTS[o][a]).length >= 2);
    check(`${k}：related（共用 ≥2 屬性）與源表一致`,
      related.join() === link.related.join(),
      `${related} vs ${link.related}`);

    const roles = ROLES.filter((r) => k in OVR_WEIGHTS[r]);
    check(`${k}：roles 與 OVR_WEIGHTS 一致`,
      roles.join() === link.roles.join(), `${roles} vs ${link.roles}`);

    const cores = ROLES.filter((r) => ROLE_SKILLS[r].slice(0, 4).includes(k));
    check(`${k}：coreRoles 與 ROLE_SKILLS 前四項一致`,
      cores.join() === link.coreRoles.join(), `${cores} vs ${link.coreRoles}`);
  }

  // related 是對稱關係：A 認得 B，B 就要認得 A
  for (const k of keys) {
    for (const r of SKILL_LINKS[k].related) {
      check(`related 對稱：${k}→${r} 則 ${r}→${k}`,
        SKILL_LINKS[r].related.includes(k));
    }
  }
}
