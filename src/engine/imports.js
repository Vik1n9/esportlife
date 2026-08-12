/**
 * 外援名額。
 *
 * 各賽區都限制每隊能上場的外籍選手人數（LCK／LPL／LEC／LCS 都是 2 名）。玩家是
 * 主場賽區（台港澳）出身，所以簽進任何海外賽區都會佔掉一個名額。
 *
 * 這是舊版完全沒有的一道硬門檻：不是數值不夠，是**位子沒了**。Maple、SwordArt、
 * Hanabi 出海時遇到的都是這個——名額只有兩個，而且早就被別人佔著。也因為這樣，
 * 「能不能出海」不是單純的實力函式，你得強到讓對方願意把名額空出來給你。
 */
import { clamp } from '../core/rng.js';
import { LEAGUES } from '../data/leagues.js';
import { importSlotsOf } from '../data/regions/index.js';
import { effectiveCoachRating } from './attributes.js';
import { flag } from '../kernel/modifiers.js';

/** 玩家簽這個聯賽會不會佔用外援名額 */
export function occupiesImportSlot(state, leagueKey) {
  const region = LEAGUES[leagueKey]?.region;
  if (!region) return false;                       // 業餘／青訓沒有這回事
  if (flag(state, 'importExempt')) return false;
  return Number.isFinite(importSlotsOf(region));   // 母區回傳 Infinity
}

/**
 * 有沒有隊伍願意把名額空出來給你（百分比）。
 *
 * 名額本來就是滿的，所以基準很低；你越強、名氣越大，越有可能讓對方把現有的外援
 * 換掉。名額少的賽區更難擠進去。
 */
export function importChance(state, leagueKey) {
  const league = LEAGUES[leagueKey];
  const region = league?.region;
  const slots = importSlotsOf(region);
  if (!Number.isFinite(slots)) return 100;

  const over = effectiveCoachRating(state) - league.min;
  const fame = Math.max(0, (state.mental?.fame ?? 40) - 40);
  // 基準 18%：名額滿了是常態。每高於門檻 1 點評價拉 4%，知名度再補一點
  // （per-point 係數在 0–100 重校時要除以 1.25，5 → 4；fame 本來就是 0–100 不動）
  return clamp(18 + over * 4 + fame * 0.25 + (slots - 2) * 12, 5, 90);
}

/**
 * 這份報價過不過得了名額這一關。
 * @returns {boolean}
 */
export function importSlotOpen(state, rng, leagueKey) {
  if (!occupiesImportSlot(state, leagueKey)) return true;
  return rng.chance(importChance(state, leagueKey));
}
