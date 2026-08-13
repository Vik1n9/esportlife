/**
 * 體力：0–100 的消耗資源（V4 §6）。
 *
 * 舊版的「體力」是一個**技能**（`sta`，由 vit 導出），一整段生涯都是同一個數字，
 * 只拿來當手感係數。那是棒球版的輪值模型留下來的——投手體力低就少上場。V4 §6 要的
 * 是完全不同的東西：一個會消耗、會恢復、要玩家自己管理的資源。沒有它，月回合制
 * （S14）與設施制訓練（S16）就沒有取捨，訓練變成「每個月都按同一個鈕」。
 *
 * ── 為什麼這個檔與「回合」無關 ──
 *
 * 這個檔只提供三個原語（`consume`／`recover`／`monthlyDrift`）與一組讀數曲線，
 * 誰在什麼時候呼叫它由呼叫端決定。S14 接上月回合制時換掉的正是那一段自動駕駛
 * （`planMonth`／`advanceMonths`）——現在推進月份的是 `phases/month.js`，行動由玩家
 * 選，這裡只剩下「一個行動值多少體力」這張表（`MONTH_ACTIONS`）。經濟一格沒動。
 *
 * ── §6.1 的草案數字動了哪一項，為什麼 ──
 *
 * 草案是：上限 100、月自然恢復 +12、訓練 −25~−30、休息 +50、常規賽 −12/月，
 * 目標「保守玩法每 3–4 個月休息一次」。三個旋鈕裡只有**自然恢復**動起來不傷手感——
 * 調訓練消耗會讓訓練變便宜（S16 的成本感覺跑掉），調休息回復會讓休息變萬靈丹
 * （§6.2 明說「太重則休息變無腦」）。自然恢復是背景值，玩家不會直接感覺到它，但它
 * 同時抬高休息月、壓低訓練月，是唯一能純粹拉長間隔的那一個。所以它被調過兩次，
 * 兩次都是因為**一年有幾個月在消耗體力**這件事被改寫：
 *
 *   S13：+12 → +17。那時一年只有賽段權重換算出來的 10 個月，而且每個月都在打比賽
 *        （訓練月淨 −27、休息月淨 +50 → 1.85 個訓練月 → 間隔 2.9），低於 §6.1 自己
 *        訂的 3–4。
 *   S14：+17 → +10。月回合制之後一年是**真的 12 個月**：其中五個月是賽事序列
 *        （季後賽／MSI／世界賽）——那幾個月玩家不訓練，卻照樣有自然恢復。整年因此
 *        平白多出 5 個月的回血，間隔被拉到 6.4 個養成回合，體力不再是稀缺資源。
 *        +10 讓它回到 3.76（160 段實測），休息佔 26.2% 的養成回合、透支月 23.2%。
 *
 * 兩次動的都是同一個旋鈕、同一個理由：**分母變了，背景值要跟著變**。訓練與休息的
 * 標價（27／50）一次都沒動，那是玩家直接感覺得到的東西。
 */
import { clamp } from '../core/rng.js';

/* ================= 數值框架（V4 §6.1） ================= */

export const STAMINA_MAX = 100;

/** 每月自然恢復。草案 +12 → S13 +17 → S14 +10（月數的分母改了兩次，理由見檔頭） */
export const MONTHLY_RECOVER = 10;

/** 一次完整訓練的消耗。§6.1 給的是 −25~−30，取中點 */
export const TRAIN_COST = 27;

/** 「減少訓練」（§6.3 賽事期唯一能選的訓練強度）。約半次訓練 */
export const LIGHT_TRAIN_COST = 12;

/** 休息。§6.1 的 +50 不動——它是玩家對這個系統最直接的手感 */
export const REST_RECOVER = 50;

/** 復健預防：不長屬性，換來一點恢復與較低的受傷風險（§5.2） */
export const REHAB_RECOVER = 20;

/** 常規賽每月消耗（§6.1） */
export const MATCH_MONTH_COST = 12;

/**
 * BO 系列賽每一局的消耗。
 *
 * §6.1 給的是「每 BO」：季後賽 −18、MSI/世界賽 −22。這裡改成**每局**計價：
 * 一輪 BO5 打到第五局跟 3:0 收工不該一樣累，而國際賽本來就打得比季後賽多
 * （小組賽＋淘汰賽），所以「國際賽比較貴」不必另外寫一條規則，局數自己會算出來。
 * 4.2 × 平均 4.3 局 ≈ 18，對得上 §6.1 的季後賽數字。
 */
export const SERIES_GAME_COST = 4.2;

/**
 * 一年 12 個月，每一個月都進體力模型。
 *
 * S13 這裡寫的是 `SEASON_MONTHS = 10`（「剩下兩個月是休賽期，不進這個模型」），
 * 那是還沒有月回合時的權宜——賽段權重換算出來的月數只涵蓋有比賽的期間。S14 之後
 * 年曆本身就是 12 個月（V4 §3.3），休賽期與復健年也照樣推進，所以換算層不必存在。
 */
export const MONTHS_PER_YEAR = 12;

/* ================= 懲罰曲線（V4 §6.2） ================= */

/** 區間邊界。§6.2 把區間定死，留給 playtest 的是區間裡的數值 */
export const BAND_FRESH = 60;
export const BAND_TIRED = 30;

/**
 * 體力區間的顯示標籤。
 *
 * 體力**必須看得見**——它跟隱藏心理正好相反，是玩家要主動管理的資源，藏起來就不成
 * 決策了。面板顯示數字，這裡給的是那個數字旁邊的一句話。
 */
export const STAMINA_BANDS = [
  { min: BAND_FRESH, key: 'fresh', label: '充沛', note: '訓練成功率正常' },
  { min: BAND_TIRED, key: 'tired', label: '疲勞', note: '訓練成功率下滑' },
  { min: 1, key: 'drained', label: '透支', note: '成功率腰斬，容易受傷' },
  { min: 0, key: 'empty', label: '見底', note: '幾乎練不出東西，隨時會出事' },
];

export const bandOf = (s) => STAMINA_BANDS.find((b) => s >= b.min) || STAMINA_BANDS[STAMINA_BANDS.length - 1];

/**
 * 訓練成功率的體力係數（§6.2）。
 *
 * 區間照 §6.2 的表，區間**內**線性內插——不內插的話 59 與 30 是同一個懲罰，玩家
 * 就沒有「還能再撐一次」的判斷空間，體力會退化成三段旗標。
 *
 * 兩個邊界（60 與 30）是刻意的斷崖，不是沒磨平：它們就是決策點。60 那一階讓
 * 「保持充沛」有明確的價值，30 那一階讓「再賭一次」是真的在賭。
 *
 * ⚠ 訓練選單是 S16 的事，這條曲線**現在還沒有任何消費者**：月回合的行動只扣體力，
 * 成功率判定還沒接上（S14 的骰子是暫時的成長介面）。S16 接上訓練成功率時，這裡是
 * 唯一該改的地方。
 */
export function successMul(s) {
  if (s >= BAND_FRESH) return 1;
  if (s >= BAND_TIRED) return 0.85 - ((BAND_FRESH - 1 - s) / (BAND_FRESH - 1 - BAND_TIRED)) * 0.10;
  if (s >= 1) return 0.60 - ((BAND_TIRED - 1 - s) / (BAND_TIRED - 2)) * 0.20;
  return 0.15;
}

/**
 * 受傷機率的體力倍率（§6.2：低體力受傷風險上升，0 更是大增）。
 *
 * 只在透支區才起作用。疲勞區（30–59）不加受傷風險是刻意的：那一格的代價是練不出
 * 東西，不是身體垮掉——兩格的懲罰形狀不一樣，玩家才分得出「累」與「透支」。
 */
export function injuryMul(s) {
  if (s >= BAND_TIRED) return 1;
  if (s >= 1) return 1 + ((BAND_TIRED - s) / BAND_TIRED) * 0.6;
  return 2;
}

/**
 * 體力對「表現」的影響（手感係數）。
 *
 * 從 `engine/lineup.js` 搬過來的：它以前吃的是 `sta` 技能（S10 之後暫時吃 `vit`
 * 屬性），現在吃的是這個檔管的資源，函式就該住在這裡。
 *
 * **中點從 62.5 改成 47（S13）、再改成 45.5（S14）**，兩次都不是把手感調好調壞，
 * 而是輸入的分布搬了家：舊的 `vit` 是屬性，160 段量到的中位數 63；新的體力是資源，
 * S13 的自動駕駛量到賽段谷底平均 45.4，S14 換成玩家自己決定的月回合之後是 47.1。
 * 中點是**回推**出來的，判準不是「中點等於平均」而是「160 段的平均手感 ≈ 0.994」
 * ——手感是個有上下界的凸函式，平均值進去不等於進去平均值。45.5 讓實測回到 0.9929
 * （不校正是 0.9891，差 0.004 就是全聯盟約半個百分點的勝率）。
 *
 * 斜率 0.0056 → 0.0035 同理：體力的擺幅比屬性大得多，斜率不收就整段生涯都貼在
 * 上下界上，手感係數會退化成一個二值旗標。
 *
 * 上下界（0.85 ~ 1.06）維持不變——體力差不會讓你少打，LoL 是五個固定先發，
 * 隊伍打幾場你就打幾場。少打是另一回事（板凳或傷勢缺席）。
 *
 * @returns {number} 約 0.85（透支）～ 1.06（狀態飽滿）
 */
export function formFactor(s) {
  return clamp(1 + (s - 45.5) * 0.0035, 0.85, 1.06);
}

/**
 * 進勝率公式的體力修正項（V4 §11.1 的「體力修正」）。
 *
 * §11.1 的驗算例把「教練加成 ＋ 體力修正」合計抓在 3.5 點，教練平均 2.0，體力就該
 * 落在 1.5 上下。舊版寫的是 `vit × 0.02`，160 段實測平均 1.24 點；換成體力之後要維持
 * 同一個量級，否則整個聯盟的強度會集體位移——這一站不是要改平衡，是要換讀數來源。
 * 保守玩法實測平均體力 45.4，係數取 0.027 → 平均 1.23 點，對齊舊值。
 * S14 的月回合把比賽時的平均體力挪到 47.1，同一個係數量到 1.27 點——與舊值差 2%，
 * 在「換讀數來源不換量級」的容差內，所以係數沒有跟著動（動它才是改平衡）。
 */
export function staminaPower(s) {
  return clamp(s, 0, STAMINA_MAX) * 0.027;
}

/* ================= 原語（與回合粒度無關） ================= */

/** 舊存檔沒有這個欄位；讀不到就當滿的，不要讓一個 undefined 傳染進勝率公式 */
export const staminaOf = (state) => (typeof state.stamina === 'number' ? state.stamina : STAMINA_MAX);

/**
 * 體能對體力經濟的影響。
 *
 * V4 §7 的 `vit` 是「手腕續航、整季訓練量」，而 S10 的十二技能表把 `vit` 的 OVR
 * 權重全部歸零（體力被抽出來當資源了）。如果體力再與 `vit` 無關，這個屬性就完全
 * 沒有消費者，加點加到它等於丟進水裡。所以恢復量掛 `vit`：60 為中性，滿值 +20%。
 * 幅度刻意小——它是體質差異，不是另一條成長線。
 */
export function vitCoef(state) {
  return clamp(1 + ((state.attr?.vit ?? 60) - 60) * 0.005, 0.8, 1.2);
}

/** 扣體力。回傳實際扣掉的量（扣到 0 為止） */
export function consume(state, amount) {
  const before = staminaOf(state);
  state.stamina = clamp(before - Math.max(0, amount), 0, STAMINA_MAX);
  return before - state.stamina;
}

/** 回體力。體質好的人回得多（見 `vitCoef`） */
export function recover(state, amount) {
  const before = staminaOf(state);
  state.stamina = clamp(before + Math.max(0, amount) * vitCoef(state), 0, STAMINA_MAX);
  return state.stamina - before;
}

/** 每月自然恢復。與行動無關，睡覺也會回——所以主迴圈每個月都呼叫它，包括賽事月 */
export function monthlyDrift(state) {
  return recover(state, MONTHLY_RECOVER);
}

/**
 * 記一個**做過決定的月份**（養成回合）。
 *
 * 分母刻意只算養成回合，不算賽事序列的月份與復健年：§6.1 的「每 3–4 個月休息一次」
 * 算的是「一次休息撐得住幾個訓練月」，單位本來就是玩家有得選的那種月份。把季後賽
 * 與復健年混進分母，量到的會是一個沒有人做過決定的數字。
 *
 * 要在**自然恢復之前**呼叫：那個「行動與比賽都結算完、恢復還沒進來」的值才是這個月
 * 真正的谷底，取月底的值會系統性地高估選手的狀態。
 */
export function noteMonth(state, { rested = false } = {}) {
  const log = state.staminaLog || (state.staminaLog = { months: 0, low: 0 });
  log.months += 1;
  if (staminaOf(state) < BAND_TIRED) log.low += 1;
  if (rested) {
    if (!state.restLog) state.restLog = [];
    state.restLog.push({ month: state.staminaMonth || 0, year: state.year });
  }
  state.staminaMonth = (state.staminaMonth || 0) + 1;
}

/** 一輪 BO 打完的消耗。逐局計價，見 `SERIES_GAME_COST` */
export const seriesCost = (games) => games * SERIES_GAME_COST;

/* ================= §6.3 賽事期間的規則 ================= */

/**
 * 這個時候能選的恢復手段。
 *
 * §6.3：賽事期間**不能選休息**，改提供「減少訓練」；備賽戰術裡的「心態調整與休息」
 * 是賽事期唯一的恢復手段。實際的選項清單與文案是 S15（賽事事件序列）與 S16
 * （訓練選單）的事，這一站只把規則寫成一個查得到的介面，讓那兩站不必各自重新解讀
 * 規格書。
 *
 * @param {{inEvent?:boolean}} ctx `inEvent` = 正在賽事期（季後賽／MSI／世界賽）
 * @returns {{id:string, cost:number, label:string}[]} cost 為負代表恢復
 */
export function recoveryOptions({ inEvent = false } = {}) {
  if (inEvent) {
    return [
      { id: 'light', cost: LIGHT_TRAIN_COST, label: '減少訓練' },
      { id: 'mindset', cost: -REST_RECOVER * 0.4, label: '心態調整與休息' },
    ];
  }
  return [
    { id: 'rest', cost: -REST_RECOVER, label: '休息' },
    { id: 'rehab', cost: -REHAB_RECOVER, label: '復健預防' },
  ];
}

/** 休息能不能選（§6.3）。S15／S16 組選單時查這一條，不要各自寫 if */
export const canRest = ({ inEvent = false } = {}) => !inEvent;

/* ================= 每月行動（V4 §4 第 2 步） ================= */

/**
 * 一個養成回合能做的事。
 *
 * S13 這裡是一段自動駕駛（`planMonth`：體力低於 45 就休息），因為玩家還沒有每月選擇
 * 的入口。S14 把入口接上來之後，「這個月做什麼」是**玩家的決定**，引擎只負責報價：
 * 每個行動花多少體力、換得到什麼。**經濟一格沒動**，動的是誰在做決定。
 *
 * `grow` 是這個行動的成長級別，`phases/month.js` 據以決定訓練骰——真正的訓練活動
 * 菜單（V4 §5.2 的六個設施）是 S16 的事，這一站只留「全力／減量／不練」三級的骨架。
 *
 * 復健預防（§5.2）不長屬性，換的是恢復與較低的受傷風險——它是唯一會扣 `tempInjuryRisk`
 * 的行動，代價是那個月完全沒有成長。
 */
export const MONTH_ACTIONS = [
  { id: 'train', label: '全力訓練', cost: TRAIN_COST, grow: 'full', note: '成長最快，體力消耗最重' },
  { id: 'light', label: '減量訓練', cost: LIGHT_TRAIN_COST, grow: 'light', note: '成長減半，體力只花一半' },
  { id: 'rest', label: '休息', cost: -REST_RECOVER, grow: null, note: '不成長，體力大幅回復' },
  { id: 'rehab', label: '復健預防', cost: -REHAB_RECOVER, grow: null, note: '不成長，小幅回復並降低受傷風險' },
];

/** 復健預防一次能壓掉多少臨時受傷風險（§5.2）。S16 接訓練菜單時這裡是唯一該改的地方 */
export const REHAB_RISK_RELIEF = 4;

/** 這個月選得到哪些行動。賽事期間不能休息（§6.3）走的是同一個 `canRest` */
export function monthActions({ inEvent = false } = {}) {
  return MONTH_ACTIONS.filter((a) => a.id !== 'rest' || canRest({ inEvent }));
}

/**
 * 結算一個行動的體力與副作用。回傳那個行動的定義，呼叫端據 `grow` 決定成長。
 *
 * 只碰體力與受傷風險——屬性成長不在這裡，那是 `phases/month.js`（S16 之後是訓練
 * 系統）的事。這條界線跟 S13 一樣：這個檔管的是資源，不是成長。
 */
export function applyMonthAction(state, id) {
  const act = MONTH_ACTIONS.find((a) => a.id === id) || MONTH_ACTIONS[0];
  if (act.cost >= 0) consume(state, act.cost);
  else recover(state, -act.cost);
  if (act.id === 'rehab') {
    state.tempInjuryRisk = Math.max(0, (state.tempInjuryRisk || 0) - REHAB_RISK_RELIEF);
  }
  return act;
}
