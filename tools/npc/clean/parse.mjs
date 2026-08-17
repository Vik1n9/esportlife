/**
 * S25 資料清洗 · wikitext 解析器（純規則，零 LLM）。
 *
 * 為什麼有這個檔：raw_data 是整頁 Wikitext，兩種來源（Liquipedia／Leaguepedia）
 * 模板名與欄位大小寫都不一致（`Infobox player` vs `Infobox Player`、
 * `{{TeamCard}}` vs `{{TeamRoster}}`）。本站不把解析邏輯散在 gen-clean.mjs 裡，
 * 而是收在一個模組，S27（參數生成）若需要重解析同一批 raw 可以直接吃。
 *
 * 解析一律行級＋巢狀模板配對，不引入 wikitext 語法引擎（零相依硬約束）。
 * 頁題一律由呼叫端從 raw 檔頭 URL 解出（重定向已展開，見 gen-clean.mjs），
 * 本模組只吃文字內容。
 */

/** 位置別名 → 遊戲位置枚舉。Liquipedia 用全名（top/jungle/mid/ad/sup），
 *  Leaguepedia 賽段頁用短碼（t/j/m/a/s，c=教練）。兩張都收。 */
export const POS_MAP = {
  top: 'TOP',
  jg: 'JGL', jng: 'JGL', jungle: 'JGL', jungler: 'JGL',
  mid: 'MID', middle: 'MID',
  ad: 'ADC', adc: 'ADC', bot: 'ADC', bottom: 'ADC', 'ad carry': 'ADC', bottomlaner: 'ADC',
  sup: 'SUP', support: 'SUP',
  t: 'TOP', j: 'JGL', m: 'MID', a: 'ADC', s: 'SUP',
};

/**
 * 巢狀模板配對：從 start（指向 `{{`）找出與之配對的整個 `{{…}}` 區塊。
 * 舊版踩過的坑：Template 值內含另一層模板（TeamPrizePool 的 Slot 裡有 Opponent、
 * TeamCard 的 placementicon），深度不追就會把內層 `}}` 當成結尾。
 */
export function matchTemplate(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text.startsWith('{{', i)) { depth++; i += 1; }
    else if (text.startsWith('}}', i)) {
      depth--;
      if (depth === 0) return text.slice(start, i + 2);
      i += 1;
    }
  }
  return null;
}

/**
 * 把模板區塊內的參數拆成物件。吃整塊（含 `{{`／`}}` 外殼），字元級掃描：
 *
 * - 追蹤 `{{`／`}}` 與 `[[`／`]]` 深度，**深度 0 的 `|` 才是參數分隔符**——
 *   這樣 `{{Slot|place=1|{{Opponent|g2}}}}` 的內層參數不會被誤切，
 *   `[[LCK/Summer/2017|LCK Summer]]` 的 `|` 不會被誤切，而一行多參數
 *   （`|p3=Blank|pos3=Jungle |p3wins=1`，Liquipedia TeamCard 實測格式）
 *   全部拆得開。
 * - 第一段是模板名（無 `=`），自動忽略。
 * - 值內含模板的（qualifier、placementicon）原樣保留，呼叫端自行解讀。
 *
 * ⚠ 舊版是「一行一個參數」的逐行解析，TeamCard 的同行多參數
 * （`|p6=Wolf |p6link=…|pos6=Support`）會把整行糊進 value，p6link／pos6
 * 全部漏掉——S25 首跑實測抓到（「A Wolf |p5flag=kr |pos5=sup」混進
 * player_id），已整段重寫。
 */
export function parseParams(block) {
  const inner = block.slice(2, block.length - 2);
  const segs = [];
  let depth = 0, bracket = 0, segStart = -1;
  for (let i = 0; i < inner.length; i++) {
    if (inner.startsWith('{{', i)) { depth++; i += 1; continue; }
    if (inner.startsWith('}}', i)) { depth--; i += 1; continue; }
    if (inner.startsWith('[[', i)) { bracket++; i += 1; continue; }
    if (inner.startsWith(']]', i)) { bracket--; i += 1; continue; }
    if (inner[i] === '|' && depth === 0 && bracket === 0) {
      segs.push(inner.slice(segStart + 1, i));
      segStart = i;
    }
  }
  if (segStart >= 0) segs.push(inner.slice(segStart + 1));

  const params = {};
  for (const seg of segs) {
    const eq = seg.indexOf('=');
    if (eq < 0) continue;
    // Liquipedia 有手誤寫成 `|pos=1=top` 的（GIGABYTE Marines 頁實測），
    // 鍵內含第二個 `=` 時取最後一段才對得上 pos1。
    let key = seg.slice(0, eq).trim();
    if (key.includes('=')) key = key.slice(key.lastIndexOf('=') + 1).trim();
    if (key) params[key] = seg.slice(eq + 1).trim();
  }
  return params;
}

/** 在文字中依序找出所有指定名稱的模板區塊（名稱大小寫不敏感前綴比對）。 */
export function findTemplates(text, names) {
  const out = [];
  const re = /\{\{\s*([A-Za-z0-9 /_:-]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1].trim();
    if (names.some((n) => name.toLowerCase() === n.toLowerCase() || name.toLowerCase().startsWith(n.toLowerCase() + '/'))) {
      const block = matchTemplate(text, m.index);
      if (block) out.push({ name, block, index: m.index });
    }
  }
  return out;
}

/** 解 wikitext 內部連結 `[[A|B]]` 與模板第一參數，回傳「顯示名」。 */
export function stripLink(s) {
  let t = s.trim();
  if (t.startsWith('[[')) {
    const inner = t.slice(2, t.indexOf(']]'));
    const parts = inner.split('|');
    t = parts[parts.length - 1];
  }
  // 去掉 <ref>…</ref> 尾巴（SquadAutoRow 的 leavedate 有帶）
  t = t.replace(/<ref[\s\S]*?<\/ref>/g, '').replace(/<ref[^>]*\/>/g, '').trim();
  return t;
}

/** 年分解析：吃 `1997-10-10`、`1997-10-??`、純 `1997`、`April 05, 1997` 等，
 *  回傳整數或 null。缺出生年者由 S27 依 §23.3 填 debut−17。 */
export function parseYear(v) {
  if (!v) return null;
  const m = String(v).match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * 選手頁 Infobox。兩種來源欄位名與大小寫都不同：
 *
 * | 欄位 | Liquipedia（{{Infobox player}}） | Leaguepedia（{{Infobox Player}}） |
 * |---|---|---|
 * | ID | id | id |
 * | 出生 | birth_date=YYYY-MM-DD | birth_date_year/month/day 三欄 |
 * | 國籍 | country | country／residency |
 * | 位置 | roles（可逗號多值） | role |
 * | 退役 | status=Retired／retired=日期 | isretired=Yes |
 *
 * 回傳 { id, birthYear, country, roles[], retired, source }；來源抓不到就回 null
 * （呼叫端判定為隊頁／賽事頁）。
 */
export function parsePlayerInfobox(text) {
  const blocks = findTemplates(text, ['Infobox player', 'Infobox Player']);
  if (!blocks.length) return null;
  const p = parseParams(blocks[0].block);
  const source = blocks[0].name.includes('Player') ? 'leaguepedia' : 'liquipedia';
  let birthYear = null;
  if (source === 'liquipedia') {
    birthYear = parseYear(p.birth_date);
  } else {
    birthYear = parseYear([p.birth_date_year, p.birth_date_month, p.birth_date_day].filter(Boolean).join('-'));
  }
  const roles = String(p.roles ?? p.role ?? '')
    .split(',')
    .map((r) => POS_MAP[r.trim().toLowerCase()])
    .filter(Boolean);
  const retired = source === 'liquipedia'
    ? (p.status === 'Retired' || !!p.retired)
    : (p.isretired === 'Yes');
  return {
    id: p.id,
    birthYear,
    country: p.country || null,
    roles,
    retired,
    source,
  };
}

/**
 * 賽事頁 TeamCard（Liquipedia 格式）：
 * ```
 * {{TeamCard
 * |team=Longzhu Gaming
 * |p1=Khan |pos1=top
 * |p2=Rascal |p2flag=kr |pos2=top
 * |p3=Blank|pos3=Jungle |p3wins=1
 * |p6=Wolf|p6link=Wolf (Korean player)|pos6=Support
 * |qualifier=[[LCK/Summer/2017|LCK Summer]]
 * |placement=1
 * }}
 * ```
 * 回傳 { teamName, place, players: [{ id, link, pos }] }。
 * - id 是短 ID，link（若有）是消歧義正式頁題——實體對齊用 link 優先。
 * - ⚠ `placement=` 手寫缺漏不可靠（24a 探勘，2017 TSM 標錯），
 *   名次以 TeamPrizePool 為準，這裡只當備用訊號。
 * - pos 缺省的選手照樣收（SKT 2017 的 p1=Huni 就沒寫 pos1）。
 */
export function parseTeamCard(block) {
  const p = parseParams(block);
  const teamName = p.team;
  const players = [];
  for (let i = 1; i <= 9; i++) {
    const id = p['p' + i];
    if (!id) continue;
    const pos = POS_MAP[String(p['pos' + i] ?? '').trim().toLowerCase()] ?? null;
    players.push({ id: id.trim(), link: p['p' + i + 'link']?.trim() || null, pos });
  }
  return {
    teamName: teamName?.trim(),
    place: p.placement ? p.placement.trim() : null,
    players,
  };
}

/**
 * TeamPrizePool 名次（Liquipedia 格式）。可靠名次來源（24a 探勘定案）：
 * ```
 * {{TeamPrizePool|cutafter=8
 * |tournament1=World Championship/2017/Playoffs
 * |{{Slot|percentage1=37.5%}}
 * |{{Slot|place=3-4 |percentage1=7% |{{Opponent|g2 |wdl=…}}}}
 * }}
 * ```
 * 回傳 [{ place, team }]，team 是 Opponent 第一參數（縮寫，如 g2／tsm）。
 * 無 place 的 Slot 不收（金額欄位）。早年（2013）連 Opponent 都沒有，該年
 * 名次由 TeamCard placement 兜底。
 */
export function parsePrizePool(text) {
  const out = [];
  const slots = findTemplates(text, ['Slot']);
  for (const s of slots) {
    const p = parseParams(s.block);
    if (!p.place) continue;
    const opps = findTemplates(s.block, ['Opponent']);
    for (const o of opps) {
      const op = parseParams(o.block);
      const first = op[''] ?? firstParam(o.block);
      if (first) out.push({ place: p.place.trim(), team: first });
    }
    if (!opps.length) out.push({ place: p.place.trim(), team: null });
  }
  return out;
}

/** 取模板區塊的第一個匿名參數（`{{Opponent|g2 |wdl=…}}` 的 g2）。
 * 第一段內含 `=`（如 `{{Opponent|place=1|…}}`）＝沒有匿名參數，回 null。 */
function firstParam(block) {
  const inner = block.slice(block.indexOf('{{') + 2);
  const firstPipe = inner.indexOf('|');
  if (firstPipe < 0) return inner.trim() || null;
  const first = inner.slice(firstPipe + 1, inner.indexOf('|', firstPipe + 1)).trim();
  return first.includes('=') ? null : first;
}

/**
 * Leaguepedia 賽段頁：`{{TeamRoster|team=AF}}`＋`{{TeamRoster/Line|player=Kiin|role=t}}`。
 * player 是 Leaguepedia 頁題（消歧義後綴為本名），實體對齊時反查回 Liquipedia 頁題。
 * role c（教練）排除——名冊只收選手。
 */
export function parseTeamRoster(block) {
  const p = parseParams(block);
  const team = p.team;
  const players = [];
  const lines = findTemplates(block, ['TeamRoster/Line']);
  for (const l of lines) {
    const lp = parseParams(l.block);
    const pos = POS_MAP[String(lp.role ?? '').trim().toLowerCase()] ?? null;
    if (!lp.player || lp.role === 'c') continue;
    players.push({ id: lp.player.trim(), link: lp.player.trim(), pos });
  }
  return { teamName: team, players };
}

/**
 * Leaguepedia 賽段頁名次：`{{TournamentResults/Line|place=1|team=DWG|…}}`。
 * ⚠ 這是例行賽名次，不是該 split 的季後賽冠軍（24d 交接筆記第 2 點）——
 * 語義差異由 S26／S27 回歸時處理，本站照實記錄。
 */
export function parseTournamentResults(text) {
  const out = [];
  const re = /\{\{\s*TournamentResults\/Line\s*\|([\s\S]*?)\}\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const p = parseParams('{{X|' + m[1] + '}}');
    if (p.place && p.team) out.push({ place: p.place.trim(), team: p.team.trim() });
  }
  return out;
}

/**
 * Liquipedia 隊頁名冊：`{{SquadAutoRow|id=Momo|link=Momo_(Taiwanese_player)|name=…|joindate=…|leavedate=…|newteam=…}}`。
 * name 是真實姓名（§23.1 去姓名）——解析時直接丟掉，不進資料。
 * 回傳 [{ id, link, join, leave, newTeam }]；joindate/leavedate 可能缺（37 個隊頁實測）。
 */
export function parseTeamSquad(text) {
  const out = [];
  for (const t of findTemplates(text, ['SquadAutoRow'])) {
    const p = parseParams(t.block);
    out.push({
      id: p.id?.trim(),
      link: p.link?.trim() || null,
      join: p.joindate ? parseYear(p.joindate) : null,
      leave: p.leavedate ? parseYear(p.leavedate) : null,
      newTeam: p.newteam?.trim() || null,
    });
  }
  return out;
}

/** 名次鍵映射（finishes.js 的 FINISH_KEYS，機器可讀；§23.3 schema 權威）。
 * 範圍名次（3-4／17-20）取下限。世界賽 17+ = 入圍賽出局（playin）；
 * MSI 5+ = 小組／兩敗止步（out，與 FINISH_ORDER 的語義一致）。 */
export function placeToFinish(place, event) {
  const n = parseInt(String(place).split('-')[0], 10);
  if (!Number.isFinite(n)) return null;
  if (event === 'msi' && n >= 5) return 'out';
  if (n === 1) return 'champion';
  if (n === 2) return 'final';
  if (n <= 4) return 'semi';
  if (n <= 8) return 'quarter';
  if (n <= 16) return 'stage';
  return 'playin';
}

/** 賽事頁分類與年份。頁題是權威（檔頭 URL 解出）：
 *  `World Championship/2017` → { event: 'worlds', year: 2017 }
 *  `Mid-Season Invitational/2017` → { event: 'msi', year: 2017 }
 *  其餘（LCK/2021/Summer、LCS/Europe/2013/Spring、Champions/2014/Spring…）
 *  → { event: 賽區代碼（首段大寫），year } */
export function classifyEvent(pageTitle) {
  const year = parseYear(pageTitle);
  if (!year) return null;
  const upper = pageTitle.toUpperCase();
  if (upper.includes('WORLD CHAMPIONSHIP')) return { event: 'worlds', year };
  if (upper.includes('MID-SEASON INVITATIONAL')) return { event: 'msi', year };
  const first = pageTitle.split('/')[0].toUpperCase();
  const regionMap = {
    'EU LCS': 'EU', 'LCS/EUROPE': 'EU', 'LCS/NA': 'NA', 'LCS/NORTH AMERICA': 'NA',
    'CHAMPIONS': 'KR', 'PANDORA.TV': 'KR', 'SBENU': 'KR',
  };
  const region = regionMap[first] ?? first;
  return { event: region, year };
}