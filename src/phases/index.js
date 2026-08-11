/**
 * 階段註冊表。
 *
 * 每個階段只匯出兩個東西：
 *
 *   export const kind = 'MSI';
 *   export function* run(g, phase) { ... }
 *
 * `g` 是 `{state, rng}`，`phase` 是年曆那一列（含 order 與該列自帶的參數）。階段不
 * import `game.js`，所以沒有循環依賴——主迴圈認得階段，階段不認得主迴圈。
 *
 * 新增一個賽事＝寫一個檔、這裡加一行、`data/formats/calendar.js` 加一列。
 * 瀏覽器的 ESM 沒辦法列舉目錄，所以這一行必須手寫。
 */
import * as split from './split.js';
import * as seasonEnd from './seasonEnd.js';
import * as media from './media.js';
import * as salary from './salary.js';
import * as alloc from './alloc.js';
import * as msi from './msi.js';
import * as worlds from './worlds.js';
import * as transfer from './transfer.js';

const MODULES = [split, seasonEnd, media, salary, alloc, msi, worlds, transfer];

export const PHASES = Object.fromEntries(MODULES.map((m) => [m.kind, m]));
