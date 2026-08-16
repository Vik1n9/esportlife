/** 自由市場：報價層級、挖角門檻、休息室與輿論的後果。 */
import { Rng } from '../../src/core/rng.js';
import { createState } from '../../src/engine/state.js';
import { generateOffers, clubVerdict, positionDemandThreshold, scoutInterest, SCOUT_BAR } from '../../src/engine/market.js';
import { LEAGUES } from '../../src/data/leagues.js';
import { effectiveCoachRating } from '../../src/engine/attributes.js';
import { LIFECYCLE_BASE } from '../../src/data/lifecycle.js';
import { driveUntil, isSigningOffer } from '../lib/harness.mjs';

export const name = '自由市場與挖角門檻';

export async function run({ check }) {
  {
    // 頂尖選手不該被強制降級
    const rng = new Rng('market');
    const state = createState({ name: 'M', role: 'TOP', seed: 'market' });
    state.stage = 'PRO'; state.league = 'LCK'; state.team = 'T1'; state.lastDelta = 4;
    for (const k of Object.keys(state.attr)) state.attr[k] = 94;
    const offers = generateOffers(state, rng, { excludeCurrentTeam: false });
    check('頂尖選手收到海外報價',
      offers.some((o) => ['LCK', 'LPL', 'LEC', 'LCS'].includes(o.league)),
      JSON.stringify(offers.map((o) => o.league)));
  }

  {
    // 只夠青訓的實力，不該收到一隊的邀約（舊版把打不到的選項擺出來騙人）
    // ⚠ S19d 出生流位移之後，業餘期訓練的成長路徑會隨出生流漂移（練到哪些屬性、
    //   rating 何時跨過一隊門檻都跟著變）——「跑完業餘期 rating 仍不到 56」是舊隨機流
    //   的巧合，不是機制（CEILING_FLOOR 軟底讓 attr 50 一年內必然漲破）。這個場景
    //   要不變的是「簽約選項永遠不超過當下 rating」：心理與生命週期固定成中性值，
    //   場景只由 attr／potential 決定，再驗證選項與 rating 一致
    const state = createState({ name: 'A', role: 'JG', seed: 'academy-only', stage: 'AMATEUR' });
    for (const k of Object.keys(state.attr)) state.attr[k] = 50;   // 介於青訓 45 與一隊 56 之間
    for (const k of Object.keys(state.potential)) state.potential[k] = 52;
    for (const k of Object.keys(state.mental)) state.mental[k] = 50;
    state.lifecycle = structuredClone(LIFECYCLE_BASE);

    check('門檻層級由低到高', SCOUT_BAR.AM2 < SCOUT_BAR.HOME && SCOUT_BAR.HOME <= SCOUT_BAR.OVERSEAS,
      JSON.stringify(SCOUT_BAR));

    // 靜態判定：rating 50 當下，球探只對二隊有興趣——一隊選項不得出現在 rating 夠不到的人面前
    const interest = scoutInterest(state);
    check('rating 50 只被青訓注意到', interest.am2 && !interest.home, JSON.stringify(interest));

    const rng = new Rng('academy-only');
    let chosen = null;
    const signChecks = [];
    const choices = driveUntil(state, rng, {
      stop: (st) => st.stage !== 'AMATEUR',
      answer: (beat) => {
        if ((beat.options || []).some((o) => o.id.startsWith('sign-'))) {
          // 簽約當下的 rating 與選項層級要一致：一隊選項出現 ⇔ rating ≥ 一隊門檻
          const rating = effectiveCoachRating(state);
          const proShown = beat.options.some((o) => o.id.startsWith('sign-') && !/青訓二隊/.test(o.label));
          signChecks.push({ rating, proShown });
          chosen = beat.options[0];
        }
        return beat.options[0].id;
      },
    });
    const offer = choices.find(isSigningOffer);
    check('這種實力會收到邀約', !!offer);
    check('簽約選項不超過當下 rating（一隊選項 ⇔ rating ≥ 56）',
      signChecks.length > 0 && signChecks.every(({ rating, proShown }) => proShown === (rating >= SCOUT_BAR.HOME)),
      JSON.stringify(signChecks));
    check('簽下的選項與進入階段一致（青訓 → AM2、一隊 → PRO）',
      chosen && (/青訓二隊/.test(chosen.label) ? state.stage === 'AM2' : state.stage === 'PRO'),
      `${state.stage}`);
  }

  {
    // 休息室與輿論的後果，有冷卻不會變常態
    const rng = new Rng('verdict');
    const state = createState({ name: 'V', role: 'ADC', seed: 'verdict' });
    state.stage = 'PRO'; state.league = 'HOME'; state.contract = { years: 3, mult: 1 }; state.year = 2020;

    // 打得動、隊內也沒事的人不該被動到。屬性拉到聯賽水準之上，讓切割那條也不成立
    for (const k of Object.keys(state.attr)) state.attr[k] = 80;
    state.mental.trust = 50;
    let fired = 0;
    for (let i = 0; i < 200; i++) { state.lastVerdictYear = null; if (clubVerdict(state, rng).kind !== 'none') fired++; }
    check('心理狀態正常時不會被開除', fired === 0, fired);

    state.mental.trust = 5;
    fired = 0;
    for (let i = 0; i < 400; i++) { state.lastVerdictYear = null; if (clubVerdict(state, rng).kind === 'rift') fired++; }
    check('信任崩到底會被迫轉隊', fired > 100, fired);

    state.lastVerdictYear = 2020;
    check('冷卻期內不會連續兩年被拆隊', clubVerdict(state, rng).kind === 'none');

    state.year = 2024;
    let recovered = false;
    for (let i = 0; i < 50; i++) { state.lastVerdictYear = 2020; if (clubVerdict(state, rng).kind !== 'none') recovered = true; }
    check('冷卻結束後恢復判定', recovered);
  }

  /* ---- V4 §9.4：切割判定改讀教練評價 ＋ 特質副作用（`rep` 風評已整條刪除） ---- */
  {
    const rng = new Rng('verdict-fire');
    const make = (rating, traits = {}, rare = {}) => {
      const s = createState({ name: 'F', role: 'ADC', seed: 'verdict-fire' });
      s.stage = 'PRO'; s.league = 'HOME'; s.contract = { years: 3, mult: 1 }; s.year = 2020;
      for (const k of Object.keys(s.attr)) s.attr[k] = rating;
      s.mental.trust = 50;                 // 把拆隊那條排除掉，只留切割
      Object.assign(s.traits, traits);
      Object.assign(s.rare, rare);
      return s;
    };
    const count = (s, kind) => {
      let n = 0;
      for (let i = 0; i < 400; i++) { s.lastVerdictYear = null; if (clubVerdict(s, rng).kind === kind) n++; }
      return n;
    };

    check('打得動就不會被切割', count(make(80), 'fired') === 0);
    const weak = count(make(52), 'fired');
    check('打不到聯賽水準才進入切割判定', weak > 0, `400 次裡 ${weak} 次`);

    // 特質副作用是 §9.4 指名的第二個來源：同樣的實力，帶著圈內毒瘤更容易被切
    const toxic = count(make(52, { pariah: true }), 'fired');
    check('特質副作用會加重切割風險（§9.4）', toxic > weak, `毒瘤 ${toxic} vs 一般 ${weak}`);

    // 而護盾特質擋得住——傳奇偶像／話題製造機那一類
    check('護盾特質擋得住切割', count(make(52, {}, { icon: true }), 'fired') === 0);
  }

  /* ---- §18.2 位置需求門檻：年齡偏好對稱（S21b 校準） ---- */
  {
    /*
     * 這個門檻的用途寫在 `market.js` 的說明裡——淘汰**衰退中的老將**。舊值不分年齡
     * 一律釘在主場賽區 min，於是新秀的第一份兩年約一到期就撞上它（實測 21 歲平均
     * 評價 61.9 對門檻 62.6，67/100 的 DEMO 段死在第 24 個月）。現在兩端對稱：
     * 30 歲以後每年變嚴，22 歲以前每年變寬，22–30 歲是同一條線。
     *
     * 守的是**形狀**（單調、對稱、中段持平、仍在硬地板 FLOOR_RATING 38 之上），
     * 不是那幾個數字本身——調校準時數字會動，形狀不該動。
     */
    const at = (age, patch = {}) => {
      const s = createState({ name: 'T', role: 'MID', seed: 'demand-threshold' });
      s.stage = 'PRO'; s.league = 'HOME'; s.age = age; s.contract = null;
      Object.assign(s, patch);
      return positionDemandThreshold(s);
    };
    const base = LEAGUES.HOME.min;

    check('門檻中段＝主場賽區 min（22–30 歲同一條線）',
      at(22) === base && at(26) === base && at(30) === base, `${at(22)}／${at(26)}／${at(30)}`);
    check('新秀三年逐年放寬（19 < 20 < 21 < 22）',
      at(19) < at(20) && at(20) < at(21) && at(21) < at(22), `${at(19)}／${at(20)}／${at(21)}／${at(22)}`);
    check('老將逐年收緊（30 < 31 < 33）', at(30) < at(31) && at(31) < at(33), `${at(31)}／${at(33)}`);
    check('放寬幅度有限——最寬的一年仍高過硬地板 FLOOR_RATING 38',
      at(19) > 38 && base - at(19) <= 8, `19 歲門檻 ${at(19)}（base ${base}）`);
    check('被下放與長約仍然加碼（放寬不吃掉既有兩項）',
      at(21, { benchedStreak: 2 }) > at(21)
      && at(21, { contract: { years: 3, mult: 1 } }) > at(21),
      `${at(21)}／下放 ${at(21, { benchedStreak: 2 })}／長約 ${at(21, { contract: { years: 3, mult: 1 } })}`);
  }
}
