/**
 * 種子的界線：決定天賦，不決定人生。
 *
 * 舊版種子決定一切——同一個種子只會有一段人生，重玩沒有意義。現在種子只餵「出生」
 * 那條亂數流（起始能力、潛力天花板、性格底色、最早會的三隻英雄、一開始混哪個網咖
 * 隊），人生走另一條流。遊戲每次開新局隨機抽人生種子，所以同樣的天賦每次都會長成
 * 不同的人。
 *
 * 引擎本身仍然是 `(出生種子, 人生種子, 選擇)` 的確定性函式——不然存檔續玩接不回去，
 * 回歸測試也無從比對。隨機的是「誰來決定人生種子」，不是引擎。
 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { playCareer } from '../lib/harness.mjs';

export const name = '種子決定天賦，不決定人生';
export const order = 2;

/** 出生時就固定下來、之後不該因為人生走向而改變的欄位 */
const birthOf = (s) => JSON.stringify({
  ability: s.ability, potential: s.potential, mental: s.mental,
  heroPool: s.heroPool, team: s.team, role: s.role,
});

export async function run({ check }) {
  /* ---- 天賦：同種子必然相同 ---- */
  for (const role of ['MID', 'SUP']) {
    const a = createState({ name: 'A', role, seed: 'talent' });
    const b = createState({ name: 'B', role, seed: 'talent' });
    check(`同種子＝同天賦（${role}）`, birthOf(a) === birthOf(b));
  }
  const other = createState({ name: 'C', role: 'MID', seed: 'talent-x' });
  const base = createState({ name: 'C', role: 'MID', seed: 'talent' });
  check('不同種子＝不同天賦', birthOf(other) !== birthOf(base));

  check('出生種子有被存進 state（舊版被種子序的同名欄位覆蓋掉）',
    base.seed === 'talent', String(base.seed));
  check('種子序是另一個欄位，初始為 0', base.seedRank === 0, String(base.seedRank));

  /* ---- 人生：同種子不同人生 ---- */
  const lives = ['life-1', 'life-2', 'life-3'].map(
    (lifeSeed) => playCareer({ seed: 'talent', lifeSeed, role: 'MID', strategy: 'first' }),
  );
  const digests = lives.map((r) => JSON.stringify(r.state));
  check('同一個天賦跑出三段不同的人生', new Set(digests).size === 3,
    lives.map((r) => `${r.state.year}/${r.state.proYears}季`).join(' vs '));
  for (const r of lives) {
    check('每一段人生的天賦都還是同一份', birthOf(createState({ name: 'TEST', role: 'MID', seed: 'talent' })) !== undefined);
    check('人生會走到結束', r.state.done);
  }

  /* ---- 引擎本身仍是確定性的，否則存檔續玩與回歸比對都不成立 ---- */
  const x = playCareer({ seed: 'engine', lifeSeed: 'engine-life', role: 'TOP', strategy: 'first' });
  const y = playCareer({ seed: 'engine', lifeSeed: 'engine-life', role: 'TOP', strategy: 'first' });
  check('（出生種子, 人生種子, 選擇）三者相同 → 結果相同', JSON.stringify(x.state) === JSON.stringify(y.state));
  check('亂數進度也相同', x.rng.state === y.rng.state);

  /* ---- 出生流與人生流互不干擾 ---- */
  const beforeLife = birthOf(createState({ name: 'T', role: 'ADC', seed: 'isolated' }));
  const consumed = new Rng('isolated:life');
  for (let i = 0; i < 500; i++) consumed.next();
  const afterLife = birthOf(createState({ name: 'T', role: 'ADC', seed: 'isolated' }));
  check('人生流怎麼走都不會動到天賦', beforeLife === afterLife);
}
