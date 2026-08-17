/**
 * S28 隊友抽選（§23.6 定案）。
 *
 * 職業期（PRO）隊友從 NPC 池抽：年代（active_years）×位置（玩家以外四位置各一）×
 * 賽區（同聯賽）三道過濾，rating 讀該 NPC 當年強度 `P_npc(年)` 並按 par±7 窗口篩選，
 * 放寬到 ±14 仍抽不到就落合成隊友（npcId null、虛構名池）——永不空手。
 * 業餘期（AMATEUR／AM2）保留 par±7 機制、名字吃虛構名池。
 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { rollRoster, mateTeamId, npcRatingInYear } from '../../src/engine/roster.js';
import { LEAGUES } from '../../src/data/leagues.js';
import { ROLES } from '../../src/data/skills.js';
import { MATE_FICTIONAL } from '../../src/data/mateNames.js';
import { NPC_ROSTER } from '../../src/data/npc/roster.js';
import { teamRegionOf } from '../../src/data/npc/teamHistory.js';
import * as teams from '../../src/data/teams.js';

export const name = '隊友抽選與 NPC 池（S28）';

const NPC_BY_ID = new Map(NPC_ROSTER.map((n) => [n.player_id, n]));
const FICTIONAL_SET = new Set(MATE_FICTIONAL);

/** 抽一組 PRO 期隊友（玩家位置以外的四個位置） */
function proMates(role, year, league, leagueKey, seed = 'mates') {
  const s = createState({ name: 'P', role, seed, stage: 'PRO' });
  s.year = year;
  s.league = league;
  s.team = 'T';
  s.contract = { years: 2, mult: 1 };
  rollRoster(s, new Rng(`${seed}:roll`), leagueKey);
  return s.mates;
}

export async function run({ check }) {
  /* ---- 位置身分：玩家以外四位置各一 ---- */
  for (const role of ROLES) {
    const mates = proMates(role, 2020, 'HOME', 'HOME', `pos-${role}`);
    const positions = mates.map((m) => m.position);
    const want = ROLES.filter((p) => p !== role);
    check(`PRO 隊友是玩家以外四位置各一（role=${role}）`,
      want.every((p) => positions.filter((x) => x === p).length === 1)
      && !positions.includes(role),
      JSON.stringify(positions));
  }

  /* ---- 年代過濾：隊友的 active_years 覆蓋當季年份 ---- */
  {
    const year = 2020;
    const mates = proMates('MID', year, 'HOME', 'HOME', 'era');
    const ok = mates.filter((m) => m.npcId != null).every((m) => {
      const npc = NPC_BY_ID.get(m.npcId);
      return npc.active_years && year >= npc.active_years[0] && year <= npc.active_years[1];
    });
    check(`隊友年代過濾：active_years 覆蓋 ${year}（2020 台港澳池有真實選手）`, ok, JSON.stringify(mates.map((m) => m.npcId)));
    check('2020 台港澳池沒有退化到全合成（年代過濾沒把池子濾空）',
      mates.some((m) => m.npcId != null), JSON.stringify(mates.map((m) => m.npcId)));
  }

  /* ---- 賽區過濾：海外聯賽隊友必須同賽區 ---- */
  {
    const mates = proMates('MID', 2020, 'LCK', 'LCK', 'region');
    const bad = mates.filter((m) => m.npcId != null)
      .filter((m) => teamRegionOf(NPC_BY_ID.get(m.npcId).team_id) !== 'LCK');
    check('LCK 簽約的隊友全部來自 LCK 池', bad.length === 0,
      JSON.stringify(mates.map((m) => `${m.npcId}:${teamRegionOf(NPC_BY_ID.get(m.npcId)?.team_id)}`)));
  }

  /* ---- rating 窗口：par±7 為主，放寬 ±14 為界；合成隊友落在 par±7 ---- */
  {
    for (const [leagueKey, year] of [['HOME', 2015], ['LCK', 2020]]) {
      const par = LEAGUES[leagueKey].par;
      const mates = proMates('ADC', year, leagueKey, leagueKey, `win-${leagueKey}`);
      check(`${leagueKey} ${year}：全體 rating 落在 [par−14, par+14]（窗口最寬界）`,
        mates.every((m) => m.rating >= par - 14 && m.rating <= par + 14),
        JSON.stringify(mates.map((m) => m.rating)));
      const syn = mates.filter((m) => m.npcId == null);
      check(`${leagueKey} ${year}：合成隊友 rating 落在 par±7（與 rollRoster 分布同構）`,
        syn.every((m) => m.rating >= par - 7 && m.rating <= par + 7),
        JSON.stringify(syn.map((m) => m.rating)));
    }
  }

  /* ---- 永不空手：抽不到真實 NPC 的缺口年份全落合成隊友 ---- */
  {
    const mates = proMates('MID', 2036, 'HOME', 'HOME', 'synthetic');
    check('缺口年份（2036）四人都還在（死路檢驗：永不空手）', mates.length === 4, `${mates.length}`);
    check('缺口年份全部是合成隊友（npcId null）',
      mates.every((m) => m.npcId == null), JSON.stringify(mates.map((m) => m.npcId)));
    check('合成隊友名字來自虛構名池', mates.every((m) => FICTIONAL_SET.has(m.name)),
      JSON.stringify(mates.map((m) => m.name)));
  }

  /* ---- 業餘期：par±7 ＋ 虛構名池，npcId null ---- */
  {
    const s = createState({ name: 'AM', role: 'SUP', seed: 'am-mates', stage: 'AMATEUR' });
    rollRoster(s, new Rng('am-roll'), 'AM2');
    const par = LEAGUES.AM2.par;
    check('業餘期隊友 npcId 全 null', s.mates.every((m) => m.npcId == null), JSON.stringify(s.mates));
    check('業餘期隊友名字來自虛構名池', s.mates.every((m) => FICTIONAL_SET.has(m.name)),
      JSON.stringify(s.mates.map((m) => m.name)));
    check('業餘期隊友 rating 在 par±7（AM2）',
      s.mates.every((m) => m.rating >= par - 7 && m.rating <= par + 7),
      JSON.stringify(s.mates.map((m) => m.rating)));
    check('業餘期隊友不帶位置（沒有位置概念）', s.mates.every((m) => m.position == null),
      JSON.stringify(s.mates.map((m) => m.position)));
  }

  /* ---- 信任與士氣機制不動（S23.6：換隊友重置 trust 的邏輯保留） ---- */
  {
    const s = createState({ name: 'T', role: 'MID', seed: 'trust', stage: 'PRO' });
    s.mental.trust = 90;
    rollRoster(s, new Rng('trust-roll'), 'HOME');
    check('換隊友後信任往中性拉回一半', s.mental.trust === 70, `${s.mental.trust}`);
    check('教練與單季士氣仍由 rollRoster 重置',
      typeof s.coach === 'string' && s.coach.length > 0 && s.mateMorale === 0,
      `coach=${s.coach}／mateMorale=${s.mateMorale}`);
  }

  /* ---- P_npc 計算（§23.3：peak.rating × 生命週期包絡，峰年＝1.0） ---- */
  {
    const npc = NPC_ROSTER.find((n) => n.peak && n.peak.rating && n.birth_year != null);
    const { peak, birth_year, lifecycle } = npc;
    check('P_npc：峰年（peak_age）＝ peak.rating × 1.0',
      Math.abs(npcRatingInYear(npc, birth_year + lifecycle.peak_age) - peak.rating) < 1e-9,
      `got ${npcRatingInYear(npc, birth_year + lifecycle.peak_age)}`);
    const late = npcRatingInYear(npc, birth_year + lifecycle.peak_age + 3);
    check('P_npc：過峰後隨曲線衰退（< peak.rating）', late < peak.rating, `${late} vs ${peak.rating}`);
    const peakNull = NPC_ROSTER.find((n) => n.peak == null);
    check('P_npc：peak 缺位回 null（強度骨幹缺位不拍數字）',
      npcRatingInYear(peakNull, 2020) === null);
  }

  /* ---- MATE_NAMES 退役（S23.6：真實選手 ID 進 NPC 池，不能再兼虛構名） ---- */
  check('MATE_NAMES 已從 teams.js 移除', !('MATE_NAMES' in teams), `exports: ${Object.keys(teams).join(',')}`);
  check('虛構名池不與任何 NPC player_id 重疊（身分不漂移）',
    MATE_FICTIONAL.every((n) => !NPC_BY_ID.has(n)),
    MATE_FICTIONAL.filter((n) => NPC_BY_ID.has(n)).join(',') || '無重疊');

  /* ---- 縮寫對照（S28：隊友卡顯示隊縮寫用） ---- */
  {
    const npc = NPC_ROSTER.find((n) => n.team_id);
    check('mateTeamId 回傳該 NPC 的隊縮寫', mateTeamId(npc.player_id) === npc.team_id,
      `${mateTeamId(npc.player_id)} vs ${npc.team_id}`);
    check('mateTeamId 查不到回 null', mateTeamId('no-such-player') === null);
  }
}
