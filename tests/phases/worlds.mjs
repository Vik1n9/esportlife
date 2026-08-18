/**
 * 世界賽冠軍登記與衛冕者（S20g，§16.2）。
 *
 * 起點是 `torch_bearer`（火炬手）的授予條件「世界賽淘汰現任世界冠軍」接不上——遊戲裡
 * 對手只是一顆浮點數，沒有隊名、沒有身分，玩家沒奪冠的年份也不記錄誰奪冠。這一站
 * 插進第一個**對手身分**概念：`titleHistory` 登記表 ＋ `challengableChampion` 賽路判定
 * ＋ 衛冕者強度加成，讓 `torch_bearer` 成為真的拿得到的東西。
 *
 * 兩層驗證：
 * 1. 純函式——`drawChampion`／`challengableChampion` 直接構造狀態驗，不靠 160 段碰運氣
 * 2. 整段世界賽驅動——用假 rng 逼玩家奪冠，驗證登記表與火炬手真的會被寫進去
 */
import { createState } from '../../src/engine/state.js';
import {
  CHAMPION_BONUS, CHAMPION_ENCOUNTER, challengableChampion, drawChampion,
} from '../../src/engine/champion.js';
import { teamNamesOf } from '../../src/data/regions/index.js';
import { eraOf } from '../../src/data/eras.js';
import { run as worldsRun } from '../../src/phases/worlds.js';

export const name = '世界賽冠軍登記與衛冕者';

/** 職業 LCK 選手探針 */
function pro(year = 2016, extra = {}) {
  const s = createState({ name: 'W', role: 'MID', seed: 'worlds-champ' });
  s.stage = 'PRO';
  s.league = 'LCK';
  s.team = 'T1';
  s.year = year;
  s.mates = [1, 2, 3, 4].map((i) => ({ name: `M${i}`, rating: 70 }));
  Object.assign(s, extra);
  return s;
}

/** 假 rng：`chance` 一律真（全勝）、`next` 一律 0（pick 取第一個） */
const forceWin = {
  next: () => 0,
  int: (a) => a,
  pick: (arr) => arr[0],
  chance: () => true,
  gauss: () => 0,
  shuffle: (arr) => arr.slice(),
  sample: (arr, n) => arr.slice(0, n),
};

/** 手動推進世界賽 generator，choice 一律選第一個，回傳全部 beat */
function driveWorlds(state, rng) {
  const flow = worldsRun({ state, rng });
  const beats = [];
  let input;
  for (;;) {
    const step = flow.next(input);
    input = undefined;
    if (step.done) break;
    beats.push(step.value);
    if (step.value.type === 'choice') input = step.value.options[0].id;
  }
  return beats;
}

export async function run({ check }) {
  /* ---- 純函式：抽合成 NPC 冠軍 ---- */
  {
    const s = pro(2024);
    // 席位數加權：2024 年 LCK／LPL 各 4 席，奪冠機率最高。這裡只驗「抽得出來、隊名是真的」
    for (let i = 0; i < 50; i++) {
      const entry = drawChampion(s, forceWin, { isPlayer: false });
      check('NPC 冠軍的隊名是該年代該賽區的真實隊名',
        teamNamesOf(entry.region, eraOf(s.year).home).includes(entry.team),
        `${entry.region}/${entry.team}`);
      check('NPC 冠軍 entry 形狀與玩家一致（event/finish/isPlayer）',
        entry.event === 'worlds' && entry.finish === 'champion' && entry.isPlayer === false,
        JSON.stringify(entry));
    }
  }

  /* ---- 純函式：玩家奪冠的 entry 帶 isPlayer ---- */
  {
    const s = pro(2024);
    const entry = drawChampion(s, forceWin, { isPlayer: true, team: s.team, region: 'KR' });
    check('玩家奪冠 entry 帶 isPlayer:true 與玩家的隊伍', entry.isPlayer === true && entry.team === 'T1', JSON.stringify(entry));
  }

  /* ---- 純函式：衛冕者賽路的三種不可挑戰情形 ---- */
  {
    const s = pro(2020);
    check('第一年（無登記）→ 無可挑戰衛冕者', challengableChampion(s) === null);

    s.titleHistory = [{ year: 2019, event: 'worlds', finish: 'champion', team: 'T1', region: 'KR', isPlayer: true }];
    check('玩家自己就是衛冕者 → 不可挑戰（不能淘汰自己）', challengableChampion(s) === null);

    s.titleHistory = [{ year: 2019, event: 'worlds', finish: 'champion', team: 'SKT', region: 'KR', isPlayer: false }];
    const champ = challengableChampion(s);
    check('NPC 衛冕者且其賽區今年有席位 → 可挑戰', champ && champ.team === 'SKT', JSON.stringify(champ));
  }

  /* ---- 常數：衛冕者比一般對手強，且越晚越可能碰上 ---- */
  {
    check('衛冕者強度加成是正值（冠軍比一號種子強）', CHAMPION_BONUS > 0, CHAMPION_BONUS);
    check('相遇機率八強 < 四強 < 決賽',
      CHAMPION_ENCOUNTER.quarter < CHAMPION_ENCOUNTER.semi
      && CHAMPION_ENCOUNTER.semi < CHAMPION_ENCOUNTER.final,
      JSON.stringify(CHAMPION_ENCOUNTER));
  }

  /* ---- 整段世界賽：玩家奪冠 → 登記表有玩家、torch_bearer 發放 ---- */
  {
    const s = pro(2016, {
      champPoints: 180,   // 第一種子（2016 是冠軍點數制）
      titleHistory: [{ year: 2015, event: 'worlds', finish: 'champion', team: 'SKT', region: 'KR', isPlayer: false }],
    });
    const beats = driveWorlds(s, forceWin);

    check('世界賽打完，今年冠軍已進登記表',
      s.titleHistory.some((e) => e.year === 2016 && e.event === 'worlds' && e.isPlayer === true),
      JSON.stringify(s.titleHistory));
    check('玩家奪冠 → 世界賽冠軍計數 +1', s.worldsWins === 1, s.worldsWins);
    check('淘汰賽贏下衛冕冠軍 → 火炬手授予（unique 階，非 unlockTrait）',
      s.unique.torch_bearer === true, JSON.stringify(s.unique));
    check('火炬手沒有誤寫進通用池', !s.traits.torch_bearer);
    check('授予有 beat（世代交替的敘事看得到）',
      beats.some((b) => b.type === 'card' && b.title.includes('火炬手')),
      beats.filter((b) => b.type === 'card').map((b) => b.title).join('／'));
  }

  /* ---- 整段世界賽：玩家沒晉級 → 仍要登記一個 NPC 冠軍（每年都有人） ---- */
  {
    const s = pro(2016, { champPoints: 0 });   // 沒門票
    driveWorlds(s, forceWin);
    check('玩家沒晉級，今年冠軍仍進登記表（NPC 合成冠軍）',
      s.titleHistory.some((e) => e.year === 2016 && e.event === 'worlds' && e.isPlayer === false),
      JSON.stringify(s.titleHistory));
  }

  /* ---- 國際賽母體：玩家與 NPC 微觀都併進 intl 池（§24.4.3，S34 玩家側／S35 NPC 側） ---- */
  {
    const s = pro(2016, { champPoints: 180 });
    driveWorlds(s, forceWin);
    const pool = s.leaguePool?.[2016]?.intl?.stats ?? {};
    const npcRows = Object.entries(pool).filter(([k]) => k !== 'player');
    check('打完世界賽，intl 池有 NPC 對手的微觀行（小組 BO1＋淘汰賽 BO5 兩路都併）',
      npcRows.length >= 5, `${npcRows.length} 筆`);
    check('玩家自己的微觀也在同一個池（同位置百分位的兩半）', !!pool.player, Object.keys(pool).length);
    check('NPC 行與玩家行同格式（都有 G 與 role）',
      npcRows.every(([, r]) => r.G > 0 && r.role) && pool.player.G > 0);
  }

  /* ---- 存檔往返帶得動 titleHistory（純 JSON，S20g） ---- */
  {
    const s = pro(2016, { champPoints: 180 });
    s.titleHistory = [{ year: 2015, event: 'worlds', finish: 'champion', team: 'SKT', region: 'KR', isPlayer: false }];
    const roundtrip = JSON.parse(JSON.stringify(s));
    check('titleHistory 經 JSON 序列化往返不變',
      JSON.stringify(roundtrip.titleHistory) === JSON.stringify(s.titleHistory),
      JSON.stringify(roundtrip.titleHistory));
  }
}
