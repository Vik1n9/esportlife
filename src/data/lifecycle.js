/**
 * 生命週期曲線的參數基準值與隨機範圍（V4 §7.2）。
 *
 * 六屬性各帶五個參數，由出生種子在基準值周圍的小範圍內隨機生成，亂數流接在
 * 「業餘隊伍」之後（§1.4 的 birth 流尾端）。「老將靠意識吃飯」不再是寫死的 awr/dec
 * 續升，而是 awr 的 peak_age 晚、fall_k 極小的曲線結果——這張表自己就把這件事
 * 表達出來，不需要任何特例。
 *
 * 五個參數的意義（§7.2 參數定義表）：
 *   peak_age     巔峰年齡：該屬性的天花板在哪一年最高
 *   rise_k       上升曲率：越大代表幼年時越接近天花板
 *   fall_k       衰退基礎速率：越大衰退越快
 *   fall_accel   衰退加速度：越大代表衰退從慢到快的轉折越急
 *   decline_pull 跟隨速率：屬性值追隨天花板下落的速度
 */

/** 每個屬性的五個參數，依序是 peak_age／rise_k／fall_k／fall_accel／decline_pull */
export const LIFECYCLE_PARAMS = ['peak_age', 'rise_k', 'fall_k', 'fall_accel', 'decline_pull'];

/**
 * 參數基準值（§7.2 種子隨機化表的「基準值」欄）。
 *
 * 基準值是「該屬性的典型生命週期」，種子只是讓每個選手在它周圍小幅擺動——所以
 * 「老將靠意識吃飯」是寫在這裡的常數關係，不是每次骰出來的運氣。
 */
export const LIFECYCLE_BASE = {
  vit: { peak_age: 24, rise_k: 1.8, fall_k: 0.04, fall_accel: 1.3, decline_pull: 0.35 },
  agi: { peak_age: 22, rise_k: 2.2, fall_k: 0.07, fall_accel: 1.6, decline_pull: 0.45 },
  awr: { peak_age: 29, rise_k: 1.2, fall_k: 0.010, fall_accel: 1.0, decline_pull: 0.15 },
  tec: { peak_age: 23, rise_k: 2.0, fall_k: 0.05, fall_accel: 1.5, decline_pull: 0.40 },
  syn: { peak_age: 26, rise_k: 1.5, fall_k: 0.025, fall_accel: 1.2, decline_pull: 0.25 },
  dec: { peak_age: 27, rise_k: 1.3, fall_k: 0.015, fall_accel: 1.1, decline_pull: 0.20 },
};

/**
 * 參數隨機範圍（§7.2 種子隨機化表的「隨機範圍」欄）。
 *
 * `peak_age` 是整數（用 `birth.int(lo, hi)`），其餘四個是連續值（用 `lo + next() ×
 * (hi − lo)`）。範圍的寬度就是「同一個天賦、不同種子」的人生差異來源之一。
 */
export const LIFECYCLE_RANGE = {
  vit: { peak_age: [22, 26], rise_k: [1.4, 2.2], fall_k: [0.025, 0.055], fall_accel: [1.0, 1.6], decline_pull: [0.25, 0.45] },
  agi: { peak_age: [20, 24], rise_k: [1.8, 2.6], fall_k: [0.05, 0.09], fall_accel: [1.3, 1.9], decline_pull: [0.35, 0.55] },
  awr: { peak_age: [27, 31], rise_k: [0.8, 1.6], fall_k: [0.007, 0.013], fall_accel: [0.7, 1.3], decline_pull: [0.08, 0.22] },
  tec: { peak_age: [21, 25], rise_k: [1.6, 2.4], fall_k: [0.035, 0.065], fall_accel: [1.2, 1.8], decline_pull: [0.30, 0.50] },
  syn: { peak_age: [24, 28], rise_k: [1.1, 1.9], fall_k: [0.015, 0.035], fall_accel: [0.9, 1.5], decline_pull: [0.15, 0.35] },
  dec: { peak_age: [25, 29], rise_k: [0.9, 1.7], fall_k: [0.010, 0.020], fall_accel: [0.8, 1.4], decline_pull: [0.10, 0.30] },
};
