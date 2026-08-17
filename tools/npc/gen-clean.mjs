#!/usr/bin/env node
/**
 * S25 資料清洗 · 主組裝腳本。
 *
 * 把 `tools/npc/raw_data/*.wiki`（1347 檔整頁 Wikitext）清洗成
 * `tools/npc/cleaned_players.json`——一人一筆、欄位對齊 §23.3 的
 * `npc_roster` schema（player_id／birth_year／position／active_years／
 * career／data_source／fetch_priority）。
 *
 * 資料流：
 *   raw 檔 →（檔頭 URL 解頁題）→ 三分類
 *     選手頁  → parsePlayerInfobox（Liquipedia／Leaguepedia 兩套欄位）
 *     賽事頁  → TeamCard／TeamPrizePool（Liquipedia）＋
 *               TeamRoster／TournamentResults（Leaguepedia）
 *     隊頁    → SquadAutoRow（效力年表，台港澳段）
 *   → 選手 ID 對齊（Leaguepedia 頁題反查 Liquipedia 頁題，純查表）
 *   → 隊名對齊（規則 → team_alias.json 字典 → pending 殘餘）
 *   → 事件流（選手 × 年 × 隊 × 賽事 × 名次）組裝 career／finishes
 *   → 驗證（player_id 唯一、team_id 都在 team_history.json、CSV 覆蓋率）
 *
 * 用法：
 *   node gen-clean.mjs                # 全流程（無 LLM；殘餘寫 pending）
 *   node gen-clean.mjs --skip-llm     # 同全流程（保留旗標：LLM 環境就緒時
 *                                     # 自動批次呼叫，見 clean/llm.mjs）
 *
 * 重跑冪等：全部讀 raw_data，不寫任何中間檔以外的東西。
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  parsePlayerInfobox, parseTeamCard, parsePrizePool, parseTeamRoster,
  parseTournamentResults, parseTeamSquad, classifyEvent, placeToFinish, findTemplates,
} from './clean/parse.mjs';
import {
  readJson, readTsv, pageTitleFromHeader, buildPlayerMap, toLiquipediaId, TeamResolver,
} from './clean/align.mjs';
import { collectPending, ALIAS_FILE } from './clean/llm.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'raw_data');

/** CSV 讀成：wiki_url 尾段 → { player_id, region, fetch_priority }。
 *  尾段是頁題的 URL 形式（`Maple_(Taiwanese_player)`）——反解後才是正式頁題。 */
function readTargetCsv() {
  const lines = readFileSync(path.join(HERE, 'target_players.csv'), 'utf8')
    .split('\n').filter((l) => l.trim());
  const out = new Map();
  for (const line of lines.slice(1)) {
    const [url, id, region, fp] = line.split(',');
    const tail = url.split('/').pop();
    const page = decodeURIComponent(tail).replaceAll('_', ' ');
    out.set(page, { player_id: id, region, fetch_priority: parseInt(fp, 10) });
  }
  return out;
}

/** 檔頭頁題 → raw 檔內容；檔頭缺頁題的檔跳過並記錄（實測應零）。 */
function scanRaw() {
  const files = readdirSync(RAW).filter((f) => f.endsWith('.wiki')).sort();
  const out = [];
  for (const f of files) {
    const text = readFileSync(path.join(RAW, f), 'utf8');
    const header = text.slice(0, 400);
    const page = pageTitleFromHeader(header);
    if (!page) { out.push({ file: f, page: null, text: '' }); continue; }
    out.push({ file: f, page, text });
  }
  return out;
}

/** 選手頁／隊頁／賽事頁三分類。
 *  選手：頁題在 CSV（target_players.csv 是選手全集）或 Infobox player 存在。
 *  隊頁：Infobox team。賽事頁：Infobox league／Tournament 或名冊模板存在。 */
function classify(raw, csvPages) {
  const players = [], teams = [], events = [], other = [];
  for (const r of raw) {
    if (!r.page) { other.push(r); continue; }
    if (csvPages.has(r.page) || /(?:\{\{Infobox player|\{\{Infobox Player)/.test(r.text)) {
      players.push(r);
    } else if (/Infobox team|Infobox Team/.test(r.text)) {
      teams.push(r);
    } else if (/Infobox league|Infobox Tournament|TeamCard|TeamRoster/.test(r.text)) {
      events.push(r);
    } else {
      other.push(r);
    }
  }
  return { players, teams, events, other };
}

/** Liquipedia 名冊選手 ID → 正式頁題：
 *  link 是消歧義頁題（優先）；`wikipedia:` 開頭的 link 是外部連結（教練等），
 *  丟掉 link 改用短 ID；短 ID 對 CSV 頁題「去後綴」比對；
 *  兩者都落空保留短 ID（組裝時若 Infobox id 相同會與選手頁合併）。 */
function rosterPlayerId(id, link, csvPages, playerMap) {
  if (!id) return null;
  if (link && !link.startsWith('wikipedia:')) {
    const l = link.replaceAll('_', ' ').trim();
    return l;
  }
  const idNorm = id.trim();
  if (csvPages.has(idNorm)) return idNorm;
  const bare = idNorm.toLowerCase();
  for (const p of csvPages) {
    const base = p.split(' (')[0].toLowerCase();
    if (base === bare) return p;
  }
  return idNorm;
}

function main() {
  const csv = readTargetCsv();
  const csvPages = new Set(csv.keys());
  const teamHistory = readJson('team_history.json');
  const dict = existsSync(ALIAS_FILE) ? JSON.parse(readFileSync(ALIAS_FILE, 'utf8')) : {};
  const resolver = new TeamResolver(teamHistory, dict);
  const { map: playerMap, conflicts: playerMapConflicts } = buildPlayerMap();

  const raw = scanRaw();
  const { players: playerPages, teams: teamPages, events: eventPages, other } = classify(raw, csvPages);

  // ── 1. 選手頁 Infobox ──────────────────────────────────────────────
  const infobox = new Map(); // 正式頁題 → parsePlayerInfobox 結果
  for (const r of playerPages) {
    const info = parsePlayerInfobox(r.text);
    if (!info) continue;
    // 頁題與 Infobox id 可能大小寫不同（Westdoor vs id=Westdoor 同）；
    // 以檔頭頁題為鍵（頁題是主鍵）。
    infobox.set(r.page, { ...info, page: r.page, dataSource: info.source });
  }

  // ── 2. 賽事頁 ──────────────────────────────────────────────────────
  // 事件流：選手頁題 → { year, teamName, event, place }
  const roster = new Map();   // 選手頁題 → [{ year, teamName, event, place }]
  const teamNames = new Set(); // 全部出現過的隊名拼法（殘餘掃描用）
  const unresolvedDisambig = readTsv('unresolved_disambig_lp.tsv');
  const disambigTargets = new Set(unresolvedDisambig.map((r) => r[0]));

  for (const r of eventPages) {
    const cls = classifyEvent(r.page);
    if (!cls) { other.push(r); continue; }
    const { event, year } = cls;
    const cards = [];
    const isLeaguepedia = r.text.includes('TeamRoster') || r.text.includes('TournamentResults/Line');
    if (isLeaguepedia) {
      for (const t of findTemplates(r.text, ['TeamRoster']).filter((x) => x.name === 'TeamRoster')) {
        const parsed = parseTeamRoster(t.block);
        cards.push(parsed);
        if (parsed.teamName) teamNames.add(parsed.teamName);
      }
      const results = parseTournamentResults(r.text);
      // 例行賽名次 → team_id（縮寫）→ finish 鍵
      const placeByTeam = new Map();
      for (const res of results) {
        const tid = resolver.resolve(res.team);
        if (tid && !placeByTeam.has(tid)) placeByTeam.set(tid, res.place);
      }
      for (const c of cards) {
        const tid = resolver.resolve(c.teamName);
        const place = tid ? (placeByTeam.get(tid) ?? null) : null;
        for (const p of c.players) {
          const pid = toLiquipediaId(p.link, playerMap);
          if (!pid) continue;
          if (!roster.has(pid)) roster.set(pid, []);
          roster.get(pid).push({ year, teamName: c.teamName, teamId: tid, event, place });
        }
      }
    } else {
      // Liquipedia：TeamCard＋TeamPrizePool
      for (const t of findTemplates(r.text, ['TeamCard'])) {
        const parsed = parseTeamCard(t.block);
        cards.push(parsed);
        if (parsed.teamName) teamNames.add(parsed.teamName);
      }
      const pool = parsePrizePool(r.text);
      const placeByTeam = new Map(); // 顯示名 → place（TeamPrizePool 權威）
      const poolTeams = new Set();
      for (const s of pool) {
        if (!s.team) continue;
        poolTeams.add(s.team);
        const tid = resolver.resolve(s.team);
        if (tid && !placeByTeam.has(tid)) placeByTeam.set(tid, s.place);
      }
      for (const c of cards) {
        const tid = resolver.resolve(c.teamName);
        const place = tid ? (placeByTeam.get(tid) ?? c.place) : (c.place ?? null);
        for (const p of c.players) {
          const pid = rosterPlayerId(p.id, p.link, csvPages, playerMap);
          if (!pid) continue;
          if (!roster.has(pid)) roster.set(pid, []);
          roster.get(pid).push({ year, teamName: c.teamName, teamId: tid, event, place, pos: p.pos });
        }
      }
    }
  }

  // ── 3. 隊頁 SquadAutoRow（效力年表，台港澳段） ─────────────────────
  const squad = new Map(); // 選手頁題 → [{ teamId, join, leave }]
  for (const r of teamPages) {
    const tid = resolver.resolve(r.page);
    if (!tid) continue;
    for (const s of parseTeamSquad(r.text)) {
      const pid = rosterPlayerId(s.id, s.link, csvPages, playerMap);
      if (!pid) continue;
      if (!squad.has(pid)) squad.set(pid, []);
      squad.get(pid).push({ teamId: tid, join: s.join, leave: s.leave });
    }
  }

  // ── 4. 殘餘隊名 → pending（LLM／執行者判讀，見 clean/llm.mjs） ────
  const pending = collectPending([...teamNames], resolver);

  // ── 5. 組裝選手記錄 ───────────────────────────────────────────────
  const players = new Map(); // 選手頁題 → 記錄
  const ensure = (pid) => {
    if (!players.has(pid)) {
      const csvMeta = csv.get(pid);
      players.set(pid, {
        player_id: pid,
        birth_year: null,
        position: null,
        active_years: null,
        career: [],
        data_source: 'liquipedia',
        fetch_priority: csvMeta ? csvMeta.fetch_priority : 3,
        notes: [],
      });
    }
    return players.get(pid);
  };

  // 5a. Infobox 基礎欄位
  for (const [page, info] of infobox) {
    const rec = ensure(page);
    rec.birth_year = info.birthYear;
    if (info.roles.length) rec.position = info.roles[0];
    rec.data_source = info.dataSource;
  }

  // 5b. 名冊事件流 → career／finishes
  const careerByTeam = new Map(); // 選手頁題 → teamId → { years:Set, finishes:Map }
  const mergeRoster = (pid, ev) => {
    const rec = ensure(pid);
    if (ev.pos && !rec.position && ev.pos !== 'c') rec.position = ev.pos;
    if (!ev.teamId) {
      if (!rec.notes.includes(`隊名未對齊：${ev.teamName}（${ev.event} ${ev.year}）`)) {
        rec.notes.push(`隊名未對齊：${ev.teamName}（${ev.event} ${ev.year}）`);
      }
      return;
    }
    let t = careerByTeam.get(pid);
    if (!t) { t = new Map(); careerByTeam.set(pid, t); }
    let entry = t.get(ev.teamId);
    if (!entry) { entry = { years: new Set(), finishes: new Map() }; t.set(ev.teamId, entry); }
    entry.years.add(ev.year);
    if (ev.place) {
      const key = `${ev.year}|${ev.event}`;
      const finish = placeToFinish(ev.place, ev.event);
      if (finish && (!entry.finishes.has(key) || placeToFinish(ev.place, ev.event) !== entry.finishes.get(key).finish)) {
        const better = !entry.finishes.has(key) ||
          rank(finish) < rank(entry.finishes.get(key).finish);
        if (better) entry.finishes.set(key, { year: ev.year, event: ev.event, finish });
      }
    }
  };
  const rank = (f) => ({ champion: 1, final: 2, semi: 3, quarter: 4, out: 4, ro16: 5, stage: 6, playin: 7, none: 99 })[f] ?? 99;

  for (const [pid, evs] of roster) for (const ev of evs) mergeRoster(pid, ev);

  // 5c. SquadAutoRow 補效力年份（早於名冊年的 joindate 延伸下限；
  //     leavedate 有值且晚於名冊年的延伸上限）
  for (const [pid, rows] of squad) {
    ensure(pid);
    let t = careerByTeam.get(pid);
    if (!t) { t = new Map(); careerByTeam.set(pid, t); }
    for (const s of rows) {
      let entry = t.get(s.teamId);
      if (!entry) { entry = { years: new Set(), finishes: new Map() }; t.set(s.teamId, entry); }
      if (s.join) entry.years.add(s.join);
      if (s.leave) entry.years.add(s.leave);
    }
  }

  // 5d. career 定型（年份 min..max）
  for (const [pid, t] of careerByTeam) {
    const rec = ensure(pid);
    for (const [teamId, entry] of t) {
      const yrs = [...entry.years].sort((a, b) => a - b);
      if (!yrs.length) continue;
      rec.career.push({
        years: [yrs[0], yrs[yrs.length - 1]],
        team_id: teamId,
        finishes: [...entry.finishes.values()].sort((a, b) => a.year - b.year || a.event.localeCompare(b.event)),
      });
    }
    rec.career.sort((a, b) => a.years[0] - b.years[0]);
    if (rec.career.length) {
      rec.active_years = [rec.career[0].years[0], rec.career[rec.career.length - 1].years[1]];
    }
  }

  // 5e. CSV 筆沒有 raw 檔的合併（頁題大小寫漂移：westdoor 併入 Westdoor）
  const bareOnly = [];
  for (const page of csvPages) {
    if (!players.has(page) && !infobox.has(page)) bareOnly.push(page);
  }
  for (const page of bareOnly) {
    const base = page.toLowerCase();
    const twin = [...players.keys()].find((p) => p.toLowerCase() === base && p !== page);
    if (twin) {
      players.get(twin).notes.push(`CSV 別名頁題合併：${page}`);
    } else {
      ensure(page).notes.push('無 raw 檔且無名冊出現');
    }
  }

  // ── 6. 驗證與報告 ─────────────────────────────────────────────────
  const all = [...players.values()];
  const ids = new Set(all.map((p) => p.player_id));
  const dup = all.filter((p) => { const n = all.filter((q) => q.player_id === p.player_id).length; return n > 1; });
  const badTeam = all.flatMap((p) => p.career.map((c) => ({ pid: p.player_id, team: c.team_id })))
    .filter(({ team }) => !teamHistory.teams.some((t) => t.team_id === team));
  const teamIdSet = new Set(teamHistory.teams.map((t) => t.team_id));
  const badTeams = [...new Set(all.flatMap((p) => p.career.map((c) => c.team_id)).filter((t) => !teamIdSet.has(t)))];
  const csvCovered = all.filter((p) => csv.has(p.player_id)).length;
  const withCareer = all.filter((p) => p.career.length).length;
  const withBirth = all.filter((p) => p.birth_year != null).length;
  const withPos = all.filter((p) => p.position).length;
  const unresolved13 = all.filter((p) => disambigTargets.has(p.player_id));

  console.log(`raw 檔 ${raw.length}（無頁題 ${other.filter((o) => !o.page).length}）`);
  console.log(`  選手頁 ${playerPages.length}、隊頁 ${teamPages.length}、賽事頁 ${eventPages.length}、其他 ${other.length}`);
  console.log(`名冊選手 ${roster.size}、SquadAutoRow 選手 ${squad.size}`);
  console.log(`cleaned 選手 ${all.length}：CSV 覆蓋 ${csvCovered}/${csvPages.size}、有名冊/生涯 ${withCareer}、有出生年 ${withBirth}、有位置 ${withPos}`);
  console.log(`未解消歧義目標 13 筆中：${unresolved13.length} 筆出現在清洗結果`);
  console.log(`隊名殘餘 ${pending.length} 筆 → clean/pending_team_alias.json`);
  console.log(`驗證：player_id 唯一 ${ids.size === all.length}、壞 team_id ${badTeams.length} 筆（${badTeams.join('、') || '無'}）`);
  console.log(`選手映射衝突 ${playerMapConflicts.length} 筆（map_intl_lp vs disambig_all）`);

  // ── 7. 產出 ───────────────────────────────────────────────────────
  const out = {
    generated: new Date().toISOString().slice(0, 10),
    note: 'S25 清洗產物。來源：Liquipedia（主源，CC BY-SA 3.0）、Leaguepedia（備援，CC BY-SA 3.0）。' +
      '欄位對齊 §23.3 npc_roster schema（peak/lifecycle/attributes/psych/traits/tags 由 S27 生成，本站不含）。' +
      '名次鍵為 data/formats/finishes.js 的機器可讀鍵；split 名次為例行賽名次（24d 交接筆記第 2 點）。',
    player_count: all.length,
    players: all.sort((a, b) => a.player_id.localeCompare(b.player_id)),
  };
  writeFileSync(path.join(HERE, 'cleaned_players.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`已寫出 cleaned_players.json（${all.length} 筆）`);
}

main();