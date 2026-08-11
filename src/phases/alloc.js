/**
 * 能力點分配。
 *
 * 同一個 kind 在年曆上出現兩次（賽季結算後一次、國際賽結束後一次），標題由年曆那一
 * 列自己帶——階段是可以參數化重複使用的。
 */
export const kind = 'ALLOC';

export function* run(g, phase) {
  const { state } = g;
  if (state.pendingPoints <= 0) return;

  const points = state.pendingPoints;
  state.pendingPoints = 0;
  yield { type: 'alloc', mode: 'points', points, title: `${phase.title}（${points} 點）` };
}
