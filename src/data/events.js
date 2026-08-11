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
    good: { text: '手感發燙，RK 一波連勝直衝宗師，彈幕全在刷「太神啦」', ability: { op: 2 } },
    bad:  { text: '排位連敗掉分，越打越上頭，逆風還硬要開', ability: { op: -2 } } },

  { id: 'scrim', name: '訓練賽加練', kind: 'normal',
    good: { text: '跟頂尖隊友加練對線，細節大開竅，教練忍不住點頭', ability: { ref: 2 } },
    bad:  { text: '加練到半夜，反應遲鈍，隔天團練被當靶子打', ability: { ref: -2 } } },

  { id: 'patch_study', name: '版本補習', kind: 'patch',
    good: { text: '把 patch note 嗑到熟，新 Meta 直接拿捏', ability: { macro: 2 }, flags: { patchDebt: -2 } },
    bad:  { text: '版本理解跟不上，打法還停在上一季，直接過時', ability: { macro: -1 }, flags: { patchDebt: 1 } } },

  { id: 'wrist', name: '手腕不適', kind: 'normal',
    good: { text: '手腕檢查無礙，虛驚一場，粉絲鬆了一口氣', ability: { sta: 1 } },
    bad:  { text: '手腕痠痛發炎，被醫生下了兩週禁練令', ability: { ref: -2 }, flags: { injuryRisk: 6 } } },

  { id: 'midnight_snack', name: '宵夜誘惑', kind: 'indulgent',
    good: { text: '狠拒宵夜誘惑，體態維持住，自律人設沒崩', ability: { sta: 1 } },
    bad:  { text: '連吃一週宵夜，體重跟反應一起變慢', ability: { sta: -2, ref: -1 } } },

  { id: 'nightlife', name: '夜生活邀約', kind: 'indulgent',
    good: { text: '婉拒局邀，早睡保狀態，被笑是老人作息', ability: { sta: 1 } },
    bad:  { text: '玩到太陽升起，隔天訓練整個靈魂出竅', ability: { ref: -2, sta: -1 } } },

  { id: 'streaming', name: '直播放縱', kind: 'indulgent',
    good: { text: '開台時間控制得宜，人氣穩定成長，彈幕一片祥和', ability: { sta: 1 }, flags: { popular: true } },
    bad:  { text: '開台開到走火入魔，訓練量直接下滑', ability: { op: -2, ref: -1 } } },

  { id: 'interview', name: '媒體專訪', kind: 'normal',
    good: { text: '專訪應對得體，贊助商主動來敲門', ability: { sta: 1 }, flags: { popular: true, bonusSalary: 40 } },
    bad:  { text: '受訪失言上新聞，被鄉民拿出來鞭，狀態受影響', ability: { op: -1, sta: -1 } } },

  { id: 'coaching', name: '教練團指導', kind: 'normal',
    good: { text: '教練點破你的戰術盲點，理解直接突破', ability: { macro: 2 }, flags: { macroPoint: true } },
    bad:  { text: '被教練盯上缺點，一直逼你改，改到不會玩', ability: { macro: -2 } } },

  { id: 'mentor', name: '老將指點', kind: 'normal',
    good: { text: '老將一句話點醒你，大局觀直接飛躍', ability: { macro: 2, vis: 1 } },
    bad:  { text: '學了不適合自己的套路，繞了一大圈遠路', ability: { macro: -2 } } },

  { id: 'romance', name: '單身誘惑', kind: 'romance',
    good: { text: '拒絕告白，把心思全押在訓練上，專注度爆表', ability: { op: 1 } },
    bad:  { text: '談起戀愛，心思全被分散，團戰各種走神', ability: { ref: -1, op: -1 }, flags: { romance: true } } },

  { id: 'endorsement', name: '代言邀約', kind: 'normal',
    good: { text: '代言商演安排得宜，名氣跟收入一起起飛', ability: { sta: 1 }, flags: { popular: true, bonusSalary: 120 } },
    bad:  { text: '代言通告排太滿，訓練量直接歸零', ability: { op: -2, sta: -1 } } },

  { id: 'slump', name: '季中低潮', kind: 'normal',
    good: { text: '靠自己把低潮挺過去，心態反而更穩了', ability: { macro: 1, sta: 1 }, flags: { composure: true } },
    bad:  { text: '季中低潮拖了一個月，狀態一路探底', ability: { op: -2, ref: -1, sta: -1 }, flags: { tiltRisk: true } } },

  { id: 'vod_review', name: '錄像檢討', kind: 'normal',
    good: { text: '把對手 VOD 看到吐，摸透習慣，單殺率直線上升', ability: { lane: 2 }, flags: { laneking: true } },
    bad:  { text: '檢討過頭，場上越想越多，反而畏首畏尾', ability: { lane: -2 } } },

  { id: 'roster_drama', name: '隊內矛盾', kind: 'normal',
    good: { text: '你主動把話攤開講，更衣室氣氛重新凝聚', ability: { macro: 1 }, flags: { leader: true } },
    bad:  { text: '隊內氣氛僵掉，訓練賽都在互相甩鍋', ability: { tf: -2 }, flags: { mateMorale: -2 } } },

  { id: 'boot_camp', name: '海外集訓', kind: 'normal',
    good: { text: '海外集訓遇上完全不同的打法，視野整個被打開', ability: { macro: 1, vis: 2, tf: 1 } },
    bad:  { text: '時差沒調過來，海外集訓整趟都在昏睡', ability: { sta: -2, ref: -1 } } },
];

/** 依生涯評價分級的粉絲留言 */
export const FAN_QUOTES = [
  ['{n}退役的瞬間我直接破防，我的青春真的到此為止了 QQ', '以後我會指著重播畫面對我兒子說：爸爸當年看過{n}用盲僧一腳迴旋踢', '外媒已經在幫{n}算歷史第一人了，根本沒有懸念，yyds', '謝謝你把台灣電競帶到世界舞台，那隻鱷魚真的玩成神了', '這種等級的選手一個世代只會出一個，respect'],
  ['{n}確定退役，推文區直接爆，一整排 QQ 刷不停', '全明星常客要說再見了，少了你我轉播都不知道要看誰', '生涯數據攤開還是很漂亮，狐狸跟 VN 他玩得跟鬼一樣', '謝謝你每一次的極限操作，瑟雷西那勾我永遠忘不了'],
  ['稱不上超級巨星，但每天打開轉播都看得到他，這樣就夠了', '默默扛了這麼多年真的辛苦了，整隊最穩的就是他', '穩定就是他最大的天賦，這種選手最難得'],
  ['至少他真的站上過職業舞台，比我們這些鍵盤俠強多了', '板凳暖了這麼多年也是一種浪漫，辛苦了'],
  ['欸這誰？……查了一下，原來真的打過職業喔', '又一個被現實打敗的追夢人，唏噓，但至少拼過'],
];

export const TIER_NAMES = ['傳奇', '歷史級球星', '優秀職業選手', '稱職選手', '邊緣選手'];
