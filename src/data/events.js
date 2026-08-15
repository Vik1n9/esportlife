/**
 * 事件卡庫。
 *
 * 每張卡有 good / bad 兩個結果，但**由玩家決定要用哪種方式面對**——
 * 舊版是引擎背著玩家擲一次 50/50 就把結果貼出來，玩家除了訓練加點與合約
 * 之外完全沒有介入餘地，事件等於是純敘事的裝飾。現在每張卡先描述處境
 * （`prompt`），再讓玩家從 `options` 裡選一條路，選項本身決定成功率與幅度。
 *
 * 結果欄位：
 * - `attr`：直接加減六大屬性（會依選項的 gain / loss 倍率縮放）。事件動的是屬性，
 *           不是技能——技能是導出值，沒有地方可以「直接加」。一張卡動 AWR，玩家會
 *           在大局觀、視野、遊走三條技能上同時看到變化，這正是兩層制想要的效果。
 * - `flags`：交給引擎解讀的副作用，避免資料層混進邏輯。
 *
 * 選項欄位：
 * - `odds`   命中 good 的百分比（`天才操作`／`神之手` 另外 +20）。
 * - `gain`   命中 good 時的數值倍率（預設 1）。
 * - `loss`   落到 bad 時的數值倍率（預設 1）。
 * - `traits` 設 false 表示「這條路不碰隱藏素質」——好的壞的都不會覺醒，
 *            也不推進自律計數。安全牌的代價就是它不會把你推向任何極端。
 * - `flags`  不論成敗都會生效的副作用（目前只有直播衝人氣用到）。
 * - `on`     這個選項自己的 good/bad 結果。當選項的行動跟卡片主軸相反時
 *            （例如「關台／休息／不看」），套卡片的通用結果會牛頭不對馬嘴，
 *            就在選項上寫自己的結果；沒寫就沿用卡片的通用結果。
 *
 * 選項的 note（成功率、幅度、是否影響素質）由引擎統一生成，
 * 資料層不寫死文案，才不會跟數值對不上。
 *
 * kind：
 * - `indulgent` 享樂類 → 好結果推進「自律」計數（連續 3 次解鎖）。
 * - `romance`   感情類 → 好結果推進「單身」計數。
 * - `patch`     版本類 → 好結果直接降低版本落差（舊版寫反了，好結果反而加重懲罰）。
 *
 * S17 補的觸發欄位（V4 §12.1／§12.2，引擎在 `engine/eventTrigger.js`）：
 * - `pool`  分類池（§12.2 四池：persona／performance／psych／career，可複數）。
 *           不產特質的池（psych／career）也要標——§0.5 池化管理要算覆蓋率。
 * - `sub`   池內子標籤（§12.2 子標籤表）。
 * - `slot`  時段標籤（§12.2，可複數）。不匹配當下時段的卡連候選池都進不去。
 *           業餘／青訓只取該階段的標籤；職業卡若場景只在職業成立（媒體、代言、
 *           海外集訓、比賽語境），不要標業餘標籤，否則月回合會在業餘期抽到
 *           職業休息室的卡（v4.2 要修的那個 bug）。
 * - `excl`  互斥群組。同一回合的兩張卡不得同組（§12.1 第二張互斥檢查）。
 *           `solo_<id>` 表示自成一格、與任何卡都不互斥。
 * - `when`  觸發條件（條件卡），沒寫＝隨機池成員。形狀見 `engine/eventTrigger.js`
 *           的 `whenHits`。S17 的 26 張卡都還沒寫條件，S18 內容站開始填。
 */
export const EVENT_CARDS = [
  { id: 'solo_queue', name: '排位衝分', kind: 'normal', pool: ['performance'], sub: 'training', slot: ['amateur', 'am2', 'regular', 'offseason'], excl: 'solo_solo_queue',
    prompt: '凌晨兩點，訓練室只剩你這台還亮著。分數卡在門檻前一步，再一把就上得去——也可能一路掉回去。',
    options: [
      { id: 'grind', label: '衝到天亮，不上分不睡', odds: 45, gain: 2.2, loss: 1.3 },
      { id: 'balanced', label: '再打三把就收', odds: 55, gain: 1, loss: 1, main: true },
      { id: 'stop', label: '關機睡覺，手感明天再說', odds: 78, gain: 0.5, loss: 0.5, traits: false,
        on: {
          good: { text: '你決定關機，隔天睡飽精神滿格，狀態比硬撐好太多', attr: { vit: 1, dec: 1 } },
          bad: { text: '躺下還在腦補那場連敗，翻來覆去更累，隔天狀態反而更差', attr: { vit: -1, tec: -1 } },
        } },
    ],
    good: { text: '手感發燙，RK 一波連勝直衝宗師，彈幕刷爆「666」', attr: { tec: 2 } },
    bad:  { text: '排位連敗掉分，隊友 0/10/0 開送，越打越上頭', attr: { tec: -1, dec: -1 } } },

  { id: 'scrim', name: '訓練賽加練', kind: 'normal', pool: ['performance'], sub: 'training', slot: ['amateur', 'am2', 'regular', 'offseason'], excl: 'training',
    prompt: '團練結束，幾個隊友還想再開一輪對線練習。時間已經很晚了。',
    options: [
      { id: 'allin', label: '留下來加練到收工', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'focus', label: '只練自己最弱的那條線', odds: 58, gain: 1, loss: 1, main: true },
      { id: 'rest', label: '回宿舍休息，保住明天狀態', odds: 78, gain: 0.5, loss: 0.5, traits: false,
        on: {
          good: { text: '好好休息一宿，隔天團練眼睛發亮，狀態滿檔歸隊', attr: { vit: 1 } },
          bad: { text: '休息一晚手感冷掉，隔天上場跟不上隊友節奏', attr: { agi: -1, tec: -1 } },
        } },
    ],
    good: { text: '跟頂尖隊友加練對線，細節大開竅，教練忍不住點頭', attr: { tec: 1, agi: 1 } },
    bad:  { text: '加練到半夜，反應遲鈍，隔天團練被當人機打', attr: { agi: -2 } } },

  { id: 'patch_study', name: '版本補習', kind: 'patch', pool: ['performance'], sub: 'training', slot: ['amateur', 'am2', 'regular', 'offseason'], excl: 'solo_patch_study',
    prompt: '新版本上線，patch note 落落長。有人整晚在啃更新日誌，也有人直接進去打了再說。',
    options: [
      { id: 'study', label: '逐條讀完，開自訂房實測數值', odds: 55, gain: 2.2, loss: 1.3 },
      { id: 'ask', label: '問教練跟隊友的結論就好', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'feel', label: '直接進排位，打到有感覺為止', odds: 62, gain: 1, loss: 1, traits: false },
    ],
    good: { text: '把 patch note 嗑到熟，新 Meta 拿捏得死死的，人人喊你「版本答案」', attr: { awr: 2 }, flags: { patchDebt: -2 } },
    bad:  { text: '版本理解跟不上，還停在上一季，被酸「版本逆子」', attr: { awr: -1 }, flags: { patchDebt: 1 } } },

  { id: 'wrist', name: '手腕不適', kind: 'normal', pool: ['performance'], sub: 'body', slot: ['amateur', 'am2', 'regular', 'offseason'], excl: 'solo_wrist',
    prompt: '右手腕從上週就開始悶痛，握滑鼠久了會麻。賽季正打到一半。',
    options: [
      { id: 'clinic', label: '立刻就醫，該停就停', odds: 80, gain: 1, loss: 0.5, traits: false, main: true },
      { id: 'tape', label: '貼個貼布，訓練量減半', odds: 52, gain: 1, loss: 1 },
      { id: 'push', label: '忍著打完，賽季不能停', odds: 32, gain: 2.4, loss: 1.8 },
    ],
    good: { text: '手腕檢查無礙，虛驚一場，粉絲鬆了一口氣', attr: { vit: 1 } },
    bad:  { text: '手腕痠痛發炎，被醫生下了兩週禁練令，只能看隊友在峽谷開秀', attr: { vit: -2 }, flags: { injuryRisk: 6 } } },

  { id: 'midnight_snack', name: '宵夜誘惑', kind: 'indulgent', pool: ['persona'], sub: 'life', slot: ['amateur', 'am2', 'regular', 'offseason'], excl: 'indulge',
    prompt: '隊友點了一整桌鹹酥雞跟珍奶，味道飄滿整個訓練室。已經三點了。',
    options: [
      { id: 'refuse', label: '一口都不碰，回房睡覺', odds: 68, gain: 1, loss: 1, main: true },
      { id: 'sip', label: '喝口無糖茶陪坐一下', odds: 78, gain: 0.5, loss: 0.5, traits: false },
      { id: 'feast', label: '一起吃，難得放鬆', odds: 26, gain: 2.2, loss: 1.3 },
    ],
    good: { text: '狠拒宵夜誘惑，體態維持住，自律人設沒崩', attr: { vit: 1 } },
    bad:  { text: '連吃一週宵夜，體重跟反應一起變慢', attr: { vit: -2, agi: -1 } } },

  { id: 'nightlife', name: '夜生活邀約', kind: 'indulgent', pool: ['persona'], sub: 'life', slot: ['amateur', 'am2', 'regular', 'offseason'], excl: 'indulge',
    prompt: '朋友揪你去續攤，說難得放假，去一次又不會死。',
    options: [
      { id: 'decline', label: '婉拒，照常十二點睡', odds: 70, gain: 1, loss: 1, main: true },
      { id: 'brief', label: '露個臉，十一點前閃人', odds: 78, gain: 0.5, loss: 0.5, traits: false },
      { id: 'party', label: '玩到最後一攤', odds: 24, gain: 2.2, loss: 1.3 },
    ],
    good: { text: '婉拒局邀，早睡保狀態，被笑是老人作息', attr: { vit: 1 } },
    bad:  { text: '玩到太陽升起，隔天訓練整個靈魂出竅', attr: { agi: -2, vit: -1 } } },

  { id: 'streaming', name: '直播放縱', kind: 'indulgent', pool: ['persona'], sub: 'media', slot: ['amateur', 'am2', 'regular', 'offseason'], excl: 'indulge',
    prompt: '你的實況台開始有人看了，斗內也進來了。但開台的時間，就是不能練的時間。',
    options: [
      { id: 'schedule', label: '排固定時段，練完才開', odds: 66, gain: 1, loss: 1, main: true },
      { id: 'hype', label: '衝一波流量，人氣先做起來', odds: 40, gain: 1.8, loss: 1.3, flags: { popular: true } },
      { id: 'close', label: '暫時關台，專心打比賽', odds: 78, gain: 0.5, loss: 0.5, traits: false,
        on: {
          good: { text: '你關台閉關，手感與專注度一起回升，粉絲在聊天室刷「等你回歸」', attr: { tec: 1, vit: 1 } },
          bad: { text: '關台期間錯過一波爆紅引流，人氣停在原地，開台數據也涼了', attr: { dec: -1 } },
        } },
    ],
    good: { text: '開台時間控制得宜，人氣穩定成長，斗內刷不停', attr: { vit: 1 }, flags: { popular: true } },
    bad:  { text: '開台開到走火入魔，訓練量下滑，聊天室笑你職業兼 YouTuber', attr: { tec: -2, agi: -1 } } },

  { id: 'interview', name: '媒體專訪', kind: 'normal', pool: ['persona'], sub: 'media', slot: ['regular', 'offseason'], excl: 'media',
    prompt: '媒體約專訪，問題單先寄過來了，裡面有一題是「你怎麼看對手」。',
    options: [
      { id: 'safe', label: '照公關稿回答，穩穩過關', odds: 78, gain: 0.5, loss: 0.5, traits: false },
      { id: 'honest', label: '講真話，該嗆就嗆', odds: 42, gain: 2.2, loss: 1.3 },
      { id: 'prep', label: '跟隊經理對過稿再上', odds: 58, gain: 1, loss: 1, main: true },
    ],
    good: { text: '專訪應對得體，贊助商主動來敲門', attr: { syn: 1 }, flags: { popular: true, bonusSalary: 40 } },
    bad:  { text: '受訪一句話被做成梗圖，全網開鞭，狀態受影響', attr: { dec: -1, vit: -1 } } },

  { id: 'coaching', name: '教練團指導', kind: 'normal', pool: ['performance'], sub: 'training', slot: ['amateur', 'am2', 'regular'], excl: 'training',
    prompt: '教練把你單獨留下來，攤開一整份你的失誤剪輯，說有些東西要從頭改。',
    options: [
      { id: 'obey', label: '全盤照做，砍掉重練', odds: 50, gain: 2.2, loss: 1.3 },
      { id: 'discuss', label: '一條一條跟教練辯到懂', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'keep', label: '謝謝指教，但保留自己的打法', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '教練點破你的戰術盲點，理解直接突破', attr: { awr: 2 }, flags: { macroPoint: true } },
    bad:  { text: '被教練盯上缺點，一直逼你改，改到不會玩', attr: { awr: -1, dec: -1 } } },

  { id: 'mentor', name: '老將指點', kind: 'normal', pool: ['performance'], sub: 'training', slot: ['amateur', 'am2', 'regular'], excl: 'training',
    prompt: '隊上那位打過最多年的老將，主動說要跟你聊聊。他的打法跟你完全不同路。',
    options: [
      { id: 'copy', label: '整套學起來，先照抄再說', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'blend', label: '挑能用的融進自己的節奏', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'listen', label: '聽聽就好，路還是自己走', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '老將一句話點醒你，大局觀直接飛躍', attr: { awr: 2, dec: 1 } },
    bad:  { text: '學了不適合自己的套路，繞了一大圈遠路', attr: { awr: -2 } } },

  { id: 'romance', name: '單身誘惑', kind: 'romance', pool: ['persona'], sub: 'life', slot: ['amateur', 'am2', 'regular', 'offseason'], excl: 'solo_romance',
    prompt: '有人在等你的答覆。你很清楚接下來幾年會有多忙。',
    options: [
      { id: 'refuse', label: '婉拒，把青春全押在峽谷', odds: 76, gain: 1, loss: 1, main: true },
      { id: 'slow', label: '先當朋友，慢慢再說', odds: 52, gain: 1.5, loss: 0.8 },
      { id: 'accept', label: '答應，人生不是只有排位', odds: 20, gain: 2, loss: 1 },
    ],
    good: { text: '拒絕告白，把青春全押在召喚峽谷，專注度爆表', attr: { dec: 1 } },
    bad:  { text: '談起戀愛，心思全被分散，團戰各種走神', attr: { awr: -1, tec: -1 }, flags: { romance: true } } },

  { id: 'endorsement', name: '代言邀約', kind: 'normal', pool: ['persona'], sub: 'media', slot: ['regular', 'offseason'], excl: 'media',
    prompt: '廠商開了一份代言合約，數字很漂亮，但通告表塞滿了整個休賽期。',
    options: [
      { id: 'sign', label: '全接，錢跟名氣都要', odds: 38, gain: 2.2, loss: 1.3 },
      { id: 'trim', label: '只接不影響訓練的檔期', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'reject', label: '推掉，這季只想專注比賽', odds: 78, gain: 0.5, loss: 0.5, traits: false,
        on: {
          good: { text: '推掉代言專注比賽，訓練量全開，賽場狀態拉滿', attr: { tec: 1, vit: 1 } },
          bad: { text: '推掉代言，廠商合作告吹，還被笑「放著白花花的錢不賺」', attr: { syn: -1 } },
        } },
    ],
    good: { text: '代言商演安排得宜，名氣跟收入一起起飛', attr: { vit: 1 }, flags: { popular: true, bonusSalary: 120 } },
    bad:  { text: '代言通告排太滿，訓練量直接歸零，被嘴「廣告選手」', attr: { tec: -2, vit: -1 } } },

  { id: 'slump', name: '季中低潮', kind: 'normal', pool: ['psych'], sub: 'pressure', slot: ['amateur', 'am2', 'regular'], excl: 'solo_slump',
    prompt: '連續幾週怎麼打都不對，鏡頭掃到你的臉，論壇已經在喊換人了。',
    options: [
      { id: 'fight', label: '硬扛，加練到打回來為止', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'reset', label: '請幾天假，把腦袋清空', odds: 58, gain: 1, loss: 1, main: true },
      { id: 'bench', label: '主動要求輪替，先坐板凳', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '靠自己把低潮挺過去，心態反而更穩了', attr: { dec: 1, vit: 1 }, flags: { composure: true } },
    bad:  { text: '季中低潮拖了一個月，狀態一路探底', attr: { tec: -2, agi: -1, vit: -1 }, flags: { tiltRisk: true } } },

  { id: 'vod_review', name: '錄像檢討', kind: 'normal', pool: ['performance'], sub: 'training', slot: ['amateur', 'am2', 'regular', 'offseason'], excl: 'training',
    prompt: '下週對上的那個對手，你手上有他整季的錄影。看，還是不看？',
    options: [
      { id: 'deep', label: '整季全看完，習慣抓到死', odds: 48, gain: 2.2, loss: 1.3 },
      { id: 'key', label: '只看關鍵局的對線段', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'skip', label: '不看，打自己的節奏就好', odds: 78, gain: 0.5, loss: 0.5, traits: false,
        on: {
          good: { text: '不糾結對手的研究，打自己的節奏，自信拉滿反倒壓制對面', attr: { dec: 1 } },
          bad: { text: '沒做足功課，對上後被對手的習慣套路打得措手不及', attr: { awr: -1, tec: -1 } },
        } },
    ],
    good: { text: '把對手 VOD 看到吐，摸透習慣，單殺率直線上升', attr: { awr: 1, tec: 1 }, flags: { laneking: true } },
    bad:  { text: '檢討過頭，場上越想越多，反而畏首畏尾', attr: { dec: -2 } } },

  { id: 'roster_drama', name: '隊內矛盾', kind: 'normal', pool: ['career'], sub: 'crisis', slot: ['amateur', 'am2', 'regular'], excl: 'team',
    prompt: '訓練賽輸完，休息室安靜得可怕。有人開始在群組裡陰陽怪氣。',
    options: [
      { id: 'confront', label: '當面把話攤開講清楚', odds: 48, gain: 2.2, loss: 1.3 },
      { id: 'mediate', label: '私下一個一個約出來談', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'avoid', label: '不介入，交給教練處理', odds: 78, gain: 0.5, loss: 0.5, traits: false,
        on: {
          good: { text: '你沒捲進矛盾，專注自己的訓練，衝突被教練消化掉了', attr: { vit: 1 } },
          bad: { text: '你選擇不介入，休息室氣氛更僵，訓練賽都在互相甩鍋', attr: { syn: -1 }, flags: { mateMorale: -2 } },
        } },
    ],
    good: { text: '你主動把話攤開講，休息室氣氛重新凝聚', attr: { syn: 1 }, flags: { leader: true } },
    bad:  { text: '隊內宮鬥劇開演，訓練賽都在互相甩鍋', attr: { syn: -2 }, flags: { mateMorale: -2 } } },

  { id: 'boot_camp', name: '海外集訓', kind: 'normal', pool: ['performance'], sub: 'training', slot: ['regular'], excl: 'solo_boot_camp',
    prompt: '隊伍安排了一趟海外集訓，對手全是完全不同體系的隊。時差七小時。',
    options: [
      { id: 'immerse', label: '每天約滿訓練賽，睡覺再說', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'adapt', label: '先調時差，再照表操課', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'light', label: '把它當調整期，練少一點', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '海外集訓遇上完全不同的打法，視野整個被打開', attr: { awr: 2, syn: 1, dec: 1 } },
    bad:  { text: '時差沒調過來，集訓整趟都在昏睡，峽谷團練全變夢遊', attr: { vit: -2, agi: -1 } } },

  { id: 'all_nighter', name: '通宵練功', kind: 'normal', pool: ['performance'], sub: 'training', slot: ['amateur', 'am2', 'regular', 'offseason'], excl: 'training',
    prompt: '版本大改，你要練的東西排到滿出來。有人笑你「練到變人形外掛」，但你很清楚身體不是鐵打的。',
    options: [
      { id: 'push', label: '練到天亮，進度一次到位', odds: 42, gain: 2.2, loss: 1.3 },
      { id: 'pace', label: '照表操課，穩穩按進度走', odds: 58, gain: 1, loss: 1, main: true },
      { id: 'rest', label: '先睡，明天再繼續', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '整夜泡在自訂房，版本細節摸得透透的，被喊「人形外掛」', attr: { tec: 2 }, flags: { grinder: true } },
    bad:  { text: '練到靈魂出竅，隔天團練反應全沒，教練唸到爆', attr: { agi: -2, vit: -1 } } },

  { id: 'clip_meme', name: '梗圖爆紅', kind: 'normal', pool: ['persona'], sub: 'media', slot: ['amateur', 'am2', 'regular'], excl: 'media',
    prompt: '你昨天那波「開秀」被剪成短片，梗圖跟「○○傳奇」的標題刷滿全網。流量來了，斷章取義也來了。',
    options: [
      { id: 'ride', label: '順勢玩梗，流量全吃', odds: 42, gain: 2.2, loss: 1.3 },
      { id: 'calm', label: '回應得體，不跟著起舞', odds: 58, gain: 1, loss: 1, main: true },
      { id: 'lie', label: '低調不回應，讓它自己退燒', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你帶頭玩自己的梗，全網跟風，人氣一波起飛', attr: { syn: 1 }, flags: { meme: true, popular: true } },
    bad:  { text: '梗越玩越歪，被解讀成自大，風向回頭咬你', attr: { dec: -1, vit: -1 } } },

  { id: 'stream_debut', name: '開台首播', kind: 'normal', pool: ['persona'], sub: 'media', slot: ['amateur', 'am2', 'regular', 'offseason'], excl: 'media',
    prompt: '戰隊幫你開一場首播，聊天室刷得飛快，斗內跟毒舌一起來。開台容易，收台難。',
    options: [
      { id: 'slot', label: '固定時段，練完才開', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'max', label: '衝一波熱度，時數開滿', odds: 40, gain: 2, loss: 1.3 },
      { id: 'rarely', label: '少開，鏡頭留給比賽', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '首播口碑爆棚，廠商隔天就來敲門談合作', attr: { vit: 1 }, flags: { camera: true, popular: true } },
    bad:  { text: '開台開到作息崩掉，訓練狀態一路直落', attr: { tec: -2, vit: -1 } } },

  { id: 'fan_meet', name: '粉絲見面會', kind: 'normal', pool: ['persona'], sub: 'media', slot: ['regular', 'offseason'], excl: 'media',
    prompt: '簽名會排了一長串，有個小粉絲舉著你的名牌說「是你讓我開始打 LOL」。簽到一半，主辦說時間不夠了。',
    options: [
      { id: 'all', label: '全簽完，簽到最後一個', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'key', label: '挑重點聊，控制時間', odds: 58, gain: 1, loss: 1, main: true },
      { id: 'exit', label: '準時結束，練習比較重要', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你簽到最後一個，小粉絲當場哭了，畫面被瘋傳', attr: { syn: 1, vit: 1 }, flags: { popular: true } },
    bad:  { text: '簽到手抽筋還誤了訓練，隔天被教練唸了一頓', attr: { vit: -1, awr: -1 } } },

  { id: 'teammate_blame', name: '隊友甩鍋', kind: 'normal', pool: ['career'], sub: 'team', slot: ['amateur', 'am2', 'regular'], excl: 'team',
    prompt: '團練輸了，語音裡互相甩鍋，最後矛頭指向新來的練習生。他眼眶都紅了。',
    options: [
      { id: 'take', label: '出來扛責任，把火引到自己身上', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'comfort', label: '私下安慰，再幫他調節奏', odds: 58, gain: 1, loss: 1, main: true },
      { id: 'away', label: '不關我的事，練自己的', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你把鍋扛下來，休息室瞬間安靜，練習生把你當大哥', attr: { syn: 1 }, flags: { guardian: true, leader: true } },
    bad:  { text: '你出來扛被隊友酸「假好人」，隊內氣氛更僵', attr: { syn: -2 }, flags: { mateMorale: -2 } } },

  { id: 'flash_steal', name: '極限搶龍', kind: 'normal', pool: ['performance'], sub: 'match', slot: ['regular'], excl: 'match',
    prompt: '比賽尾聲，對面在打巴龍，全隊只剩你能上前搶。隊友把寶全押在你這一下。',
    options: [
      { id: 'go', label: '閃現進場，秒懲戒搶龍', odds: 40, gain: 2.2, loss: 1.3 },
      { id: 'safe', label: '穩著打，拖到對面失誤', odds: 58, gain: 1, loss: 1, main: true },
      { id: 'back', label: '保命要緊，下波再找機會', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你閃現進場秒懲戒搶下巴龍，全場暴動，賽評喊破喉嚨', attr: { dec: 1, agi: 1 }, flags: { clutch: true } },
    bad:  { text: '搶龍失敗全隊陪葬，賽後被「打野差距」刷屏', attr: { dec: -2 } } },

  { id: 'enemy_taunt', name: '賽前互嗆', kind: 'normal', pool: ['persona'], sub: 'media', slot: ['regular'], excl: 'media',
    prompt: '對手在採訪裡放話「今年會把你們打回原形」，底下留言一片揶揄。鏡頭轉到你，等你接招。',
    options: [
      { id: 'clap', label: '火力全開回嗆', odds: 42, gain: 2.2, loss: 1.3 },
      { id: 'polite', label: '官腔帶過，不上鉤', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'mute', label: '沉默是金，不回應', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你一句「打過才知道」直接圈粉，賽前氣勢拉滿', attr: { syn: 1, dec: 1 }, flags: { trashtalk: true } },
    bad:  { text: '回嗆被剪成音檔，比賽又輸了，反噬比話還快', attr: { dec: -2, vit: -1 } } },

  { id: 'champion_ban', name: '招牌被Ban', kind: 'normal', pool: ['performance'], sub: 'match', slot: ['regular'], excl: 'match',
    prompt: '賽前 BP，對面連 Ban 你兩隻招牌角，明顯有備而來。教練問你第三隻選什麼。',
    options: [
      { id: 'secret', label: '掏出秘密武器打他措手不及', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'solid', label: '選隻穩的，靠版本理解', odds: 58, gain: 1, loss: 1, main: true },
      { id: 'coach', label: '讓教練全權決定', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你掏出藏了很久的版本答案，對面直接傻眼', attr: { awr: 2 }, flags: { meta: true } },
    bad:  { text: '秘密武器被看穿，整場被當靶子打，賽後「BP 背鍋」', attr: { tec: -2 } } },

  { id: 'presser_quote', name: '賽後金句', kind: 'normal', pool: ['persona'], sub: 'media', slot: ['regular'], excl: 'media',
    prompt: '賽後記者會，記者問「你覺得為什麼能贏」。你腦中閃過一句能上頭條的話，但說出口可能被做成梗。',
    options: [
      { id: 'quote', label: '爆金句，標題我來定', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'plain', label: '官腔回答，穩穩過關', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'humble', label: '謙虛推給團隊', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '金句登上各大標題，廣告商跟流量一起上門', attr: { syn: 1 }, flags: { meme: true, popular: true } },
    bad:  { text: '一句話被斷章取義，黑粉帶著梗圖湧入', attr: { dec: -1, vit: -1 } } },

  { id: 'baited', name: '被釣魚', kind: 'normal', pool: ['persona'], sub: 'media', slot: ['amateur', 'am2', 'regular', 'offseason'], excl: 'media',
    prompt: '直播時聊天室刷滿「你肯定打不過對面中路」，越刷越兇。你很清楚這是釣魚，但火就是壓不住。',
    options: [
      { id: 'ignore', label: '無視，專心打自己的', odds: 64, gain: 1, loss: 1, main: true },
      { id: 'clap', label: '剛一波，當場回嗆', odds: 42, gain: 2, loss: 1.3 },
      { id: 'hidect', label: '關聊天室，眼不見為淨', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你穩住沒上鉤，彈幕反而佩服你心態夠硬', attr: { dec: 1 }, flags: { composure: true } },
    bad:  { text: '你上鉤開噴，整段被剪成「心態炸裂」傳全網', attr: { dec: -1, vit: -1 }, flags: { tiltRisk: true } } },

  /* ================= S18 第一批（20 張，v4.3.1） ================= */
  /* 死配方觸發卡：genius／clutch／intlghost／underdog（S19a 交接筆記第三節清單）。
   * 四張都是隨機池卡（無 when）——靠 availableEvents 的耗盡機制，解鎖後不再抽到。 */

  { id: 'genius_flash', name: '天才操作', kind: 'normal', pool: ['performance'], sub: 'match', slot: ['regular'], excl: 'match',
    prompt: '對面五個人追你一個人，你技能全在，血量不到三成。鏡頭特寫你，全場等你一個決定。',
    options: [
      { id: 'dare', label: '回身一秀三，這波就是我的', odds: 38, gain: 2.2, loss: 1.3 },
      { id: 'kite', label: '極限拉扯，能拖一秒是一秒', odds: 58, gain: 1, loss: 1, main: true },
      { id: 'safe', label: '交閃保全，命比帥重要', odds: 78, gain: 0.5, loss: 0.5, traits: false,
        on: {
          good: { text: '你交閃拉開，隊友順勢反包，沒秀到但賺到了', attr: { vit: 1 } },
          bad: { text: '你交閃退場，彈幕刷「慫了」，士氣小受打擊', attr: { dec: -1 } },
        } },
    ],
    good: { text: '你回身秒兩隻再反殺第三隻，賽評吼到破音，這波剪輯傳全網', attr: { tec: 2, agi: 1 }, mental: { conf: 2 }, flags: { genius: true } },
    bad:  { text: '你操作變形一秀三失敗，白送人頭，賽後被剪成「下飯集錦」', attr: { tec: -2 }, mental: { conf: -2 } } },

  { id: 'clutch_series', name: '關鍵系列賽', kind: 'normal', pool: ['performance'], sub: 'match', slot: ['regular'], excl: 'match',
    prompt: 'BO5 打到了第五場，教練把最後一選交到你手上。贏了晉級，輸了放假。',
    options: [
      { id: 'carry', label: '選自己最熟的，來一場硬仗', odds: 42, gain: 2.2, loss: 1.3 },
      { id: 'team', label: '選補團隊的，讓陣容更完整', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'defer', label: '交給教練決定，我聽指令', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '第五場你打出超水準表現，關鍵團戰全勝，賽後被封「大場面選手」', attr: { dec: 2 }, mental: { comp: 2 }, flags: { clutch: true } },
    bad:  { text: '第五場你手抖失誤連連，隊伍止步季後賽，自責到失眠', attr: { dec: -2 }, mental: { comp: -2 } } },

  { id: 'intl_camp', name: '國際賽集訓', kind: 'normal', pool: ['performance'], sub: 'training', slot: ['regular'], excl: 'training',
    prompt: '入選國際賽集訓名單，教練組要你配合全新的訓練體系，作息也要跟著改。',
    options: [
      { id: 'full', label: '全盤配合，當成最後一次機會', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'adapt', label: '接受新體系，保留自己的節奏', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'keep', label: '照舊訓練，國際賽再說', odds: 78, gain: 0.5, loss: 0.5, traits: false,
        on: {
          good: { text: '你維持既有節奏，狀態穩定，集訓隊友還來請教你', attr: { awr: 1 } },
          bad: { text: '你沒跟上新體系，集訓檢討會上被單獨點名', attr: { syn: -1 } },
        } },
    ],
    good: { text: '集訓成效顯著，你成了體系核心，國際賽名單確定有你的位置', attr: { syn: 2 }, mental: { drive: 2 }, flags: { intlghost: true } },
    bad:  { text: '新體系把你練到水土不服，手感全亂，連國內賽都開始出問題', attr: { awr: -1, tec: -1 }, mental: { drive: -2 } } },

  { id: 'underdog_battle', name: '不被看好的一戰', kind: 'normal', pool: ['performance'], sub: 'match', slot: ['regular'], excl: 'match',
    prompt: '明天對上例行賽第一的隊伍，賠率開到三倍，賽評沒有一個人看好你們。',
    options: [
      { id: 'fight', label: '就是要打臉所有人，研究透他們', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'calm', label: '當普通比賽打，緊張反而會輸', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'low', label: '認清實力差距，少輸當贏', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '全隊爆氣拿下大冷門，賽後採訪你說「我們從沒想過自己會輸」', attr: { dec: 2 }, mental: { resl: 2 }, flags: { underdog: true } },
    bad:  { text: '被當人機打，賽後討論區開滿嘲諷串，越想越悶', attr: { dec: -2 }, mental: { resl: -2 } } },

  /* 訓練／日常（5 張） */

  { id: 'morning_review', name: '晨間覆盤', kind: 'normal', pool: ['performance'], sub: 'training', slot: ['amateur', 'am2', 'regular', 'offseason'], excl: 'training',
    prompt: '昨晚團練的錄影已經上傳，教練說「明天早上大家自己先看一遍」。有人還在睡。',
    options: [
      { id: 'deep', label: '逐幀檢討自己的每一波操作', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'key', label: '只看團戰與決策的關鍵段落', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'skip', label: '補個眠，晚上團練再看', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你從錄影裡找到自己的決策盲點，這週團練明顯少犯錯', attr: { awr: 2 }, mental: { drive: 1 } },
    bad:  { text: '覆盤越看越糟心，一早上都在想自己有多爛', attr: { dec: -2 }, mental: { conf: -1 } } },

  { id: 'diet_control', name: '飲食控制', kind: 'normal', pool: ['persona'], sub: 'life', slot: ['amateur', 'am2', 'regular', 'offseason'], excl: 'solo_diet_control',
    prompt: '戰隊請了營養師，菜單改成少油少糖。隊友哀鴻遍野，說這是「水煮人生」。',
    options: [
      { id: 'strict', label: '嚴格照菜單吃，一個月見真章', odds: 48, gain: 2.2, loss: 1.3 },
      { id: 'half', label: '營養餐照吃，偶爾偷吃一口', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'refuse', label: '管他的，吃飽才有體力', odds: 78, gain: 0.5, loss: 0.5, traits: false,
        on: {
          good: { text: '你照常吃喝，體重沒變，反而作息規律精神好', attr: { vit: 1 } },
          bad: { text: '宵夜照吃，體重直線上升，反應速度明顯變慢', attr: { vit: -1, agi: -1 } },
        } },
    ],
    good: { text: '一個月後體脂下降、精神變好，連注意力都集中了', attr: { vit: 2 }, mental: { disc: 2 } },
    bad:  { text: '你撐不下去開始暴飲暴食，體重反彈還連帶作息崩壞', attr: { vit: -2 }, mental: { disc: -2 } } },

  { id: 'sleep_hygiene', name: '睡眠管理', kind: 'normal', pool: ['performance'], sub: 'body', slot: ['amateur', 'am2', 'regular', 'offseason'], excl: 'solo_sleep_hygiene',
    prompt: '你的作息已經亂了半個月，凌晨四點還很清醒，中午才起得來。隊友約你下午團練。',
    options: [
      { id: 'fix', label: '硬調作息，早睡早起一週', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'step', label: '每天提早半小時睡，慢慢調', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'stay', label: '順其自然，能練就好', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '作息調回來之後，反應速度跟判斷力一起恢復水準', attr: { agi: 2 }, mental: { disc: 2 } },
    bad:  { text: '硬調作息失敗，連續失眠，黑眼圈比聯盟還深', attr: { vit: -2 }, mental: { disc: -1 } } },

  { id: 'rehab_care', name: '復健保養', kind: 'normal', pool: ['performance'], sub: 'body', slot: ['regular', 'offseason'], excl: 'solo_rehab_care',
    prompt: '賽季尾聲，你的手腕又開始隱隱作痛。隊醫說最好每週加兩次復健，但你只想多練兩小時。',
    options: [
      { id: 'rehab', label: '乖乖復健，保養優先', odds: 70, gain: 1, loss: 0.5, main: true },
      { id: 'half', label: '復健照做，訓練也照練', odds: 50, gain: 1.5, loss: 1 },
      { id: 'push', label: '忍一忍，賽季優先', odds: 30, gain: 2.4, loss: 1.8 },
    ],
    good: { text: '復健照做之後手腕穩定下來，關鍵比賽全程無痛', attr: { vit: 2 }, mental: { resl: 1 } },
    bad:  { text: '你忽視警告繼續加練，手腕狀況惡化，教練被迫讓你輪休', attr: { vit: -2 }, flags: { injuryRisk: 4 } } },

  { id: 'hero_pool', name: '英雄池擴充', kind: 'normal', pool: ['performance'], sub: 'training', slot: ['regular', 'offseason'], excl: 'training',
    prompt: '版本強勢角你一隻都不會，教練要求你練新英雄，時間只有兩週。',
    options: [
      { id: 'grind', label: '日夜狂練，練到夢裡都是它', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'focus', label: '挑兩隻最適配的打法練熟', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'keep', label: '練自己的招牌角，靠熟悉度贏', odds: 78, gain: 0.5, loss: 0.5, traits: false,
        on: {
          good: { text: '你靠招牌角維持勝率，隊友配合得當，暫時沒問題', attr: { tec: 1 } },
          bad: { text: 'BP 被針對，你沒有備案英雄，整個系列賽被 Ban 到沒得玩', attr: { awr: -1 } },
        } },
    ],
    good: { text: '新英雄練出成效，BP 直接多一手，對手不敢再針對你', attr: { tec: 2 }, mental: { drive: 2 } },
    bad:  { text: '新英雄練不成，招牌又被 Ban，兩頭落空', attr: { tec: -2 }, mental: { drive: -1 } } },

  /* 隊內（3 張） */

  { id: 'birthday_party', name: '隊友生日', kind: 'normal', pool: ['persona'], sub: 'team', slot: ['amateur', 'am2', 'regular', 'offseason'], excl: 'team',
    prompt: '今天是隊友生日，大夥兒約好晚上慶祝。但你有一場重要的加練排在同一個時段。',
    options: [
      { id: 'join', label: '練完再去，至少人到場', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'party', label: '今晚先慶祝，明天加倍練', odds: 40, gain: 2, loss: 1.3 },
      { id: 'skip', label: '練完直接休息，心意到就好', odds: 78, gain: 0.5, loss: 0.5, traits: false,
        on: {
          good: { text: '隊友體諒你認真，隔天還帶蛋糕給你', attr: { vit: 1 } },
          bad: { text: '你缺席慶生，隊友嘴上不說，訓練室氣氛微妙', attr: { syn: -1 }, flags: { mateMorale: -1 } },
        } },
    ],
    good: { text: '你練完趕上切蛋糕，隊友感動，休息室氣氛更好了', attr: { syn: 2 }, mental: { trust: 2 } },
    bad:  { text: '慶祝到太晚，隔天團練全隊都像宿醉，教練開噴', attr: { vit: -1, syn: -1 }, mental: { trust: -1 } } },

  { id: 'coach_conflict', name: '教練對質', kind: 'normal', pool: ['career'], sub: 'team', slot: ['regular'], excl: 'team',
    prompt: '教練認為你的打法太自私，當著全隊的面檢討你。你覺得他根本不懂你的角色。',
    options: [
      { id: 'argue', label: '當場辯清楚，誰對誰錯講明白', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'talk', label: '賽後單獨找教練談', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'swallow', label: '先吞下去，比賽證明一切', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你單獨溝通後達成共識，教練調整了你的定位，團隊打得更好', attr: { syn: 2 }, mental: { trust: 2 } },
    bad:  { text: '雙方話越說越僵，教練開始冷凍你，替補席看比賽的日子開始了', attr: { syn: -2 }, mental: { trust: -2 }, flags: { mateMorale: -2 } } },

  { id: 'rookie_tutoring', name: '新人請益', kind: 'normal', pool: ['persona'], sub: 'team', slot: ['regular', 'offseason'], excl: 'team',
    prompt: '隊上新來的練習生戰戰兢兢地來請教你，說他很崇拜你，想跟你學兩手。',
    options: [
      { id: 'teach', label: '傾囊相授，把他當接班人在帶', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'pick', label: '教他基本功，剩下的自己悟', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'busy', label: '先練自己的，有空再說', odds: 78, gain: 0.5, loss: 0.5, traits: false,
        on: {
          good: { text: '你忙自己的，新人自己摸索出路子，反而成長快', attr: { vit: 1 } },
          bad: { text: '新人覺得你架子大，隊內開始有人閒言閒語', attr: { syn: -1 }, flags: { mateMorale: -1 } },
        } },
    ],
    good: { text: '新人進步神速，成了可用戰力，隊裡都誇你是好前輩', attr: { syn: 2 }, mental: { trust: 2 } },
    bad:  { text: '你花太多時間帶新人，自己的狀態下滑，教練提醒你顧好自己', attr: { tec: -1, agi: -1 }, mental: { drive: -1 } } },

  /* 媒體（3 張） */

  { id: 'fan_message', name: '粉絲私訊', kind: 'normal', pool: ['persona'], sub: 'media', slot: ['regular', 'offseason'], excl: 'media',
    prompt: '一位粉絲私訊你長篇告白，說你從業餘賽就開始看，是他的精神支柱。這條訊息你讀了好幾遍。',
    options: [
      { id: 'reply', label: '認真回覆他，不辜負這份心意', odds: 56, gain: 1.5, loss: 1 },
      { id: 'heart', label: '點個讚當作回覆', odds: 66, gain: 1, loss: 1, main: true },
      { id: 'ignore', label: '私訊太多了，看了就忘', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你們聊了一晚，你重新想起打職業的初衷，隔天訓練特別有勁', attr: { syn: 1 }, mental: { conf: 2, drive: 1 } },
    bad:  { text: '你被私訊內容觸動，開始患得患失，怕讓粉絲失望，壓力變大', attr: { vit: -1 }, mental: { comp: -2 } } },

  { id: 'stream_meltdown', name: '直播翻車', kind: 'normal', pool: ['persona'], sub: 'media', slot: ['regular', 'offseason'], excl: 'media',
    prompt: '直播時遊戲崩潰，你把鍵盤砸了，畫面全程沒關——三百萬人看你失控。',
    options: [
      { id: 'apologize', label: '開誠布公道歉，好好解釋', odds: 56, gain: 1.5, loss: 1 },
      { id: 'joke', label: '自嘲帶過，說這只是效果', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'silent', label: '不回應，讓風波自己過去', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你坦率承認情緒管理不好，粉絲反而更挺你，說你夠真實', attr: { syn: 2 }, mental: { resl: 2 }, flags: { composure: true } },
    bad:  { text: '「脾氣差」的標籤貼上了，俱樂部下達直播禁令，贊助商也來關切', attr: { syn: -2, vit: -1 }, mental: { comp: -2 } } },

  { id: 'sponsor_dinner', name: '贊助商飯局', kind: 'normal', pool: ['persona'], sub: 'media', slot: ['regular', 'offseason'], excl: 'media',
    prompt: '贊助商代表邀你出席晚宴，說要談「品牌合作」。你很清楚這種飯局要陪笑敬酒，還要穿西裝。',
    options: [
      { id: 'attend', label: '出席，拉好關係才有資源', odds: 50, gain: 2, loss: 1.3 },
      { id: 'brief', label: '去露個面，找藉口早退', odds: 64, gain: 1, loss: 1, main: true },
      { id: 'decline', label: '婉拒，專注比賽', odds: 78, gain: 0.5, loss: 0.5, traits: false,
        on: {
          good: { text: '你婉拒飯局，賽場表現出色，廠商反而更賞識你', attr: { vit: 1 } },
          bad: { text: '你推掉飯局，廠商轉去贊助別人，錯過一次機會', attr: { syn: -1 } },
        } },
    ],
    good: { text: '飯局聊得愉快，贊助合約加碼，俱樂部高層對你另眼相看', attr: { vit: 1 }, mental: { disc: 1 }, flags: { bonusSalary: 80 } },
    bad:  { text: '應酬到半夜，隔天訓練狀態奇差，還被隊友笑「酒局選手」', attr: { vit: -2 }, mental: { disc: -2 } } },

  /* 賽場補充（1 張）＋生涯（3 張） */

  { id: 'bench_seat', name: '替補席', kind: 'normal', pool: ['psych'], sub: 'pressure', slot: ['regular'], excl: 'solo_bench_seat',
    prompt: '教練把你換下，讓新人上場。你坐在替補席看完整場，新人打得還行。',
    options: [
      { id: 'study', label: '坐著看比賽，研究對手學東西', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'fight', label: '加倍練習，證明自己值得先發', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'sulk', label: '越想越委屈，這口氣吞不下', odds: 26, gain: 1.6, loss: 1.6 },
    ],
    good: { text: '你把替補期當成充電期，狀態調整回來，重新站回先發', attr: { dec: 2 }, mental: { comp: 2 } },
    bad:  { text: '替補席越坐越消沉，訓練都提不起勁，狀態雪上加霜', attr: { dec: -2 }, mental: { resl: -2 } } },

  { id: 'family_support', name: '家人不支持', kind: 'normal', pool: ['persona'], sub: 'life', slot: ['amateur', 'am2', 'regular', 'offseason'], excl: 'solo_family_support',
    prompt: '家人又打電話來，說你再這樣打電動下去沒前途，要你回去考公職。',
    options: [
      { id: 'prove', label: '用成績證明這條路走得通', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'talk', label: '好好溝通，讓他們理解你', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'hide', label: '報喜不報憂，拖一天是一天', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你把家人說服了一半，他們說「那就再給你一年」。你練得更拼了', attr: { dec: 2 }, mental: { resl: 2 } },
    bad:  { text: '家裡天天催你放棄，你開始懷疑自己，訓練時常走神', attr: { dec: -2 }, mental: { resl: -2 } } },

  { id: 'transfer_rumor', name: '轉會風聲', kind: 'normal', pool: ['career'], sub: 'transfer', slot: ['transfer', 'regular'], excl: 'solo_transfer_rumor',
    prompt: '轉會窗開啟，網上開始傳你要被交易的消息，經紀人說「有隊伍開價了」。',
    options: [
      { id: 'leave', label: '看看外面的價碼，順便探探風', odds: 48, gain: 2, loss: 1.3 },
      { id: 'stay', label: '專心打好現在，談約交給經紀人', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'ignore', label: '耳邊風，隊裡需要我就在', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你按兵不動，專注賽場，交易風聲反而變成你的談判籌碼', attr: { dec: 2 }, mental: { drive: 2 } },
    bad:  { text: '你分心想轉會的事，比賽表現下滑，兩邊都顧不好', attr: { dec: -2 }, mental: { trust: -2 } } },

  { id: 'career_plan', name: '生涯規劃', kind: 'normal', pool: ['career'], sub: 'life', slot: ['regular', 'offseason'], excl: 'solo_career_plan',
    prompt: '你已經 24 歲，職業生涯過了一半。深夜你打開記事本，想寫下接下來三年的計畫。',
    options: [
      { id: 'goal', label: '寫下明確目標，逐年推進', odds: 52, gain: 2, loss: 1.3 },
      { id: 'think', label: '想清楚就好，方向比細節重要', odds: 64, gain: 1, loss: 1, main: true },
      { id: 'now', label: '計畫趕不上變化，走一步算一步', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你的計畫清晰可行，練起來更有方向，連教練都說你成熟了', attr: { dec: 2 }, mental: { drive: 2 } },
    bad:  { text: '越想越焦慮，覺得自己沒剩多少時間，壓力大到失眠', attr: { vit: -1 }, mental: { comp: -2 } } },

  /* 版本／英雄池（1 張） */

  { id: 'meta_shift', name: '版本改動', kind: 'patch', pool: ['performance'], sub: 'training', slot: ['regular', 'offseason'], excl: 'training',
    prompt: '季中版本大改，你熟悉的打法被削了一輪，新的主流玩法你完全沒碰過。',
    options: [
      { id: 'deep', label: '立刻投入研究，搶先吃透新版本', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'watch', label: '先看高手怎麼玩，再跟上', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'hold', label: '先觀望，等版本穩定再說', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你比別人早一步掌握新版本，成了第一個吃螃蟹的人', attr: { awr: 2 }, mental: { drive: 2 }, flags: { patchDebt: -2 } },
    bad:  { text: '你固守舊打法，新版本跟不上，被隊友拉開差距', attr: { awr: -2 }, mental: { disc: -1 }, flags: { patchDebt: 1 } } },
];

/** 依生涯評價分級的粉絲留言 */
export const FAN_QUOTES = [
  ['{n}退役的瞬間我直接破防，我的青春真的到此為止了 QQ', '以後我會指著重播畫面對我兒子說：爸爸當年看過{n}用盲僧一腳迴旋踢', '外媒已經在幫{n}算歷史第一人了，根本沒有懸念，yyds', '謝謝你把台灣電競帶到世界舞台，那隻鱷魚真的玩成神了', '這種等級的選手一個世代只會出一個，respect'],
  ['{n}確定退役，推文區直接爆，一整排 QQ 刷不停', '全明星常客要說再見了，少了你我轉播都不知道要看誰', '生涯數據攤開還是很漂亮，狐狸跟 VN 他玩得跟鬼一樣', '謝謝你每一次的極限操作，瑟雷西那勾我永遠忘不了'],
  ['稱不上超級巨星，但每天打開轉播都看得到他，這樣就夠了', '默默扛了這麼多年真的辛苦了，整隊最穩的就是他', '穩定就是他最大的天賦，這種選手最難得'],
  ['至少他真的站上過職業舞台，比我們這些鍵盤俠強多了', '板凳暖了這麼多年也是一種浪漫，辛苦了'],
  ['欸這誰？……查了一下，原來真的打過職業喔', '又一個被現實打敗的追夢人，唏噓，但至少拼過'],
];

export const TIER_NAMES = ['傳奇', '歷史級選手', '優秀職業選手', '稱職選手', '邊緣選手'];
