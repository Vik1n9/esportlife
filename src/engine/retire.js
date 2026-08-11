/**
 * 退役訊號。
 *
 * 退役可能發生在年度流程的任何深處（訓練期年齡到頂、業餘三年沒人要、自由市場
 * 沒人開價、被解散後無人接手）。用例外往上拋，比讓每一層都回傳「我要不要繼續」
 * 乾淨——階段模組只要 `retire(reason)`，主迴圈負責接。
 */
export class RetireSignal extends Error {
  constructor(reason) { super(reason); this.reason = reason; }
}

export const retire = (reason) => { throw new RetireSignal(reason); };
