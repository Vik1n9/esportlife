/**
 * 事件卡庫。
 *
 * 每張卡有 good / bad 兩個結果，但**由玩家決定要用哪種方式面對**——
 * 舊版是引擎背著玩家擲一次 50/50 就把結果貼出來，玩家除了訓練加點與合約
 * 之外完全沒有介入餘地，事件等於是純敘事的裝飾。現在每張卡先描述處境
 * （`prompt`），再讓玩家從 `options` 裡選一條路，選項本身決定成功率與幅度。
 *
 * 結果欄位：
 * - `ability`：直接加減能力值（會依選項的 gain / loss 倍率縮放）。
 * - `flags`：交給引擎解讀的副作用，避免資料層混進邏輯。
 *
 * 選項欄位：
 * - `odds`   命中 good 的百分比（`天才操作`／`神之手` 另外 +20）。
 * - `gain`   命中 good 時的數值倍率（預設 1）。
 * - `loss`   落到 bad 時的數值倍率（預設 1）。
 * - `traits` 設 false 表示「這條路不碰隱藏素質」——好的壞的都不會覺醒，
 *            也不推進自律計數。安全牌的代價就是它不會把你推向任何極端。
 * - `flags`  不論成敗都會生效的副作用（目前只有直播衝人氣用到）。
 *
 * 選項的 note（成功率、幅度、是否影響素質）由引擎統一生成，
 * 資料層不寫死文案，才不會跟數值對不上。
 *
 * kind：
 * - `indulgent` 享樂類 → 好結果推進「自律」計數（連續 3 次解鎖）。
 * - `romance`   感情類 → 好結果推進「單身」計數。
 * - `patch`     版本類 → 好結果直接降低版本落差（舊版寫反了，好結果反而加重懲罰）。
 */
export const EVENT_CARDS = [
  { id: 'solo_queue', name: '排位衝分', kind: 'normal',
    prompt: '凌晨兩點，網咖只剩你這台還亮著。分數卡在門檻前一步，再一把就上得去——也可能一路掉回去。',
    options: [
      { id: 'grind', label: '衝到天亮，不上分不睡', odds: 45, gain: 2.2, loss: 1.3 },
      { id: 'balanced', label: '再打三把就收', odds: 55, gain: 1, loss: 1, main: true },
      { id: 'stop', label: '關機睡覺，手感明天再說', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '手感發燙，RK 一波連勝直衝宗師，彈幕刷爆「666」', ability: { op: 2 } },
    bad:  { text: '排位連敗掉分，隊友 0/10/0 開送，越打越上頭', ability: { op: -2 } } },

  { id: 'scrim', name: '訓練賽加練', kind: 'normal',
    prompt: '團練結束，幾個隊友還想再開一輪對線練習。時間已經很晚了。',
    options: [
      { id: 'allin', label: '留下來加練到收工', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'focus', label: '只練自己最弱的那條線', odds: 58, gain: 1, loss: 1, main: true },
      { id: 'rest', label: '回宿舍休息，保住明天狀態', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '跟頂尖隊友加練對線，細節大開竅，教練忍不住點頭', ability: { ref: 2 } },
    bad:  { text: '加練到半夜，反應遲鈍，隔天團練被當人機打', ability: { ref: -2 } } },

  { id: 'patch_study', name: '版本補習', kind: 'patch',
    prompt: '新版本上線，patch note 落落長。有人整晚在啃更新日誌，也有人直接進去打了再說。',
    options: [
      { id: 'study', label: '逐條讀完，開自訂房實測數值', odds: 55, gain: 2.2, loss: 1.3 },
      { id: 'ask', label: '問教練跟隊友的結論就好', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'feel', label: '直接進排位，打到有感覺為止', odds: 62, gain: 1, loss: 1, traits: false },
    ],
    good: { text: '把 patch note 嗑到熟，新 Meta 拿捏得死死的，人人喊你「版本答案」', ability: { macro: 2 }, flags: { patchDebt: -2 } },
    bad:  { text: '版本理解跟不上，還停在上一季，被酸「版本逆子」', ability: { macro: -1 }, flags: { patchDebt: 1 } } },

  { id: 'wrist', name: '手腕不適', kind: 'normal',
    prompt: '右手腕從上週就開始悶痛，握滑鼠久了會麻。賽季正打到一半。',
    options: [
      { id: 'clinic', label: '立刻就醫，該停就停', odds: 80, gain: 1, loss: 0.5, traits: false, main: true },
      { id: 'tape', label: '貼個貼布，訓練量減半', odds: 52, gain: 1, loss: 1 },
      { id: 'push', label: '忍著打完，賽季不能停', odds: 32, gain: 2.4, loss: 1.8 },
    ],
    good: { text: '手腕檢查無礙，虛驚一場，粉絲鬆了一口氣', ability: { sta: 1 } },
    bad:  { text: '手腕痠痛發炎，被醫生下了兩週禁練令，只能看隊友在峽谷開秀', ability: { ref: -2 }, flags: { injuryRisk: 6 } } },

  { id: 'midnight_snack', name: '宵夜誘惑', kind: 'indulgent',
    prompt: '隊友點了一整桌鹹酥雞跟珍奶，味道飄滿整個訓練室。已經三點了。',
    options: [
      { id: 'refuse', label: '一口都不碰，回房睡覺', odds: 68, gain: 1, loss: 1, main: true },
      { id: 'sip', label: '喝口無糖茶陪坐一下', odds: 78, gain: 0.5, loss: 0.5, traits: false },
      { id: 'feast', label: '一起吃，難得放鬆', odds: 26, gain: 2.2, loss: 1.3 },
    ],
    good: { text: '狠拒宵夜誘惑，體態維持住，自律人設沒崩', ability: { sta: 1 } },
    bad:  { text: '連吃一週宵夜，體重跟反應一起變慢', ability: { sta: -2, ref: -1 } } },

  { id: 'nightlife', name: '夜生活邀約', kind: 'indulgent',
    prompt: '朋友揪你去續攤，說難得放假，去一次又不會死。',
    options: [
      { id: 'decline', label: '婉拒，照常十二點睡', odds: 70, gain: 1, loss: 1, main: true },
      { id: 'brief', label: '露個臉，十一點前閃人', odds: 78, gain: 0.5, loss: 0.5, traits: false },
      { id: 'party', label: '玩到最後一攤', odds: 24, gain: 2.2, loss: 1.3 },
    ],
    good: { text: '婉拒局邀，早睡保狀態，被笑是老人作息', ability: { sta: 1 } },
    bad:  { text: '玩到太陽升起，隔天訓練整個靈魂出竅', ability: { ref: -2, sta: -1 } } },

  { id: 'streaming', name: '直播放縱', kind: 'indulgent',
    prompt: '你的實況台開始有人看了，斗內也進來了。但開台的時間，就是不能練的時間。',
    options: [
      { id: 'schedule', label: '排固定時段，練完才開', odds: 66, gain: 1, loss: 1, main: true },
      { id: 'hype', label: '衝一波流量，人氣先做起來', odds: 40, gain: 1.8, loss: 1.3, flags: { popular: true } },
      { id: 'close', label: '暫時關台，專心打比賽', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '開台時間控制得宜，人氣穩定成長，斗內刷不停', ability: { sta: 1 }, flags: { popular: true } },
    bad:  { text: '開台開到走火入魔，訓練量下滑，聊天室笑你職業兼 YouTuber', ability: { op: -2, ref: -1 } } },

  { id: 'interview', name: '媒體專訪', kind: 'normal',
    prompt: '媒體約專訪，問題單先寄過來了，裡面有一題是「你怎麼看對手」。',
    options: [
      { id: 'safe', label: '照公關稿回答，穩穩過關', odds: 78, gain: 0.5, loss: 0.5, traits: false },
      { id: 'honest', label: '講真話，該嗆就嗆', odds: 42, gain: 2.2, loss: 1.3 },
      { id: 'prep', label: '跟隊經理對過稿再上', odds: 58, gain: 1, loss: 1, main: true },
    ],
    good: { text: '專訪應對得體，贊助商主動來敲門', ability: { sta: 1 }, flags: { popular: true, bonusSalary: 40 } },
    bad:  { text: '受訪一句話被做成梗圖，全網開鞭，狀態受影響', ability: { op: -1, sta: -1 } } },

  { id: 'coaching', name: '教練團指導', kind: 'normal',
    prompt: '教練把你單獨留下來，攤開一整份你的失誤剪輯，說有些東西要從頭改。',
    options: [
      { id: 'obey', label: '全盤照做，砍掉重練', odds: 50, gain: 2.2, loss: 1.3 },
      { id: 'discuss', label: '一條一條跟教練辯到懂', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'keep', label: '謝謝指教，但保留自己的打法', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '教練點破你的戰術盲點，理解直接突破', ability: { macro: 2 }, flags: { macroPoint: true } },
    bad:  { text: '被教練盯上缺點，一直逼你改，改到不會玩', ability: { macro: -2 } } },

  { id: 'mentor', name: '老將指點', kind: 'normal',
    prompt: '隊上那位打過最多年的老將，主動說要跟你聊聊。他的打法跟你完全不同路。',
    options: [
      { id: 'copy', label: '整套學起來，先照抄再說', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'blend', label: '挑能用的融進自己的節奏', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'listen', label: '聽聽就好，路還是自己走', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '老將一句話點醒你，大局觀直接飛躍', ability: { macro: 2, vis: 1 } },
    bad:  { text: '學了不適合自己的套路，繞了一大圈遠路', ability: { macro: -2 } } },

  { id: 'romance', name: '單身誘惑', kind: 'romance',
    prompt: '有人在等你的答覆。你很清楚接下來幾年會有多忙。',
    options: [
      { id: 'refuse', label: '婉拒，把青春全押在峽谷', odds: 76, gain: 1, loss: 1, main: true },
      { id: 'slow', label: '先當朋友，慢慢再說', odds: 52, gain: 1.5, loss: 0.8 },
      { id: 'accept', label: '答應，人生不是只有排位', odds: 20, gain: 2, loss: 1 },
    ],
    good: { text: '拒絕告白，把青春全押在召喚峽谷，專注度爆表', ability: { op: 1 } },
    bad:  { text: '談起戀愛，心思全被分散，團戰各種走神', ability: { ref: -1, op: -1 }, flags: { romance: true } } },

  { id: 'endorsement', name: '代言邀約', kind: 'normal',
    prompt: '廠商開了一份代言合約，數字很漂亮，但通告表塞滿了整個休賽期。',
    options: [
      { id: 'sign', label: '全接，錢跟名氣都要', odds: 38, gain: 2.2, loss: 1.3 },
      { id: 'trim', label: '只接不影響訓練的檔期', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'reject', label: '推掉，這季只想打球', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '代言商演安排得宜，名氣跟收入一起起飛', ability: { sta: 1 }, flags: { popular: true, bonusSalary: 120 } },
    bad:  { text: '代言通告排太滿，訓練量直接歸零，被嘴「廣告選手」', ability: { op: -2, sta: -1 } } },

  { id: 'slump', name: '季中低潮', kind: 'normal',
    prompt: '連續幾週怎麼打都不對，鏡頭掃到你的臉，論壇已經在喊換人了。',
    options: [
      { id: 'fight', label: '硬扛，加練到打回來為止', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'reset', label: '請幾天假，把腦袋清空', odds: 58, gain: 1, loss: 1, main: true },
      { id: 'bench', label: '主動要求輪替，先坐板凳', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '靠自己把低潮挺過去，心態反而更穩了', ability: { macro: 1, sta: 1 }, flags: { composure: true } },
    bad:  { text: '季中低潮拖了一個月，狀態一路探底', ability: { op: -2, ref: -1, sta: -1 }, flags: { tiltRisk: true } } },

  { id: 'vod_review', name: '錄像檢討', kind: 'normal',
    prompt: '下週對上的那個對手，你手上有他整季的錄影。看，還是不看？',
    options: [
      { id: 'deep', label: '整季全看完，習慣抓到死', odds: 48, gain: 2.2, loss: 1.3 },
      { id: 'key', label: '只看關鍵局的對線段', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'skip', label: '不看，打自己的節奏就好', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '把對手 VOD 看到吐，摸透習慣，單殺率直線上升', ability: { lane: 2 }, flags: { laneking: true } },
    bad:  { text: '檢討過頭，場上越想越多，反而畏首畏尾', ability: { lane: -2 } } },

  { id: 'roster_drama', name: '隊內矛盾', kind: 'normal',
    prompt: '訓練賽輸完，更衣室安靜得可怕。有人開始在群組裡陰陽怪氣。',
    options: [
      { id: 'confront', label: '當面把話攤開講清楚', odds: 48, gain: 2.2, loss: 1.3 },
      { id: 'mediate', label: '私下一個一個約出來談', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'avoid', label: '不介入，交給教練處理', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你主動把話攤開講，更衣室氣氛重新凝聚', ability: { macro: 1 }, flags: { leader: true } },
    bad:  { text: '隊內宮鬥劇開演，訓練賽都在互相甩鍋', ability: { tf: -2 }, flags: { mateMorale: -2 } } },

  { id: 'boot_camp', name: '海外集訓', kind: 'normal',
    prompt: '隊伍安排了一趟海外集訓，對手全是完全不同體系的隊。時差七小時。',
    options: [
      { id: 'immerse', label: '每天約滿訓練賽，睡覺再說', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'adapt', label: '先調時差，再照表操課', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'light', label: '把它當調整期，練少一點', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '海外集訓遇上完全不同的打法，視野整個被打開', ability: { macro: 1, vis: 2, tf: 1 } },
    bad:  { text: '時差沒調過來，集訓整趟都在昏睡，峽谷團練全變夢遊', ability: { sta: -2, ref: -1 } } },
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
