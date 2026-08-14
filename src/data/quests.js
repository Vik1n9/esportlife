/**
 * 生涯任務卡表（V4 §12.3，S17b）。
 *
 * ⚠ 本站只放測試用假卡：S18 內容站會寫 20 張 legend ＋ 5 張 route 取代這裡。
 * 假卡刻意選「兩種類型、兩種條件形狀」各一張，量出來的開卡／達成／逾期率就是
 * S19c 校準期限與目標難度的起點（假卡會出現在真實遊戲裡，直到 S18 換表）。
 *
 *   - 常青傳說（legend）：一史詩＋一稀有 的標準素材形狀（§14.2 目前 20 張的寫法）。
 *     素材選 `prophet`（版本先知）＋`star`（明星選手）：160 段實測中，打過國際賽
 *     四強的生涯（32/160）裡兩者同時持有的有 20/32——素材面夠寬，不會死卡。
 *   - 賽區統治者（route）：純軌跡、不吃素材（§14.3）。觸發 2 冠 → 達成 4 冠的
 *     「里程碑追逐」形狀：累計計數器的達成目標必須比觸發門檻高，否則開卡當下
 *     就瞬間達成，期限與追逐感全部白設。
 *
 * 卡 schema（§12.3）：
 *   id / type（legend|route）/ name / text（情境敘事）
 *   trigger（觸發條件式；legend 的底線門檻由引擎層 AND，不寫在這裡）
 *   goal（達成目標，同一套條件式語法）
 *   deadline（期限，**賽季**數；null = 生涯結束前）
 *   result（達成結果：legend → {tier:'legendary', key}；route → {tier:'epic', key, label}）
 *   failLabel（未達成降階的生涯標籤，失敗時掛進 state.labels）
 *   goalText／materialText（§12.3 v4.2：素材與目標是玩家可見資訊，文本完整公開）
 */
export const QUEST_CARDS = [
  {
    id: 'legend-evergreen',
    type: 'legend',
    name: '常青傳說',
    text: '「老將退燒了。」媒體每年都這樣寫，但你的兩張底牌還沒亮出來。',
    trigger: ['and', ['has', 'epic', 'prophet'], ['has', 'rare', 'star']],
    goal: ['stat', 'splitTitles', 'gte', 4],
    deadline: 2,
    result: { tier: 'legendary', key: 'prophet_king' },
    failLabel: '傳奇的殘響',
    goalText: '達成目標：生涯累計賽段冠軍 ≥ 4',
    materialText: '所需素材：版本先知（史詩）＋ 明星選手（稀有）',
  },
  {
    id: 'route-region-ruler',
    type: 'route',
    name: '賽區統治者',
    text: '外戰一條蟲，內戰一條龍——讓賽區統治力變成一座有名字的獎盃。',
    trigger: ['and', ['stat', 'splitTitles', 'gte', 2], ['stat', 'intlWinRate', 'lt', 40]],
    goal: ['and', ['stat', 'splitTitles', 'gte', 4], ['stat', 'intlWinRate', 'lt', 40]],
    deadline: 3,
    result: { tier: 'epic', key: 'soloking', label: '賽區統治者' },
    failLabel: '差一步的賽區霸主',
    goalText: '達成目標：生涯累計賽段冠軍 ≥ 4，且國際賽勝率 < 40%',
    materialText: null,
  },
];