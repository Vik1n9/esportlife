/**
 * 賽區以外的隊名與人名。純資料。
 *
 * 各賽區的職業隊名住在 `data/regions/*`——那是賽區的屬性。這裡放的是不屬於任何
 * 賽區的東西：業餘起點的場景（網咖隊與自辦盃賽）與隨機隊友的 ID。
 *
 * 業餘的兩張表（隊伍＋賽事名）合併成同一個場景物件：戰報與簽約都是從「這個業餘
 * 世界」取素材，拆成兩個檔沒有意義。對外仍以 `TEAMS_AMATEUR`／`AMATEUR_CUPS`
 * 兩個名字匯出，呼叫端不必知道它們其實同源。
 */

/**
 * 業餘起點的隊伍名。
 *
 * S2（2012）的台灣還沒有校隊或校際聯賽這種東西——當年的業餘場景是網咖包台、
 * 網咖自辦的盃賽，還有在排位上打出名號的路人王。隊伍多半是一群朋友臨時湊的，
 * 隊名也就跟著隨便取。
 */
const AMATEUR_SCENE = {
  teams: [
    '不知道怎輸',
    '東海小飛俠',
    '真愛搞玩皮',
    '殛噬狂殺',
    '誰來都一樣',
    'YenKalHowGo',
    '曜越鬥龍隊',
  ],
  cups: [
    '英雄聯盟大都會盃',
    '連鎖網咖城市盃',
    '週末 5v5 業餘聯賽',
    '飲料店贊助盃',
    '巴哈網友自辦盃',
    '排位路人王擂台',
  ],
};

export const TEAMS_AMATEUR = AMATEUR_SCENE.teams;
export const AMATEUR_CUPS = AMATEUR_SCENE.cups;

export const MATE_NAMES = ['Maple', 'Betty', 'Hanabi', 'Kaiwing', 'River', 'Doggo', 'Unified', 'Ziv', 'Westdoor', 'Mountain', 'Rest', 'Kongyue'];
