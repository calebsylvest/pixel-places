// Fallingwater, traced from HABS PA-5346 (references/habs-sheet-03..06.jpg: basement, first, second and
// third floor plans). The four plan sheets share one registration, so one conversion serves them all.
// Sheet pixels -> metres: the first floor's 98'-0" dimension spans sheet x 236..805, so 1 px = 0.0525 m.
// x runs sheet left -> right (roughly west -> east), y runs sheet bottom -> top (roughly south -> north).
export const K = (98 * 0.3048) / (805 - 236);
export const X = (sx) => (sx - 170) * K;
export const Y = (sy) => (600 - sy) * K;
export const P = (sx, sy) => [X(sx), Y(sy)];
/** Rectangle from sheet pixels [sx0, sy0, sx1, sy1] to world [x0, y0, x1, y1]. */
export const R = (a, b, c, d) => [X(Math.min(a, c)), Y(Math.max(b, d)), X(Math.max(a, c)), Y(Math.min(b, d))];

// ---- levels (sections, sheets 9–10; elevations, sheets 7–8), in metres above the pool below the falls --
export const WD = 0.35; // water below the falls
export const WU = 4.6; // Bear Run above the falls
export const FL1 = 7.0; // main floor ("main level 0'-0\"")
export const PLAT = FL1 - 2.18; // the hatch stair's platform over the stream (-7'-2")
export const FL2 = FL1 + 2.845; // second level terrace, 9'-4"
export const FL3 = FL1 + 5.43; // third level terrace, 17'-9 3/4"
export const ROOF = FL1 + 7.59; // roof, 24'-11"
export const TOWER = FL1 + 9.98; // top of the main (chimney) tower, 32'-9"
export const SLAB = 0.42; // depth of a floor tray

// ---- each floor: rooms (for names and floors), interior (roofed area), stone (masonry), glass (window
// walls, red steel frames), terraces (open trays with parapets on the listed edges) -------------------
const room = (key, name, r) => ({ key, name, r: R(...r) });
const ter = (key, name, r, edges) => ({ key, name, r: R(...r), edges });
const g = (a, b, c, d) => R(a, b, c, d); // a glass wall, drawn as a thin box

export const FLOORS = {
  1: {
    rooms: [
      room("kitchen", "Kitchen", [252, 230, 320, 323]),
      room("servants", "Servants' sitting room", [186, 233, 240, 266]),
      room("entry", "Entry", [471, 300, 507, 337]),
      room("coats", "Coats", [471, 274, 512, 300]),
      room("dining", "Dining end of the living room", [335, 262, 450, 330]),
      room("hatch", "The hatch", [460, 453, 545, 497]),
      room("living", "Living room", [300, 260, 545, 542]),
    ],
    interior: [[252, 230, 330, 323], [302, 272, 330, 460], [330, 260, 392, 453], [392, 270, 535, 453], [318, 453, 545, 497], [318, 497, 458, 542], [177, 230, 240, 271], [238, 230, 254, 240]].map((r) => R(...r)),
    stone: [
      [240, 240, 252, 323], [280, 220, 330, 230], [319, 220, 330, 272], // kitchen
      [330, 250, 392, 260], [392, 270, 450, 282], // the north wall, built against the hill
      [307, 322, 331, 382], // the chimney and hearth
      [307, 446, 333, 460], [450, 446, 467, 460], // piers carrying the second floor
      [450, 300, 471, 337], [512, 270, 535, 300], [507, 323, 535, 410], // entry and the east wall
      [548, 293, 602, 307], [567, 340, 705, 355], // the loggia's walls
      [177, 230, 186, 271], [183, 266, 240, 271], // servants' room
    ].map((r) => R(...r)),
    glass: [g(300, 373, 304, 446), g(316, 460, 320, 473), g(316, 493, 320, 517), g(316, 533, 320, 542), g(318, 540, 458, 544), g(533, 425, 537, 453), g(456, 497, 460, 505), g(456, 520, 460, 542), g(543, 453, 547, 497), g(186, 264, 240, 268)],
    terraces: [
      ter("terraceW", "West terrace", [235, 450, 318, 542], "nws"),
      ter("terraceE", "East terrace", [537, 373, 598, 497], "e"),
      ter("terraceE", "East terrace", [458, 497, 598, 545], "es"),
      ter("loggia", "Loggia", [535, 305, 602, 340], ""),
      ter("loggia", "Loggia", [535, 340, 567, 373], ""),
    ],
  },
  2: {
    rooms: [
      room("dressing", "Dressing room (Mr. Kaufmann's bedroom)", [252, 236, 318, 330]),
      room("bathN", "Bath", [335, 227, 392, 262]),
      room("hall2", "Hall", [330, 262, 450, 300]),
      room("stair2", "Stair hall", [450, 262, 530, 322]),
      room("master", "Master bedroom (Mrs. Kaufmann's)", [334, 300, 418, 405]),
      room("bathA", "Bath", [422, 302, 463, 345]),
      room("bathB", "Bath", [422, 348, 463, 410]),
      room("guest", "Guest bedroom", [467, 322, 530, 410]),
    ],
    interior: [[242, 225, 330, 330], [330, 225, 395, 262], [330, 250, 530, 412], [318, 330, 330, 412]].map((r) => R(...r)),
    stone: [
      [242, 225, 254, 270], [242, 282, 254, 322], [265, 225, 330, 237], // dressing room
      [307, 290, 335, 392], // the chimney
      [390, 268, 435, 280], [530, 362, 545, 400], [532, 295, 615, 305], [570, 342, 702, 352],
    ].map((r) => R(...r)),
    partitions: [[330, 261, 395, 265], [418, 300, 422, 412], [463, 300, 467, 412], [420, 344, 465, 348], [334, 298, 380, 302], [398, 298, 420, 302], [467, 318, 490, 322], [505, 318, 530, 322]].map((r) => R(...r)),
    glass: [g(254, 328, 307, 332), g(318, 403, 368, 407), g(386, 403, 420, 407), g(420, 410, 465, 414), g(465, 410, 530, 414), g(316, 392, 320, 405)],
    terraces: [
      ter("terraceM", "Master terrace", [318, 405, 462, 580], "wse"),
      ter("terraceG", "Guest terrace", [535, 352, 702, 415], "es"),
      ter("terraceG", "Guest terrace", [530, 322, 560, 362], ""),
      ter("terraceW2", "West terrace", [75, 202, 242, 302], "nws"),
      ter("bridge2", "Bridge to the hillside", [427, 112, 475, 250], "we"),
    ],
  },
  3: {
    rooms: [
      room("study", "Study", [252, 235, 310, 300]),
      room("bath3", "Bath", [332, 232, 392, 255]),
      room("stair3", "Stair", [365, 255, 430, 283]),
      room("gallery", "Gallery", [330, 283, 472, 305]),
      room("alcove", "Sleeping alcove", [430, 255, 472, 283]),
    ],
    interior: [[240, 222, 330, 300], [330, 230, 472, 305]].map((r) => R(...r)),
    stone: [[240, 222, 252, 277], [240, 222, 328, 235], [310, 237, 330, 274], [357, 252, 430, 260], [307, 297, 332, 385]].map((r) => R(...r)),
    partitions: [[330, 253, 392, 257], [428, 255, 432, 283]].map((r) => R(...r)),
    glass: [g(252, 298, 307, 302), g(332, 303, 380, 307), g(400, 303, 472, 307), g(470, 255, 474, 305), g(240, 277, 244, 300)],
    terraces: [ter("terrace3", "Third-floor terrace", [332, 305, 530, 382], "es")],
  },
};

// Long concrete band at the third level, over the south rooms of the second floor (dotted on sheet 6).
export const BAND = R(268, 382, 722, 430);
// Roofs: over the third floor, and over the second-floor rooms the third floor doesn't cover.
export const ROOFS = [R(236, 218, 476, 309), R(472, 250, 535, 322)];
// Concrete trellises: over the hatch (beams east-west); over the drive (north-south, bent round a tree);
// beside the boulder on the west.
export const TRELLIS_HATCH = Array.from({ length: 8 }, (_, i) => R(466, 422 + i * 18, 537, 427 + i * 18));
export const TRELLIS_DRIVE = Array.from({ length: 16 }, (_, i) => {
  const sx = 482 + i * 13;
  return R(sx, 185, sx + 3, 300);
});
export const TRELLIS_WEST = [120, 145, 166].map((sx) => R(sx, 160, sx + 4, 205));
export const TRELLIS_TREES = [P(568, 285), P(655, 332)];
// The hatch stair: from the living room down to a platform just above Bear Run.
export const HATCH = { stair: R(470, 458, 545, 495), platform: R(545, 458, 575, 503) };
// Bolsters: the four stone and concrete piers on the ledge that carry the living room (basement, sheet 3).
export const BOLSTERS = [[300, 318], [385, 393], [452, 460], [525, 533]].map(([a, b]) => R(a, 330, b, 445));
// The bridge over Bear Run to the east, and the walk from the loggia down to it.
export const BRIDGE = { deck: R(812, 415, 890, 590), walls: [R(805, 415, 812, 590), R(890, 415, 897, 590)] };
export const WALKS = [R(602, 340, 700, 400), R(700, 385, 900, 418)];
// The bold line north of the house on the first-floor plan: the foot of the hillside above the drive.
export const HILL = [[0, 60], [280, 110], [400, 165], [550, 197], [650, 222], [725, 250], [800, 282], [880, 308], [1020, 330]].map(([a, b]) => P(a, b));
// The boulder west of the kitchen (hatched on sheets 3–4).
export const BOULDER = [[73, 125], [130, 150], [185, 160], [228, 190], [215, 222], [150, 240], [90, 245], [66, 200]].map(([a, b]) => P(a, b));
// The lip of the falls (bold on the basement plan), north to south then curving east.
export const LIP = [[300, 425], [312, 470], [325, 520], [340, 555], [365, 580], [400, 595], [430, 600]].map(([a, b]) => P(a, b));
export const SITE = [X(0), Y(770), X(1030), Y(40)]; // world bounds of the site model
