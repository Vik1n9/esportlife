/** 季後賽賽制。純資料。 */

/** 季後賽輪次名稱與 BO 數（由參賽規模決定要打幾輪） */
export const PLAYOFF_ROUNDS = [
  { key: 'quarter', name: '八強', bo: 3 },
  { key: 'semi', name: '四強', bo: 5 },
  { key: 'final', name: '決賽', bo: 5 },
];

/**
 * 冠軍點數：全年各賽段季後賽名次累積，決定世界賽種子序。
 * 這是 2013–2022 真實存在的制度，也是「第四種子」這種身分能成立的前提。
 */
export const CHAMPIONSHIP_POINTS = { champion: 90, final: 70, semi: 45, quarter: 20, none: 5 };
