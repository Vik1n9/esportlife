/**
 * 世界賽冠軍登記與衛冕者賽路（S20g，V4 §16.2）。
 *
 * 這一站要在「對手一直是純數字」的引擎裡插進第一個**對手身分**概念。這裡放的是
 * 純資料推導與純查詢——「誰是今年的世界冠軍」「衛冕者在不在玩家的賽路上」——不含
 * 任何 beat yield。敘事與授予由 `phases/worlds.js` 組裝，這樣登記表與賽路判定可以
 * 單獨測試，不必跑完整生涯。
 *
 * ⚠ **庚組相容**（S28 真 NPC 戰隊池）：合成冠軍走既有的 `teamNamesOf`（自動吃時代
 * 改名，零新內容）。S28 進場時要換掉的是「抽一個合成隊名」這一行，登記表的欄位與
 * 消費端（`ledger.js` 的 `reigningChampion`）原封不動——**換內容不換結構**。
 */
import { REGIONS, teamNamesOf, worldsSlotsOf } from '../data/regions/index.js';
import { eraOf } from '../data/eras.js';
import { reigningChampion } from './ledger.js';

/**
 * 各輪碰到衛冕冠軍的機率（百分比，餵 `rng.chance`）。八強 < 四強 < 決賽——兩支強隊
 * 通常在後段相遇。衛冕冠軍「佔一個淘汰賽席位」，玩家走得越深越可能碰上他。
 */
export const CHAMPION_ENCOUNTER = { quarter: 15, semi: 30, final: 60 };

/** 衛冕冠軍比同輪一般對手強多少點（0–100 刻度）。他是冠軍，不該跟一號種子一樣強 */
export const CHAMPION_BONUS = 4;

/**
 * 依世界賽席位數加權抽一個奪冠賽區。席位多的賽區（LCK／LPL）奪冠機率高——這是
 * 現成資料（`worldsSlotsOf`），不是新編的機率表。
 */
export function pickChampionRegion(state, rng) {
  const regions = Object.keys(REGIONS);
  const weights = regions.map((r) => worldsSlotsOf(state.year, r));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < regions.length; i++) {
    roll -= weights[i];
    if (roll < 0) return regions[i];
  }
  return regions[regions.length - 1];
}

/**
 * 抽今年的世界冠軍，回傳 `titleHistory` 的一筆 entry。
 *
 * - `isPlayer: true` → 玩家奪冠，`team` 是玩家的隊伍、`region` 是玩家的賽區。
 * - 否則抽一個合成 NPC 冠軍：賽區依席位加權，隊名走 `teamNamesOf(region, eraKey)`
 *   （自動吃時代改名，避開 N18「2016 年的台北暗殺星」那種跨時代錯誤）。
 *
 * 形狀對玩家與 NPC 一致——這是「共用變數」的定義，也是 S28 能換內容不換結構的前提。
 */
export function drawChampion(state, rng, { isPlayer = false, team = null, region = null } = {}) {
  if (isPlayer) {
    return {
      year: state.year, event: 'worlds', finish: 'champion',
      team, region, isPlayer: true,
    };
  }
  const r = pickChampionRegion(state, rng);
  return {
    year: state.year, event: 'worlds', finish: 'champion',
    team: rng.pick(teamNamesOf(r, eraOf(state.year).home)),
    region: r, isPlayer: false,
  };
}

/**
 * 今年世界賽「可被挑戰」的衛冕冠軍（上屆世界賽冠軍），不可挑戰就回 null。
 *
 * 不可挑戰的三種情形（§16.2 邊界表）：
 * - 遊戲第一年／從沒記錄過冠軍 → 表是空的
 * - 玩家自己就是衛冕冠軍 → 不能把自己標成對手
 * - 衛冕冠軍的賽區今年沒有世界賽席位 → 合成冠軍也要過席位檢查，沒晉級就不標
 */
export function challengableChampion(state) {
  const champ = reigningChampion(state, 'worlds');
  if (!champ || champ.isPlayer) return null;
  if (worldsSlotsOf(state.year, champ.region) < 1) return null;
  return champ;
}
