/**
 * 種子化亂數產生器（xorshift32，32-bit）。
 *
 * 全遊戲唯一的隨機來源。引擎只透過這個實例取亂數，UI 層一律不得呼叫，
 * 這是「同種子＋同選擇＝同一段人生」的前提。
 *
 * 內部狀態可讀寫（`state`），因此存檔可以把亂數進度一起序列化。
 *
 * 為什麼用 xorshift32：淨室重寫（S03）要把 v4-before 的 sfc-like 演算法整段換掉，
 * 不能只是改變數名。xorshift32 是公認最簡單的 32-bit 線性回饋移位暫存器——三行
 * 本體、全週期、均勻度夠（低維差距在實務用量下無感），而且和 sfc/mulberry 那族
 * 的加法混洗結構完全不同。種子字串用 FNV-1a 散成 32-bit：它比 cyrb 那類重型 hash
 * 少一圈迴圈，對「種子只有幾個字元」的用量綽綽有餘；FNV 對相似字串的輸出低位
 * 相近，但 xorshift32 自身迭代擴散性強，初始狀態差幾個 bit 幾步之後就完全無關。
 */
export class Rng {
  /** @param {string} seed */
  constructor(seed) {
    this.seedString = String(seed);
    this.reset();
  }

  reset() {
    // FNV-1a：字串 → 32-bit。offset basis 非零，任何非空種子都不會散成 0；
    // 保險起見仍留一個 fallback，避免極端輸入把 xorshift32 釘在零狀態
    let h = 0x811c9dc5;
    const str = this.seedString;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    this._s = h || 0x9e3779b9;
  }

  /** 序列化用：目前的內部狀態 */
  get state() { return this._s; }
  set state(v) { this._s = v | 0; }

  /** @returns {number} [0,1) */
  next() {
    let x = this._s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this._s = x | 0;
    return (x >>> 0) / 4294967296;
  }

  /** 含頭含尾的整數 */
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }

  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }

  /** p 為百分比（0-100） */
  chance(p) { return this.next() * 100 < p; }

  /** Fisher-Yates；不使用 sort(隨機比較器)，跨瀏覽器結果一致 */
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  sample(arr, n) { return this.shuffle(arr).slice(0, n); }

  /**
   * 近似常態分布，標準差 sd。
   *
   * 用 Box-Muller（兩個均勻 → 一個常態），截斷在 ±4σ——極端尾巴在生涯模擬裡
   * 只會產生「一個人強到沒道理」的離群值，截掉反而貼近遊戲要的分布形狀。
   */
  gauss(sd) {
    const u = Math.max(this.next(), 1e-12);   // log(0) 會炸，墊一個下限
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
    return clamp(z, -4, 4) * sd;
  }
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** 產生一組人類看得懂、可口述的新種子 */
export function randomSeed() {
  return Math.random().toString(36).slice(2, 10);
}
