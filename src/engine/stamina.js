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
 * 月回合制是 S14 的事。這個檔只提供三個原語（`consume`／`recover`／`monthlyDrift`）
 * 與一組讀數曲線，誰在什麼時候呼叫它由呼叫端決定。S14 把玩家的每月選擇接上來時，
 * 換掉的只有 `planMonth`（見下）那一段自動駕駛，經濟本身不必重寫。
 *
 * ── §6.1 的草案數字動了哪一項，為什麼 ──
 *
 * 草案是：上限 100、月自然恢復 +12、訓練 −25~−30、休息 +50、常規賽 −12/月，
 * 目標「保守玩法每 3–4 個月休息一次」。**這組數字自己算出來不是 3–4 個月。**
 * 穩態下一次休息撐得住 k 個訓練月，k = 休息月的淨回復 ÷ 訓練月的淨消耗：
 *
 *   訓練月淨消耗 = 27（訓練）＋ 12（比賽）− 12（自然）= 27
 *   休息月淨回復 = 50（休息）＋ 12（自然）− 12（比賽）= 50
 *   k = 50 ÷ 27 ≈ 1.85 → 休息間隔 ≈ 2.9 個月
 *
 * 差的不多但方向明確：照抄會得到一個「不到三個月就得躺一次」的節奏。三個旋鈕裡
 * 只有**自然恢復**動起來不傷手感——調訓練消耗會讓訓練變便宜（S16 的成本感覺跑掉），
 * 調休息回復會讓休息變萬靈丹（§6.2 明說「太重則休息變無腦」）。自然恢復是背景值，
 * 玩家不會直接感覺到它，但它同時抬高休息月、壓低訓練月，是唯一能純粹拉長間隔的那一個。
 * 所以 +12 → +17（休息月合計 +67，草案寫 +62）。實測見 `docs/v4/13-體力系統.md`。
 */
import { clamp } from '../core/rng.js';

/* ================= 數值框架（V4 §6.1） ================= */

export const STAMINA_MAX = 100;

/** 每月自然恢復。§6.1 草案是 +12，實測後上調（理由見檔頭） */
export const MONTHLY_RECOVER = 17;

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

/** 一年有幾個「會消耗體力」的月份。剩下兩個月是休賽期，不進這個模型 */
export const SEASON_MONTHS = 10;

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
 * ⚠ 訓練選單是 S16 的事，這條曲線現在還沒有真正的消費者——只有下面的自動駕駛
 * 在讀它。S16 接上訓練成功率時，這裡是唯一該改的地方。
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
 * **中點從 62.5 改成 47**，不是把手感調好調壞，是因為輸入換了一種東西：舊的 `vit`
 * 是屬性，160 段生涯量到的中位數 63；新的體力是資源，保守玩法在 5–75 之間來回，
 * 賽段谷底平均實測 45.4。中點不跟著搬就是整個聯盟集體位移，勝率公式與所有既有
 * 門檻都會跟著跑掉——47 是回推出來的：它讓 160 段的平均手感落回 0.994，跟換讀數
 * 來源之前一致（這一站換的是體力從哪裡來，不是體力值多少錢）。
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
  return clamp(1 + (s - 47) * 0.0035, 0.85, 1.06);
}

/**
 * 進勝率公式的體力修正項（V4 §11.1 的「體力修正」）。
 *
 * §11.1 的驗算例把「教練加成 ＋ 體力修正」合計抓在 3.5 點，教練平均 2.0，體力就該
 * 落在 1.5 上下。舊版寫的是 `vit × 0.02`，160 段實測平均 1.24 點；換成體力之後要維持
 * 同一個量級，否則整個聯盟的強度會集體位移——這一站不是要改平衡，是要換讀數來源。
 * 保守玩法實測平均體力 45.4，係數取 0.027 → 平均 1.23 點，對齊舊值。
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

/** 每月自然恢復。與行動無關，睡覺也會回 */
export function monthlyDrift(state) {
  return recover(state, MONTHLY_RECOVER);
}

/** 一輪 BO 打完的消耗。逐局計價，見 `SERIES_GAME_COST` */
export const seriesCost = (games) => games * SERIES_GAME_COST;

/** 賽段佔全年比例 → 這一段有幾個月 */
export const monthsFor = (weight) => Math.max(1, Math.round(SEASON_MONTHS * weight));

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

/* ================= 自動駕駛（S14 會換掉） ================= */

/**
 * 保守玩法在這個月會做什麼。
 *
 * **這是暫時的自動駕駛**：月回合制（S14）還沒做，玩家還沒有每月選擇的入口，但體力
 * 不能因此變成裝飾——它要真的在生涯裡上上下下，`formFactor` 與受傷機率才讀得到
 * 東西，S07 的「體力節奏」不變式也才跑得動。S14 接上玩家選擇之後，換掉的是這個
 * 函式，不是上面的經濟。
 *
 * 判準只有一條：**體力掉到 45 以下就休息**。45 = §6.2 的透支線 30 再加半次訓練的
 * 緩衝——低於這條線還硬練，一定會踩進「成功率腰斬」那一格。這是「保守」的定義：
 * 不賭，但也不是體力一少就躺（那會變成 §6.2 說的「休息變無腦」）。
 */
export const REST_AT = 45;

export function planMonth(state, { inEvent = false } = {}) {
  if (staminaOf(state) >= REST_AT) return 'train';
  return canRest({ inEvent }) ? 'rest' : 'light';
}

/**
 * 推進 N 個月的體力。
 *
 * 每個月的順序是：行動 → 比賽 → 自然恢復。中間那個「行動與比賽都結算完、自然恢復
 * 還沒進來」的值才是這個月真正的谷底，所以手感係數與區間統計都取它——取月底的值
 * 會系統性地高估選手的狀態。
 *
 * @param {object} state
 * @param {number} months
 * @param {{matchLoad?:number, inEvent?:boolean}} ctx matchLoad = 這幾個月的出賽比例
 * @returns {{months:number, avg:number, rests:number, low:number}} avg 為谷底平均
 */
export function advanceMonths(state, months, { matchLoad = 1, inEvent = false } = {}) {
  const log = state.staminaLog || (state.staminaLog = { months: 0, low: 0 });
  if (!state.restLog) state.restLog = [];

  let sum = 0;
  let rests = 0;
  let low = 0;

  for (let i = 0; i < months; i++) {
    const act = planMonth(state, { inEvent });
    if (act === 'rest') {
      recover(state, REST_RECOVER);
      rests += 1;
      state.restLog.push({ month: state.staminaMonth || 0, year: state.year });
    } else {
      consume(state, act === 'light' ? LIGHT_TRAIN_COST : TRAIN_COST);
    }
    consume(state, MATCH_MONTH_COST * clamp(matchLoad, 0, 1));

    const trough = staminaOf(state);
    sum += trough;
    if (trough < BAND_TIRED) { low += 1; log.low += 1; }

    monthlyDrift(state);
    state.staminaMonth = (state.staminaMonth || 0) + 1;
    log.months += 1;
  }

  return { months, avg: months ? sum / months : staminaOf(state), rests, low };
}
