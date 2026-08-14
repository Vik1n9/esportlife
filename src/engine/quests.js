/**
 * 生涯任務引擎（V4 §12.3，S17b）。
 *
 * §12.1 的事件卡當月結算完就結束；生涯任務卡是**狀態機**——由生涯狀態的積累觸發，
 * 開出一個跨回合的目標與期限，直到達成或逾期。它是傳說特質與替代性生涯路線的
 * 唯一發放口（§13.4／§14.3），所以 S07 的兩條傳奇不變式全部經過這裡。
 *
 * 每月（每個結算點）跑一次：
 *
 *   1. 掃未觸發的卡 → 觸發條件命中 → 開卡（legend 一律再 AND 底線門檻，引擎層，
 *      不逐卡複製——它是持有率 ≤50% 的守門員，不是設計自由度）
 *   2. 掃進行中的卡 → 達成目標命中 → 結算達成結果（**此時才消耗素材**，§14.1：
 *      開卡就吃素材的話，逾期失敗等於白虧兩個特質，玩家會學會不開卡）
 *   3. 掃進行中的卡 → 期限已過／素材被吃掉 → 結算未達成結果，永久失敗，不再觸發
 *
 * 三個決定的定案（交接筆記要記）：
 *
 * - **素材何時消耗**：達成時才消耗（§14.1 已寫）。
 * - **期限怎麼計**：以賽季（年）為單位。月為單位會讓期限受 S14 的月推進節奏影響，
 *   難校準。期限 = 開卡年 + N−1（deadline=2 → 開卡年與下一年共兩季，第三年開季失敗）。
 * - **失敗怎麼降階**：`legend`／`route` 失敗一律掉成生涯標籤，**不讓 legend 掉成
 *   史詩**——那會讓史詩持有率被任務卡灌水，破壞 §14.2 的驗收線。
 *
 * v4.2 三條規則的落點：
 *
 * - （一）素材失效即失敗：步驟 3 檢核每張卡的素材需求（條件式的正向 `has`／
 *   `hasCount` 節點），素材不在身上就失敗。被「其他已達成的任務卡」吃掉與被合成
 *   消耗走同一條檢核，差異只在失敗通知要講誰吃的。
 * - （二）失敗通知不得靜默：結算回傳的 `failed[].reason` 指名吃素材的卡；素材消耗
 *   同時記進 `state.quests.log`（時間點＋來源），S17a 的查詢層與 §15.5 傳記才答得
 *   出「哪一張卡吃掉哪個素材、什麼時候」。
 * - （三）同結算點按開卡時間排序：步驟 2 依 (openedYear, openedMonth) 排序處理，
 *   先開先吃。順序寫死才有可預測性——否則同一個局面會因為求值順序給出不同結果。
 *
 * 純規則、不做呈現：觸發與結算全部可以在 Node 裡測，呈現接在 `phases/shared.js`
 * 的 `questBeats`（跟 S17 的 eventTrigger／drawEvent 同一個切分方式）。
 */
import { evalCond, collectMaterials, materialHeld, consumeMaterial } from './conditions.js';
import { exclusiveHeld } from './progression.js';

/** legend 卡的底線門檻（§14.2）：生涯至少一次國際賽四強以上（世界賽四強／MSI 四強） */
export const LEGEND_BASELINE = ['stat', 'intlSemis', 'gte', 1];

/**
 * 跑一次生涯任務結算。
 *
 * @param {object} state 遊戲狀態（會直接改：開卡、消耗素材、發放結果、標籤、log）
 * @param {object[]} cards 卡表（測試可傳自訂卡）
 * @param {{forced?:boolean}} [opts] `forced`＝生涯結束：不開新卡，進行中的卡先算
 *   達成（目標已滿足的照發），其餘全部以退役結算失敗
 * @returns {{opened:object[], achieved:object[], failed:object[]}} 給呈現層的報告
 */
export function settleQuests(state, cards, { forced = false } = {}) {
  state.quests ||= { active: [], done: [], log: [] };
  state.labels ||= [];
  const quests = state.quests;
  const byId = new Map(cards.map((c) => [c.id, c]));
  const report = { opened: [], achieved: [], failed: [] };
  const consumed = [];   // 本次結算的素材消耗清單（v4.2 失敗通知指名用）

  /* ---- 1. 開卡：未觸發過的卡，條件命中即開，不佔每月事件配額 ---- */
  if (!forced) {
    for (const card of cards) {
      if (quests.done.some((d) => d.id === card.id)) continue;
      if (quests.active.some((a) => a.id === card.id)) continue;
      const trigger = card.type === 'legend' ? ['and', LEGEND_BASELINE, card.trigger] : card.trigger;
      if (!evalCond(state, trigger)) continue;
      quests.active.push({
        id: card.id,
        openedYear: state.year,
        openedMonth: state.month ?? 1,
        deadlineYear: card.deadline == null ? null : state.year + card.deadline - 1,
      });
      report.opened.push({ id: card.id });
    }
  }

  /* ---- 2. 達成：依開卡時間排序，先開先吃（v4.2 規則三）。達成當下才消耗素材。
   * forced（退役收束）也走這一輪：目標已滿足的照發，沒滿足的留給步驟 3 以退役失敗 ---- */
  const ordered = [...quests.active]
    .sort((a, b) => a.openedYear - b.openedYear || a.openedMonth - b.openedMonth);
  for (const q of ordered) {
    const card = byId.get(q.id);
    if (!card || !evalCond(state, card.goal)) continue;

    for (const mat of collectMaterials(card.trigger)) {
      for (const { tier, key } of consumeMaterial(state, mat)) {
        quests.log.push({ year: state.year, month: state.month ?? 1, questId: card.id, tier, key, by: card.id });
        consumed.push({ tier, key, questId: card.id });
      }
    }
    grantResult(state, card);
    quests.active = quests.active.filter((x) => x.id !== q.id);
    quests.done.push({ id: card.id, result: 'achieved', year: state.year });
    report.achieved.push({ id: card.id });
  }

  /* ---- 3. 失敗：期限過／素材失效／退役。永久失敗，降階為生涯標籤。
   * 步驟 2 已把達成的移除，這裡只剩沒達成的——forced 時全部以退役結算 ---- */
  for (const q of [...quests.active]) {
    const card = byId.get(q.id);
    if (!card) continue;
    const reason = forced
      ? { kind: 'retirement' }
      : q.deadlineYear != null && state.year > q.deadlineYear
        ? { kind: 'deadline' }
        : materialEaten(state, card, consumed, byId);
    if (!reason) continue;

    if (card.failLabel) state.labels.push(card.failLabel);
    quests.active = quests.active.filter((x) => x.id !== q.id);
    quests.done.push({ id: card.id, result: 'failed', year: state.year, reason });
    report.failed.push({ id: card.id, reason });
  }

  return report;
}

/** 達成結果：legend → 傳說特質；route → 史詩特質 ＋ 生涯標籤（§12.3 表） */
function grantResult(state, card) {
  const result = card.result;
  if (result.tier === 'legendary') {
    // 互斥（§13.3 第二層）若被別的特質擋住，獎賞不發——卡表設計時要避免；
    // 任務本身照算達成（素材已經消耗），避免獎賞判定反過來影響素材時序
    if (!exclusiveHeld(state, result.key)) state.legendary[result.key] = true;
  } else {
    if (!exclusiveHeld(state, result.key)) state.epic[result.key] = true;
    if (result.label) state.labels.push(result.label);
  }
}

/**
 * 素材失效檢核（v4.2 規則一）：卡的素材需求只要有一個不在身上就判失敗。
 * 回傳失敗原因（`material`＋`eater`），沒有失效回 null。
 *
 * eater 由本次結算的消耗清單指名——被「其他已達成的任務卡」吃掉時講出哪一張；
 * 清單裡找不到（合成／維持條件消耗）就留 null，呈現層用「素材已不在身上」帶過。
 */
function materialEaten(state, card, consumed, byId) {
  for (const mat of collectMaterials(card.trigger)) {
    if (materialHeld(state, mat)) continue;
    if (mat.key !== undefined) {
      const eat = consumed.find((c) => c.tier === mat.tier && c.key === mat.key);
      return { kind: 'material', material: mat.key, eater: eat ? byId.get(eat.questId)?.name ?? null : null };
    }
    const eaters = [...new Set(
      consumed.filter((c) => c.tier === mat.tier)
        .map((c) => byId.get(c.questId)?.name)
        .filter(Boolean),
    )];
    return { kind: 'material', material: `${mat.tier} 特質 ×${mat.count}`, eater: eaters.length ? eaters.join('、') : null };
  }
  return null;
}