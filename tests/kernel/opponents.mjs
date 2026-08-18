/**
 * 逐選手對手模型（§23.4，S29）。
 *
 * 守 §23.4 的三條新不變式：年代一致（硬紅）、實體化率（量測不硬紅，餵 S30）、
 * 缺口落回不得帶身分；另守聚合公式與選隊規則本身。強度數學的校準錨點（比例制
 * 門檻）由 regression/invariants.mjs 繼續站崗。
 */
import { Rng } from '../../src/core/rng.js';
import { NPC_BY_ID, NPC_ROSTER } from '../../src/data/npc/roster.js';
import { TEAM_HISTORY, teamRegionOf } from '../../src/data/npc/teamHistory.js';
import { REGION_TEAM_IDS } from '../../src/data/npc/teamIds.js';
import { ROLES } from '../../src/data/skills.js';
import { eraOf } from '../../src/data/eras.js';
import {
  intlExpOf, materializeOpponent, npcPowerInYear, oppLineupText, playoffOpponent, psychStability,
  regionParOf, regionPatchDebt, teamCheckM, teamsInYear,
  HOME_REGION_PATCH_DEBT, OTHER_REGION_PATCH_DEBT, REGION_PATCH_DEBT,
} from '../../src/engine/opponents.js';
import { deciderCheckDecay, deciderCheckM } from '../../src/engine/psych.js';
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
    // S35（§24.4.1）：Global_Boss 對手的強度＝聚合式＋intlMod（intlExp − debt，加項、
    // 聚合式形狀不變）；非 globalBoss（p2 池空落回）intlMod 為 0，同一條式子仍然成立
    const expected = carryPlayer.power * 0.60 + othersAvg * 0.40
      + starTerm(carryPlayer.power, regionParOf(hit.region)) + OPPONENT_SUPPORT_RESIDUAL
      + (hit.intlMod ?? 0);
    check('聚合式＝carry×0.60＋其餘×0.40＋對手明星項＋殘項＋intlMod', Math.abs(hit.strength - expected) < 1e-9, `${hit.strength} vs ${expected}`);
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

  /* ---------------- Global_Boss（§24.4.1，S35） ---------------- */

  // Region Patch Debt：四大賽區 0／HOME 四代 1.5／其餘 2.5（表寫死於 §24.4.1）
  check('Region Patch Debt：四大賽區為 0', ['LCK', 'LPL', 'LEC', 'LCS'].every((r) => regionPatchDebt(r) === 0));
  check('Region Patch Debt：HOME 四代 1.5', ['GPL', 'LMS', 'PCS', 'LCP'].every((r) => regionPatchDebt(r) === HOME_REGION_PATCH_DEBT));
  check('Region Patch Debt：其餘賽區 2.5', ['CBLOL', 'VCS', 'TCL', 'LLA'].every((r) => regionPatchDebt(r) === OTHER_REGION_PATCH_DEBT));
  check('四大賽區常數表只列四席', Object.values(REGION_PATCH_DEBT).every((v) => v === 0) && Object.keys(REGION_PATCH_DEBT).length === 4);

  // intlExp：五名先發各自的 Worlds＋MSI 參賽年數和，×0.5，上界 3.0
  {
    // 無任何國際賽年表的五人 → 0（構造隊：從名冊挑 career 無 worlds／msi 的選手）
    const noIntl = { players: NPC_ROSTER.filter((n) => (n.career ?? []).every((e) =>
      (e.finishes ?? []).every((f) => f.event !== 'worlds' && f.event !== 'msi'))).slice(0, 5)
      .map((n) => ({ id: n.player_id })) };
    check('intlExp：無國際賽年表的隊為 0', noIntl.players.length === 5 ? intlExpOf(noIntl) === 0 : true,
      noIntl.players.length === 5 ? '' : '找不到五名無國際年表选手，跳過');
    // 公式結構：挑一支國際賽實體化的 Global_Boss 隊，n 依 career 年表重算後比對
    const s16 = { year: 2016, league: 'HOME', team: '閃電狼' };
    const opp = materializeOpponent(s16, 76, 'intl');
    if (opp.materialized && opp.globalBoss) {
      let n = 0;
      for (const p of opp.players) {
        const years = new Set();
        for (const e of NPC_BY_ID[p.id]?.career ?? []) {
          for (const f of e.finishes ?? []) {
            if ((f.event === 'worlds' || f.event === 'msi') && f.year != null) years.add(f.year);
          }
        }
        n += years.size;
      }
      check('intlExp＝min(3.0, 0.5×n)，n 為五先發國際賽年數和',
        Math.abs(intlExpOf(opp) - Math.min(3.0, 0.5 * n)) < 1e-9, `n=${n}`);
      check('intlExp 恆在 0–3.0 上界內', intlExpOf(opp) >= 0 && intlExpOf(opp) <= 3.0);
    } else {
      log('SKIP 2016 國際賽無 Global_Boss 隊——intlExp 結構檢查等資料補齊再驗');
    }
  }

  // 選池：國際賽實體化優先 fetch_priority 2（Global_Boss）隊——命中的隊五人必全是 p2，
  // 且 intlMod＝intlExp − 對手賽區 debt；p2 池空落回的隊 globalBoss:false、不帶加成。
  // 季後賽（league 內）不吃 Global_Boss 選池。
  {
    let bossSeen = 0; let fallbackSeen = 0;
    for (let year = 2012; year <= 2030; year++) {
      const s = { year, league: 'HOME', team: '閃電狼' };
      for (const target of [68, 74, 80]) {
        const opp = materializeOpponent(s, target, 'intl');
        if (!opp.materialized) continue;
        const isP2 = opp.players.every((p) => NPC_BY_ID[p.id]?.fetch_priority === 2);
        if (opp.globalBoss) {
          bossSeen++;
          check(`${year} globalBoss 隊五人皆為 fetch_priority 2`, isP2, opp.teamId);
          check(`${year} intlMod＝intlExp − ${opp.region} 的 debt`,
            Math.abs(opp.intlMod - (intlExpOf(opp) - regionPatchDebt(opp.region))) < 1e-9, `${opp.intlMod}`);
        } else {
          fallbackSeen++;
          check(`${year} 落回隊不帶 Global_Boss 加成`, opp.intlMod === 0 && !isP2);
        }
        check(`${year} 實體化隊帶檢定讀數 checkM`,
          typeof opp.checkM === 'number' && opp.checkM >= 0 && opp.checkM <= 100);
      }
    }
    log(`Global_Boss 選池掃描 2012–2030：globalBoss ${bossSeen} 筆、落回 ${fallbackSeen} 筆`);
    check('有年分能選到 Global_Boss 隊（p2 池非空）', bossSeen > 0, 'p2 池全空——S24 補抓');
  }

  // checkM：對手五人 psych 的 comp×0.6＋resl×0.4 均值；psych 缺位視同 m=50（中性基準）
  {
    const fake = { players: [{ id: '__none_a', position: 'MID' }, { id: '__none_b', position: 'TOP' }] };
    check('checkM：psych 全缺位視同 m=50', teamCheckM(fake) === 50);
    check('中性對手的檢定衰減有界且小（m=50 → ~0.2 點）',
      deciderCheckDecay(deciderCheckM(50, 50)) > 0 && deciderCheckDecay(deciderCheckM(50, 50)) < 0.5);
  }
}
