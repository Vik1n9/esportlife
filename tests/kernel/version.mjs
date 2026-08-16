/**
 * 版號單一來源不變式。
 *
 * AGENTS.md 版本編號規則：`X.Y.Z` **適用全專案**——規格書版本號與軟體版本
 * 共用同一套。也就是說專案裡有三份版號手抄本：
 *
 *   ① `package.json` 的 `version`          （套件版號）
 *   ② `src/version.js` 的 `APP_VERSION`     （玩家看得到：右上角徽章＋分享圖）
 *   ③ `ESPORT-DESIGN-V4.md` 檔頭            （規格書版號）
 *
 * 三份必須逐字相同才會正確，所以照單一來源規則要有測試守著
 * （「跨檔字串比對必須有測試」）。這條測試是 S22 返工三換來的：`APP_VERSION`
 * 從 v4.0.0 一路漂到規格書 v4.5.3 都沒人發現，因為沒有任何東西比對過它——
 * S22 文件同步站的範圍寫明「不要改 src/」，版號徽章就這樣被跳過了。
 *
 * ⚠ 瀏覽器讀不到 `package.json`（零建置、無打包器），所以 `APP_VERSION` 只能是
 * 字面值，不能真的 import 過來。單一來源靠這條測試維持，不是靠程式結構。
 * 升版時三處一起改，這裡會擋住漏改的那一處。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../../src/version.js';

export const name = '版號單一來源（package.json／APP_VERSION／規格書檔頭）';

const root = (rel) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));

/** 規格書檔頭：`# … — 規格企劃書 v4.5.3（…）`，只取第一行避免掃到增訂註記 */
function specVersion() {
  const head = readFileSync(root('ESPORT-DESIGN-V4.md'), 'utf8').split('\n')[0];
  return head.match(/v(\d+\.\d+\.\d+)/)?.[1] ?? null;
}

/** CHANGELOG 最新一節：`## [v4.5.3] - 2026-08-16` */
function changelogVersion() {
  const line = readFileSync(root('CHANGELOG.md'), 'utf8')
    .split('\n').find((l) => l.startsWith('## ['));
  return line?.match(/\[v?(\d+\.\d+\.\d+)\]/)?.[1] ?? null;
}

export async function run({ check, log }) {
  const pkg = JSON.parse(readFileSync(root('package.json'), 'utf8')).version;
  const spec = specVersion();
  const changelog = changelogVersion();

  check('package.json 有版號', /^\d+\.\d+\.\d+$/.test(pkg ?? ''), `讀到 ${pkg}`);
  check('規格書檔頭解析得出版號', spec !== null, 'ESPORT-DESIGN-V4.md 第一行沒有 vX.Y.Z');
  check('CHANGELOG 最新節解析得出版號', changelog !== null, 'CHANGELOG.md 找不到 ## [vX.Y.Z]');

  // APP_VERSION 帶 v 前綴（徽章要顯示 v），比對時脫掉再比
  check('APP_VERSION 格式為 vX.Y.Z', /^v\d+\.\d+\.\d+$/.test(APP_VERSION), `讀到 ${APP_VERSION}`);
  const app = APP_VERSION.replace(/^v/, '');

  check('APP_VERSION 與 package.json 同號', app === pkg,
    `APP_VERSION=${APP_VERSION}／package.json=${pkg}`);
  check('規格書與 package.json 同號（AGENTS.md：全專案共用一套）', spec === pkg,
    `規格書=v${spec}／package.json=${pkg}`);
  check('CHANGELOG 最新節與 package.json 同號', changelog === pkg,
    `CHANGELOG=v${changelog}／package.json=${pkg}`);

  log(`package.json=${pkg}｜APP_VERSION=${APP_VERSION}｜規格書=v${spec}｜CHANGELOG=v${changelog}`);
}
