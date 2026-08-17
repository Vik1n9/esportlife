/**
 * 虛構隊友名池（S23.6 定案，S28 落地）。
 *
 * `MATE_NAMES`（十二個真實選手 ID）退役後，業餘期與合成隊友取名改吃這裡。
 * 為什麼不能再用真實選手名：那十二個名字現在以 `player_id` 身分住在 NPC 池裡，
 * 兼業餘虛構名等於讓同一個名字在「史實選手」與「網咖路人」兩種身分間漂移。
 *
 * 本池全部是虛構綽號，不指向任何真實選手。合成隊友（`data_source: 'synthetic'`，
 * 抽不到真實 NPC 的洞）與業餘期隊友共用同一個池——兩者都是「沒有身分的人」。
 */
export const MATE_FICTIONAL = [
  'Basalt',
  'Bramble',
  'Cinder',
  'Drift',
  'Eclipse',
  'Fathom',
  'Glimmer',
  'Halcyon',
  'Ignis',
  'Jetstream',
  'Kestrel',
  'Lumen',
  'Marlowe',
  'Obelisk',
  'Peregrine',
  'Quillon',
  'Runic',
  'Sable',
  'Tesseract',
  'Umbra',
  'Veridian',
  'Ward',
  'Yarrow',
  'Zephyr',
];
