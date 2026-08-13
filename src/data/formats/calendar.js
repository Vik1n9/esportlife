/**
 * 年曆：一年有哪些階段、落在哪個月。
 *
 * 這張表是「一年長什麼樣」的唯一來源。舊版沒有這一層，於是 MSI 要放在哪、2020 有沒有
 * MSI、2025 多出來的 First Stand 要插在哪，全部散成 game.js 主迴圈裡的 if；想調整
 * 順序就得在 1000 行的檔案裡找位置。
 *
 * 現在新增一個賽事＝這裡加一列 ＋ 寫一個 `phases/*.js` ＋ 在 `phases/index.js`
 * 註冊一行。主迴圈不動。
 *
 * ── S14：order 空間從賽段序換成月序 ──
 *
 * 舊版的 `order` 是賽段序（賽段 k = 10k，插在中間的取 10n+5）。V4 §3.2 把回合粒度
 * 換成「月」之後，那個空間不夠用了——一個賽段本身要攤成好幾個養成回合，賽事得落在
 * **某一個月**而不是「某兩個賽段之間」。
 *
 * 所以這裡改成標「哪個月、月內第幾檔」，實際的月份由 `engine/calendar.js` 依賽區當年
 * 的賽段數展開（`at` 是符號位置，數字月份是固定位置）：
 *
 *   `EVERY_MONTH`  每一個養成回合各一次（賽事序列的月份不排）
 *   `SPLIT_OPEN`   每個賽段的第一個月：名單公布
 *   `SPLIT_CLOSE`  每個賽段的最後一個月：季後賽
 *   `MSI_SLOT`     MSI 專屬的那一個月（由賽區的 `msiAfter` 決定接在哪一段之後）
 *   `{month, slot}` 固定月份；同一個月裡照 slot 遞增排
 *
 * ⚠ **月份不是寫死 §3.3 那張表**。那張表畫的是「兩賽段賽區」的樣子；賽區各年的賽段數
 * 是 1~3 段（`data/regions/*`），MSI 接在第幾段之後也因區而異。月份怎麼分配由賽段數
 * 決定，見 `engine/calendar.js` 的 `monthLayout`。
 */

/** 同一個月裡的先後。名單先出，才輪得到那個月的養成回合 */
export const SLOT = {
  SPLIT_OPEN: 0,
  MONTH: 1,
  PLAYOFF: 2,
  MSI: 3,
  SEASON_END: 4,
  WORLDS: 5,
  OFFSEASON: 6,
};

export const EVENTS = [
  // 賽段：開幕（先發名單）與收尾（季後賽）分開兩檔——中間夾的是那個賽段的養成回合
  { kind: 'SPLIT', at: 'SPLIT_OPEN', from: 2012, to: 9999 },
  { kind: 'PLAYOFF', at: 'SPLIT_CLOSE', from: 2012, to: 9999 },

  // 養成回合（V4 §4 的七步序列）。賽事序列的月份不排這一檔
  { kind: 'MONTH', at: 'EVERY_MONTH', from: 2012, to: 9999 },

  // MSI 打的就是剛結束那個賽段的冠軍，所以它自己佔掉那一段之後的一個月。
  // 是哪一段由 data/regions/* 的 msiAfter 決定（2025 起從第一賽段之後移到第二賽段
  // 之後），這裡不必知道是哪一年
  { kind: 'MSI', at: 'MSI_SLOT', from: 2015, to: 9999 },

  // 賽季結束：合併全年數據、算世界賽種子序、年度獎項、版本改動、傷病。
  // 10 月結算、11 月開打——種子序要先定案，世界賽才有門票可談，而 §3.3 的世界賽
  // 期間本來就橫跨兩個月（這兩個月都不排養成回合）
  { kind: 'SEASON_END', month: 10, slot: SLOT.SEASON_END, from: 2012, to: 9999 },
  { kind: 'WORLDS', month: 11, slot: SLOT.WORLDS, from: 2012, to: 9999 },

  // 休賽期（§3.3 的 12 月）：媒體、薪資、轉會。都排在該月的養成回合之後
  { kind: 'MEDIA', month: 12, slot: SLOT.OFFSEASON, from: 2012, to: 9999 },
  { kind: 'SALARY', month: 12, slot: SLOT.OFFSEASON + 1, from: 2012, to: 9999 },
  { kind: 'TRANSFER', month: 12, slot: SLOT.OFFSEASON + 2, from: 2012, to: 9999 },
];
