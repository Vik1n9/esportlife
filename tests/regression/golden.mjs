/**
 * 黃金種子快照。
 *
 * 純重構（搬檔案、把散落的判斷收進 modifiers）不該改變任何一段生涯的結果。這個
 * suite 把固定種子跑出來的生涯錄成快照，重構期間必須逐位元一致；一旦有意改動賽制
 * 造成差異，用 `npm run test:golden` 重新 baseline，並在 commit 訊息說明差異來源。
 *
 * 快照存 tests/regression/golden.json。它同時記錄整份 state 的雜湊（最嚴格的檢查）
 * 與一份人看得懂的摘要（讓 diff 讀得出來哪裡變了）。
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { careerTier, careerScore } from '../../src/engine/career.js';
import { TIER_NAMES } from '../../src/data/events.js';

export const name = '黃金種子快照';
export const order = 3;

const SNAPSHOT = join(dirname(fileURLToPath(import.meta.url)), 'golden.json');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

/** 一段生涯的可比對摘要。欄位都選「改了就該被看見」的。 */
function digest({ seed, role, style, state }) {
  return {
    id: `${seed}/${role}/${style}`,
    hash: createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0, 16),
    year: state.year,
    age: state.age,
    tier: TIER_NAMES[careerTier(state)],
    score: careerScore(state),
    proYears: state.proYears,
    peakOvr: state.peakOvr,
    salary: state.salary,
    honors: state.honors.length,
    worlds: state.worldsWins,
    msi: state.msiWins,
    splits: state.splitTitles,
  };
}

export async function run({ check, log, shared }) {
  if (!shared.runs) {
    check('黃金種子需要冒煙測試先產生樣本', false, 'shared.runs 不存在——是不是單獨跑了這個 suite？');
    return;
  }
  const current = shared.runs.map(digest).sort((a, b) => a.id.localeCompare(b.id));

  let baseline = null;
  try {
    baseline = JSON.parse(await readFile(SNAPSHOT, 'utf8'));
  } catch { /* 還沒有快照 */ }

  if (UPDATE || !baseline) {
    await writeFile(SNAPSHOT, `${JSON.stringify(current, null, 2)}\n`);
    log(baseline ? `已更新快照（${current.length} 段生涯）` : `已建立快照（${current.length} 段生涯）`);
    if (!UPDATE) log('注意：這是新建的基準，本次沒有比對到任何東西');
    return;
  }

  check('生涯樣本數一致', baseline.length === current.length, `基準 ${baseline.length} vs 現在 ${current.length}`);

  const byId = new Map(baseline.map((b) => [b.id, b]));
  const drifted = [];
  for (const now of current) {
    const was = byId.get(now.id);
    if (!was) { drifted.push(`${now.id}：基準沒有這一段`); continue; }
    if (was.hash === now.hash) continue;
    // 雜湊不同才逐欄位比對，把差異印成人看得懂的樣子
    const fields = Object.keys(now).filter((k) => k !== 'id' && k !== 'hash' && was[k] !== now[k]);
    drifted.push(fields.length
      ? `${now.id}：${fields.map((f) => `${f} ${was[f]}→${now[f]}`).join('、')}`
      : `${now.id}：摘要相同但 state 內容有變（${was.hash}→${now.hash}）`);
  }

  check('所有生涯與基準完全一致', drifted.length === 0,
    drifted.length ? `${drifted.length} 段偏移：\n      ${drifted.slice(0, 10).join('\n      ')}${drifted.length > 10 ? `\n      …另外 ${drifted.length - 10} 段` : ''}` : '');

  if (!drifted.length) log(`${current.length} 段生涯與基準一致`);
}
