/**
 * 逐選手對手模型（§23.4，S29）。
 *
 * 守 §23.4 的三條新不變式：年代一致（硬紅）、實體化率（量測不硬紅，餵 S30）、
 * 缺口落回不得帶身分；另守聚合公式與選隊規則本身。強度數學的校準錨點（比例制
 * 門檻）由 regression/invariants.mjs 繼續站崗。
 */
import { Rng } from '../../src/core/rng.js';
import { NPC_ROSTER } from '../../src/data/npc/roster.js';
import { TEAM_HISTORY } from '../../src/data/npc/teamHistory.js';
import { REGION_TEAM_IDS } from '../../src/data/npc/teamIds.js';
import { ROLES } from '../../src/data/skills.js';
import { eraOf } from '../../src/data/eras.js';
import {
  materializeOpponent, npcPowerInYear, oppLineupText, playoffOpponent, psychStability,
  regionParOf, teamsInYear,
} from '../../src/engine/opponents.js';
import { OPPONENT_SUPPORT, OPPONENT_SUPPORT_RESIDUAL, opponentStrength, starTerm } from '../../src/kernel/strength.js';

export const name = '逐選手對手模型（S29）';

export async function run({ check, log }) {
  /* ---------------- 不變式 1：年代一致（硬紅） ---------------- */

  let teamsChecked = 0;
  for (let year = 2012; year <= 2030; year++) {
    for (const team of teamsInYear(year)) {
      teamsChecked++;
      check(`${year} ${team.teamId} 陣容五位置各一`, ROLES.every((p) => team.players.some((x) => x.position === p)), JSON.stringify(team.players.map((p) => p.position)));
      for (const p of team.players) {
        const npc = NPC_ROSTER.find((n) => n.player_id === p.id);
        check(`${year} ${team.teamId} 先發 ${p.id} 效力年表覆蓋賽事年份`,
          npc.career.some((e) => e.team_id === team.teamId && year >= e.years[0] && year <= e.years[1]),
          JSON.stringify(npc.career));
        check(`${year} ${team.teamId} 先發 ${p.id} active_years 覆蓋賽事年份`,
          npc.active_years && year >= npc.active_years[0] && year <= npc.active_years[1],
          JSON.stringify(npc.active_years));
      }
    }
  }
  log(`選隊池掃描 2012–2030：${teamsChecked} 支完整陣容隊，年代一致全數通過`);

  /* ---------------- 聚合公式與選隊規則 ---------------- */

  const rng = new Rng('opponents');
  const state22 = { year: 2022, league: 'HOME', team: '閃電狼' };

  let hit = null;
  for (const target of [60, 64, 68, 72, 76, 80, 84, 88, 92]) {
    const opp = materializeOpponent(state22, target, 'intl');
    if (opp.materialized) { hit = opp; break; }
  }
  check('2022 年國際賽能找到可實體化對手', !!hit, '池太薄，S24 補抓');
  if (hit) {
    const carryPlayer = hit.players.reduce((a, b) => (b.power > a.power ? b : a));
    const others = hit.players.filter((p) => p !== carryPlayer);
    const othersAvg = others.reduce((t, p) => t + p.power, 0) / others.length;
    const expected = carryPlayer.power * 0.60 + othersAvg * 0.40
      + starTerm(carryPlayer.power, regionParOf(hit.region)) + OPPONENT_SUPPORT_RESIDUAL;
    check('聚合式＝carry×0.60＋其餘×0.40＋對手明星項＋殘項', Math.abs(hit.strength - expected) < 1e-9, `${hit.strength} vs ${expected}`);
    check('carry 是五人最高者', hit.carry === carryPlayer.power);
    check('對手明星項吃對手主場聯賽 par', starTerm(hit.carry, regionParOf(hit.region)) <= 6.0);

    const farAway = materializeOpponent(state22, hit.carry + 40, 'intl');
    if (farAway.materialized) {
      check('選隊取 carry 最接近目標者',
        Math.abs(farAway.carry - (hit.carry + 40)) <= Math.abs(hit.carry - (hit.carry + 40)) + 1e-9,
        `target=${hit.carry + 40} 選到 carry=${farAway.carry}`);
    }
  }

  // 殘項與匿名路的常數分工：落回的匿名對手仍吃 OPPONENT_SUPPORT 9.0
  const emptyState = { year: 1911, league: 'HOME', team: '閃電狼' };
  const anon = materializeOpponent(emptyState, 72, 'intl');
  check('無隊可選時落回匿名階梯', !anon.materialized && anon.strength === opponentStrength(72));

  /* ---------------- 不變式 3：缺口落回不得帶身分 ---------------- */

  check('匿名對手的敘事為空（不得出現隊名與選手 ID）', oppLineupText(anon) === '');
  if (hit) {
    const text = oppLineupText(hit);
    check('實體化敘事帶隊名與全員 ID', text.includes(hit.teamName) && hit.players.every((p) => text.includes(p.id)));
  }

  /* ---------------- 聯賽內賽事排除自己的隊 ---------------- */

  check('玩家隊伍映射全部存在于戰隊史', Object.values(REGION_TEAM_IDS).every((id) => TEAM_HISTORY[id]),
    Object.entries(REGION_TEAM_IDS).filter(([, id]) => !TEAM_HISTORY[id]).map(([n]) => n).join(', '));

  const selfId = REGION_TEAM_IDS['閃電狼'];
  const flashWolvesYear = 2016;
  // FW 2016 在池裡（LMS 完整陣容與否由資料決定），若完整則季後賽抽選必須排除
  const fwTeam = teamsInYear(flashWolvesYear).find((t) => t.teamId === selfId);
  if (fwTeam) {
    const fwState = { year: flashWolvesYear, league: 'HOME', team: '閃電狼' };
    let met = null;
    for (const target of [60, 66, 72, 78, 84]) {
      const opp = materializeOpponent(fwState, target, 'playoff');
      if (opp.materialized && opp.teamId === selfId) { met = opp; break; }
    }
    check('季後賽選隊池不抽到自己隊伍', !met, met ? `target 選到了 ${met.teamId}` : '');
  } else {
    log(`SKIP FW ${flashWolvesYear} 不在完整陣容池——排除檢查等資料補齊再驗`);
  }

  /* ---------------- 國際賽不遇自己賽區（含主場四代） ---------------- */

  for (const year of [2014, 2016, 2022, 2026]) {
    const homeEra = eraOf(year).home;
    const s = { year, league: 'HOME', team: '閃電狼' };
    let selfMet = null;
    for (const target of [60, 70, 80, 90]) {
      const opp = materializeOpponent(s, target, 'intl');
      if (opp.materialized && ['GPL', 'LMS', 'PCS', 'LCP'].includes(opp.region)) selfMet = opp;
    }
    check(`國際賽不遇主場賽區（${year} ${homeEra} 四代皆排）`, !selfMet, selfMet ? `${selfMet.teamId}(${selfMet.region})` : '');
  }

  /* ---------------- 季後賽的階梯目標與記帳 ---------------- */

  const pstate = {
    year: 2022, league: 'LCK', team: 'T1', stage: 'PRO',
    oppFaces: { playoff: { draws: 0, materialized: 0 }, intl: { draws: 0, materialized: 0 } },
  };
  playoffOpponent(pstate, rng, 'final', 1);
  check('季後賽抽選有記帳', pstate.oppFaces.playoff.draws === 1);

  /* ---------------- psychStability 帶寬 ---------------- */

  const flat = psychStability({ comp: 50, conf: 50, drive: 50, disc: 50, trust: 50, resl: 50 });
  check('六維全 50 的發揮倍率＝1.00', Math.abs(flat - 1.00) < 1e-9, String(flat));
  check('psychStability 恆在 0.85–1.15', psychStability({ comp: 0, conf: 0, drive: 0, disc: 0, trust: 0, resl: 0 }) >= 0.85
    && psychStability({ comp: 100, conf: 100, drive: 100, disc: 100, trust: 100, resl: 100 }) <= 1.15);
  check('NPC 強度＝peak×生命週期×心理（峰歲時生命週期因子＝1）', (() => {
    const npc = NPC_ROSTER.find((n) => n.position && n.peak?.rating && n.birth_year != null);
    const atPeakAge = npc.birth_year + npc.lifecycle.peak_age;
    const expected = npc.peak.rating * psychStability(npc.psych);
    return Math.abs(npcPowerInYear(npc, atPeakAge) - expected) < 1e-6;
  })());
}
