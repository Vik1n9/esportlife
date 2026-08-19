/**
 * 訓練事件卡（V4 §5.4）——訓練專用池的卡表。純資料。
 *
 * 訓練結果由「卡片池抽取」決定，不再用成功率公式。兩階段判定（階段一成敗、階段二
 * 抽檔位）與卡池抽取住在 `engine/training.js`，這個檔只放「抽到某張卡之後，這張卡
 * 講了什麼、附帶什麼效果」。
 *
 * ── 卡結構（S18 定案，2026-08-15） ──
 *
 *   { id, tier, weight, activity?, stage?, stamina?, text, effects? }
 *
 * - `activity`：5 種有卡池活動（scrim／vod／fitness／soloq／study）；沒標＝全活動。
 *   rest／rehab 無卡池不標（S46：休息不分成敗所以不抽卡，復健退出玩家選單）。
 * - `stage`：生涯階段（AMATEUR／AM2／PRO）；沒標＝全階段（後向兼容語意，同事件卡
 *   slot）。
 * - `stamina`：閉區間 [lo, hi]；沒標＝全體力。
 * - `effects`：`mental`（僅大成功／大失敗 ±3~5，§14.8.4）、`buff`（activeEffects，
 *   trainBoost 模式照 S16 的 momentum）、`injury`（僅大失敗）、`attr`（永久屬性
 *   增減，走 investAttr）。成功係數由檔位決定（`SUCCESS_COEF`），卡上不重複宣告。
 *
 * ── 池分配（§0.5 池化管理） ──
 *
 * - **兜底 20**（5 活動 × 4 檔位）：id `tr_<activity>_<tier>`，只標 activity、不標
 *   stage／stamina——任何活動 × 檔位 × 階段永不空池的保證。weight 依檔位：
 *   success／failure 高、great 低。
 * - **PRO 24**：低體力大失敗危險卡 4（`stamina [0,39]`，受傷／心理重擊）、高體力
 *   大成功獎勵卡 4（`stamina [70,100]`）、一般職業文本卡 16。體力條件語意：低體力
 *   時危險卡進池 → 低體力踩中高風險的機率上升；高體力時池子只剩正常卡 → 維持
 *   正常機率。
 * - **AM2 8**：attr 壓 ±1、無 injury 大失敗、心理 ±3 保守、不加 flags。
 * - **業餘 8**：同上；業餘星探不變式（nobody 測試，rating 不得推過 AM2 門檻）是紅線。
 *
 * ⚠ **S46 的搬遷**：`mechanics`（個人機械訓練）與 `heroes`（英雄池練習）兩個活動退場，
 * 60 張卡不增不減，只搬標籤與改文案——12 張 `mechanics` 改標 `study`（VOD 研究）、
 * 8 張 `heroes` 改標 `soloq`（英雄池併進 SOLO RANK）。原本 `heroes` 的 4 張兜底卡搬過去
 * 會讓 soloq 有兩套無條件卡（兜底不變式要求「恰好 1 張」），所以它們改標 `stage: ['PRO']`
 * 歸進 PRO 池——PRO 因此從 20 張變 24 張。
 *
 * ⚠ 訓練卡刻意不寫「選項／特質條件／特質線索」——訓練不解鎖特質（避免稀釋事件卡
 * 的專屬性，FLAG_TRAIT 表不動），訓練結果也不是決策點。
 *
 * ⚠ **池別（success／failure）不是欄位，是 `tier` 的導出值**（S20c／N19）。原本
 * 60 張卡每張都手抄一次 `pool`，而抽卡（`drawTrainingCard`）根本不讀它——一份資料
 * 兩份手抄本，還有一條測試專門守它們對不對得上。改成 `poolOfTier()` 導出之後，
 * 對不上這件事就不存在了。
 */

/** 檔位 → 池別。大成功與成功屬成功池，失敗與大失敗屬失敗池 */
export function poolOfTier(tier) {
  return tier === 'great_success' || tier === 'success' ? 'success' : 'failure';
}
export const TRAINING_CARDS = [
  // ══════════════ 兜底 20：5 活動 × 4 檔位，全階段全體力 ══════════════

  { id: 'tr_study_success', tier: 'success', weight: 10, activity: ['study'],
    text: 'VOD 研究照進度推進，對手的換線時機與地圖節奏都記進了筆記。',
    effects: {} },
  { id: 'tr_study_failure', tier: 'failure', weight: 10, activity: ['study'],
    text: '錄影看了一整晚，畫面全在腦裡打結，該抓的細節一個都沒抓到。',
    effects: {} },
  { id: 'tr_study_great_success', tier: 'great_success', weight: 3, activity: ['study'],
    text: '從別隊的錄影裡挖出一個沒人講過的節奏破口，越看越興奮。',
    effects: { mental: { conf: 3, drive: 3 } } },
  { id: 'tr_study_great_failure', tier: 'great_failure', weight: 3, activity: ['study'],
    text: '看別隊的細節看到自我懷疑，越比越覺得自己差得遠。',
    effects: { mental: { conf: -3 } } },

  { id: 'tr_scrim_success', tier: 'success', weight: 10, activity: ['scrim'],
    text: '團隊訓練賽照計畫執行，陣型推進與撤退都到位。',
    effects: {} },
  { id: 'tr_scrim_failure', tier: 'failure', weight: 10, activity: ['scrim'],
    text: '訓練賽被對面體系壓制，中路一崩全隊跟著亂。',
    effects: {} },
  { id: 'tr_scrim_great_success', tier: 'great_success', weight: 3, activity: ['scrim'],
    text: '訓練賽打出完美團戰，隊友的讚嘆在語音裡刷了一片。',
    effects: { mental: { conf: 3, trust: 3 } } },
  { id: 'tr_scrim_great_failure', tier: 'great_failure', weight: 3, activity: ['scrim'],
    text: '訓練賽溝通失誤連連，賽後語音一片沉默，氣氛僵住。',
    effects: { mental: { trust: -3 } } },

  { id: 'tr_vod_success', tier: 'success', weight: 10, activity: ['vod'],
    text: '戰術覆盤按進度推進，該記的視野節奏都記下了。',
    effects: {} },
  { id: 'tr_vod_failure', tier: 'failure', weight: 10, activity: ['vod'],
    text: '覆盤時注意力渙散，看完只記得自己操作很醜，重點沒抓到。',
    effects: {} },
  { id: 'tr_vod_great_success', tier: 'great_success', weight: 3, activity: ['vod'],
    text: '覆盤看出對手一個致命習慣，教練驚喜地要全隊都來聽你講。',
    effects: { mental: { disc: 3, conf: 3 } } },
  { id: 'tr_vod_great_failure', tier: 'great_failure', weight: 3, activity: ['vod'],
    text: '連著看完自己崩盤的幾場錄像，越看越沮喪，懷疑自己選了錯的路。',
    effects: { mental: { drive: -3 } } },

  { id: 'tr_fitness_success', tier: 'success', weight: 10, activity: ['fitness'],
    text: '健身房的課表按表完成，手腕與腰部的痠痛感輕了一些。',
    effects: {} },
  { id: 'tr_fitness_failure', tier: 'failure', weight: 10, activity: ['fitness'],
    text: '健身做到一半就沒力氣，組數沒做完，感覺狀態被掏空。',
    effects: {} },
  { id: 'tr_fitness_great_success', tier: 'great_success', weight: 3, activity: ['fitness'],
    text: '體能測驗破了自己的紀錄，汗水流完精神反而特別好。',
    effects: { mental: { drive: 3, resl: 3 } } },
  { id: 'tr_fitness_great_failure', tier: 'great_failure', weight: 3, activity: ['fitness'],
    text: '逞強加練導致姿勢垮掉，腰背拉到刺痛，被隊醫勒令停練。',
    effects: { mental: { resl: -3 } } },

  { id: 'tr_soloq_success', tier: 'success', weight: 10, activity: ['soloq'],
    text: '排位穩定上分，幾場翻盤局打得特別沉得住氣。',
    effects: {} },
  { id: 'tr_soloq_failure', tier: 'failure', weight: 10, activity: ['soloq'],
    text: '排位連敗掉分，隊友 0/10/0 開送，越打越上頭。',
    effects: {} },
  { id: 'tr_soloq_great_success', tier: 'great_success', weight: 3, activity: ['soloq'],
    text: '排位一波連勝，把把 Carry，彈幕刷爆「666」與「路人王」。',
    effects: { mental: { conf: 4, drive: 3 } } },
  { id: 'tr_soloq_great_failure', tier: 'great_failure', weight: 3, activity: ['soloq'],
    text: '輸到心態爆炸，最後一把點投降的那一刻，覺得自己根本不配打職業。',
    effects: { mental: { conf: -4, drive: -3 } } },

  // ══════════════ PRO 24：低體力危險 4 ＋ 高體力獎勵 4 ＋ 一般 16 ══════════════

  { id: 'tr_pro_low_study', tier: 'great_failure', weight: 10, activity: ['study'], stage: ['PRO'], stamina: [0, 39],
    text: '累成這樣還熬夜看錄影，看到天亮眼睛都對不上焦——隔天起身一陣暈眩，隊醫直接把你送去檢查。',
    effects: { mental: { conf: -4 }, injury: true } },
  { id: 'tr_pro_low_scrim', tier: 'great_failure', weight: 10, activity: ['scrim'], stage: ['PRO'], stamina: [0, 39],
    text: '帶著疲勞上團練，反應慢半拍，失誤全算在你頭上，隊友語氣明顯變差。',
    effects: { mental: { trust: -4, drive: -3 } } },
  { id: 'tr_pro_low_fit', tier: 'great_failure', weight: 10, activity: ['fitness'], stage: ['PRO'], stamina: [0, 39],
    text: '疲勞之下硬練體能，最後一組直接垮掉，隊醫說肌腱有拉傷的跡象。',
    effects: { mental: { resl: -3 }, injury: true } },
  { id: 'tr_pro_low_soloq', tier: 'great_failure', weight: 10, activity: ['soloq'], stage: ['PRO'], stamina: [0, 39],
    text: '輸麻了還繼續排，分數掉了兩百多，直播間全在刷「狀態下滑」。',
    effects: { mental: { conf: -5, drive: -3 } } },

  { id: 'tr_pro_high_study', tier: 'great_success', weight: 3, activity: ['study'], stage: ['PRO'], stamina: [70, 100],
    text: '精神飽滿地把對手的錄影拆到幀，一個補刀節奏的小動作被你抄下來，隔天對線立刻用上。',
    effects: { mental: { conf: 3 }, attr: { tec: 2 } } },
  { id: 'tr_pro_high_scrim', tier: 'great_success', weight: 3, activity: ['scrim'], stage: ['PRO'], stamina: [70, 100],
    text: '團練狀態火熱，一波指揮級開團打完，教練在語音裡說「這就是我簽你的原因」。',
    effects: { mental: { conf: 4, trust: 3 }, attr: { syn: 2 } } },
  { id: 'tr_pro_high_vod', tier: 'great_success', weight: 3, activity: ['vod'], stage: ['PRO'], stamina: [70, 100],
    text: '精神飽滿地覆盤，把自己上一場的每個決策都問到底，筆記連教練組都借去抄。',
    effects: { mental: { disc: 3 }, attr: { awr: 2 } } },
  { id: 'tr_pro_high_fit', tier: 'great_success', weight: 3, activity: ['fitness'], stage: ['PRO'], stamina: [70, 100],
    text: '體能測驗拿下全隊第一，隊醫拍拍你肩膀說職業生涯可以再戰十年。',
    effects: { mental: { drive: 3 }, attr: { vit: 2 } } },

  { id: 'tr_pro_study_form', tier: 'success', weight: 8, activity: ['study'], stage: ['PRO'],
    text: '數據分析師把對手的錄影切成片段丟給你，一格一格對——職業隊的功課就是細到這種程度。',
    effects: { attr: { tec: 1 } } },
  { id: 'tr_pro_study_slump', tier: 'failure', weight: 8, activity: ['study'], stage: ['PRO'],
    text: '連著兩天看錄影都看不進去，教練問你對面打野的開局路線，你答不出來。',
    effects: { attr: { tec: -1 } } },
  { id: 'tr_pro_scrim_first', tier: 'success', weight: 8, activity: ['scrim'], stage: ['PRO'],
    text: '一軍團練，你指揮的一波入侵被全隊執行得乾乾淨淨，連對手都喊暫停重新部署。',
    effects: { attr: { dec: 1 } } },
  { id: 'tr_pro_scrim_lose', tier: 'failure', weight: 8, activity: ['scrim'], stage: ['PRO'],
    text: '團練輸給二隊，教練賽後覆盤語氣很重，休息室安靜得只剩鍵盤聲。',
    effects: { attr: { syn: -1 } } },
  { id: 'tr_pro_vod_extra', tier: 'success', weight: 8, activity: ['vod'], stage: ['PRO'],
    text: '主動加開一場覆盤，把上週輸掉的兩場逐波拆給隊友聽，會議室待到深夜。',
    effects: { attr: { awr: 1 } } },
  { id: 'tr_pro_vod_blank', tier: 'failure', weight: 8, activity: ['vod'], stage: ['PRO'],
    text: '覆盤時完全跟不上教練的分析，被當眾問「你昨天到底有沒有看比賽」。',
    effects: { attr: { dec: -1 } } },
  { id: 'tr_pro_fit_extra', tier: 'success', weight: 8, activity: ['fitness'], stage: ['PRO'],
    text: '被隊友拖進健身房加練，體能數據小幅上升，狀態肉眼可見地變好。',
    effects: { attr: { vit: 1 } } },
  { id: 'tr_pro_fit_over', tier: 'failure', weight: 8, activity: ['fitness'], stage: ['PRO'],
    text: '加練過頭，隔天訓練整個虛脫，隊醫警告你再這樣要強制放假。',
    effects: { attr: { vit: -1 } } },
  { id: 'tr_pro_soloq_rank', tier: 'success', weight: 8, activity: ['soloq'], stage: ['PRO'],
    text: '下播後自己加排，韓服分數穩穩往上爬，狀態手感都在線。',
    effects: { attr: { tec: 1 } } },
  { id: 'tr_pro_soloq_meme', tier: 'failure', weight: 8, activity: ['soloq'], stage: ['PRO'],
    text: '排位偶遇知名選手，被對位打爆，彈幕截圖轉發，黑粉又多了幾百個。',
    effects: { attr: { agi: -1 } } },
  { id: 'tr_pro_soloq_plan', tier: 'success', weight: 8, activity: ['soloq'], stage: ['PRO'],
    text: '教練組替你定了三隻新英雄的排位練習計畫，進度順利，數據分析師都說熟練度曲線漂亮。',
    effects: {} },
  { id: 'tr_pro_soloq_meta', tier: 'failure', weight: 8, activity: ['soloq'], stage: ['PRO'],
    text: '苦練的新英雄被版本一刀砍廢，教練說換一隻，排位白刷的感覺不好受。',
    effects: {} },
  { id: 'tr_pro_soloq_pool', tier: 'success', weight: 8, activity: ['soloq'], stage: ['PRO'],
    text: '排位刻意只選練習中的英雄，幾把下來熟練度肉眼可見地爬。',
    effects: {} },
  { id: 'tr_pro_soloq_stuck', tier: 'failure', weight: 8, activity: ['soloq'], stage: ['PRO'],
    text: '新練的英雄排位怎麼打都不順，連最基本的連招都會斷。',
    effects: {} },
  { id: 'tr_pro_soloq_burst', tier: 'great_success', weight: 3, activity: ['soloq'], stage: ['PRO'],
    text: '新英雄上手神速，排位幾把就打出教學局的水平，隊友直呼撿到寶。',
    effects: { mental: { drive: 3, conf: 3 } } },
  { id: 'tr_pro_soloq_wall', tier: 'great_failure', weight: 3, activity: ['soloq'], stage: ['PRO'],
    text: '排到深夜還是練不起來那隻英雄，開始懷疑是不是自己上限就到這。',
    effects: { mental: { conf: -3 } } },

  // ══════════════ AM2 8：青訓次級，attr ±1、無 injury、心理 ±3 ══════════════

  { id: 'tr_am2_study_win', tier: 'great_success', weight: 6, activity: ['study'], stage: ['AM2'],
    text: '青訓教練丟給你一隊的錄影，你抓出對面打野的固定開局，被誇「這是一隊的眼睛」。',
    effects: { mental: { conf: 3 }, attr: { tec: 1 } } },
  { id: 'tr_am2_study_loss', tier: 'great_failure', weight: 6, activity: ['study'], stage: ['AM2'],
    text: '整晚盯著別隊的錄影，記了滿滿三頁卻沒有一條講得出所以然，挫敗感很重。',
    effects: { mental: { drive: -3 }, attr: { tec: -1 } } },
  { id: 'tr_am2_scrim_win', tier: 'great_success', weight: 6, activity: ['scrim'], stage: ['AM2'],
    text: '二隊團練打出漂亮開團，隊長賽後主動跟你碰拳。',
    effects: { mental: { trust: 3 }, attr: { syn: 1 } } },
  { id: 'tr_am2_scrim_loss', tier: 'great_failure', weight: 6, activity: ['scrim'], stage: ['AM2'],
    text: '團練跟隊友為資源分配鬧僵，語音裡誰都不讓誰。',
    effects: { mental: { trust: -3 }, attr: { syn: -1 } } },
  { id: 'tr_am2_vod_win', tier: 'great_success', weight: 6, activity: ['vod'], stage: ['AM2'],
    text: '教練在開會時誇你的覆盤筆記是全青訓最細的，還拿給一隊看。',
    effects: { mental: { disc: 3 }, attr: { awr: 1 } } },
  { id: 'tr_am2_soloq_win', tier: 'great_success', weight: 6, activity: ['soloq'], stage: ['AM2'],
    text: '在青訓服衝進伺服器前列，教練點名要重點觀察你。',
    effects: { mental: { conf: 3 }, attr: { tec: 1 } } },
  { id: 'tr_am2_fit_win', tier: 'great_success', weight: 6, activity: ['fitness'], stage: ['AM2'],
    text: '青訓體能測驗碾壓同期，健身教練說你的底子比職業選手都好。',
    effects: { mental: { drive: 3 }, attr: { vit: 1 } } },
  { id: 'tr_am2_soloq_pool', tier: 'great_success', weight: 6, activity: ['soloq'], stage: ['AM2'],
    text: '在青訓服偷偷排出一手絕活英雄，青訓賽上一拿出來就打出教學局。',
    effects: { mental: { drive: 3 } } },

  // ══════════════ 業餘 8：網咖期，規則同 AM2（nobody 不變式紅線） ══════════════

  { id: 'tr_am_study_win', tier: 'great_success', weight: 6, activity: ['study'], stage: ['AMATEUR'],
    text: '把職業比賽的錄影一格一格倒帶，終於看懂那波換線在換什麼——原來高手是這樣想的。',
    effects: { mental: { conf: 3 }, attr: { tec: 1 } } },
  { id: 'tr_am_study_loss', tier: 'great_failure', weight: 6, activity: ['study'], stage: ['AMATEUR'],
    text: '通宵看完一整個賽季的錄像，隔天上機什麼都想不起來，網咖的椅子坐到腰都直不起來。',
    effects: { mental: { conf: -3 }, attr: { tec: -1 } } },
  { id: 'tr_am_scrim_win', tier: 'great_success', weight: 6, activity: ['scrim'], stage: ['AMATEUR'],
    text: '業餘聯賽的訓練賽碾壓對手，隊友說跟你同隊以後比賽有底氣了。',
    effects: { mental: { trust: 3 }, attr: { syn: 1 } } },
  { id: 'tr_am_scrim_loss', tier: 'great_failure', weight: 6, activity: ['scrim'], stage: ['AMATEUR'],
    text: '配合失誤送掉整場訓練賽，隊友撂下一句「你會不會玩」就下線了。',
    effects: { mental: { trust: -3 }, attr: { syn: -1 } } },
  { id: 'tr_am_vod_win', tier: 'great_success', weight: 6, activity: ['vod'], stage: ['AMATEUR'],
    text: '跟隊友擠在網咖同一台機器前覆盤自己的比賽，吵到半夜，筆記寫了整整三頁。',
    effects: { mental: { disc: 3 }, attr: { awr: 1 } } },
  { id: 'tr_am_fit_win', tier: 'great_success', weight: 6, activity: ['fitness'], stage: ['AMATEUR'],
    text: '跟著晨跑團跑了兩公里，整個人神清氣爽，網咖的煙味都沒那麼難受了。',
    effects: { mental: { drive: 3 }, attr: { vit: 1 } } },
  { id: 'tr_am_soloq_win', tier: 'great_success', weight: 6, activity: ['soloq'], stage: ['AMATEUR'],
    text: '排位一波連勝，「路人王」的稱號在小圈子裡傳開，有人來問你要不要打比賽。',
    effects: { mental: { conf: 3 }, attr: { tec: 1 } } },
  { id: 'tr_am_soloq_pool', tier: 'great_success', weight: 6, activity: ['soloq'], stage: ['AMATEUR'],
    text: '在網咖的排位開發出自己的絕活英雄，用它在業餘賽裡把對面打到投降。',
    effects: { mental: { drive: 3 } } },
];
