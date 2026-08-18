/**
 * 賽事事件序列五拍（V4 §15.2）。
 *
 * 季後賽／MSI／世界賽的每一場 BO 都走同一個五拍結構：
 *
 *   1. 賽前敘事（對手介紹、賽區背景、輿論氛圍）
 *   2. 備賽戰術選擇（1 決策，4 選項）
 *   3. 戰術結算：固定效果＋隨機事件判定
 *   4. 比賽自動模擬 → 結果呈現（逐局比分、關鍵數據摘要）
 *   5. 賽後敘事（採訪、輿論、心理結算）
 *
 * S14 之前季後賽只有三拍：扮演路口 → 出比分 → 奪冠敘事。缺的正是第 2、3 拍的備賽
 * 戰術——它是賽事期唯一的玩家輸入（§6.3：賽事期間不能休息），也是體力系統在賽季
 * 裡的出口。沒有它，賽事期的體力只出不進，走得越深的人下一賽段越慘，卻沒有半個
 * 決策點可以緩衝。
 *
 * 三個賽事（playoff／msi／worlds）各自只負責「對手怎麼來」「名次怎麼算」「敘事
 * 語氣」，這裡是它們共用的骨架。改敘事語氣不用開三個檔。
 *
 * 核心計算沿用 `kernel/series.js` 的 `runSeries`，五拍只是包在它外面的敘事結構——
 * BO 系列賽、種子序、決勝局的計算已經對了，不要在這裡重寫。
 */
import { PRESSURE } from '../engine/psych.js';
import { applyMental } from '../engine/mental.js';
import { consume, recover, recoveryOptions } from '../engine/stamina.js';
import { runSeries } from '../kernel/series.js';
import { intlBandNote, kinded } from './shared.js';
const card = kinded('match');

/**
 * 備賽戰術（V4 §15.3）。⚠ 效果只掛在「這一場系列賽」上，不是永久加屬性。
 *
 * 四項的取捨是三條軸：體力成本、勝率修正、隨機風險。
 *
 *   research  便宜，但 20% 會被對方教練組反制（mod 翻負）——針對研究是雙向的
 *   system    最穩：沒有隨機項，穩定的小幅加成
 *   mindset   不消耗反而回體力，代價是幾乎沒有戰術效果——它是賽事期唯一的恢復手段
 *   bootcamp  最貴、效果最大，但 15% 會讓手腕發警訊（臨時受傷風險）
 *
 * `mod` 是進 `gameChance` 的勝率修正（百分點），只活這一輪 BO。它是單場的準備，
 * 不是訓練——掛錯層會讓玩家用季後賽刷屬性（S15 說明書明令的坑）。
 *
 * mindset 的恢復量不寫死在這裡：§6.3 說它是賽事期唯一恢復手段、恢復量為休息的四成，
 * 那個數字唯一出處在 `stamina.js` 的 `recoveryOptions({ inEvent: true })`，這裡讀
 * 回來用——S14 交接筆記明說「規則的出處已經在 stamina.js，不必重新解讀規格書」。
 */
const MINDSET_RECOVER = -recoveryOptions({ inEvent: true }).find((o) => o.id === 'mindset').cost;

const TACTICS = [
  { id: 'research', label: '針對對手弱點研究', cost: 15, mod: 3, risk: 'counter', note: '特定場景機率↑，被反制時風險大' },
  { id: 'system', label: '強化自身體系', cost: 20, mod: 2, risk: null, note: '穩定提升團隊表現' },
  { id: 'mindset', label: '心態調整與休息', cost: -MINDSET_RECOVER, mod: 1, risk: null, note: '抗壓判定↑，恢復少量體力' },
  { id: 'bootcamp', label: '高強度集訓', cost: 30, mod: 4, risk: 'injury', note: '操作/默契↑，體力消耗重、受傷風險微增' },
];

/**
 * 賽前敘事的語氣。`stakes` 是這一場的份量——生死戰跟八強不能是同一個調性。
 * `oppTitle` 是選配的對手標記（S20g：對上衛冕冠軍時由世界賽掛上），它比 `oppNote`
 * 多一層「這個對手有身分」的強調。
 */
function preMatchNarrative(stakes, oppNote, state, oppTitle = '') {
  const head = {
    elimination: '輸了，賽季就結束了。',
    final: '整個賽季的努力，濃縮成一個 BO。',
    intl: '國際賽的舞台，全球觀眾在看著。',
    playoff: '例行賽打得好不好，到了季後賽都不算數。',
  }[stakes] || '';
  const crowd = (state.fame ?? 0) >= 60
    ? '現場的鏡頭不斷帶到你身上。'
    : '看台上有人舉著你的應援牌。';
  const tag = oppTitle ? `<b class="hl">${oppTitle}</b><br>` : '';
  return `${head}<br>${tag}${oppNote}${oppNote ? '<br>' : ''}${crowd}`;
}

/**
 * 賽後敘事。贏的人進採訪，輸的人回更衣室——語氣跟 stakes 一起變重。
 * `oppTag === 'reigningChampion'` 且贏球時是「世代交替」的 beat（S20g）。
 */
function postMatchNarrative(stakes, win, oppTag = null) {
  if (win) {
    if (oppTag === 'reigningChampion') return '你擊敗了衛冕冠軍——老一輩的目光，現在落在你身上。';
    if (stakes === 'elimination') return '生死戰活下來了。賽後記者會上，你說這張門票是整個賽季的交代。';
    if (stakes === 'final') return '賽後採訪，你說這是整個賽季濃縮成的一個晚上。';
    if (stakes === 'intl') return '賽後混採區擠滿了記者——國際賽的每一場勝利都有人看見。';
    return '賽後採訪，你把手感歸功於整個團隊的溝通。';
  }
  if (stakes === 'elimination') return '世界賽的大門在眼前關上。更衣室裡沒有聲音。';
  if (stakes === 'final') return '更衣室裡一片沉默。就差一步。';
  if (stakes === 'intl') return '賽後採訪，你說下次會把失誤的地方補回來。';
  return '更衣室裡檢討了很久。';
}

/**
 * 跑一輪五拍序列，回傳 `runSeries` 的結果。
 *
 * 這個 generator 不自己決定對手——對手怎麼來是各賽事的事（季後賽看種子序、國際賽
 * 看賽區），呼叫端把對手與輪次標題帶進來，這裡只組裝敘事。
 *
 * @param {object} g
 * @param {object} opts
 * @param {string} opts.title 輪次標題（如「八強 · BO3」）
 * @param {number} opts.bo 3 或 5
 * @param {number} opts.oppRating 對手強度（0–100）
 * @param {number} opts.seed 種子序（1–4，影響下剋上）
 * @param {'playoff'|'final'|'intl'|'elimination'} opts.stakes 決定敘事語氣與預設壓力係數
 * @param {number} [opts.pressure] 失誤的壓力係數，預設 `PRESSURE[stakes]`
 * @param {string} [opts.oppNote] 對手敘事（怎麼來、什麼身分），由呼叫端提供
 * @param {string} [opts.oppTag] 對手身分標記（S20g）：`'reigningChampion'` 等，改賽後語氣
 * @param {string} [opts.oppTitle] 對手身分的顯示標籤（如「衛冕冠軍」），進賽前敘事
 * @param {object|null} [opts.opp] 實體化對手：Bo5 高壓檢定（§24.4.2）讀 `opp.checkM`
 * @param {boolean} [opts.intl] 國際賽戰報：結果卡附國際榜同位置級距帶（§15.2／§24.4.3）
 * @returns {{win:boolean, mine:number, theirs:number, games:string[], decider:boolean, deaths:number}}
 */
export function* runSeriesEvent(g, {
  title, bo, oppRating, seed, stakes, pressure = PRESSURE[stakes] ?? PRESSURE.playoff, oppNote = '', oppTag = null, oppTitle = '', opp = null, intl = false,
}) {
  const { state, rng } = g;

  const series = title;

  /* ── 第 1 拍：賽前敘事 ── */
  yield card('info', `${title} · 賽前`, preMatchNarrative(stakes, oppNote, state, oppTitle), series);

  /* ── 第 2 拍：備賽戰術選擇（賽事期唯一的決策點） ── */
  // `'act'`（§22.2 第 4 條明訂）：備賽戰術與訓練菜單同性質——規劃型決策，要對照
  // 屬性條與體力才選得下去，所以回底部決策槽，不跟卡片覆寫走（S39）
  const pickedId = yield {
    type: 'choice',
    kind: 'tactics',
    slot: 'act',
    stakes,
    title: `備賽戰術 · ${title}`,
    options: TACTICS.map((t) => ({
      id: t.id,
      label: t.label,
      main: t.id === 'system',
      note: `${t.cost >= 0 ? `體力 −${t.cost}` : `體力 +${-t.cost}`}　${t.note}`,
    })),
  };
  const tactic = TACTICS.find((t) => t.id === pickedId) || TACTICS[1];

  /* ── 第 3 拍：戰術結算（固定效果＋隨機事件判定） ── */
  let mod = tactic.mod;
  const staminaNote = tactic.cost >= 0
    ? `體力 −${consume(state, tactic.cost)}`
    : `體力 +${Math.round(recover(state, -tactic.cost))}`;

  /*
   * 隨機事件判定：賽事期**刻意不抽月度事件卡**。V4 §12.1 的觸發引擎只服務養成回合
   * 的月度判定（`phases/month.js` 第 5 步）；賽事期抽事件卡會引入屬性變化，等於
   * 讓玩家用季後賽刷屬性。所以這裡只有手擲的兩條風險——research 被反制、bootcamp
   * 受傷。它們只影響這一輪。
   */
  if (tactic.risk === 'counter' && rng.chance(20)) {
    mod = -4;
    yield card('bad', `${title} · 被反制`,
      `針對對手弱點研究做了整套功課，但對方教練組也研究了你——BP 被針對。<br>${staminaNote}`, series);
  } else if (tactic.risk === 'injury' && rng.chance(15)) {
    state.tempInjuryRisk = (state.tempInjuryRisk || 0) + 3;
    yield card('bad', `${title} · 集訓代價`,
      `高強度集訓把狀態練出來了，但手腕也發出了警訊。<br>${staminaNote}`, series);
  } else {
    yield card('', `${title} · 備賽結算`,
      `${tactic.label}。${staminaNote}<br><span class="muted">${tactic.note}</span>`, series);
  }

  /* ── 第 4 拍：比賽自動模擬 → 結果呈現（沿用 kernel/series.js，不重寫） ── */
  const res = runSeries(state, rng, { bo, oppRating, seed, pressure, mod, opp });
  const deciderNote = res.decider
    ? `<br><span class="muted">系列賽被拖進決勝局，${res.win ? '你們把它拿下來了' : '最後一局沒守住'}。</span>`
    : '';
  // §15.2 v4.8.0 增訂：Bo5 檢定局附一句高壓敘事——只寫現象，不出 comp／resl 數值與衰減點數，
  // 不暗示對手心理。輸掉而己方沒衰減時寫中性的「一時之差」，不栽贓給自己也不指對手
  let checkNote = '';
  if (res.deciderCheck && res.decider) {
    const line = res.win
      ? '第五局的手穩住了。'
      : (res.deciderCheck.mineDecay > 0 ? '第五局，手在螢幕前抖了一下。' : '決勝局只輸在一時之差。');
    checkNote = `<br><span class="muted">${line}</span>`;
  }
  // §15.2 國際賽戰報：結果卡附國際榜同位置級距帶（母體不足時 intlBandNote 回 null，不顯示）
  const intlNoteRaw = intl ? intlBandNote(state) : null;
  const intlNote = intlNoteRaw ? `<br>${intlNoteRaw}` : '';
  yield card(res.win ? 'good' : 'bad', `${title} · 結果`,
    `<b class="${res.win ? 'up' : 'dn'}">${res.mine}-${res.theirs}</b>${deciderNote}${checkNote}${intlNote}` +
    `<div class="statline">${res.games.length} 局｜陣亡 ${res.deaths}</div>`, series);

  /* ── 第 5 拍：賽後敘事 ＋ 心理結算 ── */
  const mental = res.win
    ? (stakes === 'elimination' ? { conf: 2, comp: 1 } : { conf: 1 })
    : (stakes === 'elimination' ? { conf: -2, comp: -1 } : { conf: -1 });
  const notes = applyMental(state, mental);
  yield card(res.win ? 'good' : 'bad', `${title} · 賽後`,
    postMatchNarrative(stakes, res.win, oppTag) +
    (notes.length ? `<br><span class="muted">（${notes.join('、')}）</span>` : ''), series);

  return res;
}
