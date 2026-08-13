/**
 * 賽事事件序列五拍（S15）。
 *
 * 季後賽／MSI／世界賽的每一場 BO 都走同一個五拍結構（V4 §15.2）：
 * 賽前敘事 → 備賽戰術（1 決策，4 選項）→ 戰術結算 → 比分 → 賽後敘事＋心理結算。
 *
 * 兩條紅線要在這裡驗：
 * - 備賽戰術的效果只掛在「這一場系列賽」上，不永久改屬性——那是「不讓季後賽變成
 *   屬性農場」的線
 * - 賽事期間不能休息（§6.3），備賽戰術裡唯一的恢復手段是「心態調整與休息」
 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { staminaOf } from '../../src/engine/stamina.js';
import { runSeriesEvent } from '../../src/phases/seriesEvent.js';

export const name = '賽事事件序列五拍';

/** 高戰力的職業選手探針：備賽戰術的體力與心理差異要看得見，不能被勝負雜訊蓋掉 */
function pro(seed, extra = {}) {
  const state = createState({ name: 'E', role: 'MID', seed });
  state.stage = 'PRO'; state.league = 'LCK'; state.team = 'T1';
  for (const k of Object.keys(state.attr)) state.attr[k] = 90;
  state.mates = [1, 2, 3, 4].map((i) => ({ name: `M${i}`, rating: 90 }));
  Object.assign(state, extra);
  return state;
}

/** 手動推進五拍 generator，備賽戰術固定選指定的 id，回傳全部 beat 與 runSeries 結果 */
function play(g, tacticId, opts = {}) {
  const beats = [];
  const flow = runSeriesEvent(g, { title: '八強 · BO5', bo: 5, oppRating: 50, seed: 1, stakes: 'playoff', ...opts });
  let input;
  let res;
  for (;;) {
    const step = flow.next(input);
    input = undefined;
    if (step.done) { res = step.value; break; }
    beats.push(step.value);
    if (step.value.type === 'choice') input = tacticId;
  }
  return { beats, res };
}

export async function run({ check }) {
  /* ---- 五拍結構與決策點 ---- */
  {
    const state = pro('five', { stamina: 60 });
    const { beats, res } = play({ state, rng: new Rng('five') }, 'system');
    check('五拍：賽前 → 戰術選擇 → 結算 → 結果 → 賽後',
      beats.length === 5
      && beats[0].type === 'card' && beats[0].title.includes('賽前')
      && beats[1].type === 'choice' && beats[1].kind === 'tactics'
      && beats[2].type === 'card' && beats[2].title.includes('備賽結算')
      && beats[3].type === 'card' && beats[3].title.includes('結果')
      && beats[4].type === 'card' && beats[4].title.includes('賽後'),
      beats.map((b) => b.title || b.type).join(' → '));
    check('備賽戰術是 4 選項', beats[1].options.length === 4, beats[1].options.map((o) => o.id).join(','));
    check('備賽戰術沒有休息選項（§6.3：賽事期間不能休息）',
      !beats[1].options.some((o) => o.id === 'rest'), beats[1].options.map((o) => o.id).join(','));
    check('第 4 拍回傳 runSeries 的結果', 'win' in res && 'games' in res && 'deaths' in res);
    check('體力消耗寫在選項註記上（玩家做決定那一刻看得到成本）',
      beats[1].options.every((o) => o.note.includes('體力')), beats[1].options.map((o) => o.note).join(' | '));
  }

  /* ---- 體力：mindset 是唯一恢復、bootcamp 消耗最重 ---- */
  {
    const net = (seed, tactic) => {
      const s = pro(seed, { stamina: 80 });
      play({ state: s, rng: new Rng(seed) }, tactic);
      return 80 - staminaOf(s);   // 正值＝淨消耗，負值＝淨恢復（含系列賽本身的消耗）
    };
    const boot = net('n-boot', 'bootcamp');
    const sys = net('n-sys', 'system');
    const mind = net('n-mind', 'mindset');
    check('集訓比強化體系更耗體力（−30 vs −20 的差距不會被局數吃掉）', boot > sys, `boot ${boot.toFixed(1)} vs sys ${sys.toFixed(1)}`);
    check('心態調整與休息是賽事期唯一恢復手段（淨恢復）', mind < 0, mind.toFixed(1));
    check('強化自身體系仍是消耗（不是白嫖）', sys > 0, sys.toFixed(1));
  }

  /* ---- 心理結算：贏長自信、輸掉自信（§15.2 第 5 拍） ---- */
  {
    const win = pro('psych-win', { stamina: 80 });
    win.mental.conf = 40;
    const r1 = play({ state: win, rng: new Rng('psych-win') }, 'system');
    check('高戰力碾壓下五拍必贏（探針成立）', r1.res.win === true);
    check('贏了長自信', win.mental.conf > 40, `conf ${win.mental.conf}`);

    const lose = pro('psych-lose', { stamina: 80 });
    lose.mental.conf = 60;
    for (const k of Object.keys(lose.attr)) lose.attr[k] = 30;   // 戰力壓低，保證輸
    const r2 = play({ state: lose, rng: new Rng('psych-lose') }, 'system', { oppRating: 95 });
    check('戰力懸殊時五拍必輸（探針成立）', r2.res.win === false);
    check('輸了掉自信', lose.mental.conf < 60, `conf ${lose.mental.conf}`);
  }

  /* ---- stakes 決定壓力係數：生死戰的低抗壓陣亡比季後賽高（V4 §9.3／§15.4） ---- */
  {
    let elimD = 0; let playoffD = 0;
    for (let i = 0; i < 200; i++) {
      const a = pro(`elim-${i}`, { stamina: 80 }); a.mental.comp = 30;
      const b = pro(`play-${i}`, { stamina: 80 }); b.mental.comp = 30;
      const ra = play({ state: a, rng: new Rng(`elim-${i}`) }, 'system', { stakes: 'elimination' });
      const rb = play({ state: b, rng: new Rng(`play-${i}`) }, 'system', { stakes: 'playoff' });
      elimD += ra.res.deaths;
      playoffD += rb.res.deaths;
    }
    check('生死戰（elimination）的壓力係數比季後賽高，低抗壓的陣亡被放大',
      elimD > playoffD, `${elimD} vs ${playoffD}`);
  }

  /* ---- 被反制：research 是賭博，統計上會偶爾翻車 ---- */
  {
    let counters = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const s = pro(`ct-${i}`, { stamina: 80 });
      const { beats } = play({ state: s, rng: new Rng(`ct-${i}`) }, 'research');
      // 第 3 拍被換成「被反制」卡時，代表針對研究失敗了
      if (beats[2].title.includes('被反制')) counters += 1;
    }
    check('針對研究有被反制的風險（約兩成）', counters > 0 && counters < N / 2,
      `${counters}/${N}`);
  }
}
