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
 * - `when`  觸發條件（條件卡），沒寫＝隨機池成員。S20g 起是 s-expression，
 *           與任務卡的 `trigger` 同一套 `evalCond`（`AGENTS.md` 條件語言規則）。
 *           S20f 內容站開始填。
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

  /* ================= S18 第二批（20 張，v4.3.1） ================= */
  /* 池分配：psych 4（補第一批只給 1 張的洞）、performance 6、persona 5、career 5
   * （career 含兩張 crisis 卡——§14.3 的降級危機敘事出口，slot 只標 crisis，
   * disbandThreat 時才進候選池）。
   * 業餘卡只加兩張心理／生活類（losing_streak、family_money），屬性增益壓在 ±1——
   * 第一批教訓：業餘池太大會把墊底選手推過 AM2 門檻（nobody 測試）。 */

  /* psych 池（4 張，補池） */

  { id: 'big_match_nerves', name: '大賽前夜', kind: 'normal', pool: ['psych'], sub: 'pressure', slot: ['regular'], excl: 'solo_big_match_nerves',
    prompt: '明天就是季後賽第一場，你躺在床上翻來覆去，手機刷到凌晨兩點。教練說「好好睡」，你根本睡不著。',
    options: [
      { id: 'count', label: '強迫自己閉眼，明天精神優先', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'study', label: '爬起來再看一遍對手的錄影，看到累為止', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'game', label: '開一把排位轉移注意力', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你意外睡得深沉，起床神清氣爽，腦子比什麼時候都清醒', attr: { vit: 1 }, mental: { comp: 2 } },
    bad:  { text: '整夜無眠，登場時眼皮發沉，手都在抖', attr: { agi: -1 }, mental: { comp: -2 } } },

  { id: 'losing_streak', name: '連敗心魔', kind: 'normal', pool: ['psych'], sub: 'pressure', slot: ['amateur', 'am2', 'regular'], excl: 'solo_losing_streak',
    prompt: '已經連輸六場了，不管是排位還是團練，你覺得自己把「輸」的姿勢練成了肌肉記憶。',
    options: [
      { id: 'grind', label: '加倍訓練，輸到贏為止', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'reset', label: '放下滑鼠兩天，徹底離開遊戲', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'coast', label: '隨緣打，狀態會自己回來', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你從連敗裡走出來，心態反而更硬了', attr: { dec: 1 }, mental: { resl: 2 } },
    bad:  { text: '連敗把你打進自我懷疑，越打越慫', attr: { dec: -2 }, mental: { resl: -2 } } },

  { id: 'lineup_leak', name: '先發名單外流', kind: 'normal', pool: ['psych'], sub: 'pressure', slot: ['regular'], excl: 'solo_lineup_leak',
    prompt: '社群深夜爆料：下一場先發名單沒有你。隊友群組安靜得嚇人，沒人出來說話。',
    options: [
      { id: 'ask', label: '直接問教練，是真是假', odds: 56, gain: 1.5, loss: 1 },
      { id: 'wait', label: '當沒看到，比賽見真章', odds: 66, gain: 1, loss: 1, main: true },
      { id: 'panic', label: '半夜打給經紀人，先探後路', odds: 30, gain: 2, loss: 1.6 },
    ],
    good: { text: '名單是假的，你穩住心態，教練反而讚你沉得住氣', attr: { dec: 1 }, mental: { comp: 1, trust: 1 } },
    bad:  { text: '你心神不寧，隔天團練表現奇差，反而坐實了名單', attr: { dec: -2 }, mental: { trust: -2 } } },

  { id: 'hype_backlash', name: '捧殺反噬', kind: 'normal', pool: ['psych'], sub: 'pressure', slot: ['amateur', 'am2', 'regular'], excl: 'solo_hype_backlash',
    prompt: '上個月媒體把你吹成「十年一遇的天才」，這個月你輸了一場，同一群人開始說你「出道即巔峰」。',
    options: [
      { id: 'ignore', label: '無視輿論，用訓練回應', odds: 58, gain: 1, loss: 1, main: true },
      { id: 'perform', label: '加倍證明自己，用操作打臉', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'accept', label: '承認自己狀態不好，坦蕩面對', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你想通了——被吹是被吹，打出自己就夠了', attr: { dec: 2 }, mental: { conf: 2 } },
    bad:  { text: '你開始患得患失，怕辜負期待，操作變形', attr: { tec: -1 }, mental: { conf: -2 } } },

  /* performance 池（6 張） */

  { id: 'lost_lane', name: '對線爆線', kind: 'normal', pool: ['performance'], sub: 'match', slot: ['regular'], excl: 'match',
    prompt: '開局六分鐘，你被單殺兩次，鏡頭反覆照你。隊友在語音裡沉默了。',
    options: [
      { id: 'regroup', label: '穩住補發育，等團戰扳回來', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'fight', label: '拼命打回對線優勢，證明自己', odds: 42, gain: 2.2, loss: 1.3 },
      { id: 'mute', label: '關語音，自己打自己的', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你忍辱負重補回發育，關鍵團戰一波翻盤', attr: { dec: 2 }, mental: { resl: 2 } },
    bad:  { text: '你越打越急，全場夢遊，賽後被單獨開會', attr: { tec: -2 }, mental: { resl: -2 } } },

  { id: 'game5_voice', name: '決勝局語音', kind: 'normal', pool: ['performance'], sub: 'match', slot: ['regular'], excl: 'match',
    prompt: '決勝局 BP 結束，語音裡忽然沒人說話了。教練的聲音也帶著顫抖。你知道這把輸了就回家。',
    options: [
      { id: 'talk', label: '打破沉默，帶起節奏，喊大家集中', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'steady', label: '按自己節奏打，別想太多', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'quiet', label: '跟著沉默，專注自己的操作', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你的聲音穩住了軍心，全隊打得像一個人', attr: { syn: 1, dec: 1 }, mental: { comp: 2 } },
    bad:  { text: '你的聲音都在抖，隊友跟著緊張，關鍵團戰全亂', attr: { dec: -2 }, mental: { comp: -2 } } },

  { id: 'injury_comeback', name: '傷癒復出', kind: 'normal', pool: ['performance'], sub: 'body', slot: ['regular'], excl: 'solo_injury_comeback',
    prompt: '手腕養了六週，醫生說可以上了。但你的手感還在冰庫裡，第一場就要對上賽區最兇的打線。',
    options: [
      { id: 'eager', label: '首發上場，用實戰找回手感', odds: 42, gain: 2.2, loss: 1.3 },
      { id: 'ease', label: '跟教練商量，先從替補打起', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'wait', label: '再養一週，確保萬無一失', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你頂住復出戰的壓力，手感奇蹟回歸', attr: { agi: 1, tec: 1 }, mental: { resl: 2 } },
    bad:  { text: '復出首戰被爆線，輿論說你「回不來了」，手腕也隱隱作痛', attr: { agi: -2 }, mental: { resl: -2 }, flags: { injuryRisk: 4 } } },

  { id: 'drill_boredom', name: '練習倦怠', kind: 'normal', pool: ['performance'], sub: 'training', slot: ['regular', 'offseason'], excl: 'training',
    prompt: '每天的訓練表你已經背得滾瓜爛熟，今天你坐在電腦前，第一次覺得「不想打了」。',
    options: [
      { id: 'push', label: '硬著頭皮練完，紀律不能斷', odds: 50, gain: 2.2, loss: 1.3 },
      { id: 'adjust', label: '調整訓練菜單，換點新鮮的', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'skip', label: '請一天假，出去走走', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你重新找到目標，練起來比誰都拼', attr: { tec: 1 }, mental: { drive: 2 } },
    bad:  { text: '倦怠累積成厭倦，訓練量持續下滑', attr: { tec: -2 }, mental: { drive: -2 } } },

  { id: 'counter_pick', name: '被康特', kind: 'normal', pool: ['performance'], sub: 'match', slot: ['regular'], excl: 'match',
    prompt: '對面鎖了一隻克制你的角色，教練問你：換線、換角，還是硬打？',
    options: [
      { id: 'swap', label: '主動換線，避開對位', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'adapt', label: '硬打，用經驗彌補康特', odds: 58, gain: 1, loss: 1, main: true },
      { id: 'defer', label: '交給教練安排', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你穩住劣勢對局，後期打出決定性操作', attr: { awr: 1 }, mental: { conf: 2 } },
    bad:  { text: '你被壓到塔下動彈不得，全場隱形', attr: { tec: -2 }, mental: { conf: -2 } } },

  { id: 'vision_drill', name: '視野特訓', kind: 'normal', pool: ['performance'], sub: 'training', slot: ['regular', 'offseason'], excl: 'training',
    prompt: '教練統計了你上週的視野數據：你的插眼數是全隊最低。他給你排了一週的視野特訓。',
    options: [
      { id: 'full', label: '全照教練的課程走，從細節改起', odds: 48, gain: 2.2, loss: 1.3 },
      { id: 'mix', label: '特訓照做，也保留自己的節奏', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'shrug', label: '數據說明不了問題，照自己習慣打', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '一週後你的視野數據翻倍，教練說「這才是職業級」', attr: { awr: 2 }, mental: { disc: 2 } },
    bad:  { text: '你被視野訓練綁住，打得畏首畏尾，該打的團不敢打', attr: { awr: -1 }, mental: { disc: -2 } } },

  /* persona 池（5 張） */

  { id: 'rival_rookie', name: '天才新人', kind: 'normal', pool: ['persona'], sub: 'team', slot: ['regular', 'offseason'], excl: 'team',
    prompt: '俱樂部簽了一個天賦爆棚的新人，位置跟你一模一樣。官宣照發佈那天，你的手機響了一整天。',
    options: [
      { id: 'mentor', label: '主動帶他，贏過他才有意思', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'focus', label: '專注提升自己，位置是練出來的', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'wary', label: '留一手，別教會徒弟餓死師傅', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你的格局隊裡都看在眼裡，教練說「隊有此人，是我們的福氣」', attr: { syn: 2 }, mental: { comp: 1, trust: 1 } },
    bad:  { text: '新人太亮眼，你開始質疑自己的價值', attr: { dec: -2 }, mental: { conf: -2 } } },

  { id: 'family_money', name: '家人求助', kind: 'normal', pool: ['persona'], sub: 'life', slot: ['amateur', 'am2', 'regular', 'offseason'], excl: 'solo_family_money',
    prompt: '家裏打來電話，說奶奶住院需要一筆手術費。你帳戶裡的錢正好是這季的積蓄。',
    options: [
      { id: 'half', label: '寄一半回去，先顧訓練', odds: 68, gain: 1, loss: 1, main: true },
      { id: 'all', label: '全寄回去，自己的錢再想辦法', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'none', label: '先不寄，等手頭寬裕', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '手術順利，你在訓練時格外踏實，家人也終於認同你的選擇', attr: { vit: 1 }, mental: { drive: 1, resl: 1 } },
    bad:  { text: '你心繫家裡，訓練分神，教練問你「怎麼了」', attr: { dec: -2 }, mental: { drive: -2 } } },

  { id: 'cast_invite', name: '賽評節目邀約', kind: 'normal', pool: ['persona'], sub: 'media', slot: ['regular', 'offseason'], excl: 'media',
    prompt: '知名賽評節目邀請你當嘉賓，全程直播、會被挖坑。經紀人說這是難得的曝光機會。',
    options: [
      { id: 'go', label: '上節目，火力全開', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'script', label: '去，但只聊準備好的話題', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'pass', label: '婉拒，專心備賽', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你在節目上圈粉無數，連對手都說「他說話比比賽還有趣」', attr: { syn: 1 }, mental: { conf: 2 }, flags: { popular: true } },
    bad:  { text: '你一句話被斷章取義，全網開戰', attr: { dec: -2 }, mental: { conf: -2 } } },

  { id: 'teammate_bashed', name: '隊友被網暴', kind: 'normal', pool: ['persona'], sub: 'team', slot: ['regular'], excl: 'team',
    prompt: '上一場輸了，全部輿論的火力集中在你隊友身上，他的直播間滿是人身攻擊。他在座位上已經坐了一整晚。',
    options: [
      { id: 'defend', label: '公開幫他說話，把砲火引過來', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'comfort', label: '私下陪他聊聊，開導一下', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'distance', label: '這種時刻他自己扛比較好', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你們的關係更鐵了，他在場上開始敢把背交給你', attr: { syn: 2 }, mental: { trust: 2 } },
    bad:  { text: '你被一起捲進風暴，兩個人都狀態下滑', attr: { syn: -1 }, mental: { trust: -2 } } },

  { id: 'interview_gotcha', name: '陷阱採訪', kind: 'normal', pool: ['persona'], sub: 'media', slot: ['regular', 'offseason'], excl: 'media',
    prompt: '賽後採訪，記者當著鏡頭問：「網上傳你跟中路不和，是真的嗎？」這是直播。',
    options: [
      { id: 'deflect', label: '笑著打太極，把話題轉到比賽', odds: 58, gain: 1, loss: 1, main: true },
      { id: 'truth', label: '大方回應「我們是不和，但場上照樣贏」', odds: 42, gain: 2.2, loss: 1.3 },
      { id: 'no', label: '拒絕回答，直接走人', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你的回應被剪成金句，隊友看了笑翻，休息室氣氛反而變好', attr: { syn: 1 }, mental: { comp: 2 }, flags: { meme: true } },
    bad:  { text: '你說得越描越黑，隊友隔天問你「什麼意思」', attr: { syn: -2 }, mental: { comp: -2 } } },

  /* career 池（5 張）——兩張 crisis 卡是 §14.3「降級危機敘事出口」的硬需求 */

  { id: 'relegation_crisis', name: '降級危機', kind: 'normal', pool: ['career'], sub: 'crisis', slot: ['crisis'], excl: 'solo_relegation_crisis',
    prompt: '連敗三週，隊伍確定要打升降賽了。管理層放話：「打不贏，下季整隊重組。」訓練室安靜得可怕。',
    options: [
      { id: 'rally', label: '站出來喊話，把士氣重新帶起來', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'grind', label: '不多說，用訓練量帶頭', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'exit', label: '私下開始找後路', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '升降賽全隊爆氣保級成功，你成了隊裡的英雄', attr: { dec: 2 }, mental: { resl: 2 } },
    bad:  { text: '保級失敗，你被捲進重建風暴，前途未卜', attr: { dec: -2 }, mental: { resl: -2 } } },

  { id: 'disband_rumor', name: '解散傳聞', kind: 'normal', pool: ['career'], sub: 'crisis', slot: ['crisis'], excl: 'solo_disband_rumor',
    prompt: '戰隊被收購的消息上了頭條，傳說要解散或合併。老隊友開始互相試探大家的去留。',
    options: [
      { id: 'stay', label: '留下來，跟俱樂部共進退', odds: 56, gain: 1.5, loss: 1 },
      { id: 'scout', label: '靜觀其變，先探聽外面的機會', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'leave', label: '果斷開始找下家', odds: 42, gain: 2.2, loss: 1.3 },
    ],
    good: { text: '你沉住氣打好每一場，新老闆放話第一個要留你', attr: { syn: 1 }, mental: { trust: 2 } },
    bad:  { text: '人心散了，訓練都像走過場，你開始懷疑這一切', attr: { syn: -2 }, mental: { trust: -2 } } },

  { id: 'buyout_offer', name: '買斷報價', kind: 'normal', pool: ['career'], sub: 'transfer', slot: ['transfer', 'regular'], excl: 'solo_buyout_offer',
    prompt: '經紀人深夜來電：海外賽區開了一張買斷你的支票，價碼是你現薪的兩倍。但你今年狀態正好。',
    options: [
      { id: 'accept', label: '接下支票，去新聯賽證明自己', odds: 42, gain: 2.2, loss: 1.3 },
      { id: 'consult', label: '跟教練坦白，問他的建議', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'refuse', label: '婉拒，留在熟悉的環境', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你留下來打出身價，新的報價反而更高了', attr: { dec: 2 }, mental: { drive: 2 } },
    bad:  { text: '你動搖了軍心，管理層開始懷疑你的忠誠', attr: { syn: -2 }, mental: { trust: -2 } } },

  { id: 'captain_offer', name: '隊長任命', kind: 'normal', pool: ['career'], sub: 'team', slot: ['regular'], excl: 'team',
    prompt: '教練私下找你：想讓你接下隊長袖標，隊裡有些老將不服。接下來兩年，你要在場上喊話、場下背鍋。',
    options: [
      { id: 'take', label: '接下，這是責任也是機會', odds: 48, gain: 2.2, loss: 1.3 },
      { id: 'negotiate', label: '接下，但先跟老將們把話說開', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'decline', label: '婉拒，專心打好自己的', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你成了隊裡的主心骨，連不服的人都開始聽你的', attr: { syn: 2 }, mental: { comp: 1, trust: 1 }, flags: { leader: true } },
    bad:  { text: '你扛不住壓力，隊長袖標成了你的負擔', attr: { dec: -2 }, mental: { comp: -2 } } },

  /* 版本／英雄池（1 張） */

  { id: 'champ_nerfed', name: '本命角被砍', kind: 'patch', pool: ['performance'], sub: 'training', slot: ['regular', 'offseason'], excl: 'training',
    prompt: '版本更新：你的本命角被砍了一刀大的，勝率直接掉三個百分點。群組裡哀鴻遍野。',
    options: [
      { id: 'adapt', label: '改打法重新適應，等版本回調', odds: 48, gain: 2.2, loss: 1.3 },
      { id: 'switch', label: '開始練新的本命角', odds: 62, gain: 1, loss: 1, main: true },
      { id: 'protest', label: '先打排位抗議，等官方回應', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你把被砍的角色玩出新花樣，開發出別人抄不走的套路', attr: { awr: 2 }, mental: { disc: 2 } },
    bad:  { text: '你死守被砍的角色，戰績一路下滑', attr: { tec: -2 }, mental: { disc: -2 } } },

  /* ================= S18 第三批（20 張，v4.3.1） ================= */
  /* 池分配：psych 5（最少池，補到 11）、performance 5、persona 5、career 5。
   * 業餘卡只 2 張（scrim_rampage、family_live），屬性增益壓在 ±1——nobody 測試
   * 紅線（第二批教訓）。psych 卡照 §12.2「不產特質」：只用 mental，不掛旗標。 */

  /* psych 池（5 張） */

  { id: 'home_crowd', name: '主場聲浪', kind: 'normal', pool: ['psych'], sub: 'pressure', slot: ['regular'], excl: 'solo_home_crowd',
    prompt: '主場最後一戰，幾萬人齊聲喊你的 ID，聲浪淹過耳機。導播把鏡頭切到你，等著拍你的表情。',
    options: [
      { id: 'embrace', label: '把掌聲當燃料，越喊越起勁', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'breathe', label: '深呼吸，把注意力鎖在遊戲裡', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'numb', label: '當成沒人看，跟團練一樣打', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '滿場歡呼聲中你打出代表作，導播特寫時你在笑', attr: { dec: 2 }, mental: { comp: 2, resl: 1 } },
    bad:  { text: '掌聲越大你手越抖，關鍵操作全變形，賽後把自己關進訓練室', attr: { dec: -1 }, mental: { comp: -2 } } },

  { id: 'hopes_pressure', name: '被寄予厚望', kind: 'normal', pool: ['psych'], sub: 'pressure', slot: ['regular'], excl: 'solo_hopes_pressure',
    prompt: '賽前訪談，全隊只有你被點名「這季要靠你了」。輿論標題越寫越聳動，連教練都開始盯你。',
    options: [
      { id: 'carry', label: '扛下來，我就是那個關鍵先生', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'share', label: '提醒大家，這是五個人的遊戲', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'ignore', label: '屏蔽所有期待，打好自己的就好', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你把壓力變成專注，用一場代表作回應所有期待', attr: { dec: 2 }, mental: { comp: 2, conf: 1 } },
    bad:  { text: '「指望你」三個字像石頭壓在胸口，越想打好越打不好', attr: { dec: -2 }, mental: { comp: -2, conf: -1 } } },

  { id: 'clutch_anxiety', name: '關鍵時刻發抖', kind: 'normal', pool: ['psych'], sub: 'pressure', slot: ['regular'], excl: 'solo_clutch_anxiety',
    prompt: '比賽剩下最後一波團戰，優勢在你這側，所有人都在等誰先動手。你的手開始微微發抖。',
    options: [
      { id: 'decisive', label: '想都不想，憑直覺先手', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'calm', label: '停一拍，想清楚再出手', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'safe', label: '把開戰權交給隊友', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你頂著發抖的手打出決定性操作，賽後才發現自己出了一身冷汗', attr: { dec: 2 }, mental: { comp: 2 } },
    bad:  { text: '你越想穩越猶豫，錯過開戰時機，隊友跟著你一起猶豫到輸', attr: { dec: -2 }, mental: { comp: -2 } } },

  { id: 'post_win_high', name: '大勝後亢奮', kind: 'normal', pool: ['psych'], sub: 'pressure', slot: ['regular'], excl: 'solo_post_win_high',
    prompt: '拿下關鍵一勝，全隊慶祝到深夜。你躺在床上，腦子還在一幀一幀重播那些精彩操作。',
    options: [
      { id: 'wind', label: '強迫自己閉眼，興奮留給明天', odds: 58, gain: 1, loss: 1, main: true },
      { id: 'rewatch', label: '偷偷爬起來，再看一遍錄影', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'chat', label: '跟粉絲聊到天亮，分享勝利喜悅', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你讓興奮留在昨天，隔天精神飽滿，手感比前一晚更燙', attr: { vit: 2 }, mental: { drive: 2 } },
    bad:  { text: '亢奮到天亮，隔天團練靈魂出竅，教練說「贏一場就膨脹？」', attr: { vit: -1 }, mental: { disc: -2 } } },

  { id: 'away_boo', name: '客場喝倒彩', kind: 'normal', pool: ['psych'], sub: 'pressure', slot: ['regular'], excl: 'solo_away_boo',
    prompt: '客場粉絲整場對著你喝倒彩，只要你一碰兵線就是一片噓聲。鏡頭很愛找你。',
    options: [
      { id: 'prove', label: '用操作堵住他們的嘴', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'focus', label: '當耳邊風，照自己節奏打', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'mute', label: '心裡把觀眾席關掉', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '全場噓聲反而點燃你，你打出本季最佳表現，賽後對著鏡頭比了閉嘴手勢', attr: { dec: 2 }, mental: { resl: 2, comp: 1 } },
    bad:  { text: '被自己人聲浪搞到心浮氣躁，操作變形，賽後越想越憋屈', attr: { dec: -1 }, mental: { resl: -2 } } },

  /* performance 池（5 張） */

  { id: 'scrim_rampage', name: '訓練賽被碾壓', kind: 'normal', pool: ['performance'], sub: 'training', slot: ['regular'], excl: 'training',
    prompt: '訓練賽被對面二十分鐘推平，你死了七次。結算畫面出來，語音裡一個字都沒有。',
    options: [
      { id: 'grind', label: '立刻開排位復健，輸到練回來為止', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'reset', label: '關機散步，明天滿血再戰', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'shrug', label: '訓練賽而已，正式賽贏了才算數', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你從被碾的錄影裡抓到對面套路，隔天訓練賽反過來碾回去', attr: { awr: 2 }, mental: { resl: 2, conf: 1 } },
    bad:  { text: '被碾的畫面在腦裡反覆播放，越練越沒自信', attr: { tec: -1 }, mental: { conf: -2 } } },

  { id: 'playoff_analysis', name: '季後賽戰術會議', kind: 'normal', pool: ['performance'], sub: 'match', slot: ['regular'], excl: 'match',
    prompt: '季後賽第一輪對手出爐，教練把戰術板推到你們面前：對手的視野節奏是這賽區最兇的。',
    options: [
      { id: 'absorb', label: '全程筆記，連對手的習慣都記下', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'question', label: '有疑慮當場提出，把戰術討論透', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'zone', label: '會議太長，後半段開始神遊', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你把對手的視野時間點背得滾瓜爛熟，比賽時像開了全圖一樣', attr: { awr: 2 }, mental: { drive: 2, disc: 1 } },
    bad:  { text: '會議上沒聽進去的都是重點，賽場上被對方的套路打懵', attr: { awr: -1 }, mental: { disc: -2 } } },

  { id: 'new_coach_system', name: '新教練新體系', kind: 'normal', pool: ['performance'], sub: 'training', slot: ['regular', 'offseason'], excl: 'training',
    prompt: '新教練上任，第一件事就是推翻舊體系。你分到一套全新的打法，跟你練了三年的習慣完全相反。',
    options: [
      { id: 'adopt', label: '全盤照學，先信任再說', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'blend', label: '學新的，也保留自己的絕活', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'resist', label: '舊打法證明過有用，為什麼要改', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '新體系在你身上長出第二套打法，教練開始重用你', attr: { awr: 2 }, mental: { drive: 2, trust: 1 } },
    bad:  { text: '舊習慣卡住新體系，兩套都練不好，位置開始不穩', attr: { awr: -1, tec: -1 }, mental: { trust: -2 } } },

  { id: 'physical_train', name: '體能訓練課', kind: 'normal', pool: ['performance'], sub: 'body', slot: ['regular', 'offseason'], excl: 'solo_physical_train',
    prompt: '戰隊請了體能教練，每週要加三堂重訓跟有氧。有人笑說「打電動還要做體操」。',
    options: [
      { id: 'commit', label: '全勤照做，把身體當資產經營', odds: 48, gain: 2.2, loss: 1.3 },
      { id: 'steady', label: '挑兩堂上，能持續最重要', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'skip', label: '趁沒人注意偷偷溜走', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '三個月後你的續航力明顯變好，賽季末大家都累癱，你還能打滿加時', attr: { vit: 2 }, mental: { disc: 2, drive: 1 } },
    bad:  { text: '體能跟不上賽程，賽季中後段你的專注力掉得比誰都快', attr: { vit: -2 }, mental: { disc: -2 } } },

  { id: 'early_lead_loss', name: '前期優勢被翻', kind: 'normal', pool: ['performance'], sub: 'match', slot: ['regular'], excl: 'match',
    prompt: '二十分鐘領先六千經濟，一波團戰全送回去，對面開始反撲。耳機裡有人開始喊「完了」。',
    options: [
      { id: 'reset', label: '叫停語音，重新整理節奏', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'steady', label: '該退就退，重新布局龍坑', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'force', label: '再開一波，用打架找回優勢', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你穩住局面把比賽拖進後期，一波團戰打回來，賽後大家都說「心臟好大」', attr: { dec: 2 }, mental: { resl: 2, comp: 1 } },
    bad:  { text: '優勢被翻之後你越想扳回越急，一波波送，比賽直接結束', attr: { dec: -2 }, mental: { comp: -2, resl: -1 } } },

  /* persona 池（5 張） */

  { id: 'contract_renew', name: '續約談判', kind: 'normal', pool: ['persona'], sub: 'transfer', slot: ['transfer', 'regular'], excl: 'solo_contract_renew',
    prompt: '合約年到了，經紀人幫你談續約。俱樂部開的條件比行情低，但戰隊感情好，隊友也都在。',
    options: [
      { id: 'market', label: '拿外面的報價去談，該要的要', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'balance', label: '談一個雙方都舒服的價碼', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'loyal', label: '直接簽，人比錢重要', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '續約談得漂亮，雙方都滿意，你帶著新約回到訓練室', attr: { syn: 2 }, mental: { trust: 2 }, flags: { bonusSalary: 120 } },
    bad:  { text: '談判卡在數字上，管理層臉色越來越難看，隊友看你眼神也怪怪的', attr: { syn: -2 }, mental: { trust: -2 } } },

  { id: 'teammate_departure', name: '好友轉會', kind: 'normal', pool: ['persona'], sub: 'team', slot: ['regular', 'offseason'], excl: 'team',
    prompt: '跟你搭檔三年的老隊友要轉會了。最後一次團練結束，他開始收拾行李，訓練室安靜得能聽見滑鼠聲。',
    options: [
      { id: 'sendoff', label: '辦場像樣的送別，好好道別', odds: 48, gain: 2.2, loss: 1.3 },
      { id: 'talk', label: '好好聊聊，把想說的話說開', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'busy', label: '送行交給別人，專心備賽', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '道別之後你把懷念化成分數，隔天賽場上打得像他在你身邊一樣', attr: { syn: 2 }, mental: { trust: 2, resl: 1 } },
    bad:  { text: '老搭檔一走，你覺得整支隊都不是滋味，配合節奏全亂', attr: { syn: -1 }, mental: { trust: -2 }, flags: { mateMorale: -2 } } },

  { id: 'family_live', name: '家人到場', kind: 'normal', pool: ['persona'], sub: 'life', slot: ['amateur', 'am2', 'regular'], excl: 'solo_family_live',
    prompt: '爸媽第一次到現場看你比賽。你的每個操作他們都看不懂，但鼓掌比誰都用力。',
    options: [
      { id: 'perform', label: '想為他們打出一場好比賽', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'relax', label: '當平常比賽打，他們開心就好', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'hide', label: '低調點，別讓鏡頭帶到他們', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你在家人面前打出代表作，賽後他們在場外等你，笑得比誰都驕傲', attr: { syn: 1 }, mental: { drive: 2, conf: 1 } },
    bad:  { text: '你越想表現越緊張，反而打差了，賽後還要擠出笑臉跟爸媽合照', attr: { dec: -1 }, mental: { drive: -2 } } },

  { id: 'rumor_mill', name: '緋聞八卦', kind: 'normal', pool: ['persona'], sub: 'media', slot: ['regular', 'offseason'], excl: 'media',
    prompt: '一篇八卦文配一張模糊照片，說你跟隔壁隊的某人「走得很近」。群組轉發，親友都來問。',
    options: [
      { id: 'clarify', label: '公開澄清，把話講清楚', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'ignore', label: '不回應，讓八卦自己涼', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'lean', label: '順著話題炒一波熱度', odds: 40, gain: 2, loss: 1.3, flags: { popular: true } },
    ],
    good: { text: '一句話講清楚，風向立刻轉，還圈了一波「敢說」的好感', attr: { syn: 2 }, mental: { conf: 1, trust: 1 } },
    bad:  { text: '澄清越描越黑，八卦演成連續劇，訓練時手機一直響', attr: { vit: -1 }, mental: { comp: -2, trust: -1 } } },

  { id: 'move_base', name: '搬進新基地', kind: 'normal', pool: ['persona'], sub: 'life', slot: ['regular', 'offseason'], excl: 'solo_move_base',
    prompt: '戰隊換新基地了，離市區更遠，但房間更大、設備全新。你要重新適應一切作息。',
    options: [
      { id: 'settle', label: '立刻照新作息安排，一天都不浪費', odds: 48, gain: 2.2, loss: 1.3 },
      { id: 'ease', label: '慢慢來，先把設備調到順手', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'chaos', label: '東西先丟著，打排位要緊', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '新環境被你整理得明明白白，作息一塵不染，訓練效率比舊基地還高', attr: { dec: 2 }, mental: { disc: 1, trust: 1 } },
    bad:  { text: '新地方亂成一團，作息跟著亂，連續一週狀態不在線', attr: { dec: -1 }, mental: { disc: -2 } } },

  /* career 池（5 張） */

  { id: 'worlds_roster', name: '世界賽名單', kind: 'normal', pool: ['career'], sub: 'team', slot: ['regular'], excl: 'solo_worlds_roster',
    prompt: '世界賽名單公布，你的名字在列。這是你第一次打世界賽，距離出發還有一個月。',
    options: [
      { id: 'prepare', label: '提前規劃訓練與體能，當決賽打', odds: 48, gain: 2.2, loss: 1.3 },
      { id: 'steady', label: '維持現狀，世界賽當平常打', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'hype', label: '跟粉絲互動，先享受這份榮耀', odds: 40, gain: 2, loss: 1.3 },
    ],
    good: { text: '你帶著完整準備踏上世界賽舞台，初登場就打出身價', attr: { dec: 2 }, mental: { drive: 2, comp: 1 } },
    bad:  { text: '名單公布後你壓力爆表，集訓表現失常，教練開始懷疑這個決定', attr: { dec: -2 }, mental: { comp: -2 } } },

  { id: 'coach_change', name: '教練下課', kind: 'normal', pool: ['career'], sub: 'team', slot: ['regular', 'offseason'], excl: 'team',
    prompt: '連敗之後，俱樂部宣布教練下課。他帶了你兩年，你是第一個接到他告別訊息的人。',
    options: [
      { id: 'back', label: '公開支持他，為他說句話', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'steady', label: '專注備戰，用成績送他離開', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'silent', label: '顧好自己，別的管不來', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你的一句話讓教練體面離場，新教練接手時也對你多了三分尊重', attr: { syn: 2 }, mental: { trust: 2, comp: 1 } },
    bad:  { text: '你為教練出頭反而站錯邊，管理層連你一起記上，風向開始對你不利', attr: { syn: -2 }, mental: { trust: -2 }, flags: { mateMorale: -2 } } },

  { id: 'salary_arrears', name: '薪資遲發', kind: 'normal', pool: ['career'], sub: 'life', slot: ['regular', 'offseason'], excl: 'solo_salary_arrears',
    prompt: '俱樂部財務出了狀況，薪資遲了一個月。合約白紙黑字，但總部只說「再等等」。',
    options: [
      { id: 'voice', label: '聯合隊友跟管理層攤牌', odds: 44, gain: 2.2, loss: 1.3 },
      { id: 'wait', label: '先照常訓練，給俱樂部時間', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'plan', label: '開始研究合約細節，留條後路', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你把話攤開講，管理層補了薪資還道歉，俱樂部反而更信任你', attr: { syn: 2 }, mental: { drive: 1, trust: 1 } },
    bad:  { text: '你帶頭鬧薪，被貼上「難搞」標籤，下季的買斷傳聞開始出現', attr: { syn: -2 }, mental: { drive: -2, trust: -1 } } },

  { id: 'demote_rumor', name: '下放風聲', kind: 'normal', pool: ['career'], sub: 'crisis', slot: ['regular'], excl: 'solo_demote_rumor',
    prompt: '休息室流言：下一季你可能被下放二隊。你這陣子表現平平，新人正虎視眈眈。',
    options: [
      { id: 'prove', label: '加倍練習，用表現守住位置', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'talk', label: '直接問教練，要個準話', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'resign', label: '反正也累了，二隊就二隊', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你把風聲化成動力，連著幾場打出季末最佳表現，先發位置穩了', attr: { dec: 2 }, mental: { resl: 2 } },
    bad:  { text: '你越想證明自己越用力過猛，操作變形，反而坐實了流言', attr: { dec: -2 }, mental: { comp: -2, resl: -1 } } },

  { id: 'retire_thought', name: '退役念頭', kind: 'normal', pool: ['career'], sub: 'life', slot: ['regular', 'offseason'], excl: 'solo_retire_thought',
    prompt: '深夜，你翻到自己剛出道那年的採訪。畫面裡的你說「我要打到打不動為止」。現在你覺得差不多了。',
    options: [
      { id: 'reignite', label: '找回初心，再拼一季', odds: 46, gain: 2.2, loss: 1.3 },
      { id: 'reflect', label: '不著急決定，先想清楚', odds: 60, gain: 1, loss: 1, main: true },
      { id: 'plan', label: '開始規劃轉型，給自己留退路', odds: 78, gain: 0.5, loss: 0.5, traits: false },
    ],
    good: { text: '你重新想起來為什麼開始，訓練的每一分鐘都有重量，狀態回春', attr: { dec: 2 }, mental: { drive: 2, resl: 1 } },
    bad:  { text: '念頭一起就壓不住，場上開始患得患失，打得像在倒數日子', attr: { dec: -2 }, mental: { drive: -2 } } },
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
