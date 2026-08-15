/**
 * 生涯傳記生成（V4 §15.5，S21a）。
 *
 * 純拼接、無 LLM、無隨機文案：同一顆 state 必定產出同一篇傳記。
 * 段落模板住在 `data/biography.js`，這裡只做「讀事實 → 選模板 → 填空」。
 *
 * 資料來源限定（§15.5）：
 *   S17a 帳本（milestones／teamHistory／awards／intlRecord）、honors、
 *   四階特質 ＋ 天生特質 ＋ fusedAway、S17b 的 labels（route 標籤與失敗降階）。
 *
 * ⚠ 不讀隱藏心理六維——六維到結算都還是不可見的（§9.1），傳記寫出來就等於
 *   揭底，把「因隱藏、果可見」的循環一次報廢。
 * ⚠ 不印 peakRating：教練評價是內部值（§10.1），傳記只能講玩家看得到的事實。
 */
import { BIO_TEMPLATES as T } from '../data/biography.js';
import { BASE_TRAITS } from '../data/traits.js';
import { INNATE_POOL } from '../data/innate.js';
import { QUEST_CARDS } from '../data/quests.js';
import { ROLE_NAMES } from '../data/skills.js';
import { activeTraitNames } from './progression.js';
import { distinctTeams } from './ledger.js';
import { finishOrder, INTL_EVENT_NAMES, NO_FINISH } from '../data/formats/finishes.js';
import { fill } from '../kernel/text.js';

/** 特質清單的引用寫法：『「A」「B」』 */
const joiner = (list) => list.map((x) => `「${x}」`).join('、');

/**
 * 生涯最佳國際賽里程碑：回 {year, event, rank}，沒打過回 null。
 *
 * ⚠ 序位讀 `data/formats/finishes.js` 的共用名次表（S20c），不再自己抄一份
 * `INTL_SCORE`——那是第三份手抄本，註解還寫著「與 `WORLDS_ORDER` 同一套」，
 * 而實際上兩邊的空格寫法不同。世界賽與 MSI 用同一把尺比較，「巔峰」段才挑得出
 * 真正最好的一次。
 */
function bestIntl(state) {
  let best = null;
  for (const m of state.milestones) {
    if (m.kind !== 'intl') continue;
    const rank = finishOrder(m.finish);
    if (rank === NO_FINISH) continue;
    if (!best || rank < best.rank) best = { year: m.year, event: m.event, rank };
  }
  return best;
}

/** 生涯最出色的職業賽季：{year, margin}。沒打過職業（teamHistory 空）時退到業餘賽季 */
function bestSeason(state) {
  const firstPro = state.teamHistory[0]?.fromYear ?? -Infinity;
  const pro = state.seasonLog.filter((e) => e.year >= firstPro && e.stat);
  const pool = pro.length ? pro : state.seasonLog;
  let best = null;
  for (const e of pool) {
    const margin = e.stat.W - e.stat.L;
    if (!best || margin > best.margin) best = { year: e.year, margin };
  }
  return best;
}

/* ---------------- 五段結構 ---------------- */

/** 出道：業餘出身 → 出道年、出道隊、位置；天生特質有就補一句。沒打進職業就退化 */
function debutParagraph(state) {
  const debut = state.milestones.find((m) => m.kind === 'debut');
  if (!debut) return fill(T.debut.amateurOnly, { name: state.name });

  const team = debut.text.replace(/^出道於 /, '');
  const text = fill(T.debut.standard, {
    name: state.name, year: debut.year, team, role: ROLE_NAMES[state.role],
  });
  const innate = INNATE_POOL.map((e) => e.key)
    .filter((k) => state.traits[k])
    .map((k) => BASE_TRAITS[k]?.name)
    .filter(Boolean);
  return innate.length ? `${text}${fill(T.debut.innate, { list: joiner(innate) })}` : text;
}

/** 巔峰：世界冠軍 > 決賽 > 四強 > 自家聯賽 > 最佳賽季。國際賽沒打過就把這句講出來 */
function peakParagraph(state, best) {
  const { worldsWins, splitTitles, name } = state;
  if (worldsWins > 0 && best?.rank === 1) {
    return fill(T.peak.worldsWin, { year: best.year, name, n: worldsWins });
  }
  if (best) {
    const event = INTL_EVENT_NAMES[best.event];
    if (best.rank === 2) return fill(T.peak.intlFinal, { year: best.year, event, name });
    if (best.rank === 3) return fill(T.peak.intlTop4, { year: best.year, event, name });
  }
  if (splitTitles > 0) {
    const tpl = state.intlAppearances === 0 ? T.peak.domesticNoIntl : T.peak.domestic;
    return fill(tpl, { name, n: splitTitles });
  }

  const season = bestSeason(state);
  if (season) {
    const tpl = state.intlAppearances === 0 ? T.peak.bestSeasonNoIntl : T.peak.bestSeason;
    const margin = season.margin >= 0 ? `+${season.margin}` : `${season.margin}`;
    return fill(tpl, { year: season.year, margin, name });
  }
  return fill(T.peak.none, { name });
}

/** 轉折：解散 → 被切割 → 合成消耗 → 任務功虧一簣 → 下滑。全無就寫「一路平穩」 */
function turnParagraph(state, season) {
  const parts = [];
  const disbands = state.milestones.filter((m) => m.kind === 'disband');
  if (disbands.length === 1) {
    parts.push(fill(T.turn.disbandOnce, {
      year: disbands[0].year, team: disbands[0].text.replace(/ 解散$/, ''), name: state.name,
    }));
  } else if (disbands.length > 1) {
    parts.push(fill(T.turn.disbandMany, { n: disbands.length, name: state.name }));
  }

  for (const m of state.milestones) {
    if (m.kind !== 'fired') continue;
    const cut = /^遭 (.+)切割$/.exec(m.text);
    const leave = /^被迫離開 (.+)$/.exec(m.text);
    const team = (cut?.[1] ?? leave?.[1] ?? '').trim();
    if (team) parts.push(fill(T.turn.fired, { year: m.year, team, name: state.name }));
  }

  if (state.fusedAway.length) {
    parts.push(fill(T.turn.fused, { list: joiner(state.fusedAway), name: state.name }));
  }

  const byId = new Map(QUEST_CARDS.map((c) => [c.id, c]));
  for (const f of (state.quests?.done ?? []).filter((d) => d.result === 'failed').slice(0, 2)) {
    const card = byId.get(f.id);
    if (card) parts.push(fill(T.turn.nearMiss, { quest: card.name }));
  }

  if (season && state.year - season.year >= 3) {
    parts.push(fill(T.turn.decline, { year: season.year, name: state.name }));
  }

  if (parts.length) return parts.join('');

  const last = state.teamHistory[state.teamHistory.length - 1];
  if (last) return fill(T.turn.calm, { name: state.name, team: last.team });
  return fill(T.turn.calmAmateur, { name: state.name });
}

/** 結局：退役年、歲數、季數、隊伍數、出賽數。沒打過職業就退化 */
function endingParagraph(state) {
  const games = Object.values(state.stats).reduce((t, s) => t + s.G, 0);
  if (!state.teamHistory.length) {
    return fill(T.ending.amateurOnly, { name: state.name, year: state.year, age: state.age });
  }
  return fill(T.ending.standard, {
    name: state.name, year: state.year, age: state.age,
    n: state.proYears, m: distinctTeams(state), g: games,
  });
}

/** 歷史定位一句：route 標籤 > 傳說特質 > 世界冠軍 > 賽段冠軍 > 年資 > 平凡 */
function legacyParagraph(state) {
  const byId = new Map(QUEST_CARDS.map((c) => [c.id, c]));
  const routes = (state.quests?.done ?? [])
    .filter((d) => d.result === 'achieved')
    .map((d) => byId.get(d.id)?.result?.label)
    .filter(Boolean);
  if (routes.length) return fill(T.legacy.route, { list: joiner(routes.slice(0, 2)) });

  const legends = activeTraitNames(state).legendary;
  if (legends.length) return fill(T.legacy.legendary, { list: joiner(legends.slice(0, 2)) });

  if (state.worldsWins > 0) return T.legacy.worlds;
  if (state.splitTitles >= 2) return fill(T.legacy.titles, { n: state.splitTitles });
  if (state.proYears >= 7) return fill(T.legacy.tenure, { n: state.proYears });
  return T.legacy.plain;
}

/**
 * 生成整篇傳記：五段（出道 → 巔峰 → 轉折 → 結局 → 歷史定位）。
 * 純函式——吃 state 回字串陣列，同一顆 state 必定同一篇。
 */
export function buildBiography(state) {
  return [
    debutParagraph(state),
    peakParagraph(state, bestIntl(state)),
    turnParagraph(state, bestSeason(state)),
    endingParagraph(state),
    legacyParagraph(state),
  ];
}
