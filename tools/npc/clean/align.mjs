/**
 * S25 資料清洗 · 實體對齊（選手 ID 與隊名別名）。
 *
 * 兩條對齊線，動機不同：
 *
 * 1. **選手 ID**：Liquipedia 頁題是 `player_id` 主鍵（§23.3 schema 權威）。
 *    Leaguepedia 名冊給的是它自己的頁題（消歧義後綴是本名，如
 *    `Ghost (Jang Yong-jun)`），要反查回 Liquipedia 頁題
 *    （`Ghost (Korean player)`）。對照表來自 S24d 的
 *    `map_intl_lp.tsv`（1021 筆主映射）＋`map_intl_lp_disambig_all.tsv`
 *    （78 筆消歧義解出）＋`unresolved_disambig_lp.tsv`（13 筆未解）。
 *    純查表，零 LLM。
 *
 * 2. **隊名別名**：raw 裡同一隊有四種拼法——隊頁頁題（Liquipedia 顯示名）、
 *    TeamCard `team=`（顯示名）、TeamPrizePool `{{Opponent|縮寫}}`、
 *    TeamRoster／TournamentResults `team=`（Leaguepedia 縮寫）。全部要對到
 *    `team_history.json` 的 `team_id`（單一來源）。解析順序：規則
 *    （team_id／display_name 不分大小寫）→ 字典（team_alias.json）→
 *    殘餘記 pending，交執行者判讀（本環境無 LLM API，判讀即「LLM 語意」的
 *    落地形式，見 llm.mjs 檔頭）。
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NPC = path.join(HERE, '..');

/** 讀 JSON（tools/npc/ 內的中間產物，全部 readFileSync——repo 無 JSON import）。 */
export function readJson(rel) {
  return JSON.parse(readFileSync(path.join(NPC, rel), 'utf8'));
}

/** 讀 TSV（`頁題<TAB>頁題` 兩欄）。 */
export function readTsv(rel) {
  return readFileSync(path.join(NPC, rel), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => l.split('\t'))
    .filter((c) => c.length >= 2);
}

/** 檔頭註記的頁題（raw 檔第一二行）。Liquipedia：`page=…`；Leaguepedia：`titles=…`。
 * 這是權威頁題——crawl 有 redirects=1，重定向已展開，比 slug 反解可靠。 */
export function pageTitleFromHeader(header) {
  const m = header.match(/[?&](?:page|titles)=([^&\s]+)/);
  if (!m) return null;
  return decodeURIComponent(m[1]).replaceAll('_', ' ').trim();
}

/** 建 Leaguepedia 頁題 → Liquipedia 頁題 反查表。
 * 主映射（map_intl_lp.tsv）＋消歧義解出（disambig_all.tsv）合併；
 * 同 Leaguepedia 頁題對到多個 Liquipedia 頁題時記衝突（實測有大小寫漂移，
 * 如 ackerman→Ackerman 兩筆，先到先贏＋衝突清單交人工）。 */
export function buildPlayerMap() {
  const map = new Map();
  const conflicts = [];
  const add = (lp, le) => {
    if (!lp || !le) return;
    if (map.has(le) && map.get(le) !== lp) {
      conflicts.push({ lp, le, existing: map.get(le) });
      return;
    }
    map.set(le, lp);
  };
  for (const [lp, le] of readTsv('map_intl_lp.tsv')) add(lp, le);
  for (const [lp, le] of readTsv('map_intl_lp_disambig_all.tsv')) add(lp, le);
  return { map, conflicts };
}

/** 選手 ID 對齊：Leaguepedia 頁題 → Liquipedia 頁題。查無回傳原值（不猜）。 */
export function toLiquipediaId(leaguepediaTitle, playerMap) {
  return playerMap.get(leaguepediaTitle) ?? leaguepediaTitle;
}

/**
 * 隊名解析器。建構時吃 team_history.json 與 team_alias.json（字典）。
 *
 * 規則層（順序）：
 * 1. team_id 不分大小寫精確（`DK`／`dk` 都中）——Leaguepedia 縮寫、
 *    TeamPrizePool Opponent 縮寫多數走這條
 * 2. display_name 不分大小寫精確（`Longzhu Gaming` → LZ）——TeamCard 走這條
 * 3. 去標點（&／-／空格）後再比 team_id／display_name（`SK Telecom T1` 對
 *    `SKT`？——不，SK Telecom T1 的 display_name 就是它，直接命中）
 * 字典層：team_alias.json 的 `alias → team_id`（LLM／執行者判讀產物）
 */
export class TeamResolver {
  constructor(teamHistory, aliasDict) {
    this.teams = teamHistory.teams;
    this.byId = new Map();
    this.byName = new Map();
    this.byFolded = new Map();
    for (const t of this.teams) {
      this.byId.set(t.team_id.toLowerCase(), t.team_id);
      this.byName.set(t.display_name.toLowerCase(), t.team_id);
      this.byFolded.set(fold(t.display_name), t.team_id);
    }
    this.alias = new Map(Object.entries(aliasDict ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  }

  resolve(name) {
    if (!name) return null;
    const n = name.trim();
    if (!n) return null;
    const low = n.toLowerCase();
    if (this.byId.has(low)) return this.byId.get(low);
    if (this.byName.has(low)) return this.byName.get(low);
    const f = fold(n);
    if (this.byFolded.has(f)) return this.byFolded.get(f);
    if (this.alias.has(low)) return this.alias.get(low);
    if (this.alias.has(f)) return this.alias.get(f);
    return null;
  }

  /** 全部可解析的輸入（供生成器掃殘餘） */
  unresolvedOf(names) {
    return [...new Set(names.map((n) => n?.trim()).filter(Boolean))].filter((n) => !this.resolve(n));
  }
}

/** 折疊：去空白／標點／大小寫，`SK Telecom T1` 與 `SKT1`…（不，這條只處理
 *  空白與標點差異，別名仍要字典兜底）。 */
function fold(s) {
  return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
}