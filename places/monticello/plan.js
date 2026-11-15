// The first floor of Monticello, traced from HABS VA-241 sheet 3 (references/habs-sheet-03.jpg).
// Sheet pixels convert to metres: x runs north -> south (sheet left -> right), y runs west -> east
// (sheet bottom -> top). The 109'-5" overall dimension spans sheet x 170..808, so 1 px = 0.0523 m.
export const K = (109 + 5 / 12) * 0.3048 / (808 - 170);
export const M = (px, py) => [(px - 170) * K, (470 - py) * K];
export const BUILDING = { x0: 0, x1: (808 - 170) * K, y0: 0, y1: (470 - 183) * K };

/** Rectangle from sheet pixels, with chamfered corners in metres: { ne, nw, se, sw } (n = north = low x, e = east = high y). */
function room(key, name, px0, py0, px1, py1, ch = {}) {
  const [x0, y1] = M(px0, py0), [x1, y0] = M(px1, py1);
  const p = [];
  const c = (k) => ch[k] || 0;
  // walk round: NW corner (x0, y0) -> SW (x1, y0) -> SE (x1, y1) -> NE (x0, y1)
  if (c("nw")) p.push([x0, y0 + c("nw")], [x0 + c("nw"), y0]);
  else p.push([x0, y0]);
  if (c("sw")) p.push([x1 - c("sw"), y0], [x1, y0 + c("sw")]);
  else p.push([x1, y0]);
  if (c("se")) p.push([x1, y1 - c("se")], [x1 - c("se"), y1]);
  else p.push([x1, y1]);
  if (c("ne")) p.push([x0 + c("ne"), y1], [x0, y1 - c("ne")]);
  else p.push([x0, y1]);
  return { key, name, poly: p, x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
const poly = (key, name, pts) => {
  const p = pts.map(([a, b]) => M(a, b)), xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  const r = { key, name, poly: p, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  r.cx = (r.x0 + r.x1) / 2;
  r.cy = (r.y0 + r.y1) / 2;
  return r;
};

// Order matters: the parlor comes before the garden portico that wraps round its bay.
export const ROOMS = [
  room("hall", "Entrance Hall", 418, 218, 555, 398, { nw: 1.0, sw: 1.0 }),
  poly("parlor", "Parlor", [[418, 405], [570, 405], [570, 505], [530, 565], [458, 565], [418, 505]]),
  room("dining", "Dining Room", 304, 365, 410, 466),
  room("tea", "Tea Room", 225, 372, 300, 466, { ne: 1.3, nw: 1.3 }),
  room("northOctagon", "North Octagon Room", 225, 188, 315, 302, { ne: 1.6, nw: 1.6 }),
  room("northSquare", "North Square Room", 322, 190, 410, 302),
  room("northPassage", "North Passage", 255, 307, 410, 358),
  room("piazza", "North Piazza", 180, 262, 250, 390, { se: 1.4, sw: 1.4 }),
  room("southSquare", "South Square Room", 562, 192, 655, 268),
  room("library", "Library", 662, 192, 748, 272, { se: 1.7 }),
  room("bookRoom", "Book Room", 662, 275, 720, 335),
  room("southPassage", "South Passage", 565, 306, 660, 330),
  room("southLobby", "South Passage", 565, 330, 640, 360),
  room("bedroom", "Jefferson's Bedroom", 580, 362, 655, 466),
  room("cabinet", "Cabinet", 662, 380, 752, 466, { sw: 1.5 }),
  room("greenhouse", "Greenhouse", 728, 262, 803, 385, { ne: 1.4, nw: 1.4 }),
  room("porchNE", "North-east Porch", 176, 188, 213, 252),
  room("porchNW", "North-west Porch", 176, 397, 213, 466),
  room("porchSE", "South-east Porch", 762, 218, 803, 258),
  room("porchSW", "South-west Porch", 762, 397, 803, 435),
  room("eastPortico", "East Portico", 398, 72, 580, 214),
  poly("westPortico", "West Portico", [[403, 505], [418, 505], [458, 565], [530, 565], [570, 505], [580, 505], [580, 705], [403, 705]]),
];
export const ROOM = Object.fromEntries(ROOMS.map((r) => [r.key, r]));

export const FOOTPRINT = [[170, 183], [398, 183], [398, 72], [580, 72], [580, 183], [808, 183], [808, 470], [580, 470], [580, 705], [403, 705], [403, 470], [170, 470]].map(([a, b]) => M(a, b));

const rect = (px0, py0, px1, py1) => {
  const [a, d] = M(px0, py0), [b, c] = M(px1, py1);
  return [Math.min(a, b), Math.min(c, d), Math.max(a, b), Math.max(c, d)];
};
const door = (px0, py0, px1, py1) => ({ rect: rect(px0, py0, px1, py1), kind: "door" });
const win = (px0, py0, px1, py1) => ({ rect: rect(px0, py0, px1, py1), kind: "window" });
export const OPENINGS = [
  // doors between rooms (by eye from the plan)
  door(470, 204, 505, 226), door(466, 394, 510, 410), door(404, 312, 422, 345), door(551, 310, 569, 330),
  door(282, 297, 305, 312), door(372, 297, 395, 312), door(245, 318, 260, 345), door(330, 352, 352, 369),
  door(296, 395, 308, 445), door(236, 362, 262, 378), door(208, 425, 230, 445), door(208, 225, 230, 245),
  door(404, 425, 422, 445), door(590, 262, 612, 310), door(654, 310, 668, 328), door(590, 356, 615, 367),
  door(680, 266, 700, 280), door(650, 212, 667, 240), door(715, 295, 733, 325), door(688, 331, 708, 384),
  door(650, 368, 667, 382), door(650, 395, 667, 445), door(735, 375, 752, 392), door(748, 405, 766, 428),
  door(744, 225, 766, 250), door(470, 556, 505, 580),
  // the porches' outer arches and the piazza arcade
  door(164, 195, 180, 245), door(178, 176, 210, 192), door(164, 405, 180, 460), door(178, 462, 210, 476),
  door(798, 225, 814, 252), door(766, 176, 798, 222), door(798, 402, 814, 430), door(164, 270, 182, 385),
  // windows
  win(255, 176, 290, 192), win(345, 176, 385, 192), win(590, 176, 630, 192), win(680, 176, 715, 192),
  win(245, 462, 275, 476), win(340, 462, 375, 476), win(600, 462, 630, 476), win(690, 462, 715, 476),
  win(798, 268, 814, 380), win(428, 515, 452, 548), win(536, 515, 560, 548),
];

// columns: east portico (four across the front), west portico (four across the front, one at each back corner)
export const COLUMNS = {
  east: [[410, 125], [463, 125], [517, 125], [570, 125]].map(([a, b]) => M(a, b)),
  west: [[412, 567], [567, 567], [412, 619], [465, 619], [517, 619], [570, 619]].map(([a, b]) => M(a, b)),
};
