/**
 * 訓練事件卡（V4 §5.4）——訓練專用池的卡表。純資料。
 *
 * 訓練結果由「卡片池抽取」決定，不再用成功率公式。兩階段判定（階段一成敗、階段二
 * 抽檔位）的機制住在 `engine/training.js`，這個檔只放「抽到某個檔位之後，這張卡講了
 * 什麼、附帶什麼效果」。
 *
 * 卡結構照 §5.4：檔位（great_success／success／failure／great_failure）、池別
 * （success_pool／failure_pool）、適用活動、敘事文本、效果（成功係數由檔位決定，
 * 效果欄放的是檔位之外的心理／受傷／短期 buff）。「選項」與「特質條件」欄位留給
 * S18 完整目錄——這一站只放 4 張假卡（每個檔位一張）把機制跑通。
 *
 * ⚠ 假卡刻意不放「永久屬性增減」：屬性成長走 §5.3 的成長公式（檔位成功係數 × 權重），
 * 再讓卡額外加永久屬性會把「成功係數」與「卡片效果」兩個來源疊在一起，S16 調參時
 * 分不出是哪個在動。S18 擴充時再依 §14.8 的編輯指南逐卡宣告。
 */
export const TRAINING_CARDS = [
  {
    id: 't_great_success',
    tier: 'great_success',
    pool: 'success',
    weight: 1,
    text: '狀態絕佳，手感火燙——這次訓練的收穫遠超預期。',
    effects: {
      // 大成功可動心理（§14.8.4）：正向維度 +3~+5，非必然。假卡給固定值方便測試
      mental: { conf: 4, drive: 3 },
      // 短期 buff 寫進 state.activeEffects（剩餘月數），順手讓「手感火燙」這個增益
      // 有真實消費者：接下來 2 個月預期成功率 +5%（讀取在 engine/training.js）
      buff: { id: 'momentum', label: '手感火燙', months: 2, trainBoost: 0.05 },
    },
  },
  {
    id: 't_success',
    tier: 'success',
    pool: 'success',
    weight: 1,
    text: '按表操課，訓練穩定到位。',
    effects: {},
  },
  {
    id: 't_failure',
    tier: 'failure',
    pool: 'failure',
    weight: 1,
    text: '狀態平平，訓練效果打了折扣。',
    effects: {},
  },
  {
    id: 't_great_failure',
    tier: 'great_failure',
    pool: 'failure',
    weight: 1,
    text: '操之過急，訓練不但沒效果，還出了狀況。',
    effects: {
      // 大失敗可動心理（§14.8.4）：負向維度 −3~−5
      mental: { conf: -4, drive: -3, resl: -3 },
      // 受傷由大失敗效果承擔（§6.2）：機率仍吃 injuryProbability 的體力／年齡乘子
      injury: true,
    },
  },
];
