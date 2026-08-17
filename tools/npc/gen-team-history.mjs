#!/usr/bin/env node
/**
 * tools/npc/gen-team-history.mjs — team_history.json 台港澳段生成器（零相依）
 *
 * S24b 的隊目錄邏輯：吃分類枚舉清單（crawl.mjs enum-cat 產出）＋ raw_data 隊頁，
 * 解析 {{Infobox team}} 產出 team_history.json 的台港澳段 draft。
 *
 * 解析規則（2026-08-16 實測隊頁後定；2026-08-17 region 改賽區）：
 * - region 依 LEAGUE_REGION 人工表（display_name → 生涯主力賽區）：
 *   GPL（2012–2014）／LMS（2015–2019）／PCS（2020–2024）／LCP（2025–）。
 *   2026-08-17「去除國籍只留賽區」定案後，不再讀 Infobox 的 region／location
 *   兩欄（那是國籍/地區，實測互相矛盾不可信——見 24b 交接筆記）。不在表內的隊
 *   落 null（Taiwan 國家代表隊無聯賽賽區；日韓越澳馬外賽區隊歸 S24c 國際段）。
 * - display_name 用頁題，不用 Infobox name——實測 BUFF 頁的 Infobox name=Afro
 *   Beast（前名），顯示名跟 Infobox 會跟身份（頁題）脫鉤。頁題才是消歧義
 *   穩定主鍵。Infobox name 與頁題不符時警告（更名候選，人工核對）。
 * - created／disbanded 格式不統一：`{{League of Legends}}: 2013-04-15`、
 *   `2012-03-09`、`2021-12-??`。取第一個 YYYY；空／`??` → null。
 * - team_id：Infobox abbreviation= 優先（實測只有 CFO/DFM/SHG/MVK/TSW 有）；
 *   其餘靠縮寫對照表（腳本內 ABBREVIATIONS，人工維護，S27 npc_roster 對齊的
 *   單一來源）。
 * - predecessors／successors 不從 Infobox 來（實測無此欄位）——draft 全空，
 *   由執行者讀 History 段散文人工補（更名比對有疑慮寫交接筆記，不順便修正史實）。
 *
 * 產出：team_history.json（台港澳段，以 --all 模式輸出的 UNCLASSIFIED 人工處理後
 * 覆寫）。重跑冪等——draft 每次從 raw 重算，人工補的欄位要補回 ABBREVIATIONS／
 * RENAMES 兩張表才不會被覆寫。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(ROOT, 'raw_data');

// 縮寫對照表（人工維護；Infobox abbreviation 沒有時的 team_id 來源）
// 2026-08-16 定：用電競圈通用縮寫（TPA/FW/JT/PSG/BYG/MCX…）；Liquipedia
// {{Team|xxx}} 模板名是全小寫 slug 不是縮寫，不適合當 team_id。兩處「abbreviated」
// 散文（DG、MAD）與 Infobox abbreviation（CFO/DFM/SHG/MVK/TSW）已吸收。
const ABBREVIATIONS = {
  'Ahq e-Sports Club': 'ahq',
  'Ahq e-Sports Club Korea': 'ACK',
  'Alpha Esports': 'ALP',
  'BUFF': 'BUFF',
  'Beyond Gaming': 'BYG',
  'Beyond Gaming Academy': 'BYGA',
  'CTBC Flying Oyster Academy': 'CFOA',
  'Deep Cross Gaming': 'DCG',
  'Deep Cross Gaming Academy': 'DCGA',
  'Dewish Team': 'DWT',
  'Dragon Gate Team': 'DG',
  'F-Soul Esports': 'FS',
  'FRANK Esports': 'FRANK',
  'Fireball': 'FB',
  'Fish Dive Team': 'FDT',
  'Flash Wolves': 'FW',
  'G-Rex': 'GRX',
  'G-Rex Infinite': 'GRXI',
  'Gamania Bears': 'GB',
  'Ground Zero Gaming': 'GZ',
  'Ground Zero Gaming Academy': 'GZA',
  'HELL PIGS': 'HP',
  'Hong Kong Attitude': 'HKA',
  'HungKuang Falcon': 'HKF',
  'Hurricane Gaming': 'HG',
  'J Team': 'JT',
  'MAD Team': 'MAD',
  'Machi Esports': 'MCX',
  'MachiX': 'MX',
  'Meta Falcon Team': 'MFT',
  'Midnight Sun Esports': 'MSE',
  'Nate.A': 'NT',
  'Nate9527': 'N27',
  'PSG Talon': 'PSG',
  'PSG Talon Academy': 'PSGA',
  'Raise Gaming': 'RG',
  'SEM9': 'SEM9',
  'SEM9 WPE': 'SWPE',
  'SillySilly Gaming': 'SS',
  'Taipei Assassins': 'TPA',
  'Taipei Bravo': 'TPB',
  'Taipei Snipers': 'TPS',
  'Taiwan': 'TWN',
  'Team Afro': 'TA',
  'Wangting': 'WT',
  'Wayi Spider': 'WS',
  'GAM Esports': 'GAM',
  'Secret Whales': 'TSW',
};

// 更名／繼承關係（人工維護；History 段散文的結論，鍵＝現名頁題）
// 2026-08-16 定：只記「兩端都在清單內」的線性繼承（前隊解散／更名 → 席位或
// 法人給後隊），來源全部是隊頁散文明示。無獨立頁題的前身（yoe IRONMEN、
// 17 Academy、Talon Esports、Afro Beast）不列陣列，交接筆記註記。
const RENAMES = {
  'Raise Gaming': { predecessors: [], successors: ['GRX'] },
  'G-Rex': { predecessors: ['RG'], successors: ['MCX'] },
  'Machi Esports': { predecessors: ['GRX'], successors: [] },
  'Alpha Esports': { predecessors: [], successors: ['HG'] },
  'Hurricane Gaming': { predecessors: ['ALP'], successors: ['DWT'] },
  'Dewish Team': { predecessors: ['HG'], successors: [] },
  'Meta Falcon Team': { predecessors: [], successors: ['HP'] },
  'HELL PIGS': { predecessors: ['MFT'], successors: [] },
  'Ahq e-Sports Club': { predecessors: [], successors: ['BYG'] },
  'Beyond Gaming': { predecessors: ['ahq'], successors: [] },
};

// 台港澳段賽區對照表（人工維護的單一來源；2026-08-17「去除國籍只留賽區」定案）。
// 值＝生涯主力賽區（該隊生涯主要時期所在聯賽，非最後賽區），跨代取主力年代：
//   GPL 2012–2014／LMS 2015–2019／PCS 2020–2024／LCP 2025–。
// 判定基準（2026-08-17 使用者拍板）：主力年代佔比；GPL→LMS 交界隊以 LMS 為主
// （TPA 等 2015 起主聯賽）；純 GPL 隊（TPS／GB，生涯止於 LMS 前後）與早期
// TeSL/GPL 身分隊（Wayi Spider）留 GPL。⚠ Taiwan（國家代表隊）無聯賽賽區，
// 不入本表（region=null，移出台港澳段）。不在表內的隊一律 null（外賽區隊歸
// S24c 國際段裁決）。
const LEAGUE_REGION = {
  'Ahq e-Sports Club': 'LMS',
  'Alpha Esports': 'LMS',
  'BUFF': 'LMS',
  'Beyond Gaming': 'PCS',
  'Beyond Gaming Academy': 'PCS',
  'CTBC Flying Oyster': 'PCS',
  'CTBC Flying Oyster Academy': 'PCS',
  'Deep Cross Gaming': 'PCS',
  'Deep Cross Gaming Academy': 'PCS',
  'Dewish Team': 'PCS',
  'Dragon Gate Team': 'LMS',
  'F-Soul Esports': 'LMS',
  'FRANK Esports': 'PCS',
  'Fireball': 'LMS',
  'Fish Dive Team': 'LMS',
  'Flash Wolves': 'LMS',
  'G-Rex': 'LMS',
  'G-Rex Infinite': 'LMS',
  'Gamania Bears': 'GPL',
  'HELL PIGS': 'PCS',
  'Hong Kong Attitude': 'LMS',
  'HungKuang Falcon': 'LMS',
  'Hurricane Gaming': 'PCS',
  'J Team': 'LMS',
  'MAD Team': 'LMS',
  'Machi Esports': 'LMS',
  'MachiX': 'LMS',
  'Meta Falcon Team': 'PCS',
  'Midnight Sun Esports': 'LMS',
  'Nate.A': 'PCS',
  'Nate9527': 'PCS',
  'PSG Talon': 'PCS',
  'PSG Talon Academy': 'PCS',
  'Raise Gaming': 'LMS',
  'SillySilly Gaming': 'PCS',
  'Taipei Assassins': 'LMS',
  'Taipei Bravo': 'PCS',
  'Taipei Snipers': 'GPL',
  'Team Afro': 'LMS',
  'Wangting': 'PCS',
  'Wayi Spider': 'GPL',
};

function parseInfobox(wikitext) {
  const m = wikitext.match(/\{\{Infobox team\n([\s\S]*?)\n\}\}/);
  if (!m) return null;
  const fields = {};
  for (const line of m[1].split('\n')) {
    const fm = line.match(/^\|([a-z0-9_]+)\s*=\s*(.*)$/i);
    if (fm && !(fm[1] in fields)) fields[fm[1]] = fm[2].trim();
  }
  return fields;
}

function firstYear(value) {
  if (!value) return null;
  const m = value.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

const args = process.argv.slice(2);
// --all：連外賽區隊（region 為 null 的 LCP/PCS 混入隊）一起輸出——S24c 裁決
// 國際段時可參考；預設只產台港澳段。
const allMode = args.includes('--all');

const teamsFile = join(ROOT, 'teams_all.txt');
const teams = readFileSync(teamsFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);

const slugify = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const entries = [];
const unclassified = [];
for (const title of teams) {
  const file = join(RAW_DIR, `${slugify(title)}.wiki`);
  if (!existsSync(file)) {
    console.error(`警告: ${title} 無 raw（先跑 crawl.mjs crawl teams_all.txt）`);
    continue;
  }
  const wiki = readFileSync(file, 'utf8');
  const box = parseInfobox(wiki);
  if (!box) {
    console.error(`警告: ${title} 無 {{Infobox team}} 段落`);
    continue;
  }
  const region = LEAGUE_REGION[title] ?? null;
  const entry = {
    team_id: box.abbreviation ?? ABBREVIATIONS[title] ?? null,
    display_name: title,
    region,
    active_years: [firstYear(box.created), firstYear(box.disbanded)],
    predecessors: RENAMES[title]?.predecessors ?? [],
    successors: RENAMES[title]?.successors ?? [],
  };
  if (box.name && box.name !== title) {
    console.error(`更名候選: ${title}（Infobox name=${box.name}）`);
  }
  if (!region) {
    unclassified.push({ title, entry });
    console.error(`UNCLASSIFIED: ${title}（不在 LEAGUE_REGION 表）`);
  }
  entries.push(entry);
}

const out = {
  generated: new Date().toISOString().slice(0, 10),
  region: '台港澳段（S24b，region 為生涯主力賽區：GPL/LMS/PCS/LCP）',
  // 外賽區隊（LCP/PCS 分類混入的日韓越澳馬隊）不入本段——S24c 國際段決定去留。
  // 偵測到的外隊：ACK/DFM/SHG/GAM/GZ/GZA/MVK/SEM9/SEM9 WPE/TSW（不在表內，被過濾）。
  teams: allMode ? entries : entries.filter((e) => e.region),
};
writeFileSync(join(ROOT, 'team_history.json'), JSON.stringify(out, null, 2) + '\n');
console.error(`已寫出 team_history.json：${entries.length} 隊（台港澳 ${entries.length - unclassified.length}、待分類 ${unclassified.length}）`);
console.error(`待分類隊：${unclassified.map((u) => u.title).join('、') || '無'}`);
console.error(`缺 team_id（Infobox 無 abbreviation 且不在對照表）：${entries.filter((e) => !e.team_id).map((e) => e.display_name).join('、') || '無'}`);