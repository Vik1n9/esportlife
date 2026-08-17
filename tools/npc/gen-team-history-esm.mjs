#!/usr/bin/env node
/**
 * S28 戰隊史 · 遊戲側生成器。
 *
 * 讀 `tools/npc/team_history.json`（S24b／S24c 產物，人工維護的史實單一來源），
 * 產出 `src/data/npc/teamHistory.js`——引擎與 UI 讀戰隊縮寫／賽區時的唯一入口。
 *
 * 為什麼要這層：§23.3 定案「遊戲資料一律 ESM `.js`、`src/data/npc/` 不 import
 * JSON」——`team_history.json` 只能住在 `tools/npc/`（用 readFileSync 吃），
 * 引擎要消費就由生成器轉一份 ESM，不讓任何 `.js` 直接開 JSON import。
 *
 * 用途（S28 消費表）：
 *   - 隊友抽選的**賽區過濾**（§23.6「同賽區池」）——NPC 的 team_id 縮寫對應
 *     哪個賽區，只有這張表知道。
 *   - 戰隊**縮寫顯示**（§23.3「data/regions/* 沒有對應戰隊時直接顯示縮寫」）。
 *
 * 用法：
 *   node gen-team-history-esm.mjs      # 重算並覆寫 src/data/npc/teamHistory.js
 *
 * 重跑冪等：只讀 team_history.json，輸出單一檔案，無人工段可覆寫。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

const src = join(ROOT, 'team_history.json');
const out = join(ROOT, '../../src/data/npc/teamHistory.js');

const { teams } = JSON.parse(readFileSync(src, 'utf8'));
const rows = teams
  .filter((t) => t.team_id && t.region)
  .sort((a, b) => a.team_id.localeCompare(b.team_id))
  .map((t) => `  "${t.team_id}": { name: ${JSON.stringify(t.display_name)}, region: ${JSON.stringify(t.region)} },`);

const header = `/**
 * NPC 戰隊史（S28／S29 消費）——由 \`tools/npc/gen-team-history-esm.mjs\` 產出，勿手改。
 * 來源：Liquipedia（主源，CC BY-SA 3.0）、Leaguepedia（備援，CC BY-SA 3.0）。
 * 與 \`tools/npc/team_history.json\` 同源（S24b／S24c 產物）；隊友抽選的賽區過濾與
 * 戰隊縮寫顯示讀這裡。
 */
`;

const body = `export const TEAM_HISTORY = {
${rows.join('\n')}
};

/**
 * 戰隊縮寫 → 賽區。§23.6「同賽區池」的過濾依據。
 *
 * 台港澳段 region 是生涯主力賽區（GPL／LMS／PCS／LCP，§23.3 去除國籍只留賽區）；
 * 國際段是 Liquipedia 賽區代碼（LCK／LPL／LEC／LCS…）。查不到（team_id 為 null
 * 或無對應）回 null——隊友抽選把它當「不在任何賽區」排除。
 */
export function teamRegionOf(teamId) {
  return TEAM_HISTORY[teamId]?.region ?? null;
}

/**
 * 戰隊縮寫的顯示名。§23.3「data/regions/* 沒有對應戰隊時直接顯示縮寫」——
 * team_id 縮寫的隊名由這張表導出（單一來源），查不到就原樣回傳縮寫。
 */
export function teamDisplayName(teamId) {
  const t = TEAM_HISTORY[teamId];
  return t ? \`\${teamId}（\${t.name}）\` : teamId;
}
`;

writeFileSync(out, header + body, 'utf8');
console.log(`寫入 ${out}：${rows.length} 隊（team_id 且有 region）`);
