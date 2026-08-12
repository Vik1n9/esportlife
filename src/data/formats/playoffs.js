/** 季後賽賽制。純資料。 */

/**
 * 季後賽制度：輪次與種子序點數同居一張表。
 *
 * 兩者永遠一起被改——輪次決定季後賽打幾輪、點數決定名次換多少冠軍點數，調制度時
 * 總是一起動。對外仍以 `PLAYOFF_ROUNDS`／`CHAMPIONSHIP_POINTS` 兩個名字匯出，
 * 避免呼叫端為了同一件事 import 兩次。
 */
const PLAYOFFS = {
  // 輪次名稱與 BO 數（由參賽規模決定要打幾輪）
  rounds: [
    { key: 'quarter', name: '八強', bo: 3 },
    { key: 'semi', name: '四強', bo: 5 },
    { key: 'final', name: '決賽', bo: 5 },
  ],
  // 全年各賽段季後賽名次累積的冠軍點數，決定世界賽種子序。
  // 這是 2013–2022 真實存在的制度，也是「第四種子」這種身分能成立的前提。
  seedPoints: { champion: 90, final: 70, semi: 45, quarter: 20, none: 5 },
};

export const PLAYOFF_ROUNDS = PLAYOFFS.rounds;
export const CHAMPIONSHIP_POINTS = PLAYOFFS.seedPoints;
