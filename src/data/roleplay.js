/**
 * 扮演事件卡。
 *
 * 跟 `EVENT_CARDS` 的分工很明確：那一套動的是操作、反應、對線這些能力值，
 * 這一套<b>完全不碰能力值</b>，只動心理與性格。你在鏡頭前說了什麼、在休息室
 * 怎麼接隊友的話、教練把你留下來談時你怎麼回——這些不會讓你補刀變準，
 * 但會決定你是誰、隊友要不要跟你打、戰隊捨不捨得放你走。
 *
 * 結果也刻意不擲骰：扮演不是賭博，你選了就是那樣的人。真正隨機的是外界反應，
 * 那部分由引擎依 `知名度` 放大或縮小（聲量越大，話被放大得越誇張）。
 *
 * 欄位：
 * - `when`   觸發時機。`presser` 季後賽系列賽前／`media` 賽後與休賽期／
 *            `locker` 休息室／`coach` 教練談話／`daily` 日常訓練。
 * - `weight` 抽卡權重。
 * - `need`   選填的出現條件（如「默契低於某值才會出現的衝突卡」）。
 * - `options[].mental` 直接套用的心理值變動。
 * - `options[].tone`   `bold` 張揚／`plain` 中庸／`humble` 收斂。引擎用來決定
 *            外界反應的方向與是否推進性格特質計數。
 */

/** @type {{id:string,name:string,when:string,weight:number,need?:(s:object)=>boolean,prompt:string,options:object[]}[]} */
export const ROLEPLAY_CARDS = [
  /* ---------------- 賽前放話 ---------------- */
  {
    id: 'presser_callout', name: '賽前記者會', when: 'presser', weight: 3,
    prompt: '記者把麥克風遞到你面前：「這輪對上他們，有信心嗎？」台下鏡頭全開著。',
    options: [
      { id: 'callout', label: '「他們守不住我這條線。」', tone: 'bold',
        mental: { ego: 5, fame: 7, nerve: 3, rep: -3, chem: -2 } },
      { id: 'respect', label: '「對手很強，我們會準備好。」', tone: 'plain',
        mental: { fame: 1, rep: 3, chem: 1 } },
      { id: 'deflect', label: '「這是團隊的比賽，我沒什麼好說的。」', tone: 'humble',
        mental: { rep: 2, chem: 3, ego: -3, fame: -1 } },
    ],
  },
  {
    id: 'presser_pressure', name: '賽前壓力', when: 'presser', weight: 3,
    prompt: '論壇已經在賭你們幾比零被掃。走進場館前，隊友都在看你的反應。',
    options: [
      { id: 'fire', label: '把那串留言截圖貼進隊內群組', tone: 'bold',
        mental: { nerve: 6, ego: 4, chem: 3, fame: 2 } },
      { id: 'calm', label: '關掉手機，照平常流程熱身', tone: 'plain',
        mental: { nerve: 4, chem: 1 } },
      { id: 'shrink', label: '一句話都不說，戴上耳機', tone: 'humble',
        mental: { nerve: -2, chem: -2, ego: -2 } },
    ],
  },
  {
    id: 'presser_underdog', name: '沒人看好的一輪', when: 'presser', weight: 3,
    need: (s) => (s.seedRank || 1) >= 3,
    prompt: '種子序排在後段，賽前分析清一色不看好你們。主持人問：「你們憑什麼？」',
    options: [
      { id: 'declare', label: '「等我們捧盃的時候再問一次。」', tone: 'bold',
        mental: { nerve: 8, ego: 5, fame: 6, rep: -2, chem: 4 } },
      { id: 'quiet', label: '「排名是他們排的，比賽是我們打的。」', tone: 'plain',
        mental: { nerve: 6, chem: 3, rep: 2, fame: 2 } },
      { id: 'accept', label: '「我們確實是弱的一方。」', tone: 'humble',
        mental: { nerve: -3, rep: 3, chem: -1 } },
    ],
  },

  /* ---------------- 媒體採訪 ---------------- */
  {
    id: 'media_blame', name: '賽後檢討的鏡頭', when: 'media', weight: 3,
    prompt: '剛輸完一輪，記者問：「今天這幾波團戰，問題出在哪裡？」隊友就坐在旁邊。',
    options: [
      { id: 'blame', label: '直接點名是哪個位置的問題', tone: 'bold',
        mental: { ego: 6, fame: 4, chem: -10, rep: -7 } },
      { id: 'share', label: '「決策是全隊一起做的，責任一起扛。」', tone: 'plain',
        mental: { chem: 6, rep: 5, fame: 1 } },
      { id: 'self', label: '「是我打得不夠好。」', tone: 'humble',
        mental: { chem: 5, rep: 6, nerve: -2, ego: -3 } },
    ],
  },
  {
    id: 'media_viral', name: '一句話上熱搜', when: 'media', weight: 2,
    prompt: '你上週隨口說的一句話被剪成梗圖，一夜之間到處都是。記者又來了，問你要不要澄清。',
    options: [
      { id: 'double', label: '不澄清，再補一句更狠的', tone: 'bold',
        mental: { fame: 12, ego: 8, rep: -8, chem: -3 } },
      { id: 'clarify', label: '好好把前後文說清楚', tone: 'plain',
        mental: { fame: 3, rep: 4 } },
      { id: 'apologise', label: '公開道歉，把事情壓下去', tone: 'humble',
        mental: { fame: -2, rep: 7, ego: -4, chem: 2 } },
    ],
  },
  {
    id: 'media_backlash', name: '輿論反撲', when: 'media', weight: 3,
    need: (s) => s.mental.rep <= -20,
    prompt: '風向已經整個轉了。贊助商私下問經理，要不要讓你少露面一陣子。',
    options: [
      { id: 'fight', label: '開直播正面回擊那些人', tone: 'bold',
        mental: { fame: 9, ego: 7, rep: -10, chem: -4 } },
      { id: 'silence', label: '停掉所有社群，只打比賽', tone: 'plain',
        mental: { fame: -4, rep: 8, nerve: 2 } },
      { id: 'mend', label: '照經理的安排跑一輪公關行程', tone: 'humble',
        mental: { rep: 12, ego: -5, fame: -1, chem: 2 } },
    ],
  },
  {
    id: 'media_spotlight', name: '封面人物', when: 'media', weight: 2,
    need: (s) => s.mental.fame >= 45,
    prompt: '雜誌要做你的封面專題，標題暫定是「一個人的隊伍」。稿子先寄來讓你確認。',
    options: [
      { id: 'accept', label: '照登，這本來就是事實', tone: 'bold',
        mental: { fame: 10, ego: 7, chem: -8, rep: -3 } },
      { id: 'rename', label: '要求把標題改成全隊合照', tone: 'plain',
        mental: { fame: 5, chem: 7, rep: 6 } },
      { id: 'decline', label: '推掉，時間留給訓練', tone: 'humble',
        mental: { fame: -3, rep: 3, chem: 2, nerve: 1 } },
    ],
  },

  /* ---------------- 休息室 ---------------- */
  {
    id: 'locker_gap', name: '休息室的沉默', when: 'locker', weight: 3,
    prompt: '中場休息，比分落後。沒有人講話，大家都在看自己的螢幕。',
    options: [
      { id: 'shout', label: '拍桌把節奏喊起來', tone: 'bold',
        mental: { nerve: 5, ego: 4, chem: 2, fame: 1 } },
      { id: 'talk', label: '把下一局的分工一條一條講清楚', tone: 'plain',
        mental: { nerve: 3, chem: 6 } },
      { id: 'wait', label: '什麼都不說，讓大家自己緩過來', tone: 'humble',
        mental: { chem: -2, nerve: -1, ego: -2 } },
    ],
  },
  {
    id: 'locker_rift', name: '隊內裂痕', when: 'locker', weight: 4,
    need: (s) => s.mental.chem <= 40,
    prompt: '有隊友在訓練賽裡直接對你翻白眼。這已經不是第一次了。',
    options: [
      { id: 'confront', label: '當場把話講死，要嘛改要嘛拆隊', tone: 'bold',
        mental: { ego: 6, chem: -9, nerve: 3, rep: -4 } },
      { id: 'sit', label: '賽後把人約出來單獨談', tone: 'plain',
        mental: { chem: 10, rep: 3 } },
      { id: 'endure', label: '忍下來，先把賽季打完', tone: 'humble',
        mental: { chem: -1, nerve: -3, ego: -3 } },
    ],
  },
  {
    id: 'locker_rookie', name: '新人來報到', when: 'locker', weight: 2,
    prompt: '二隊上來一個新人，跟你同位置，眼神裡全是想取代你的意思。',
    options: [
      { id: 'crush', label: '訓練賽狠狠碾他一輪，讓他知道差距', tone: 'bold',
        mental: { ego: 5, nerve: 2, chem: -5 } },
      { id: 'teach', label: '把自己的筆記整份給他', tone: 'plain',
        mental: { chem: 8, rep: 5, ego: -2 } },
      { id: 'ignore', label: '當作沒這個人', tone: 'humble',
        mental: { chem: -3, ego: 1 } },
    ],
  },
  {
    id: 'locker_celebrate', name: '奪冠之後', when: 'locker', weight: 2,
    need: (s) => s.wonSplitThisYear,
    prompt: '獎盃還在桌上，慶功宴的位子已經訂好了。麥克風遞到你手上。',
    options: [
      { id: 'declare', label: '「這只是開始，世界賽見。」', tone: 'bold',
        mental: { fame: 8, ego: 5, nerve: 4, rep: -1 } },
      { id: 'thank', label: '把每個隊友的名字唸一遍', tone: 'plain',
        mental: { chem: 9, rep: 6, fame: 3 } },
      { id: 'short', label: '「謝謝大家。」然後把麥克風傳走', tone: 'humble',
        mental: { rep: 3, chem: 2, ego: -2 } },
    ],
  },

  /* ---------------- 教練談話 ---------------- */
  {
    id: 'coach_bench', name: '教練的輪替名單', when: 'coach', weight: 3,
    prompt: '教練把你留下來：「下個賽段我想讓新人先發幾場。」他在等你的反應。',
    options: [
      { id: 'refuse', label: '「你要換我，先把理由講清楚。」', tone: 'bold',
        mental: { ego: 7, nerve: 3, chem: -6, rep: -3 } },
      { id: 'ask', label: '問清楚是哪裡不夠，然後照做', tone: 'plain',
        mental: { chem: 5, nerve: 3, rep: 3 } },
      { id: 'accept', label: '點頭，什麼都不問', tone: 'humble',
        mental: { chem: 2, nerve: -4, ego: -5 } },
    ],
  },
  {
    id: 'coach_style', name: '打法之爭', when: 'coach', weight: 3,
    prompt: '教練要全隊改成他那套運營體系，那跟你擅長的打法完全相反。',
    options: [
      { id: 'insist', label: '堅持自己的節奏，用成績說話', tone: 'bold',
        mental: { ego: 7, nerve: 4, chem: -5 } },
      { id: 'negotiate', label: '提出折衷版本，跟教練一起改', tone: 'plain',
        mental: { chem: 6, rep: 3, nerve: 2 } },
      { id: 'follow', label: '完全照教練的來', tone: 'humble',
        mental: { chem: 5, ego: -5, nerve: -1 } },
    ],
  },
  {
    id: 'coach_trust', name: '教練的私下談話', when: 'coach', weight: 2,
    prompt: '教練把門關上：「這支隊伍接下來要靠誰扛，我想聽你自己說。」',
    options: [
      { id: 'claim', label: '「我。這還用問嗎。」', tone: 'bold',
        mental: { ego: 8, nerve: 6, fame: 3, chem: -3 } },
      { id: 'team', label: '「看是哪一輪，誰手感好誰扛。」', tone: 'plain',
        mental: { chem: 7, nerve: 2, rep: 3 } },
      { id: 'humble', label: '「我還不夠格講這句話。」', tone: 'humble',
        mental: { nerve: -3, chem: 3, ego: -4, rep: 2 } },
    ],
  },

  /* ---------------- 日常訓練 ---------------- */
  {
    id: 'daily_scrim_call', name: '訓練賽的指揮權', when: 'daily', weight: 3,
    prompt: '訓練賽打到一半，兩個隊友對同一波開團的判斷吵起來，兩邊都轉頭看你。',
    options: [
      { id: 'decide', label: '直接拍板，照你的判斷走', tone: 'bold',
        mental: { ego: 5, nerve: 3, chem: -2 } },
      { id: 'vote', label: '暫停一下，三個人把邏輯講完再決定', tone: 'plain',
        mental: { chem: 6, nerve: 1 } },
      { id: 'pass', label: '「你們決定就好。」', tone: 'humble',
        mental: { chem: -2, ego: -4 } },
    ],
  },
  {
    id: 'daily_late', name: '有人又遲到了', when: 'daily', weight: 2,
    prompt: '同一個隊友這週第三次晚到團練。教練還沒進來，大家都在等你說話。',
    options: [
      { id: 'callout', label: '當著全隊的面唸他', tone: 'bold',
        mental: { ego: 4, chem: -5, rep: -2, nerve: 2 } },
      { id: 'private', label: '練完再私下提醒', tone: 'plain',
        mental: { chem: 6, rep: 3 } },
      { id: 'cover', label: '幫他跟教練圓過去', tone: 'humble',
        mental: { chem: 4, rep: 1, ego: -3 } },
    ],
  },
  {
    id: 'daily_grind', name: '深夜的訓練室', when: 'daily', weight: 3,
    prompt: '凌晨的訓練室只剩兩個人。隊友忽然開口：「你覺得我們今年真的有機會嗎？」',
    options: [
      { id: 'promise', label: '「有。我會把你們帶上去。」', tone: 'bold',
        mental: { nerve: 5, ego: 4, chem: 5 } },
      { id: 'honest', label: '「不知道，但我每天都在準備。」', tone: 'plain',
        mental: { nerve: 3, chem: 4, rep: 2 } },
      { id: 'doubt', label: '「說真的，我也不確定。」', tone: 'humble',
        mental: { nerve: -4, chem: 1, ego: -3 } },
    ],
  },
  {
    id: 'daily_stream_clip', name: '訓練時的直播剪輯', when: 'daily', weight: 2,
    prompt: '你在自己台上吐槽隊友的一段被剪出來瘋傳。隊友已經看到了。',
    options: [
      { id: 'own', label: '「講的是事實，我不收回。」', tone: 'bold',
        mental: { fame: 9, ego: 7, chem: -9, rep: -6 } },
      { id: 'explain', label: '進群組解釋當下的語境', tone: 'plain',
        mental: { fame: 2, chem: 2, rep: 1 } },
      { id: 'delete', label: '刪片，私下跟本人道歉', tone: 'humble',
        mental: { fame: -3, chem: 6, rep: 4, ego: -4 } },
    ],
  },
];

/** 外界反應的敘述，依 tone 與知名度分級。純敘事。 */
export const CROWD_REACTIONS = {
  bold: [
    '這段被剪成短影音到處轉，留言區吵成一團。',
    '圈內幾個評論人隔天就拿這件事開了一整集。',
    '討論區有人幫你說話，也有人整串在鞭。',
  ],
  plain: [
    '報導照著你的原話登出去，沒有掀起什麼波瀾。',
    '這段沒什麼人轉，但看過的人都給了好評。',
    '隊經理看完訪問，點了點頭。',
  ],
  humble: [
    '沒有人特別討論，這大概就是你要的效果。',
    '有人說你太客氣，也有人說這才是選手該有的樣子。',
    '這段在圈內流傳得不廣，但隊友有看到。',
  ],
};
