// Monticello, c. 1810–1820. See BRIEF.md for sources; the first floor is traced in plan.js.
// x runs north -> south, y runs west -> east (metres); z up. The first floor is FL above the lawn.
import { mount } from "../../engine/app.js";
import { box, cyl, disc, sphere, patch, quad, rampOf, mFlat, mMottle, mStroke, mBands, tone4, shadeTones, floorId, setId, hash, bayerAt, clamp, rgb, glows, facesCamera, cloudShade, lerp } from "../../engine/render.js";
import { panel, rasterPlan, inPoly } from "../../engine/build.js";
import { drawBeast, beastHeight } from "../../engine/beast.js";
import { ROOMS, ROOM, FOOTPRINT, OPENINGS, COLUMNS, BUILDING, M } from "./plan.js";

const PI = Math.PI, HP = PI / 2;
const pick = (l) => l[Math.floor(Math.random() * l.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const X1 = BUILDING.x1, Y1 = BUILDING.y1; // main block: x 0..X1, y 0..Y1
const FL = 0.95, CORN = 5.7, ENT = 6.7, BAL = 7.55; // heights from the west elevation (sheet 1)
const DOME = { x: ROOM.parlor.cx, y: -0.4, r: 4.5 }; // octagonal dome over the west front (31' × 28')

// ---- palette -----------------------------------------------------------------------------------
const BRICK = [176, 86, 58], TRIM = [236, 232, 220], ROOF = [128, 128, 132], GLASS = [52, 62, 80];
const mBrick = (() => {
  const r = rampOf(BRICK), mortar = rampOf([206, 188, 168]);
  return (l, u, v, px, py) => {
    const row = Math.floor(v / 0.075), t = v / 0.075 - row, header = (Math.floor(u / 0.115) + row) & 1;
    const len = header ? 0.115 : 0.23, j = Math.floor((u + (row & 1) * 0.06) / len), s = (u + (row & 1) * 0.06) / len - j;
    if (t < 0.18 || s < 0.06) return mortar[clamp(Math.floor(l + (bayerAt(px, py) - 0.5) * 0.4), 0, 4)];
    return r[clamp(Math.floor(l + (header ? -0.35 : 0) + 0.5 * (hash(j, row) - 0.5) + (bayerAt(px, py) - 0.5) * 0.3), 0, 4)];
  };
})();
const mTrim = mFlat(TRIM), mRoof = mBands(ROOF, 0.45, 0.1, 0.5, true), mPlinth = mMottle([150, 76, 56], 0.25, 0.3);
const mGlassWin = (() => {
  const g = rampOf(GLASS), w = rampOf(TRIM);
  return (l, u, v, px, py) => (u % 0.28 < 0.03 || v % 0.32 < 0.03 ? w[clamp(Math.floor(l + 0.4), 0, 4)] : g[clamp(Math.floor(l + 0.8 + ((px + py * 2) % 11 === 0 ? 1.5 : 0)), 0, 4)]);
})();
const mBalusters = (l, u, v) => {
  const r = rampOf(TRIM), t = u % 0.22;
  if (v > 0.72 || v < 0.1) return r[clamp(Math.floor(l + 0.3), 0, 4)];
  return t > 0.06 && t < 0.16 && !(Math.abs(v - 0.4) > 0.25 && Math.abs(t - 0.11) > 0.03) ? r[clamp(Math.floor(l + 0.1), 0, 4)] : 0;
};
const mChinese = (l, u, v) => {
  // the "Chinese" lattice railings on the terraces
  const r = rampOf(TRIM), a = (u + v) % 0.5, b = (u - v + 10) % 0.5;
  return v < 0.06 || v > 0.84 || u % 1.5 < 0.06 || a < 0.04 || b < 0.04 ? r[clamp(Math.floor(l + 0.2), 0, 4)] : 0;
};

// facade material: windows and arches placed by world position along the face
function mFacade(toWorld, windows, arches, z0) {
  const glass = rampOf(GLASS), trim = rampOf(TRIM);
  return (l, u, v, px, py) => {
    const w = toWorld(u), z = z0 + v;
    for (const [a, b] of arches) if (w > a && w < b && z < FL + 3.6 + Math.sqrt(Math.max(0, ((b - a) / 2) ** 2 - (w - (a + b) / 2) ** 2)) * 0.6) return w - a < 0.12 || b - w < 0.12 ? trim[3] : glass[0];
    for (const [a, b] of windows)
      if (w > a && w < b && z > FL + 0.4 && z < FL + 4.0) {
        if (w - a < 0.1 || b - w < 0.1 || z < FL + 0.5 || z > FL + 3.9) return trim[clamp(Math.floor(l + 0.4), 0, 4)];
        return (w - a) % 0.3 < 0.03 || (z - FL) % 0.36 < 0.03 ? trim[clamp(Math.floor(l + 0.2), 0, 4)] : glass[clamp(Math.floor(l + 0.7 + ((px + 2 * py) % 13 === 0 ? 1.5 : 0)), 0, 4)];
      }
    return mBrick(l, u, v, px, py);
  };
}

// ---- shared helpers ----------------------------------------------------------------------------
let NAV = null, LIGHTS = [];
const block = (x0, y0, x1, y1, g) => NAV && NAV.block(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), g);
function column(x, y, z0, z1, r = 0.36) {
  box(x - r - 0.08, y - r - 0.08, z0, x + r + 0.08, y + r + 0.08, z0 + 0.25, mTrim, mTrim);
  cyl(x, y, z0 + 0.25, z1 - 0.3, r, r * 0.88, mStroke(TRIM, 0.3, 0.06, 0.25, true), null);
  box(x - r - 0.1, y - r - 0.1, z1 - 0.3, x + r + 0.1, y + r + 0.1, z1, mTrim, mTrim);
  block(x - r, y - r, x + r, y + r, 0.1);
}
function chair(x, y, yaw, c = [110, 70, 44], z = 0) {
  const m = mFlat(c), cs = Math.cos(yaw), sn = Math.sin(yaw);
  box(x - 0.22, y - 0.22, z + 0.42, x + 0.22, y + 0.22, z + 0.47, mFlat([150, 60, 50]), m);
  for (const [a, b] of [[0.18, 0.18], [0.18, -0.18], [-0.18, 0.18], [-0.18, -0.18]]) box(x + a - 0.025, y + b - 0.025, z, x + a + 0.025, y + b + 0.025, z + 0.42, m, m);
  const bx = x - cs * 0.2, by = y - sn * 0.2, r = Math.abs(cs) > 0.5 ? [bx - 0.03, by - 0.2, bx + 0.03, by + 0.2] : [bx - 0.2, by - 0.03, bx + 0.2, by + 0.03];
  box(r[0], r[1], z + 0.47, r[2], r[3], z + 0.95, m, m);
}
function table(x0, y0, x1, y1, h = 0.74, c = [120, 74, 44]) {
  const m = mMottle(c, 0.3, 0.3);
  box(x0, y0, h - 0.05, x1, y1, h, m, m);
  for (const [x, y] of [[x0 + 0.05, y0 + 0.05], [x1 - 0.1, y0 + 0.05], [x0 + 0.05, y1 - 0.1], [x1 - 0.1, y1 - 0.1]]) box(x, y, 0, x + 0.05, y + 0.05, h - 0.05, m, m);
  block(x0, y0, x1, y1, 0.15);
}
function bust(x, y, c = [232, 228, 218]) {
  cyl(x, y, 0, 1.15, 0.2, 0.2, mFlat([160, 120, 90]), mFlat([180, 140, 100]));
  sphere(x, y, 1.32, 0.15, c, "rough");
  sphere(x, y, 1.55, 0.12, c, "solid");
  block(x - 0.25, y - 0.25, x + 0.25, y + 0.25, 0.1);
}
function bookcase(x0, y0, x1, y1, h) {
  const shelf = rampOf([110, 74, 48]);
  const cols = [[150, 60, 50], [96, 70, 50], [200, 180, 120], [70, 90, 70], [120, 100, 80]].map(rampOf);
  const books = (l, u, v) => {
    const row = Math.floor(v / 0.36), t = v - row * 0.36;
    if (t < 0.04) return shelf[3];
    const b = Math.floor(u / 0.04), hh = hash(b, row);
    return t > 0.36 * (0.55 + 0.4 * hash(b, row + 9)) ? shelf[1] : cols[Math.floor(hh * 5)][clamp(Math.floor(l + 0.3 * (hash(row, b) - 0.5)), 0, 4)];
  };
  box(x0, y0, 0, x1, y1, h, mFlat([110, 74, 48]), books);
  block(x0, y0, x1, y1, 0.12);
}
function plant(x, y, z, s = 1) {
  cyl(x, y, z, z + 0.3 * s, 0.14 * s, 0.17 * s, mFlat([170, 96, 64]), mFlat([90, 62, 44]));
  for (let i = 0; i < 5; i++) sphere(x + Math.cos(i * 2.4) * 0.1 * s, y + Math.sin(i * 2.4) * 0.1 * s, z + (0.45 + 0.1 * (i % 3)) * s, 0.16 * s, [[70, 120, 60], [96, 140, 70], [60, 100, 56]][i % 3], "rough");
}

// ---- the day (shared by both scenes) -----------------------------------------------------------
const DAY = 360, START = 0.32;
const tod = (clock) => (clock / DAY + START) % 1;
const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function ambient(clock) {
  const t = tod(clock), NIGHT = [0.4, 0.44, 0.66], DAYL = [1, 1, 1], GOLD = [1.03, 0.88, 0.72];
  if (t < 0.22 || t > 0.86) return NIGHT;
  if (t < 0.28) return lerp3(NIGHT, GOLD, (t - 0.22) / 0.06);
  if (t < 0.34) return lerp3(GOLD, DAYL, (t - 0.28) / 0.06);
  if (t < 0.72) return DAYL;
  if (t < 0.79) return lerp3(DAYL, GOLD, (t - 0.72) / 0.07);
  return lerp3(GOLD, NIGHT, (t - 0.79) / 0.07);
}
const clockText = (clock) => {
  const t = tod(clock) * 24, h = Math.floor(t), m = Math.floor((t - h) * 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};

// ---- people ------------------------------------------------------------------------------------
const SK = { a: [226, 186, 152], b: [214, 170, 132], c: [150, 104, 76], d: [124, 84, 60], e: [176, 128, 92], f: [100, 68, 50] };
const CAST = {
  jefferson: { name: "Thomas Jefferson", role: "Former President, in his seventies", k: 1.08, girth: 0.9,
    desc: "Third President of the United States. He designed and rebuilt this house over forty years and retired here in 1809.",
    look: { skin: SK.a, hair: [196, 170, 150], hairStyle: "thin", top: [106, 84, 64], shirt: [240, 236, 226], bottom: [92, 78, 62], shoes: [60, 44, 34] } },
  martha: { name: "Martha Jefferson Randolph", role: "Jefferson's eldest daughter", k: 1.0,
    desc: "She ran the household here, with her husband and their large family, through Jefferson's retirement.",
    look: { skin: SK.a, hair: [150, 100, 70], hairStyle: "bun", top: [96, 110, 140], bottom: [96, 110, 140], skirt: [96, 110, 140], legs: [96, 110, 140], shoes: [60, 50, 50] } },
  cornelia: { name: "Cornelia Jefferson Randolph", role: "Granddaughter", k: 0.9, girth: 0.85,
    desc: "One of Martha's daughters. She learned architectural drawing from her grandfather.",
    look: { skin: SK.a, hair: [120, 80, 52], hairStyle: "bun", top: [226, 220, 200], bottom: [226, 220, 200], skirt: [226, 220, 200], legs: [226, 220, 200], shoes: [80, 60, 50] } },
  george: { name: "A Randolph grandson", role: "Grandchild", k: 0.66, girth: 0.9,
    desc: "One of the many Randolph grandchildren who grew up in the house.",
    look: { skin: SK.a, hair: [150, 104, 64], top: [70, 96, 140], bottom: [200, 190, 170], shoes: [60, 50, 40] } },
  visitor: { name: "A visitor", role: "Uninvited guest", k: 1.02,
    desc: "Strangers came to see the former President; the family sometimes fed dozens of guests. Visitors waited in the entrance hall, among Jefferson's collections.",
    look: { skin: SK.b, hair: [70, 54, 40], top: [40, 44, 56], shirt: [236, 236, 230], bottom: [200, 186, 150], shoes: [40, 34, 30], hat: [40, 36, 36], hatBrim: 0.17 } },
  burwell: { name: "Burwell Colbert", role: "Butler and Jefferson's personal attendant; enslaved", k: 1.0,
    desc: "He ran the dining room and the main house and was also a skilled painter and glazier. Jefferson freed him in his will.",
    look: { skin: SK.c, hair: [36, 30, 26], top: [70, 64, 70], shirt: [236, 232, 220], bottom: [70, 64, 70], shoes: [40, 34, 30] } },
  sally: { name: "Sally Hemings", role: "Chambermaid and seamstress; enslaved", k: 0.95,
    desc: "She cared for Jefferson's rooms and clothes. Monticello and most historians conclude that Jefferson was the father of her six children.",
    look: { skin: SK.e, hair: [50, 36, 30], hairStyle: "bun", top: [176, 156, 120], bottom: [150, 120, 96], skirt: [150, 120, 96], legs: [150, 120, 96], shoes: [70, 54, 44], headwrap: [214, 200, 170] } },
  priscilla: { name: "Priscilla Hemmings", role: "Nursemaid to the Randolph children; enslaved", k: 0.96,
    desc: "She looked after Martha Randolph's younger children. She was married to the joiner John Hemmings.",
    look: { skin: SK.d, hair: [40, 32, 28], top: [120, 96, 120], bottom: [176, 150, 110], skirt: [176, 150, 110], legs: [176, 150, 110], shoes: [70, 54, 44], headwrap: [196, 70, 60] } },
  john: { name: "John Hemmings", role: "Joiner and cabinetmaker; enslaved", k: 1.0,
    desc: "He made much of the house's woodwork and furniture and kept it in repair. Jefferson freed him in his will.",
    look: { skin: SK.c, hair: [40, 32, 28], top: [150, 132, 104], shortSleeve: true, shirt: [220, 214, 200], bottom: [110, 96, 80], shoes: [60, 46, 36] } },
  edith: { name: "Edith Hern Fossett", role: "Head cook; enslaved", k: 0.95,
    desc: "She trained in French cooking in the President's House kitchen in Washington and ran the Monticello kitchen, under the south terrace.",
    look: { skin: SK.f, hair: [40, 32, 28], top: [180, 170, 150], bottom: [120, 100, 80], skirt: [120, 100, 80], legs: [120, 100, 80], shoes: [70, 54, 44], headwrap: [236, 232, 220] } },
  fanny: { name: "Frances Gillette Hern", role: "Cook; enslaved", k: 0.93,
    desc: "She also trained in the President's House kitchen and cooked here alongside Edith Fossett.",
    look: { skin: SK.d, hair: [40, 32, 28], top: [140, 120, 150], bottom: [110, 90, 80], skirt: [110, 90, 80], legs: [110, 90, 80], shoes: [70, 54, 44], headwrap: [200, 180, 120] } },
  wormley: { name: "Wormley Hughes", role: "Gardener; enslaved", k: 1.02,
    desc: "He planted and tended the flower beds around the West Lawn.",
    look: { skin: SK.c, hair: [40, 32, 28], top: [170, 150, 110], shortSleeve: true, bottom: [100, 90, 76], shoes: [60, 46, 36], hat: [200, 176, 110], hatBrim: 0.2 } },
  israel: { name: "Israel Gillette", role: "House and stable worker; enslaved", k: 0.98,
    desc: "He worked in the house and with the horses. His memories of Monticello were published in 1873.",
    look: { skin: SK.d, hair: [40, 32, 28], top: [96, 110, 96], bottom: [140, 120, 96], shoes: [60, 46, 36] } },
};
const HORSE = { len: 1.7, h: 1.6, r: 0.4, leg: 0.07, color: [124, 82, 54], hoof: [40, 36, 40], neck: { len: 0.85, up: 0.95, r: 0.2 }, head: { len: 0.6, r: 0.14, snout: 0.75, tilt: -1.05 }, mane: { along: true, color: [52, 40, 32] }, ears: { r: 0.05, up: true }, tail: { len: 0.9, r: 0.08, droop: 1.2, color: [52, 40, 32] } };
const add = (crowd, key, extra) => crowd.add({ key, ...CAST[key], short: CAST[key].name.split(" ")[0], speed: 1.0, ...extra });

// ================================================================================================
// THE MAIN FLOOR
// ================================================================================================
const FLOOR_GRID = (() => {
  // which room each floor point is in (0.1 m grid), for colouring floors
  const c = 0.1, x0 = -1, y0 = -13, nx = 360, ny = 350, g = new Int16Array(nx * ny).fill(-1);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * c, y = y0 + (j + 0.5) * c;
      for (let r = 0; r < ROOMS.length; r++) if (inPoly(x, y, ROOMS[r].poly)) { g[j * nx + i] = r; break; }
    }
  return (x, y) => {
    const i = Math.floor((x - x0) / c), j = Math.floor((y - y0) / c);
    return i < 0 || j < 0 || i >= nx || j >= ny ? null : ROOMS[g[j * nx + i]] || null;
  };
})();
const BOARDS = shadeTones([170, 128, 86]), BOARDS_D = shadeTones([140, 100, 66]), STONE = shadeTones([196, 190, 178]);
function insideFloor(x, y, px, py) {
  if (!inPoly(x, y, FOOTPRINT)) return 0;
  const r = FLOOR_GRID(x, y);
  if (!r) return rgb(110, 60, 44); // wall bases
  floorId(r.key, px, py);
  if (r.key === "parlor") {
    // Jefferson's parquet: cherry squares set in beech
    const u = (x + y) / 0.5, v = (x - y) / 0.5, a = Math.floor(u), b = Math.floor(v), inner = u - a > 0.15 && u - a < 0.85 && v - b > 0.15 && v - b < 0.85;
    return tone4(inner ? shadeTones([170, 92, 60]) : shadeTones([220, 186, 130]), 0.5 + 0.2 * (hash(a, b) - 0.5), px, py);
  }
  if (r.key === "hall") return tone4(shadeTones([96, 140, 84]), 0.5 + 0.25 * (hash(px >> 1, py) - 0.5), px, py); // floor painted "grass green"
  if (r.key.startsWith("porch") || r.key.endsWith("Portico") || r.key === "piazza" || r.key === "greenhouse") {
    const t = (Math.floor(x / 0.6) + Math.floor(y / 0.6)) & 1;
    return tone4(STONE, 0.5 + (t ? 0.12 : -0.08) + 0.15 * (hash(px >> 2, py >> 2) - 0.5), px, py);
  }
  const board = Math.floor(y / 0.16), joint = (x + board * 1.7) % 3.6 < 0.04;
  return tone4(joint || (y / 0.16) % 1 < 0.08 ? BOARDS_D : BOARDS, 0.5 + 0.3 * (hash(board, Math.floor((x + board * 1.7) / 3.6)) - 0.5), px, py);
}
function insideBuild({ nav }) {
  NAV = nav;
  LIGHTS = [];
  nav.open(-1, -13, 35, 22);
  // everything outside the footprint is out of bounds for the people inside
  for (let x = -1; x < 35; x += 0.2) for (let y = -13; y < 22; y += 0.2) if (!inPoly(x + 0.1, y + 0.1, FOOTPRINT)) nav.block(x, y, x + 0.2, y + 0.2, 0);
  setId("walls");
  const plaster = mStroke([226, 218, 196], 0.4, 0.08, 0.25, true);
  rasterPlan({ cell: 0.1, bounds: [-1, -13, 35, 22], footprint: FOOTPRINT, rooms: ROOMS, openings: OPENINGS, h: 4.4, cut: 0.9, inner: 1.3, mat: plaster, top: mFlat([130, 70, 52]), glass: mGlassWin, sill: 0.6, head: 3.6, nav });
  // porticoes: columns full height when they're on the far side, stumps on the near side
  setId("columns");
  for (const [x, y] of COLUMNS.east) column(x, y, 0, facesCamera(0, 1) ? 1.0 : 4.75);
  for (const [x, y] of COLUMNS.west) column(x, y, 0, facesCamera(0, -1) ? 1.0 : 4.75);

  // Entrance Hall: Jefferson's museum ("Indian Hall")
  const H = ROOM.hall;
  setId("busts");
  bust(H.x0 + 1.4, H.y0 + 1.6);
  bust(H.x1 - 1.4, H.y0 + 1.6, [240, 236, 228]);
  setId("collections");
  const cab = mMottle([110, 74, 50], 0.3, 0.3), arts = [[150, 96, 60], [210, 190, 150], [120, 60, 40], [200, 160, 90], [90, 70, 50]];
  for (const [x0, x1] of [[H.x0 + 0.1, H.x0 + 0.7], [H.x1 - 0.7, H.x1 - 0.1]]) {
    box(x0, H.y0 + 3.2, 0, x1, H.y1 - 2.4, 0.9, cab, cab);
    block(x0, H.y0 + 3.2, x1, H.y1 - 2.4, 0.1);
    for (let y = H.y0 + 3.4; y < H.y1 - 2.6; y += 0.45) sphere((x0 + x1) / 2, y, 1.02, 0.12, arts[Math.floor(hash(x0, y) * 5)], "rough");
  }
  setId("mastodon");
  box(H.x0 + 2.6, H.y1 - 2.2, 0, H.x0 + 4.6, H.y1 - 1.0, 0.7, cab, cab);
  block(H.x0 + 2.6, H.y1 - 2.2, H.x0 + 4.6, H.y1 - 1.0, 0.1);
  for (let i = 0; i < 6; i++) sphere(H.x0 + 2.9 + i * 0.3, H.y1 - 1.6 + 0.12 * Math.sin(i), 0.85, 0.11 + 0.03 * (i % 2), [226, 214, 186], "rough");
  setId("benches");
  for (const x of [H.x0 + 2.4, H.x1 - 2.4]) box(x - 0.8, H.y0 + 0.3, 0.42, x + 0.8, H.y0 + 0.7, 0.48, mFlat([120, 80, 50]), mFlat([100, 66, 44]));

  // Parlor
  const P = ROOM.parlor;
  setId("harpsichord");
  box(P.x0 + 0.6, P.y1 - 1.9, 0.75, P.x0 + 1.5, P.y1 - 0.5, 0.98, mFlat([120, 70, 40]), mFlat([100, 58, 34]));
  for (const [x, y] of [[P.x0 + 0.65, P.y1 - 1.85], [P.x0 + 1.4, P.y1 - 1.85], [P.x0 + 0.65, P.y1 - 0.6], [P.x0 + 1.4, P.y1 - 0.6]]) box(x, y, 0, x + 0.05, y + 0.05, 0.75, mFlat([100, 58, 34]), mFlat([100, 58, 34]));
  block(P.x0 + 0.6, P.y1 - 1.9, P.x0 + 1.5, P.y1 - 0.5, 0.15);
  setId("parlorFurniture");
  box(P.x1 - 0.9, P.y0 + 3.5, 0, P.x1 - 0.3, P.y0 + 6.0, 0.45, mFlat([170, 60, 50]), mFlat([110, 60, 40]));
  box(P.x1 - 0.4, P.y0 + 3.5, 0.45, P.x1 - 0.3, P.y0 + 6.0, 0.95, mFlat([170, 60, 50]), mFlat([110, 60, 40]));
  block(P.x1 - 0.9, P.y0 + 3.5, P.x1 - 0.3, P.y0 + 6.0);
  table(P.cx - 0.5, P.cy - 0.5, P.cx + 0.5, P.cy + 0.5, 0.72, [150, 90, 50]);
  setId("chair");
  for (const [dx, dy, yaw] of [[-1.0, 0, 0], [1.0, 0, PI], [0, -1.0, HP], [0, 1.0, -HP]]) chair(P.cx + dx, P.cy + dy, yaw, [150, 110, 60]);
  chair(P.x0 + 1.0, P.y1 - 2.5, HP, [150, 110, 60]);

  // Dining Room (yellow walls in Jefferson's day; the wall tops show it)
  const D = ROOM.dining;
  setId("diningTable");
  table(D.x0 + 1.4, D.cy - 0.55, D.x1 - 1.4, D.cy + 0.55, 0.74, [130, 80, 46]);
  setId("chair");
  for (const x of [D.x0 + 1.9, D.cx, D.x1 - 1.9]) chair(x, D.cy - 0.95, HP), chair(x, D.cy + 0.95, -HP);
  chair(D.x0 + 0.95, D.cy, 0);
  chair(D.x1 - 0.95, D.cy, PI);
  setId("dumbwaiter");
  box(D.x0 + 0.2, D.y1 - 0.8, 0, D.x0 + 0.7, D.y1 - 0.2, 1.1, mFlat([110, 66, 40]), mFlat([110, 66, 40]));
  block(D.x0 + 0.2, D.y1 - 0.8, D.x0 + 0.7, D.y1 - 0.2);
  setId("revolvingDoor");
  cyl(D.x0 + 2.0, D.y1 - 0.15, 0, 2.2, 0.55, 0.55, mFlat([120, 80, 50]), mFlat([120, 80, 50]), PI, 2 * PI);

  // Tea Room: busts of Jefferson's heroes
  const T = ROOM.tea;
  setId("teaBusts");
  bust(T.x0 + 0.7, T.cy - 1.1);
  bust(T.x0 + 0.7, T.cy + 1.1);
  bust(T.x0 + 1.6, T.y0 + 0.6);
  bust(T.x0 + 1.6, T.y1 - 0.6);
  setId("teaTable");
  cyl(T.cx + 0.3, T.cy, 0, 0.7, 0.05, 0.05, mFlat([110, 66, 40]), null);
  cyl(T.cx + 0.3, T.cy, 0.7, 0.74, 0.5, 0.5, mFlat([130, 80, 46]), mFlat([140, 88, 50]));
  block(T.cx - 0.2, T.cy - 0.5, T.cx + 0.8, T.cy + 0.5);
  setId("chair");
  chair(T.cx + 0.3, T.cy - 0.85, HP);
  chair(T.cx + 0.3, T.cy + 0.85, -HP);

  // Jefferson's suite: bedroom with the alcove bed, cabinet, library, book room, greenhouse
  setId("alcoveBed");
  const AB = { x0: 25.2, x1: 26.1, y0: 1.35, y1: 3.75 };
  box(AB.x0, AB.y0, 0.15, AB.x1, AB.y1, 0.55, mFlat([240, 236, 226]), mFlat([200, 60, 50]));
  box(AB.x0, AB.y1 - 0.45, 0.55, AB.x1, AB.y1 - 0.1, 0.68, mFlat([246, 244, 236]), mFlat([246, 244, 236]));
  box(AB.x0 - 0.05, AB.y0, 1.9, AB.x1 + 0.05, AB.y1, 2.2, mFlat([200, 60, 50]), mFlat([200, 60, 50]));
  block(AB.x0, AB.y0, AB.x1, AB.y1, 0.05);
  const C = ROOM.cabinet;
  setId("polygraph");
  table(C.x0 + 1.9, C.y0 + 1.6, C.x0 + 2.8, C.y0 + 3.0, 0.76, [120, 74, 44]);
  box(C.x0 + 2.1, C.y0 + 1.9, 0.76, C.x0 + 2.6, C.y0 + 2.7, 0.86, mFlat([90, 60, 40]), mFlat([90, 60, 40]));
  box(C.x0 + 2.2, C.y0 + 2.0, 0.86, C.x0 + 2.5, C.y0 + 2.6, 1.15, mFlat([196, 170, 110]), mFlat([150, 120, 80]));
  setId("revolvingChair");
  cyl(C.x0 + 1.3, C.y0 + 2.3, 0, 0.45, 0.05, 0.05, mFlat([90, 60, 40]), null);
  cyl(C.x0 + 1.3, C.y0 + 2.3, 0.42, 0.5, 0.3, 0.3, mFlat([120, 70, 50]), mFlat([150, 60, 50]));
  cyl(C.x0 + 1.3, C.y0 + 2.3, 0.5, 0.95, 0.3, 0.3, mFlat([120, 70, 50]), null, PI * 0.6, PI * 1.4);
  setId("bookstand");
  for (let i = 0; i < 3; i++) cyl(C.x0 + 0.7, C.y1 - 0.8, 0.3 + i * 0.32, 0.6 + i * 0.32, 0.3 - i * 0.05, 0.25 - i * 0.05, mFlat([110, 70, 44]), mFlat([200, 180, 140]));
  block(C.x0 + 0.4, C.y1 - 1.1, C.x0 + 1.0, C.y1 - 0.5);
  setId("telescope");
  for (const a of [0, 2.1, 4.2]) box(C.x1 - 1.3 + Math.cos(a) * 0.2 - 0.02, C.y0 + 0.8 + Math.sin(a) * 0.2 - 0.02, 0, C.x1 - 1.3 + Math.cos(a) * 0.2 + 0.02, C.y0 + 0.8 + Math.sin(a) * 0.2 + 0.02, 1.1, mFlat([90, 60, 40]), mFlat([90, 60, 40]));
  sphere(C.x1 - 1.3, C.y0 + 0.8, 1.25, 0.08, [190, 150, 80], "gloss");
  sphere(C.x1 - 1.1, C.y0 + 0.6, 1.32, 0.07, [190, 150, 80], "gloss");
  const L = ROOM.library;
  setId("books");
  // bookcases go between the doors: the library opens to the sitting room and the book room, and
  // the book room is a hub with doors on all four sides
  bookcase(L.x0 + 0.3, L.y1 - 0.55, L.x1 - 1.9, L.y1 - 0.1, 2.3);
  bookcase(L.x0 + 0.1, L.y0 + 0.3, L.x0 + 0.55, L.y0 + 1.5, 2.3);
  const B = ROOM.bookRoom;
  bookcase(B.x0 + 0.1, B.y1 - 1.6, B.x0 + 0.55, B.y1 - 0.15, 2.3);
  bookcase(B.x1 - 0.55, B.y1 - 1.6, B.x1 - 0.1, B.y1 - 0.15, 2.3);
  bookcase(B.x0 + 0.1, B.y0 + 0.15, B.x0 + 0.9, B.y0 + 0.55, 2.3);
  setId("libraryTable");
  table(L.cx - 0.6, L.cy - 0.4, L.cx + 0.6, L.cy + 0.4);
  const G = ROOM.greenhouse;
  setId("greenhouse_plants");
  box(G.x1 - 0.9, G.y0 + 1.6, 0, G.x1 - 0.3, G.y1 - 1.6, 0.8, mFlat([120, 90, 60]), mFlat([110, 80, 54]));
  block(G.x1 - 0.9, G.y0 + 1.6, G.x1 - 0.3, G.y1 - 1.6);
  for (let y = G.y0 + 1.9; y < G.y1 - 1.7; y += 0.55) plant(G.x1 - 0.6, y, 0.8, 0.9 + 0.3 * hash(y, 2));
  setId("workbench");
  table(G.x0 + 1.4, G.cy - 0.7, G.x0 + 2.1, G.cy + 0.7, 0.86, [110, 80, 54]);
  // Martha's sitting room, guest rooms
  const Q = ROOM.southSquare;
  setId("marthaDesk");
  table(Q.x0 + 0.8, Q.y1 - 1.3, Q.x0 + 2.0, Q.y1 - 0.6, 0.76, [130, 80, 46]);
  setId("chair");
  chair(Q.x0 + 1.4, Q.y1 - 1.7, HP);
  chair(Q.cx + 0.6, Q.cy - 0.6, PI * 0.75);
  for (const [R, c] of [[ROOM.northOctagon, [70, 100, 130]], [ROOM.northSquare, [150, 120, 70]]]) {
    setId("guestBed");
    box(R.cx - 0.7, R.y1 - 2.3, 0, R.cx + 0.7, R.y1 - 0.3, 0.6, mFlat([240, 236, 226]), mFlat(c));
    box(R.cx - 0.7, R.y1 - 0.45, 0, R.cx + 0.7, R.y1 - 0.3, 1.4, mFlat([120, 80, 50]), mFlat([120, 80, 50]));
    block(R.cx - 0.7, R.y1 - 2.3, R.cx + 0.7, R.y1 - 0.3);
  }
  setId("windsor");
  for (const [x, y] of [[ROOM.piazza.cx - 0.4, ROOM.piazza.cy - 1.5], [ROOM.piazza.cx - 0.4, ROOM.piazza.cy + 1.5]]) chair(x, y, PI, [70, 90, 60]);
  // lamps for the evening
  for (const r of [H, P, D, C, L, Q, T]) LIGHTS.push({ x: r.cx, y: r.cy, z: 1.0, r: 3.4, c: [150, 96, 36], k: 0.55, flicker: true });
  setId(null);
}

// ---- the household's day inside ----------------------------------------------------------------
const S_ = {
  polygraph: { x: ROOM.cabinet.x0 + 1.3, y: ROOM.cabinet.y0 + 2.3, yaw: 0, pose: { sit: 1, right: "type", left: "hold" }, label: "writing letters at his polygraph", walk: "going to his cabinet" },
  readLib: { x: ROOM.library.cx - 0.6, y: ROOM.library.y1 - 1.0, yaw: HP, pose: { right: "hold", left: "hold" }, label: "choosing a book", walk: "going to the library" },
  greenhouse: { x: ROOM.greenhouse.x0 + 2.6, y: ROOM.greenhouse.cy, yaw: 0, pose: { right: "hold", left: "hold" }, label: "tending seedlings in the greenhouse", walk: "going to the greenhouse" },
  hallGreet: { x: ROOM.hall.cx, y: ROOM.hall.y1 - 1.6, yaw: HP, pose: { right: "point" }, label: "showing a visitor his collections", walk: "going to the entrance hall" },
  parlorSit: { x: ROOM.parlor.cx - 1.0, y: ROOM.parlor.cy, yaw: 0, pose: { sit: 1, right: "rest", left: "rest" }, label: "in the parlor with the family", walk: "going to the parlor" },
  teaRead: { x: ROOM.tea.cx + 0.3, y: ROOM.tea.cy - 0.85, yaw: HP, pose: { sit: 1, right: "hold", left: "hold" }, label: "reading in the tea room", walk: "going to the tea room" },
  marthaDesk: { x: ROOM.southSquare.x0 + 1.4, y: ROOM.southSquare.y1 - 1.7, yaw: HP, pose: { sit: 1, right: "type", left: "hold" }, label: "keeping the household accounts", walk: "going to her sitting room" },
  harpsichord: { x: ROOM.parlor.x0 + 1.0, y: ROOM.parlor.y1 - 2.5, yaw: HP, pose: { sit: 1, right: "type", left: "type" }, label: "playing the harpsichord", walk: "going to the harpsichord" },
  playHall: { x: ROOM.hall.cx - 1.2, y: ROOM.hall.cy + 1.0, yaw: 0, pose: { right: "point" }, label: "looking at the mastodon bones", walk: "running to the hall" },
  bedSide: { x: 24.75, y: 2.5, yaw: 0, pose: { right: "hold", left: "hold" }, label: "making up Jefferson's bed", walk: "going to Jefferson's rooms" },
  cabinetTidy: { x: ROOM.cabinet.x0 + 2.2, y: ROOM.cabinet.y1 - 0.9, yaw: -HP, pose: { right: "hold", left: "hold" }, label: "tidying the cabinet", walk: "going to the cabinet" },
  sew: { x: ROOM.southSquare.cx + 0.6, y: ROOM.southSquare.cy - 0.6, yaw: PI * 0.75, pose: { sit: 1, right: "hold", left: "hold" }, label: "sewing", walk: "going to sew" },
  sideboard: { x: ROOM.dining.x0 + 1.0, y: ROOM.dining.y1 - 1.0, yaw: PI, pose: { right: "hold", left: "hold" }, label: "laying out the dining room", walk: "going to the dining room" },
  doorHall: { x: ROOM.hall.cx + 1.0, y: ROOM.hall.y1 - 0.8, yaw: HP, pose: { right: "rest", left: "rest" }, label: "answering the door", walk: "going to the front door" },
  cellarS: { x: 25.0, y: 8.0, hide: true, label: "below stairs", walk: "going down to the cellars" },
  cellarN: { x: 8.9, y: 7.4, hide: true, label: "upstairs", walk: "going upstairs" },
  window1: { x: ROOM.northSquare.cx, y: ROOM.northSquare.y1 - 0.6, yaw: HP, pose: { right: "hold", left: "hold" }, item: "box", label: "repairing a window sash", walk: "carrying his tools" },
  window2: { x: ROOM.dining.cx, y: ROOM.dining.y0 + 0.6, yaw: -HP, pose: { right: "hold", left: "hold" }, item: "box", label: "easing a sticking sash", walk: "carrying his tools" },
  window3: { x: ROOM.library.x0 + 1.6, y: ROOM.library.y1 - 1.2, yaw: HP, pose: { right: "hold", left: "hold" }, item: "box", label: "mending a bookcase", walk: "carrying his tools" },
};
const at = (k, extra = {}) => {
  const s = S_[k];
  const t = { spot: k, x: s.x, y: s.y, yaw: s.yaw, pose: s.pose || {}, label: s.label, walkLabel: s.walk, hide: s.hide, item: s.item };
  for (const key in extra) if (extra[key] !== undefined) t[key] = extra[key];
  return t;
};
const D_ = ROOM.dining;
const DINNER = [
  ["jefferson", D_.x1 - 0.95, D_.cy, PI], ["martha", D_.x0 + 0.95, D_.cy, 0], ["cornelia", D_.cx, D_.cy - 0.95, HP], ["george", D_.x0 + 1.9, D_.cy + 0.95, -HP], ["visitor", D_.cx, D_.cy + 0.95, -HP],
];
const SERVE = { burwell: [D_.x1 - 1.7, D_.cy - 1.6, HP], priscilla: [D_.x0 + 1.9, D_.cy + 1.7, -HP] };
const dinnerTime = (t) => t > 0.6 && t < 0.66;
function insideBrain(a, crowd) {
  const t = tod(crowd.clock), night = t > 0.88 || t < 0.25, k = a.key;
  if (dinnerTime(t)) {
    const seat = DINNER.find((d) => d[0] === k);
    if (seat) return { x: seat[1], y: seat[2], yaw: seat[3], pose: { sit: 1, right: "hold", left: "rest" }, dur: 8, label: "at dinner", walkLabel: "going in to dinner" };
    if (SERVE[k]) {
      const [x, y, yaw] = SERVE[k], r = Math.random() < 0.5;
      return { x: r ? x : D_.x0 + 0.6, y: r ? y : D_.y1 - 1.0, yaw, pose: { right: "hold", left: "hold" }, item: Math.random() < 0.5 ? "box" : null, dur: rand(4, 7), label: "serving dinner", walkLabel: "serving dinner" };
    }
  }
  if (k === "jefferson") {
    if (night) return { x: 24.75, y: 2.4, yaw: 0, dur: 0.5, label: "going to bed", walkLabel: "going to bed", then: () => ({ direct: true, x: 25.65, y: 1.45, z: 0.55, yaw: HP, pose: { lie: 1 }, sleep: true, dur: 30, label: "asleep in his alcove bed" }) };
    if (a.task && a.task.sleep) return { direct: true, x: 24.75, y: 2.4, z: null, yaw: PI, dur: 1, label: "getting up at first light" };
    if (t > 0.5 && t < 0.58) {
      a.awayLabel = "out riding over the plantation";
      return { x: ROOM.porchSW.cx, y: ROOM.porchSW.cy, hide: true, dur: (0.58 - t) * DAY, label: "out riding", walkLabel: "going out for his daily ride" };
    }
    if (t < 0.33) return at("polygraph", { dur: 25 });
    return at(pick(["polygraph", "polygraph", "readLib", "greenhouse", "hallGreet", t > 0.66 ? "parlorSit" : "teaRead"]), { dur: rand(15, 30) });
  }
  if (k === "martha") {
    if (night) return at("cellarN", { dur: 30, label: "upstairs" });
    return at(pick(["marthaDesk", "marthaDesk", "parlorSit", "harpsichord", "sideboard"]), { dur: rand(15, 30), spot: "m_" + Math.random() });
  }
  if (k === "cornelia" || k === "george") {
    if (night) return at("cellarN", { dur: 30 });
    return at(pick(k === "cornelia" ? ["harpsichord", "teaRead", "parlorSit"] : ["playHall", "parlorSit", "playHall"]), { dur: rand(10, 22), spot: k + Math.random() });
  }
  if (k === "visitor") {
    if (night || Math.random() < 0.35) {
      a.awayLabel = "gone, or not yet arrived";
      return { x: ROOM.eastPortico.cx, y: ROOM.eastPortico.y1 - 0.8, hide: true, dur: rand(30, 70), label: "away", walkLabel: "leaving by the east portico" };
    }
    return { x: ROOM.hall.cx + rand(-2, 2), y: ROOM.hall.cy + rand(-1.5, 2), yaw: rand(-PI, PI), pose: { right: "rest", left: "rest" }, dur: rand(10, 20), label: "waiting in the entrance hall, studying the collections", walkLabel: "looking round the hall" };
  }
  if (k === "burwell") {
    if (night) return at("cellarS", { dur: 30 });
    return at(pick(["sideboard", "doorHall", "sideboard", "window2"]), { dur: rand(10, 18), label: k === "burwell" && Math.random() < 0.3 ? "glazing a window" : undefined, spot: "b" + Math.random() });
  }
  if (k === "sally") {
    if (night) return at("cellarS", { dur: 30 });
    return at(pick(["bedSide", "cabinetTidy", "sew"]), { dur: rand(12, 22), spot: "s" + Math.random() });
  }
  if (k === "priscilla") {
    if (night) return at("cellarS", { dur: 30 });
    const kid = crowd.list.find((o) => o.key === "george");
    return kid && !kid.hidden ? { follow: kid, near: 1.4, dur: rand(10, 20), pose: { right: "rest" }, label: "minding the children" } : at("sew", { dur: 10, spot: "p" + Math.random() });
  }
  if (k === "john") {
    if (night) return at("cellarS", { dur: 30 });
    return at(pick(["window1", "window2", "window3"]), { dur: rand(14, 24), spot: "j" + Math.random() });
  }
  return { dur: 5 };
}
function insidePeople(crowd) {
  for (const k of ["jefferson", "martha", "cornelia", "george", "visitor", "burwell", "sally", "priscilla", "john"]) {
    const a = add(crowd, k, { x: ROOM.hall.cx + rand(-2, 2), y: ROOM.hall.cy + rand(-2, 2), yaw: 0, brain: insideBrain });
    if (k === "jefferson") a.speed = 0.85;
  }
}

// ================================================================================================
// OUTSIDE
// ================================================================================================
const TER = { w: 6, z: FL, nLen: 18, wLen: 38 }; // L-shaped terraces: out from the ends, then west
const TERRACES = [
  { r: [-TER.nLen, -1.5, 0, -1.5 + TER.w] }, // north leg
  { r: [-TER.nLen - TER.w, -1.5 - TER.wLen, -TER.nLen, -1.5 + TER.w] }, // north leg turning west
  { r: [X1, -1.5, X1 + TER.nLen, -1.5 + TER.w] },
  { r: [X1 + TER.nLen, -1.5 - TER.wLen, X1 + TER.nLen + TER.w, -1.5 + TER.w] },
];
const PAVILIONS = [[-TER.nLen - TER.w / 2, -1.5 - TER.wLen - 2.6], [X1 + TER.nLen + TER.w / 2, -1.5 - TER.wLen - 2.6]];
const WEST = { x: X1 / 2, y: -26, rx: 18, ry: 11 }; // the roundabout walk on the West Lawn
const EAST = { x: X1 / 2, y: 30, r: 7 }; // the carriage circle in front of the east portico
const onTerrace = (x, y) => TERRACES.some(({ r }) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]);
const onPortico = (x, y) => (x > 12 && x < 21.4 && ((y > Y1 && y < 20.2) || (y < -2.5 && y > -8.5)));
const outsideZ = (x, y) => (onTerrace(x, y) || onPortico(x, y) ? FL : 0);
const GRASS = [[86, 124, 62], [104, 140, 70], [122, 156, 80], [142, 170, 92]], GRAVEL = shadeTones([206, 194, 170]);

function outsideFloor(x, y, px, py) {
  const e = ((x - 17) / 55) ** 2 + ((y + 10) / 46) ** 2 + 0.08 * (hash(Math.floor(x / 3), Math.floor(y / 3)) - 0.5);
  if (e > 1) return 0;
  // the walk round the West Lawn, with flower borders on both sides
  const w = Math.hypot((x - WEST.x) / WEST.rx, (y - WEST.y) / WEST.ry), dw = Math.abs(w - 1) * Math.min(WEST.rx, WEST.ry);
  if (dw < 0.9) return floorId("walk", px, py), tone4(GRAVEL, 0.5 + 0.3 * (hash(px, py) - 0.5), px, py);
  if (dw < 1.9) {
    floorId("flowers", px, py);
    const f = hash(Math.floor(x * 3), Math.floor(y * 3));
    return f > 0.55 ? rgb(...[[214, 70, 70], [236, 196, 70], [210, 120, 190], [240, 240, 230], [150, 90, 200]][Math.floor(f * 17) % 5]) : tone4(GRASS, 0.2, px, py);
  }
  const de = Math.abs(Math.hypot(x - EAST.x, y - EAST.y) - EAST.r);
  const drive = de < 1.6 || (Math.abs(x - EAST.x) < 1.6 && y > EAST.y + EAST.r - 0.5);
  if (drive || (y > Y1 && y < EAST.y - EAST.r + 0.5 && Math.abs(x - EAST.x) < 4.6)) return floorId("drive", px, py), tone4(GRAVEL, 0.45 + 0.3 * (hash(px, py) - 0.5), px, py);
  floorId("lawn", px, py);
  return tone4(GRASS, 0.5 + 0.18 * (hash(Math.floor(x / 1.2), Math.floor(y / 1.2)) - 0.5) + 0.22 * (hash(px, py) - 0.5), px, py);
}
function tree(x, y, s = 1, dark = false) {
  cyl(x, y, 0, 3 * s, 0.3 * s, 0.2 * s, mFlat([100, 80, 62]), null);
  const G = dark ? [[44, 82, 54], [56, 96, 60], [40, 72, 50]] : [[70, 116, 60], [88, 134, 70], [60, 104, 56]];
  for (let i = 0; i < 10; i++) {
    const a = i * 2.39, r = (0.8 + 0.6 * (i % 3)) * s;
    sphere(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, (3.4 + 0.7 * (i % 4)) * s, (1.2 + 0.3 * (i % 2)) * s, G[i % 3], "rough");
  }
  NAV && NAV.block(x - 0.5 * s, y - 0.5 * s, x + 0.5 * s, y + 0.5 * s);
}
function pediment(xa, xb, y, z0, rise, outward) {
  // triangular gable facing outward (-1 = west, +1 = east), with a half-round lunette window
  const xm = (xa + xb) / 2, lun = rampOf(GLASS), tr = rampOf(TRIM);
  const mat = (l, u, v) => {
    const du = u - (xb - xa) / 2, r = Math.hypot(du, v - 0.3);
    if (v > 0.3 && r < 0.75 && r > 0.6) return tr[4];
    if (v > 0.3 && r < 0.6) return Math.abs(du) % 0.25 < 0.04 ? tr[3] : lun[1];
    return tr[clamp(Math.floor(l + 0.3), 0, 4)];
  };
  if (outward < 0) patch([xa, y, z0], [xb, y, z0], [xm, y, z0 + rise], [xm, y, z0 + rise], mat, [0, -1, 0]);
  else patch([xb, y, z0], [xa, y, z0], [xm, y, z0 + rise], [xm, y, z0 + rise], mat, [0, 1, 0]);
}
function portico(side) {
  // side -1 = west (garden), +1 = east (entrance)
  const xa = side > 0 ? 11.95 : 12.25, xb = 21.35, yIn = side > 0 ? Y1 : -2.4, yOut = side > 0 ? 20.2 : -8.5, ys = side > 0 ? 21.8 : -12.2;
  const yl = Math.min(yIn, yOut), yh = Math.max(yIn, yOut), cols = side > 0 ? COLUMNS.east : COLUMNS.west;
  setId(side > 0 ? "eastPortico" : "westPortico");
  box(xa, yl, 0, xb, yh, FL, mFlat([210, 204, 190]), mPlinth);
  // steps down to the lawn
  for (let i = 0; i < 5; i++) {
    const y0 = side > 0 ? yOut + i * ((ys - yOut) / 5) : yOut - (i + 1) * ((yOut - ys) / 5), y1 = y0 + Math.abs(ys - yOut) / 5;
    box(xa + 1, Math.min(y0, y1), 0, xb - 1, Math.max(y0, y1), FL - (i + 1) * (FL / 5) + FL / 5, mFlat([200, 194, 180]), mFlat([180, 174, 160]));
  }
  for (const [x, y] of cols) column(x, y, FL, CORN);
  box(xa, yl, CORN, xb, yh, ENT, mTrim, mBands(TRIM, 0.33, 0.25, 0.6, true));
  pediment(xa, xb, yOut, ENT, 2.2, side);
  const xm = (xa + xb) / 2, back = side > 0 ? Y1 - 0.5 : DOME.y;
  patch([xa, yOut, ENT], [xa, back, ENT], [xm, yOut, ENT + 2.2], [xm, back, ENT + 2.2], mRoof, [-0.6, 0, 0.8]);
  patch([xb, back, ENT], [xb, yOut, ENT], [xm, back, ENT + 2.2], [xm, yOut, ENT + 2.2], mRoof, [0.6, 0, 0.8]);
}
function dome() {
  setId("dome");
  const { x, y, r } = DOME, n = 8, ring = (rr, z) => Array.from({ length: n + 1 }, (_, i) => [x + rr * Math.cos(((i + 0.5) / n) * 2 * PI), y + rr * Math.sin(((i + 0.5) / n) * 2 * PI), z]);
  const ow = rampOf(GLASS), tr = rampOf(TRIM);
  const drum = (l, u, v, px, py) => {
    const cu = u - 1.72, cv = v - 1.6, d = Math.hypot(cu, cv * 1.1);
    if (d < 0.75) return d > 0.62 ? tr[4] : ow[1];
    return mBrick(l, u, v, px, py);
  };
  // the drum: eight brick faces with round windows, up to a white cornice
  const lo = ring(r, ENT), hi = ring(r, 10.0);
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5 + 0.5) / n * 2 * PI;
    patch(lo[i], lo[i + 1], hi[i], hi[i + 1], drum, [Math.cos(a), Math.sin(a), 0]);
  }
  const c0 = ring(r + 0.2, 10.0), c1 = ring(r + 0.2, 10.5), c2 = ring(r - 0.1, 10.5);
  for (let i = 0; i < n; i++) {
    const a = (i + 1) / n * 2 * PI;
    patch(c0[i], c0[i + 1], c1[i], c1[i + 1], mTrim, [Math.cos(a), Math.sin(a), 0]);
    patch(c1[i], c1[i + 1], c2[i], c2[i + 1], mTrim, [0, 0, 1]);
  }
  // the dome: faceted, rising to the oculus at about 13.4 m (44'7" with the lawn below)
  const rows = 6;
  for (let j = 0; j < rows; j++) {
    const t0 = (j / rows) * HP, t1 = ((j + 1) / rows) * HP, z0 = 10.5 + 3.0 * Math.sin(t0), z1 = 10.5 + 3.0 * Math.sin(t1);
    const ra = ring((r - 0.1) * Math.cos(t0) + 0.6 * (1 - Math.cos(t0)) * 0, z0), rb = ring(Math.max(0.6, (r - 0.1) * Math.cos(t1)), z1);
    for (let i = 0; i < n; i++) {
      const a = (i + 1) / n * 2 * PI, s = Math.sin((t0 + t1) / 2);
      patch(ra[i], ra[i + 1], rb[i], rb[i + 1], mBands([150, 150, 156], 0.3, 0.08, 0.4, true), [Math.cos(a) * (1 - s), Math.sin(a) * (1 - s), s + 0.1]);
    }
  }
  cyl(x, y, 13.45, 13.6, 0.7, 0.6, mTrim, mFlat([60, 70, 90]));
}
function outsideBuild({ nav }) {
  NAV = nav;
  LIGHTS = [];
  nav.open(-38, -56, 72, 36);
  // the main block on its plinth
  setId("house");
  box(-0.1, -0.1, 0, X1 + 0.1, Y1 + 0.1, FL, null, mPlinth);
  const eastWin = [[4.4, 6.3], [9.2, 11.2], [22.0, 24.1], [26.7, 28.5]], westWin = [[3.9, 5.5], [8.9, 10.7], [22.5, 24.1], [27.2, 28.5]];
  const facE = mFacade((u) => X1 - u, eastWin, [[0.4, 2.1], [31.2, 32.8]], FL), facW = mFacade((u) => u, westWin, [[0.4, 2.1], [31.2, 32.8]], FL);
  const facN = mFacade((u) => Y1 - u, [], [[11.8, 14.4], [4.6, 6.4], [6.6, 8.4], [8.6, 10.4], [0.5, 3.4]], FL), facS = mFacade((u) => u, [[4.8, 6.6], [6.8, 8.6], [8.8, 10.6]], [[11.4, 12.8], [2.1, 3.6]], FL);
  box(0, 0, FL, X1, Y1, CORN, null, mBrick, { n: facE, s: facW, w: facN, e: facS });
  nav.block(-0.2, -0.2, X1 + 0.2, Y1 + 0.2, 0.2);
  // the parlor's polygonal bay on the west front
  const bay = [[570, 470], [570, 505], [530, 565], [458, 565], [418, 505], [418, 470]].map(([a, b]) => M(a, b));
  for (let i = 0; i < bay.length - 1; i++) {
    const [ax, ay] = bay[i], [bx, by] = bay[i + 1], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
    patch([ax, ay, 0], [bx, by, 0], [ax, ay, CORN], [bx, by, CORN], mBrick, [-dy / l, dx / l, 0]);
  }
  setId("entablature");
  box(-0.2, -0.2, CORN, X1 + 0.2, Y1 + 0.2, ENT, mFlat([200, 196, 186]), mBands(TRIM, 0.33, 0.25, 0.6, true));
  // balustrade along the roof edge, and the low hipped roof behind it
  setId("balustrade");
  for (const [f, c, a0, a1] of [["n", Y1 + 0.2, -0.2, X1 + 0.2], ["s", -0.2, -0.2, X1 + 0.2], ["e", X1 + 0.2, -0.2, Y1 + 0.2], ["w", -0.2, -0.2, Y1 + 0.2]]) {
    panel(f, c, a0, a1, ENT, BAL, mBalusters);
    panel({ n: "s", s: "n", e: "w", w: "e" }[f], c, a0, a1, ENT, BAL, mBalusters);
  }
  setId("roof");
  const ins = 0.8, rz = ENT + 1.9, ym = Y1 / 2, rx0 = ins + (ym - ins), rx1 = X1 - ins - (ym - ins);
  patch([X1 - ins, Y1 - ins, ENT], [ins, Y1 - ins, ENT], [rx1, ym, rz], [rx0, ym, rz], mRoof, [0, 0.5, 0.85]);
  patch([ins, ins, ENT], [X1 - ins, ins, ENT], [rx0, ym, rz], [rx1, ym, rz], mRoof, [0, -0.5, 0.85]);
  patch([ins, Y1 - ins, ENT], [ins, ins, ENT], [rx0, ym, rz], [rx0, ym, rz], mRoof, [-0.5, 0, 0.85]);
  patch([X1 - ins, ins, ENT], [X1 - ins, Y1 - ins, ENT], [rx1, ym, rz], [rx1, ym, rz], mRoof, [0.5, 0, 0.85]);
  setId("chimneys");
  for (const [x, h] of [[8.3, 10.2], [11.9, 12.4], [21.0, 12.4], [25.1, 10.2], [26.0, 10.2]]) box(x - 0.45, 6.6, ENT, x + 0.45, 7.6, h, mFlat([150, 80, 60]), mBrick);
  portico(1);
  portico(-1);
  dome();
  // terraces over the service wings, with Chinese railings, and the pavilions at their ends
  setId("terrace");
  for (const { r } of TERRACES) {
    const [x0, y0, x1, y1] = r;
    box(x0, y0, 0, x1, y1, FL, mFlat([196, 184, 162]), mBrick);
    nav.open(x0, y0, x1, y1);
  }
  for (const { r } of TERRACES) {
    const [x0, y0, x1, y1] = r;
    if (x1 - x0 > y1 - y0) for (const [f, c] of [["s", y0 + 0.05], ["n", y1 - 0.05]]) panel(f, c, x0, x1, FL, FL + 0.9, mChinese);
    else for (const [f, c] of [["w", x0 + 0.05], ["e", x1 - 0.05]]) panel(f, c, y0, y1, FL, FL + 0.9, mChinese);
  }
  // doors of the service rooms along the outer face of each terrace (kitchen, smokehouse, stables...)
  setId("serviceDoors");
  const dark = rampOf([46, 34, 30]);
  for (let x = X1 + 2; x < X1 + TER.nLen - 1; x += 3.2) panel("n", -1.5 + TER.w + 0.01, x, x + 1.0, 0, 2.0 > FL ? FL - 0.05 : 0.9, (l) => dark[1]);
  for (let x = -TER.nLen + 1; x < -1; x += 3.2) panel("n", -1.5 + TER.w + 0.01, x, x + 1.0, 0, FL - 0.05, (l) => dark[1]);
  setId("pavilion");
  for (const [px, py] of PAVILIONS) {
    box(px - 2.6, py - 2.6, 0, px + 2.6, py + 2.6, 4.2, null, mFacade((u) => u, [[1.6, 3.0]], [], 0));
    box(px - 2.8, py - 2.8, 4.2, px + 2.8, py + 2.8, 4.6, mTrim, mTrim);
    const top = [px, py, 6.0];
    patch([px - 2.8, py - 2.8, 4.6], [px + 2.8, py - 2.8, 4.6], top, top, mRoof, [0, -0.6, 0.8]);
    patch([px + 2.8, py + 2.8, 4.6], [px - 2.8, py + 2.8, 4.6], top, top, mRoof, [0, 0.6, 0.8]);
    patch([px - 2.8, py + 2.8, 4.6], [px - 2.8, py - 2.8, 4.6], top, top, mRoof, [-0.6, 0, 0.8]);
    patch([px + 2.8, py - 2.8, 4.6], [px + 2.8, py + 2.8, 4.6], top, top, mRoof, [0.6, 0, 0.8]);
    box(px + 0.8, py - 0.4, 4.6, px + 1.4, py + 0.4, 6.4, mFlat([150, 80, 60]), mBrick);
    nav.block(px - 2.7, py - 2.7, px + 2.7, py + 2.7);
  }
  setId("tree");
  const trees = [[-12, 12, 1.1], [-6, 24, 1.3], [40, 14, 1.2], [48, 26, 1.1], [30, 33, 1.0], [2, 32, 1.0], [-14, -24, 1.2], [50, -24, 1.2], [-8, -46, 1.0], [42, -48, 1.1], [16.7, -50, 1.3], [-22, 4, 0.9], [58, 6, 0.9]];
  for (const [x, y, s] of trees) tree(x, y, s, s > 1.15);
  setId(null);
}

// ---- the household's day outside --------------------------------------------------------------
const KITCHEN = { x: X1 + 4.5, y: -1.5 + TER.w + 0.9 }; // kitchen door on the outer face of the south wing
const STABLE = { x: -TER.nLen + 4, y: -1.5 + TER.w + 0.9 };
const BEDS = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * 2 * PI;
  return [WEST.x + Math.cos(a) * (WEST.rx + 1.4), WEST.y + Math.sin(a) * (WEST.ry + 1.4), a];
});
// the ride: a loop round the carriage circle and out along the drive (the terraces wall off the West Lawn)
const RIDE = Array.from({ length: 12 }, (_, i) => {
  const a = PI + (i / 12) * 2 * PI;
  return [EAST.x + Math.cos(a) * (EAST.r + 0.2), EAST.y + Math.sin(a) * (EAST.r + 0.2)];
});
let RIDER = null, HORSE_A = null;
function outsideBrain(a, crowd) {
  const t = tod(crowd.clock), night = t > 0.88 || t < 0.24, k = a.key;
  if (k === "horse") {
    if (t > 0.5 && t < 0.58) return { route: [[STABLE.x + 2, STABLE.y + 3], [-4, 12], ...RIDE, ...RIDE, [-4, 12], [STABLE.x + 2, STABLE.y + 3]], x: STABLE.x, y: STABLE.y + 1.5, yaw: HP, dur: 4, label: "carrying Jefferson on his ride", walkLabel: "carrying Jefferson on his ride", ride: true };
    return { x: STABLE.x + rand(-2, 2), y: STABLE.y + 1.6, yaw: HP + rand(-0.4, 0.4), pose: Math.random() < 0.6 ? { graze: 1 } : {}, dur: rand(8, 16), label: "at the stables" };
  }
  if (k === "jefferson") {
    if (HORSE_A && HORSE_A.task && HORSE_A.task.ride && HORSE_A.state === "walk") return { dur: 1, label: "riding" };
    if (night) return { x: ROOM.porchSW.cx, y: ROOM.porchSW.cy, hide: true, dur: 30, label: "indoors" };
    if (t > 0.48 && t < 0.5) return { x: STABLE.x + 1, y: STABLE.y + 0.8, yaw: HP, dur: 2, label: "mounting his horse", walkLabel: "walking to the stables" };
    a.awayLabel = "indoors, writing";
    return Math.random() < 0.5 ? { x: rand(-TER.nLen + 1, -2), y: 0.5, yaw: -HP, z: FL, pose: { right: "rest", left: "rest" }, dur: rand(10, 20), label: "looking out over the West Lawn", walkLabel: "walking on the terrace" } : { x: ROOM.porchSW.cx, y: ROOM.porchSW.cy, hide: true, dur: rand(20, 40), label: "indoors", walkLabel: "going indoors" };
  }
  if (k === "wormley") {
    if (night) return { x: KITCHEN.x + 10, y: KITCHEN.y + 2, hide: true, dur: 30, label: "at the quarters" };
    const [bx, by, ang] = pick(BEDS);
    return { x: bx + Math.cos(ang) * 0.9, y: by + Math.sin(ang) * 0.9, face: [bx, by], pose: { right: "hold", left: "hold" }, dur: rand(10, 20), label: "weeding the flower borders", walkLabel: "walking the borders" };
  }
  if (k === "edith" || k === "fanny") {
    if (night) return { x: KITCHEN.x, y: KITCHEN.y - 0.8, hide: true, dur: 30, label: "in the kitchen" };
    if (Math.random() < 0.4) return { x: KITCHEN.x, y: KITCHEN.y - 0.8, hide: true, dur: rand(12, 25), label: "cooking in the kitchen", walkLabel: "going back to the kitchen" };
    return { x: KITCHEN.x + rand(1, 9), y: KITCHEN.y + rand(0.5, 2.5), yaw: rand(-PI, PI), pose: { right: "hold", left: "hold" }, item: pick(["basket", "pail", null]), dur: rand(6, 12), label: k === "edith" ? "fetching from the smokehouse" : "carrying water from the cistern", walkLabel: "crossing the kitchen yard" };
  }
  if (k === "israel") {
    if (night) return { x: STABLE.x, y: STABLE.y - 0.8, hide: true, dur: 30, label: "at the stables" };
    if (HORSE_A && !(HORSE_A.task && HORSE_A.task.ride)) return { x: STABLE.x + 1.6, y: STABLE.y + 2.0, face: [HORSE_A.x, HORSE_A.y], pose: { right: "hold" }, item: "pail", dur: rand(8, 14), label: "watering the horse" };
    return { x: STABLE.x + rand(-3, 3), y: STABLE.y + 1.5, yaw: rand(-PI, PI), pose: {}, dur: 8, label: "waiting for the horse to come back" };
  }
  if (k === "visitor") {
    if (night || Math.random() < 0.3) return { x: EAST.x, y: 35, hide: true, dur: rand(20, 40), label: "away", walkLabel: "leaving down the drive" };
    return { x: EAST.x + rand(-4, 4), y: EAST.y - EAST.r - rand(1, 3), yaw: -HP, pose: { right: "rest" }, dur: rand(10, 20), label: "admiring the east front", walkLabel: "walking up the drive" };
  }
  if (k === "cornelia" || k === "george") {
    if (night) return { x: ROOM.porchNW.cx, y: ROOM.porchNW.cy, hide: true, dur: 30, label: "indoors" };
    return { x: rand(-TER.nLen + 1, -1), y: rand(-1, 3.5), z: FL, yaw: rand(-PI, PI), pose: k === "george" ? { right: "point" } : { right: "hold", left: "hold" }, dur: rand(8, 16), label: k === "george" ? "playing on the north terrace" : "sketching the West Lawn", walkLabel: "walking on the terrace" };
  }
  return { dur: 5 };
}
function outsidePeople(crowd) {
  crowd.ground = outsideZ;
  HORSE_A = crowd.add({ key: "horse", name: "Jefferson's horse", role: "Saddle horse", desc: "Jefferson rode over the plantation nearly every day, well into his eighties.", spec: HORSE, x: STABLE.x, y: STABLE.y + 1.6, yaw: HP, draw: drawBeast, pickH: beastHeight, pickW: 0.8, walkPose: () => ({}), stride: 1.1, speed: 2.2, radius: 0.6, noPush: true, brain: outsideBrain });
  for (const k of ["jefferson", "wormley", "edith", "fanny", "israel", "visitor", "cornelia", "george"]) add(crowd, k, { x: 10 + rand(-2, 2), y: -14 + rand(-2, 2), yaw: 0, brain: outsideBrain });
  RIDER = crowd.list.find((a) => a.key === "jefferson");
}
function outsideUpdate(dt, crowd) {
  // Jefferson in the saddle while the horse is out on its ride
  const h = HORSE_A, j = RIDER;
  if (h && j && h.task && h.task.ride && h.state === "walk") {
    j.hidden = false;
    j.state = "do";
    j.task = { dur: 1, label: "riding over the plantation", pose: { sit: 1, right: "hold", left: "hold" }, yaw: h.yaw, z: h.z + 1.05 };
    j.x = h.x - Math.cos(h.yaw) * 0.25;
    j.y = h.y - Math.sin(h.yaw) * 0.25;
    j.yaw = h.yaw;
    j.label = "riding over the plantation";
    j.timer = 1;
  }
}

// ---- things --------------------------------------------------------------------------------------
const ROOM_TEXT = {
  hall: ["Entrance Hall", "Jefferson's museum: natural history specimens, mastodon bones, maps, and Native American objects, many brought back by Lewis and Clark. The floor was painted grass green. A seven-day clock over the door is driven by cannonball weights."],
  parlor: ["Parlor", "27' 3\" × 23' 8\" with an 18' ceiling. Music, games and conversation; the floor is Jefferson's parquet of cherry and beech."],
  dining: ["Dining Room", "Painted bright chrome yellow. Wine came up from the cellar by dumbwaiters beside the fireplace, and dishes came in through a revolving serving door."],
  tea: ["Tea Room", "Jefferson called it his 'most honourable suite': busts of Franklin, Washington, Lafayette and John Paul Jones stood here."],
  northOctagon: ["North Octagon Room", "A guest room, often used by James and Dolley Madison."],
  northSquare: ["North Square Room", "A guest bedroom."],
  northPassage: ["North Passage", "A narrow stair here leads to the upper floors."],
  piazza: ["North Piazza", "A covered porch on the north end."],
  southSquare: ["South Square Room", "Martha Randolph's sitting room, where she managed the household."],
  library: ["Library", "Jefferson sold his library of some 6,700 books to Congress in 1815, then started collecting again."],
  bookRoom: ["Book Room", "More of Jefferson's books."],
  southPassage: ["South Passage", "A stair leads down to the cellars and the all-weather passage to the kitchen."],
  southLobby: ["South Passage", ""],
  bedroom: ["Jefferson's Bedroom", "His bed stands in an alcove open to both the bedroom and the cabinet."],
  cabinet: ["Cabinet", "Jefferson's study: a revolving chair, a revolving book stand, a telescope, and the polygraph that copied each letter as he wrote it."],
  greenhouse: ["Greenhouse", "A glassed-in porch where Jefferson raised seedlings and kept his workbench."],
  porchNE: ["Porch", ""], porchNW: ["Porch", ""], porchSE: ["Porch", ""], porchSW: ["Porch", "Jefferson's private way out of his suite."],
  eastPortico: ["East Portico", "The entrance front. Visitors arrived here."],
  westPortico: ["West Portico", "The garden front, below the dome. This is the view on the nickel."],
};
const insideThings = {
  ...Object.fromEntries(Object.entries(ROOM_TEXT).map(([k, [name, text]]) => [k, { name, text }])),
  walls: { name: "Walls", text: "Brick, plastered inside. Walls are cut away so the rooms can be seen." },
  columns: { name: "Columns", text: "The porticoes' columns." },
  busts: { name: "Busts", text: "Busts of Jefferson and Alexander Hamilton faced each other across the hall, 'opposed in death as in life', Jefferson remarked." },
  collections: { name: "Collections", text: "Fossils, minerals, antlers, and objects from Native American nations, many collected by Lewis and Clark." },
  mastodon: { name: "Mastodon bones", text: "Jefferson was fascinated by the American mastodon and displayed bones dug up in Kentucky." },
  benches: { name: "Benches", text: "Where visitors waited to be received." },
  harpsichord: { name: "Harpsichord", text: "Jefferson's granddaughters played it for the family." },
  parlorFurniture: { name: "Sofa and table", text: "" },
  chair: { name: "Chair", text: "" },
  diningTable: { name: "Dining table", text: "Dinner was the main meal, at about half past three." },
  dumbwaiter: { name: "Wine dumbwaiter", text: "A box lift in the side of the fireplace brought wine up from the cellar." },
  revolvingDoor: { name: "Revolving serving door", text: "Shelves on a turning door, so dishes could pass in from the service passage." },
  teaBusts: { name: "Busts", text: "Franklin, Washington, Lafayette, John Paul Jones." },
  teaTable: { name: "Tea table", text: "" },
  alcoveBed: { name: "Alcove bed", text: "Open on one side to the bedroom and on the other to the cabinet." },
  polygraph: { name: "Polygraph", text: "A copying machine: a second pen, linked to the first, wrote a duplicate of each letter." },
  revolvingChair: { name: "Revolving chair", text: "Jefferson's swivel chair, with a writing arm." },
  bookstand: { name: "Revolving book stand", text: "Holds several open books at once." },
  telescope: { name: "Telescope", text: "From the cabinet window he could watch the building of the University of Virginia." },
  books: { name: "Books", text: "" },
  libraryTable: { name: "Table", text: "" },
  greenhouse_plants: { name: "Seedlings", text: "" },
  workbench: { name: "Workbench", text: "" },
  marthaDesk: { name: "Writing desk", text: "Martha Randolph's household accounts." },
  guestBed: { name: "Guest bed", text: "" },
  windsor: { name: "Windsor chairs", text: "" },
};
const outsideThings = {
  house: { name: "Monticello", sub: "1769–1809", text: "110' long and 87'9\" deep across the porticoes. Jefferson rebuilt the first house into this one between 1796 and 1809.", enter: "inside", enterLabel: "inside" },
  entablature: { name: "Entablature", text: "A full Doric cornice runs round the whole house, tying it together." },
  balustrade: { name: "Balustrade", text: "It hides the upper floors, so the house looks like a single storey." },
  roof: { name: "Roof", text: "" },
  chimneys: { name: "Chimneys", text: "" },
  eastPortico: { name: "East Portico", text: "The entrance front.", enter: "inside", enterLabel: "inside" },
  westPortico: { name: "West Portico", text: "The garden front, the view on the nickel.", enter: "inside", enterLabel: "inside" },
  dome: { name: "The dome", sub: "31' × 28', octagonal", text: "Among the first domes on an American house. The room inside was little used: at times a bedroom, a storeroom, a playroom." },
  terrace: { name: "Terraces", text: "Walkways on top of the service wings. Underneath: the kitchen, cellars, smokehouse, dairy, stables and rooms where enslaved workers lived and worked." },
  serviceDoors: { name: "Service rooms", text: "Kitchen, smokehouse, dairy and stables under the terraces, out of sight from the house." },
  pavilion: { name: "Pavilion", text: "Small buildings at the ends of the terraces. Jefferson and his wife lived in the South Pavilion while the first house was built." },
  tree: { name: "Tree", text: "" },
  walk: { name: "Roundabout walk", text: "A gravel walk round the West Lawn, lined with flower borders." },
  flowers: { name: "Flower borders", text: "Jefferson planned the beds; enslaved gardeners planted and kept them." },
  drive: { name: "Carriage drive", text: "" },
  lawn: { name: "Lawn", text: "" },
};

function story(where) {
  return {
    paras: [
      where === "inside"
        ? "The main floor of Monticello, traced from the Historic American Buildings Survey drawings. Walls are cut away to show the rooms."
        : "Monticello and its terraces, traced from the Historic American Buildings Survey drawings.",
      "Jefferson called it his 'essay in architecture'. It was also the centre of a plantation of about 5,000 acres, and most of the work here was done by enslaved people: over his lifetime Jefferson enslaved more than 600.",
      "A day passes in six minutes. Dinner is at about half past three.",
    ],
  };
}
mount({
  title: "Monticello",
  subtitle: "Charlottesville, Virginia, c. 1815",
  start: "outside",
  menu: [
    { scene: "outside", label: "outside" },
    { scene: "inside", label: "main floor" },
  ],
  scenes: {
    outside: {
      title: "Monticello", subtitle: "Charlottesville, Virginia, c. 1815: the house, terraces and West Lawn", short: "outside",
      view: { S: 8, bounds: [-38, -56, 72, 36], top: 14.2, below: 0.4, shadow: [-0.8, -0.35], light: { dir: [0.34, 0.4, 1], base: 1.45, k: 2.0 }, edge: 0.25 },
      rot: 3, focus: [16, -8, 3], things: outsideThings, floor: outsideFloor, build: outsideBuild, people: outsidePeople, update: outsideUpdate,
      overlay: (t) => cloudShade(t, { scale: 160, wind: [-3, 1], cover: 0.55, strength: 0.22 }), ambient, roster: true, story: story("outside"),
    },
    inside: {
      title: "Monticello: the main floor", subtitle: "Charlottesville, Virginia, c. 1815", short: "the main floor",
      view: { S: 16, bounds: [-1, -13, 35, 22], top: 4.6, below: 0.3, shadow: [0.3, -0.12], light: { base: 1.7, k: 1.8 }, edge: 0.12, shadeGround: [0.76, 0.72, 0.86], shadeObj: [0.86, 0.84, 0.92] },
      rot: 0, focus: [17, 4, 1], things: insideThings, floor: insideFloor, build: insideBuild, people: insidePeople,
      update: (dt, crowd, api) => {
        const t = tod(crowd.clock);
        if (t > 0.6 && t < 0.601 && !crowd.dinnerSaid) (crowd.dinnerSaid = true), api.say("<b>Dinner</b><span>Half past three: the family gathers in the dining room. Burwell Colbert serves.</span>");
        if (t > 0.7) crowd.dinnerSaid = false;
      },
      overlay: (t) => {
        const tt = tod(t);
        if (tt > 0.74 || tt < 0.24) glows(LIGHTS, t);
      },
      ambient, roster: true, story: story("inside"),
    },
  },
});
window.__monticelloTime = (clock) => clockText(clock);
