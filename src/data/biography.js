/**
 * 生涯傳記的段落模板（V4 §15.5，S21a）。
 *
 * 純資料、零邏輯：模板是字串，`{變數}` 由 `engine/biography.js` 填空。
 * 「用哪一段、怎麼退化」是引擎的責任，這裡只把文案釘在一處——想調文案的人
 * 不必翻邏輯，想調邏輯的人不必翻文案。
 *
 * 語氣：維基百科式（中立、事實、第三人稱）。§15.5 的另一種語氣（電競新聞報導）
 * 刻意不做，理由與交接筆記見 S21a 說明書。
 *
 * 段落結構（§15.5）：出道 → 巔峰（或沒有巔峰）→ 轉折 → 結局 → 歷史定位一句。
 * 每一段都有「事實不足時」的退化模板，不允許留空或佔位符。
 */
export const BIO_TEMPLATES = {
  debut: {
    standard: '{name} 出身業餘賽事，{year} 年正式出道，加入 {team}，司職{role}。',
    innate: '他帶有{list}的特質。',
    amateurOnly: '{name} 的電競生涯止步於業餘賽事，從未登上職業聯賽的舞台。',
  },
  peak: {
    worldsWin: '{year} 年世界賽，{name} 隨隊捧起召喚師獎盃，生涯共奪得 {n} 座世界賽冠軍。',
    intlFinal: '{year} 年{event}，{name} 一路打進決賽，最終屈居亞軍。',
    intlTop4: '{year} 年{event}，{name} 打入四強，寫下生涯國際賽最佳成績。',
    domestic: '{name} 的榮譽集中在自家聯賽，生涯共拿下 {n} 座賽段冠軍。',
    domesticNoIntl: '{name} 的榮譽集中在自家聯賽，生涯共拿下 {n} 座賽段冠軍；而國際賽的舞台始終沒有向他敞開。',
    bestSeason: '{year} 年是 {name} 生涯最出色的賽季（勝差 {margin}），這份高峰卻沒能轉化成國際賽的成績。',
    bestSeasonNoIntl: '{year} 年是 {name} 生涯最出色的賽季（勝差 {margin}），而國際賽的舞台始終沒有向他敞開。',
    none: '{name} 的職業生涯沒有留下值得一提的高峰。',
  },
  turn: {
    disbandOnce: '{year} 年，{name} 效力的 {team} 解散，他的職業生涯迎來第一次轉折。',
    disbandMany: '生涯期間，{name} 共經歷 {n} 次戰隊解散。',
    fired: '{year} 年，{name} 遭 {team} 切割，被迫離開。',
    fused: '為了追求更高階的特質，{name} 在合成中捨棄了{list}。',
    nearMiss: '他曾一度逼近「{quest}」的目標，最終功虧一簣。',
    decline: '{year} 年之後，{name} 的狀態開始下滑，職業生涯進入尾聲。',
    calm: '{name} 的職業生涯沒有經歷重大轉折，以 {team} 一員的身分走到最後。',
    calmAmateur: '{name} 的業餘生涯一路平穩，最終平淡落幕。',
  },
  ending: {
    standard: '{name} 於 {year} 年退役，時年 {age} 歲，職業生涯共 {n} 季、效力過 {m} 支戰隊、累計 {g} 場出賽。',
    amateurOnly: '{name} 於 {year} 年離開電競圈，時年 {age} 歲，未曾以職業選手身分登板。',
  },
  legacy: {
    route: '他的生涯被後人記作{list}。',
    legendary: '他以{list}的稱號留名電競史。',
    worlds: '作為世界冠軍，他的名字長留在台灣電競的歷史裡。',
    titles: '他靠著 {n} 座賽段冠軍，在自家聯賽留下了自己的名字。',
    tenure: '他沒能成為鎂光燈的主角，但 {n} 季的職業生涯本身就是一份紀錄。',
    plain: '他的職業生涯短暫而平凡，終究淹沒在電競產業的快速迭代之中。',
  },
};
