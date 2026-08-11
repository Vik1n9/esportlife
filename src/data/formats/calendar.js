/**
 * 年曆：哪一年有哪些階段、照什麼順序跑。
 *
 * 這張表是「一年長什麼樣」的唯一來源。舊版沒有這一層，於是 MSI 要放在哪、2020 有沒有
 * MSI、2025 多出來的 First Stand 要插在哪，全部散成 game.js 主迴圈裡的 if；想調整
 * 順序就得在 1000 行的檔案裡找位置。
 *
 * 現在新增一個賽事＝這裡加一列 ＋ 寫一個 `phases/*.js` ＋ 在 `phases/index.js`
 * 註冊一行。主迴圈不動。
 *
 * `order` 決定先後：
 *   `PER_SPLIT`  展開成該賽區當年的每個賽段，賽段 k 得到 order = 10k
 *   數字          固定位置；900 以後是賽季結束之後的事
 *
 * 因為賽段是 10、20、30，任何「插在第 n 個賽段之後」的賽事只要拿 10n+5 就會落在
 * 正確的縫裡——MSI 歸位就是靠這個。
 */
export const EVENTS = [
  { kind: 'SPLIT', order: 'PER_SPLIT', from: 2012, to: 9999 },

  // MSI 打的就是剛結束那個賽段的冠軍，所以它插在該賽段之後、下一個賽段之前。
  // 位置由 data/formats/msi.js 的 qualifyAfterSplit 決定（2025 起從第一賽段之後
  // 移到第二賽段之後），這裡不必知道是哪一年
  { kind: 'MSI', order: 'MSI_SLOT', from: 2015, to: 9999 },

  // MSI 打完馬上要回去打下一個賽段，能力點得先分配掉
  { kind: 'ALLOC', order: 'MSI_SLOT_AFTER', from: 2015, to: 9999, title: 'MSI 成果分配' },

  // 賽季結束：合併各賽段數據、算世界賽種子序、年度獎項、版本改動、傷病
  { kind: 'SEASON_END', order: 900, from: 2012, to: 9999 },

  // 休賽期。`phaseIndex` 是給 UI 進度條用的，只需要標在第一個
  { kind: 'MEDIA', order: 901, from: 2012, to: 9999, phaseIndex: 2 },
  { kind: 'SALARY', order: 902, from: 2012, to: 9999 },
  { kind: 'ALLOC', order: 903, from: 2012, to: 9999, title: '能力點分配' },

  { kind: 'WORLDS', order: 905, from: 2012, to: 9999 },
  { kind: 'ALLOC', order: 906, from: 2012, to: 9999, title: '大賽成果分配' },

  { kind: 'TRANSFER', order: 907, from: 2012, to: 9999 },
];
