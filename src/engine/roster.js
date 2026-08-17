/**
 * 隊友名單與隊名。
 *
 * 隊伍強度的計算已經搬到 `kernel/strength.js`——那是三個階段共用的東西，
 * 這裡只負責「這一年這個聯賽有哪些隊、你的隊友是誰」。
 *
 * 隊友來源（S23.6 定案，S28 落地）：
 * - **職業期（PRO）**：從 NPC 池抽——年代（`active_years` 覆蓋當季年份）×
 *   位置（玩家以外四位置各一）×賽區（所在聯賽同賽區）三道過濾，rating 讀該
 *   NPC 當年強度 `P_npc(年)`（§23.3），按 `par±7` 窗口篩選，放寬到 ±14 仍
 *   抽不到就落回合成隊友（`npcId: null`，虛構名池取名）——**永不空手**。
 * - **業餘期（AMATEUR／AM2）**：保留 par±7 機制，名字吃虛構名池。
 */
import { COACHES } from '../data/coaches.js';
import { DISBAND_YEAR } from '../data/disband.js';
import { LEAGUES } from '../data/leagues.js';
import { ROLES } from '../data/skills.js';
import { MATE_FICTIONAL } from '../data/mateNames.js';
import { NPC_ROSTER } from '../data/npc/roster.js';
import { teamRegionOf } from '../data/npc/teamHistory.js';
import { teamNamesOf } from '../data/regions/index.js';
import { eraOf } from '../data/eras.js';
import { ceilingCurve } from './lifecycle.js';

export function homeLeagueName(state) {
  return eraOf(state.year).home;
}

/**
 * 該年度某聯賽「還能簽約」的隊伍清單。
 *
 * 簽約發生在第 N 年的休賽期，實際效力的是第 N+1 季，所以當年就解散的戰隊
 * 必須排除。舊版沒有這道過濾，於是可以在 2019 年休賽期加入剛倒閉的閃電狼，
 * 之後那支隊伍就永遠不會觸發解散事件——史實解散被一個時序漏洞繞過去了。
 */
/**
 * 二隊／青訓的隊名。
 *
 * 舊版寫死成 ['閃電狼二隊', 'ahq Academy', 'PSG Talon Academy', '峽谷次級聯隊']，
 * 於是 2013 年就會冒出 PSG Talon Academy——PSG Talon 2020 才成立。改為直接掛在
 * 「當年真實存在的一隊」底下推導，時代自動正確，也不必再維護第二份名單。
 */
export function academyTeamsOf(state, leagueKey) {
  const suffix = LEAGUES[leagueKey].region === 'HOME' ? ' 二隊' : ' Academy';
  return teamsOf(state, leagueKey).map((t) => t + suffix);
}

export function teamsOf(state, leagueKey) {
  const league = LEAGUES[leagueKey];
  if (!league) return [];
  // 主場賽區隨時代改名換隊，所以要把當年的時代鍵（GPL/LMS/PCS/LCP）帶進去
  const pool = teamNamesOf(league.region, homeLeagueName(state));
  return pool.filter((t) => !(DISBAND_YEAR[t] <= state.year));
}

/* ---------------- 隊友抽選 ---------------- */

/** 主場賽區的史實聯賽名（GPL／LMS／PCS／LCP）——§23.6「同賽區池」的判準 */
const HOME_REGIONS = ['GPL', 'LMS', 'PCS', 'LCP'];

/**
 * NPC 當年強度（§23.3）：`peak.rating × lifecycleFactor(當年年齡)`。
 *
 * `lifecycleFactor` 復用 §7.2 `ceiling_curve` 的歸一化包絡——NPC 不重跑成長模擬，
 * 只沿同一條曲線形狀縮放，峰年（`peak_age`）＝ 1.0。`peak`／`birth_year` 缺位
 * 時強度骨幹不存在，回 null（抽選把它排除，落合成隊友）。
 */
export function npcRatingInYear(npc, year) {
  if (!npc.peak?.rating || npc.birth_year == null) return null;
  const age = year - npc.birth_year;
  const { peak_age, rise_k, fall_k, fall_accel = 1.5 } = npc.lifecycle || {};
  return npc.peak.rating * ceilingCurve({ peak_age, rise_k, fall_k, fall_accel }, age);
}

/** 玩家所在聯賽的「同賽區」判準：主場賽區吃台港澳四代聯賽，其餘 leagueKey 直接對 region */
function inLeagueRegion(npcRegion, leagueKey) {
  if (leagueKey === 'HOME') return HOME_REGIONS.includes(npcRegion);
  return npcRegion === leagueKey;
}

/** npcId → team_id（UI 隊友卡顯示縮寫用；避免每次 render 掃整份名冊） */
const NPC_BY_ID = new Map(NPC_ROSTER.map((n) => [n.player_id, n]));
export function mateTeamId(npcId) {
  return NPC_BY_ID.get(npcId)?.team_id ?? null;
}

/** 業餘期與合成隊友共用：par±7 隨機 rating＋虛構名（S23.6「統計分布同構」） */
function syntheticMate(rng, par, position) {
  return {
    npcId: null,
    name: rng.pick(MATE_FICTIONAL),
    position,
    rating: rng.int(par - 7, par + 7),
  };
}

/**
 * 職業期隊友抽選：玩家位置以外的四個位置各抽一人。
 *
 * 三道過濾（年代×位置×賽區）先決定候選池，rating 窗口 `par±7` 篩選、依序放寬
 * ±10 → ±14，全空才落合成隊友——窗口是「隊友不能比你強太多或弱太多」的變異度
 * 護欄（保留現行 `par±7` 的校準語義），合成是「永不空手」的死路檢驗兜底。
 */
function pickProMates(state, rng, leagueKey) {
  const par = LEAGUES[leagueKey].par;
  const year = state.year;
  const positions = ROLES.filter((p) => p !== state.role);
  return positions.map((pos) => {
    const pool = NPC_ROSTER.filter((npc) =>
      npc.position === pos
      && npc.active_years && year >= npc.active_years[0] && year <= npc.active_years[1]
      && npc.peak?.rating != null && npc.birth_year != null
      && inLeagueRegion(teamRegionOf(npc.team_id), leagueKey)
    );
    for (const [lo, hi] of [[7, 7], [10, 10], [14, 14]]) {
      const inWindow = pool.filter((npc) => {
        const r = npcRatingInYear(npc, year);
        return r != null && r >= par - lo && r <= par + hi;
      });
      if (!inWindow.length) continue;
      const npc = rng.pick(inWindow);
      return {
        npcId: npc.player_id,
        name: npc.player_id,
        position: pos,
        rating: Math.round(npcRatingInYear(npc, year)),
      };
    }
    return syntheticMate(rng, par, pos);
  });
}

export function rollRoster(state, rng, leagueKey) {
  if (state.stage === 'PRO') {
    state.mates = pickProMates(state, rng, leagueKey);
  } else {
    // 業餘期（AMATEUR／AM2）：par±7 機制原樣，名字改吃虛構名池
    const par = LEAGUES[leagueKey].par;
    state.mates = rng.sample(MATE_FICTIONAL, 4).map((name) => ({
      npcId: null,
      name,
      position: null,
      rating: rng.int(par - 7, par + 7),
    }));
  }
  state.coach = rng.pick(COACHES).name;
  state.mateMorale = 0;
  // 換了一批隊友，信任要重新建立：往中性拉回一半，但你是什麼樣的人會跟著你走
  if (state.mental) state.mental.trust = Math.round((state.mental.trust + 50) / 2);
}


/* ---------------- 顯示名 ---------------- */

/** 目前所在階段的顯示名 */
export function stageLabel(state) {
  if (state.stage === 'AMATEUR') return '網咖盃賽';
  if (state.stage === 'AM2') return state.am2Track === 'OVERSEAS' ? '海外青訓' : '青訓次級';
  return LEAGUES[state.league]?.region === 'HOME' ? homeLeagueName(state) : LEAGUES[state.league]?.name || '';
}

/** 目前所在階段對應的 LEAGUES 鍵 */
export function currentLeagueKey(state) {
  if (state.stage === 'PRO') return state.league;
  return state.stage === 'AM2' ? 'AM2' : 'AMATEUR';
}

/** 聯賽的顯示名（主場賽區依時代改名） */
export function leagueLabel(state, leagueKey) {
  return LEAGUES[leagueKey].region === 'HOME' ? homeLeagueName(state) : LEAGUES[leagueKey].name;
}
