/**
 * 事件卡庫。
 *
 * 每張卡有 good / bad 兩個結果（基礎 50%，`天才操作` 提升至 70%）。
 * - `ability`：直接加減能力值。
 * - `flags`：交給引擎解讀的副作用，避免資料層混進邏輯。
 *
 * kind：
 * - `indulgent` 享樂類 → 好結果推進「自律」計數（連續 3 次解鎖）。
 * - `romance`   感情類 → 好結果推進「單身」計數。
 * - `patch`     版本類 → 好結果直接降低版本落差（舊版寫反了，好結果反而加重懲罰）。
 */
export const EVENT_CARDS = [
  { id: 'solo_queue', name: '排位衝分', kind: 'normal',
    good: { text: '手感發燙，連勝衝上宗師', ability: { op: 2 } },
    bad:  { text: '連敗掉分，越打越亂', ability: { op: -2 } } },

  { id: 'scrim', name: '訓練賽加練', kind: 'normal',
    good: { text: '跟頂尖隊友對練，細節大開竅', ability: { ref: 2 } },
    bad:  { text: '過度訓練，反應變鈍', ability: { ref: -2 } } },

  { id: 'patch_study', name: '版本補習', kind: 'patch',
    good: { text: '讀懂新版本，Meta 全掌握', ability: { macro: 2 }, flags: { patchDebt: -2 } },
    bad:  { text: '版本理解跟不上，打法過時', ability: { macro: -1 }, flags: { patchDebt: 1 } } },

  { id: 'wrist', name: '手腕不適', kind: 'normal',
    good: { text: '檢查無礙，虛驚一場', ability: { sta: 1 } },
    bad:  { text: '手腕痠痛，休息兩週', ability: { ref: -2 }, flags: { injuryRisk: 6 } } },

  { id: 'midnight_snack', name: '宵夜誘惑', kind: 'indulgent',
    good: { text: '堅持自律，體態維持', ability: { sta: 1 } },
    bad:  { text: '連吃一週宵夜，反應明顯變慢', ability: { sta: -2, ref: -1 } } },

  { id: 'nightlife', name: '夜生活邀約', kind: 'indulgent',
    good: { text: '婉拒，早睡保持狀態', ability: { sta: 1 } },
    bad:  { text: '玩太晚，隔天訓練狀態低迷', ability: { ref: -2, sta: -1 } } },

  { id: 'streaming', name: '直播放縱', kind: 'indulgent',
    good: { text: '控制時長，人氣穩定成長', ability: { sta: 1 }, flags: { popular: true } },
    bad:  { text: '沉迷開台，訓練量下滑', ability: { op: -2, ref: -1 } } },

  { id: 'interview', name: '媒體專訪', kind: 'normal',
    good: { text: '應對得體，贊助敲門', ability: { sta: 1 }, flags: { popular: true, bonusSalary: 40 } },
    bad:  { text: '失言上新聞，狀態受影響', ability: { op: -1, sta: -1 } } },

  { id: 'coaching', name: '教練團指導', kind: 'normal',
    good: { text: '戰術理解突破', ability: { macro: 2 }, flags: { macroPoint: true } },
    bad:  { text: '被盯上缺點，一直被要求改', ability: { macro: -2 } } },

  { id: 'mentor', name: '老將指點', kind: 'normal',
    good: { text: '一句話點醒，大局觀飛躍', ability: { macro: 2, vis: 1 } },
    bad:  { text: '學了不適合的招，繞了遠路', ability: { macro: -2 } } },

  { id: 'romance', name: '單身誘惑', kind: 'romance',
    good: { text: '拒絕表白，專注訓練', ability: { op: 1 } },
    bad:  { text: '開始戀愛，心思分散', ability: { ref: -1, op: -1 }, flags: { romance: true } } },

  { id: 'endorsement', name: '代言邀約', kind: 'normal',
    good: { text: '商演安排得宜，多賺又有名氣', ability: { sta: 1 }, flags: { popular: true, bonusSalary: 120 } },
    bad:  { text: '行程太滿，訓練量掉了', ability: { op: -2, sta: -1 } } },

  { id: 'slump', name: '季中低潮', kind: 'normal',
    good: { text: '調整心態走出來，更強了', ability: { macro: 1, sta: 1 }, flags: { composure: true } },
    bad:  { text: '低潮拖了一個月', ability: { op: -2, ref: -1, sta: -1 }, flags: { tiltRisk: true } } },

  { id: 'vod_review', name: '錄像檢討', kind: 'normal',
    good: { text: '看穿對手習慣，單殺率上升', ability: { lane: 2 }, flags: { laneking: true } },
    bad:  { text: '想太多，場上反而遲疑', ability: { lane: -2 } } },

  { id: 'roster_drama', name: '隊內矛盾', kind: 'normal',
    good: { text: '你出面把話講開，更衣室凝聚起來', ability: { macro: 1 }, flags: { leader: true } },
    bad:  { text: '氣氛僵掉，訓練賽都在互丟責任', ability: { tf: -2 }, flags: { mateMorale: -2 } } },

  { id: 'boot_camp', name: '海外集訓', kind: 'normal',
    good: { text: '對上完全不同的打法，視野被打開', ability: { macro: 1, vis: 2, tf: 1 } },
    bad:  { text: '時差沒調過來，整趟都在昏睡', ability: { sta: -2, ref: -1 } } },
];

/** 依生涯評價分級的粉絲留言 */
export const FAN_QUOTES = [
  ['{n}退休了……我的青春也跟著結束了 QQ', '以後我會指著重播畫面說：爸爸看過{n}打比賽', '外媒已經在算歷史排名了，根本沒有懸念', '謝謝你把台灣電競帶到世界的舞台', '這種等級的選手，一個世代只會出現一個'],
  ['{n}確定退役，推文區已經滿滿的 QQ', '全明星常客說再見了', '生涯數據攤開還是很漂亮', '謝謝你每一次的極限操作'],
  ['稱不上超級巨星，但每天打開轉播都看得到他，這樣就夠了', '默默扛了這麼多年，辛苦了', '穩定就是他最大的天賦'],
  ['至少他真的站上過職業舞台，比鍵盤後的我們都強', '板凳暖了這麼多年，也是一種浪漫'],
  ['欸這誰？……查了一下，原來真的打過職業喔', '又一個被現實打敗的追夢人，唏噓'],
];

export const TIER_NAMES = ['傳奇', '歷史級球星', '優秀職業選手', '稱職選手', '邊緣選手'];
