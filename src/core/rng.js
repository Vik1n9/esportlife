/**
 * 種子化亂數產生器（sfc-like，32-bit）。
 *
 * 全遊戲唯一的隨機來源。引擎只透過這個實例取亂數，UI 層一律不得呼叫，
 * 這是「同種子＋同選擇＝同一段人生」的前提。
 *
 * 內部狀態可讀寫（`state`），因此存檔可以把亂數進度一起序列化。
 */
export class Rng {
  /** @param {string} seed */
  constructor(seed) {
    this.seedString = String(seed);
    this.reset();
  }

  reset() {
    let s = 1779033703;
    const str = this.seedString;
    for (let i = 0; i < str.length; i++) {
      s = Math.imul(s ^ str.charCodeAt(i), 3432918353);
      s = (s << 13) | (s >>> 19);
    }
    this._s = s | 0;
  }

  /** 序列化用：目前的內部狀態 */
  get state() { return this._s; }
  set state(v) { this._s = v | 0; }

  /** @returns {number} [0,1) */
  next() {
    this._s |= 0;
    this._s = (this._s + 0x6d2b79f5) | 0;
    let t = Math.imul(this._s ^ (this._s >>> 15), 1 | this._s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
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

  /** 近似常態分布，標準差 sd */
  gauss(sd) { return ((this.next() + this.next() + this.next() + this.next() - 2) / 2) * sd * 2; }
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** 產生一組人類看得懂、可口述的新種子 */
export function randomSeed() {
  return Math.random().toString(36).slice(2, 10);
}
