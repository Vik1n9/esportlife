/**
 * 逐選手對手模型（§23.4，S29 落地）。
 *
 * S29 前對手是聚合強度：§11.1 階梯表一個數字，經 `OPPONENT_SUPPORT` 換算後直接
 * 進勝率公式。現在對手是**身分實體化**——階梯表仍是對手水準的唯一來源
 * （校準錨點不動），NPC 陣容是階梯水準的具象：
 *
 * 1. 依賽事層級算出「選隊目標水準」（階梯表原封不動，含種子序懲罰與 gauss 擺動），
 * 2. 從該年 NPC 池選**當年 carry 水準最接近目標**的隊（以隊伍為單位，不拼全明星），
 * 3. 強度從五人陣容聚合回 §11.1：`P_carry × 0.60 + 其餘四人均值 × 0.40
 *    + starTerm(P_carry, 對手主場聯賽 par) + OPPONENT_SUPPORT_RESIDUAL`。
 *
 * 陣容缺口年份落回階梯表匿名對手（`materialized: false`）——無隊名無人名，
 * 敘事不得帶身分（§23.4 不變式 3），強度仍走 `OPPONENT_SUPPORT` 舊路。
 *
 * 完全離線：只讀 `src/data/npc/` 靜態檔，無網路、無 LLM。
 */
import { LEAGUES } from '../data/leagues.js';
import { NPC_BY_ID, NPC_ROSTER } from '../data/npc/roster.js';
import { TEAM_HISTORY, teamRegionOf } from '../data/npc/teamHistory.js';
import { REGION_TEAM_IDS } from '../data/npc/teamIds.js';
import { ROLES } from '../data/skills.js';
import { eraOf } from '../data/eras.js';
import { ceilingCurve } from './lifecycle.js';
import { HOME_REGIONS } from './roster.js';
import { PERFORM_FLOOR, PERFORM_SPAN, deciderCheckM } from './psych.js';
import { OPPONENT_SUPPORT, OPPONENT_SUPPORT_RESIDUAL, opponentStrength, starTerm } from '../kernel/strength.js';

/**
 * NPC 當年強度 P_npc(年)（§23.4 聚合式的輸入）：
 * `peak.rating × lifecycleFactor(年齡) × psychStability(psych)`。
 *
 * `npcRatingInYear` 的骨幹（peak × 生命週期包絡）復用隊友抽選同一條；psychStability
 * 復用 §9.2 的 0.85–1.15 發揮帶寬映射——對手心理只進這一處，不新增對手端失誤模型
 * （失誤只發生在玩家這一側，§9.3）。`peak`／`birth_year` 缺位回 null，該選手不進實體化池。
 */
export function npcPowerInYear(npc, year) {
  const base = npcBaseRating(npc, year);
  if (base == null) return null;
  return base * psychStability(npc.psych);
}

/** peak.rating × 生命週期包絡（不含心理）；缺 peak／birth_year 回 null */
function npcBaseRating(npc, year) {
  if (!npc.peak?.rating || npc.birth_year == null) return null;
  const age = year - npc.birth_year;
  const { peak_age, rise_k, fall_k, fall_accel = 1.5 } = npc.lifecycle || {};
  return npc.peak.rating * ceilingCurve({ peak_age, rise_k, fall_k, fall_accel }, age);
}

/** §9.2 發揮帶寬的 NPC 版：六維均值映射進 0.85–1.15 */
export function psychStability(psych) {
  if (!psych) return 1;
  const dims = Object.values(psych);
  const mean = dims.reduce((t, v) => t + v, 0) / dims.length;
  return PERFORM_FLOOR + PERFORM_SPAN * (mean / 100);
}

/* ---------------- 選隊池 ---------------- */

/**
 * 該年「陣容完整」的 NPC 隊伍表（快取，逐年建一次）。
 *
 * 以隊伍為單位（§23.4 構成規則 1）：依 career 年表判定某選手某年效力哪隊
 * （不用 `team_id` 現屬隊——那是名冊拍攝時點，不是史實年表），五位置各一才算
 * 完整；同位置雙人或有人算不出當年強度都不進池。
 *
 * ⚠ **年代一致不變式（§23.4 硬紅）就長在這裡**：入池要同時過 career 年表覆蓋該年
 * **與** `active_years` 覆蓋該年——資料裡有少量兩欄不一致的筆（career 記了後期
 * 效力、active_years 沒跟上），收緊到兩個都過，賽事年份就必然同時落在兩者之內。
 */
const TEAMS_BY_YEAR = new Map();
export function teamsInYear(year) {
  if (TEAMS_BY_YEAR.has(year)) return TEAMS_BY_YEAR.get(year);

  const teams = new Map();
  for (const npc of NPC_ROSTER) {
    if (!npc.position) continue;
    if (!npc.active_years || year < npc.active_years[0] || year > npc.active_years[1]) continue;
    const power = npcPowerInYear(npc, year);
    if (power == null) continue;
    for (const entry of npc.career) {
      if (!entry.team_id || year < entry.years[0] || year > entry.years[1]) continue;
      const t = teams.get(entry.team_id) || { spots: {}, dup: false };
      if (t.spots[npc.position]) t.dup = true;   // 同年同位置兩人：陣容不乾淨，整隊棄
      else t.spots[npc.position] = { npc, power };
      teams.set(entry.team_id, t);
    }
  }

  const out = [];
  for (const [teamId, t] of teams) {
    if (t.dup || ROLES.some((p) => !t.spots[p])) continue;
    const players = ROLES.map((p) => ({ id: t.spots[p].npc.player_id, position: p, power: t.spots[p].power }));
    const carry = Math.max(...players.map((p) => p.power));
    out.push({ teamId, players, carry });
  }
  TEAMS_BY_YEAR.set(year, out);
  return out;
}

/**
 * 某年某聯賽對應的「賽區字串」——與 `TEAM_HISTORY` 的 `region` 欄位同義（主場吃
 * 年代聯賽名 GPL／LMS／PCS／LCP，海外吃聯賽鍵本身 LCK／LPL／LEC／LCS）。
 *
 * 兩邊的「賽區」命名空間不一樣：`LEAGUES[key].region` 給的是 `data/regions/*` 的
 * 賽區鍵（HOME／KR／CN…），`teamRegionOf` 給的是 Liquipedia 的聯賽代碼——這個函式
 * 是兩邊的橋，S29 的 `selfRegion` 與 S32 的 `leagueSim.js` 共用同一條（單一來源）。
 */
export function regionKeyOf(year, leagueKey) {
  if (leagueKey === 'HOME') return eraOf(year).home;
  return LEAGUES[leagueKey]?.region !== 'HOME' ? leagueKey : eraOf(year).home;
}

/** 玩家當季的賽區判準：`regionKeyOf` 的 state 版本 */
function selfRegion(state) {
  return regionKeyOf(state.year, state.league);
}

/**
 * NPC 隊的賽區是不是「玩家自己的賽區」。主場玩家四個年代（GPL／LMS／PCS／LCP）
 * 都算同一個賽區——國際賽不遇自己賽區，不能只排當年的年代標籤
 * （2016 年的 MSI 不能碰上 GPL 時代標籤的舊隊員組成的隊）。
 */
function isSelfRegion(region, state) {
  if (state.league === 'HOME' || LEAGUES[state.league]?.region === 'HOME') return HOME_REGIONS.includes(region);
  return region === selfRegion(state);
}

/** 對手主場聯賽的 par：四個頂級賽區有 LEAGUES 條目，其餘落回主場賽區 par（66） */
export function regionParOf(region) {
  return LEAGUES[region]?.par ?? LEAGUES.HOME.par;
}

/* ---------------- Global_Boss（§24.4.1，S35） ---------------- */

/**
 * 國際賽 Global_Boss 選池門檻：五名先發全部是 S27 的 `fetch_priority === 2`
 * 產物（歷年 Worlds／MSI 參賽隊員＋四大賽區賽段冠軍隊員）才算國際賽精選隊。
 * 不是整隊優先度欄位——模板是逐選手取材，隊是年表重組出來的。
 */
export function isGlobalBossTeam(team) {
  return team.players.every((p) => NPC_BY_ID[p.id]?.fetch_priority === 2);
}

/**
 * 大賽經驗加成的原始讀數 n ＝ 五名先發各自的 Worlds＋MSI 參賽年數之和
 * （career 年表裡 event ∈ {worlds, msi} 的 entries；同年兩賽事只算一年——
 * 「年」是出場單位，不是場次）。拆出來是為了 S36 的池診斷能量未夾取的 n
 * （`tools/calibrate-160.mjs --intl`），不必在工具裡再抄一份走訪法。
 */
export function intlYearsOf(team) {
  let total = 0;
  for (const p of team.players) {
    const years = new Set();
    for (const entry of NPC_BY_ID[p.id]?.career ?? []) {
      for (const f of entry.finishes ?? []) {
        if ((f.event === 'worlds' || f.event === 'msi') && f.year != null) years.add(f.year);
      }
    }
    total += years.size;
  }
  return total;
}

/** §24.4.1 第 2 條的兩個常數。⚠ 動它們要先讀該節的 S36 註記（上界與錨點互斥） */
export const INTL_EXP_COEF = 0.5;
export const INTL_EXP_CAP = 3.0;

/**
 * 大賽經驗加成（§24.4.1）：`min(3.0, 0.5 × n)`。
 * 上界 3.0 點 ＝ 單局勝率 +5.3pp（×1.76）：老將紅利看得見，碾不爛人。
 *
 * ⚠ **實測（S36）：p2 池 95.5% 打上界、sd 0.10**——n 的池均值是 13.5 而不是
 * S31 估的 ~3，加成實際上退化成常數 +3.0。收斂結論、掃值表與「上界 3.0 之下
 * 鑑別度與局勝率錨互斥」的推導都在 §24.4.1 的 S36 註記；本站不改常數。
 */
export function intlExpOf(team) {
  return Math.min(INTL_EXP_CAP, INTL_EXP_COEF * intlYearsOf(team));
}

/**
 * 賽區級別版本適應度（Region Patch Debt，§24.4.1）：國際賽對局扣對手隊強度——
 * 小賽區隊的 meta 適應成本（史實：外卡與次級賽區隊在國際賽系統性偏弱）。
 * 四大賽區 0／HOME 四代（GPL／LMS／PCS／LCP）1.5／其餘賽區 2.5。
 */
export const REGION_PATCH_DEBT = { LCK: 0, LPL: 0, LEC: 0, LCS: 0 };
export const HOME_REGION_PATCH_DEBT = 1.5;
export const OTHER_REGION_PATCH_DEBT = 2.5;
export function regionPatchDebt(region) {
  if (REGION_PATCH_DEBT[region] === 0) return 0;
  return HOME_REGIONS.includes(region) ? HOME_REGION_PATCH_DEBT : OTHER_REGION_PATCH_DEBT;
}

/**
 * Bo5 高壓檢定的對手端讀數（§24.4.2 對稱實作）：對手五人 psych 的
 * `comp × 0.6 + resl × 0.4` 均值。psych 缺位的 NPC 視同 m=50，也是匿名對手的基準。
 *
 * ⚠ **m=50 不是「不衰減」**（S36 實測更正）：門檻是 60，`deciderCheckDecay(50)`
 * ＝ 0.204 點。§24.4.2 據此推「兩邊各衰 ~0.2 互相抵消」，但玩家端 m 實測均值
 * **74.4**（89.9% 零衰減）、對手端 50.8（1.7% 零衰減）——抵消不成立，淨 **+0.125
 * 點偏向玩家**。量級遠小於帶寬（四條驗收線全部落帶內），S36 依 §24.4.2「破帶
 * 才動四常數」不動門檻；要讓「資料沒有＝不衰減」名實相符是門檻 60 → 50 的
 * 規格決定，登記在 §24.4.2 的 S36 註記。
 */
export function teamCheckM(team) {
  let sum = 0; let n = 0;
  for (const p of team.players) {
    const psych = NPC_BY_ID[p.id]?.psych;
    sum += deciderCheckM(psych?.comp ?? 50, psych?.resl ?? 50);
    n += 1;
  }
  return n ? sum / n : 50;
}

/**
 * 從選隊池實體化一個對手。
 *
 * 國際賽（`scope === 'intl'`）過 Global_Boss 選池（§24.4.1）：先收斂到
 * `fetch_priority === 2` 的隊；該年 p2 池空時落回任一外賽區完整隊（死路檢驗：
 * 不空手），標 `globalBoss: false`、不帶本節兩項加成。
 *
 * @param {object} state
 * @param {number} target 階梯表算出的「選隊目標水準」（carry 尺度，含擺動與懲罰）
 * @param {'playoff'|'intl'} scope 聯賽內賽事吃玩家賽區池；國際賽吃全池、排除玩家賽區
 * @returns {{ materialized:boolean, strength:number, teamId?:string, teamName?:string,
 *   region?:string, players?:object[], carry?:number, globalBoss?:boolean,
 *   intlMod?:number, checkM?:number }}
 */
export function materializeOpponent(state, target, scope, intlBoost = 0) {
  const year = state.year;
  const home = selfRegion(state);
  const selfTeamId = REGION_TEAM_IDS[state.team] ?? null;

  let pool = teamsInYear(year).filter((t) => {
    const region = teamRegionOf(t.teamId);
    if (t.teamId === selfTeamId) return false;                    // 不自己打自己
    if (scope === 'playoff') return region === home;              // 聯賽內：同賽區
    return !isSelfRegion(region, state);                          // 國際賽：不遇自己賽區
  });

  // Global_Boss 選池：p2 池非空才收斂，空池落回（不空手、globalBoss: false，§24.4.1 選池規則）
  let globalBoss = false;
  if (scope === 'intl' && pool.length) {
    const p2 = pool.filter(isGlobalBossTeam);
    if (p2.length) { pool = p2; globalBoss = true; }
  }
  if (!pool.length) return { materialized: false, strength: opponentStrength(target) };

  const pick = pool.reduce((best, t) => (Math.abs(t.carry - target) < Math.abs(best.carry - target) ? t : best), pool[0]);
  const region = teamRegionOf(pick.teamId);
  const carryPlayer = pick.players.reduce((a, b) => (b.power > a.power ? b : a));
  // §24.4.1 落點：`intlMod = intlExp − debt` 進加項——聚合式形狀不改，不碰乘法鏈
  const intlMod = globalBoss ? intlExpOf(pick) - regionPatchDebt(region) : 0;

  return {
    materialized: true,
    teamId: pick.teamId,
    teamName: TEAM_HISTORY[pick.teamId]?.name ?? pick.teamId,
    region,
    players: pick.players,
    carry: carryPlayer.power,
    globalBoss,
    intlMod,
    checkM: teamCheckM(pick),
    strength: aggregateTeamStrength(pick.players, region) + intlBoost + intlMod,
  };
}

/**
 * §23.4 聚合式：carry 份額 0.60、其餘四人份額 0.40、對手明星項顯式化、教練／體力殘項。
 *
 * 單一來源：`materializeOpponent`（S29 對手實體化）與 `leagueSim.js`（S32 賽區背景
 * 模擬）的 NPC 隊強度都經這裡算，不得各抄一份聚合式。
 */
export function aggregateTeamStrength(players, region) {
  const carryPlayer = players.reduce((a, b) => (b.power > a.power ? b : a));
  const others = players.filter((p) => p !== carryPlayer);
  const othersAvg = others.reduce((t, p) => t + p.power, 0) / others.length;
  return carryPlayer.power * 0.60
    + othersAvg * 0.40
    + starTerm(carryPlayer.power, regionParOf(region))
    + OPPONENT_SUPPORT_RESIDUAL;
}

/**
 * 抽一個對手並記帳。計數餵 §23.4 的實體化率量測
 * （MSI／世界賽 ≥ 90%、季後賽 ≥ 80%，量測不硬紅）。
 */
export function drawOpponent(state, rng, { scope, target, intlBoost = 0 }) {
  const opp = materializeOpponent(state, target, scope, intlBoost);
  const log = state.oppFaces?.[scope];
  if (log) {
    log.draws += 1;
    if (opp.materialized) log.materialized += 1;
  }
  // rng 保留在簽名裡：選隊是確定性的（最近 carry），但呼叫端的 gauss 擺動走在
  // target 裡——以後想加抽選擾動有地方掛
  void rng;
  return opp;
}

/* ---------------- 各賽事的階梯目標 ---------------- */

/**
 * 季後賽對手（§11.1 階梯：八強 par+2／四強 par+4.5／決賽 par+7.5，
 * 種子序懲罰 `(種子−1)×1.5`，每場 `gauss(1.5)` 擺動）。
 */
export function playoffOpponent(state, rng, roundKey, seed) {
  const par = LEAGUES[state.league]?.par ?? 66;
  const step = roundKey === 'final' ? 7.5 : roundKey === 'semi' ? 4.5 : 2;
  const target = par + step + (seed - 1) * 1.5 + rng.gauss(1.5);
  return drawOpponent(state, rng, { scope: 'playoff', target });
}

/**
 * 國際賽對手（MSI 地板 72／世界賽地板 74，輪次遞增帶在 `step`，
 * `bonus` 修正與每場 `gauss(1.6)` 擺動照舊）。
 *
 * `scope` 預設 `'intl'`（全池、排除玩家賽區）；**地區資格賽是聯賽內賽事**，
 * 選隊池走玩家賽區並排除自己的隊（§23.4：季後賽／生死戰不自己打自己）。
 */
export function intlOpponent(state, rng, step, { floor, mod = 0, intlBoost = 0, scope = 'intl' } = {}) {
  const par = LEAGUES[state.league]?.par ?? 66;
  const target = Math.max(par, floor) + step + mod + rng.gauss(1.6);
  return drawOpponent(state, rng, { scope, target, intlBoost });
}

/** Swiss 對手（世界賽 2023 起：par 地板 74，戰績每淨勝一場 +2，`gauss(1.5)` 擺動） */
export function swissOpponent(state, rng, wins, losses) {
  const par = Math.max(LEAGUES[state.league]?.par ?? 66, 74);
  const target = par + (wins - losses) * 2.0 + rng.gauss(1.5);
  return drawOpponent(state, rng, { scope: 'intl', target });
}

/**
 * 實體化對手的敘事：隊名＋五名先發。**落回匿名時不得使用**——
 * `materialized: false` 的對局文字不得出現隊名與選手 ID（§23.4 不變式 3）。
 */
export function oppLineupText(opp) {
  if (!opp.materialized) return '';
  const roster = opp.players.map((p) => p.id).join('、');
  return `對手是 <b class="hl">${opp.teamName}</b>（${opp.region}）——先發：${roster}`;
}
