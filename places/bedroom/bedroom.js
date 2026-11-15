// Van Gogh's bedroom in the Yellow House, Arles, October 1888. See BRIEF.md for sources.
// x runs left to right as seen from the doorway corner, y runs toward the window, z up; metres.
// The room is a trapezoid: the window wall runs from (0, DL) to (RW, DR), so the room is deeper on
// the right (the bed side), with an obtuse corner at the left of the window and an acute one at the right.
import { mount } from "../../engine/app.js";
import { box, cyl, sphere, quad, rampOf, mFlat, mStroke, floorId, setId, hash, bayerAt, clamp, rgb, glows, facesCamera, setShadows } from "../../engine/render.js";
import { wall, wallLine, panel } from "../../engine/build.js";

const PI = Math.PI;
// 12 ft wide; about 15 m² in all (figures reported for the real room; see BRIEF.md)
const RW = 3.66, DL = 3.8, DR = 4.6, CEIL = 3.0; // width, depth at the left and right walls, ceiling
const WL = Math.hypot(RW, DR - DL), WX = RW / WL, WY = (DR - DL) / WL; // window wall length and direction
const onWall = (u) => [WX * u, DL + WY * u]; // point on the window wall, u metres from the left corner
const NX = WY, NY = -WX; // inward normal of the window wall
const WIN = [1.05, 2.1], SILL = 0.85, HEAD = 2.45; // window opening along the wall, and its height
const RDOOR = [3.65, 4.45], LDOOR = [0.35, 1.15]; // right door (stairs), left door (Gauguin's room)

// ---- the two palettes ------------------------------------------------------------------------
// "described": the colours Van Gogh lists in his letter to Theo of 16 October 1888.
// "today": the faded pigments as the paintings look now (the red lakes have faded).
const PALETTES = {
  described: {
    wall: [184, 164, 214], floor: [196, 98, 70], floor2: [180, 116, 82], wood: [238, 198, 78], sheet: [214, 228, 122],
    cover: [216, 50, 40], window: [72, 152, 82], table: [228, 142, 58], basin: [72, 112, 196], door: [192, 164, 214], outline: [44, 40, 74],
  },
  today: {
    wall: [148, 176, 214], floor: [158, 124, 92], floor2: [134, 140, 108], wood: [228, 192, 92], sheet: [210, 214, 150],
    cover: [200, 60, 50], window: [96, 146, 92], table: [216, 152, 82], basin: [90, 122, 184], door: [150, 164, 204], outline: [40, 46, 64],
  },
};
let C = PALETTES.described;
let NAV = null;
const block = (x0, y0, x1, y1, g) => NAV && NAV.block(x0, y0, x1, y1, g);

// ---- floor -------------------------------------------------------------------------------------
const depthAt = (x) => DL + ((DR - DL) * x) / RW;
const inRoom = (x, y) => x >= 0 && x <= RW && y >= 0 && y <= depthAt(x);
function floor(x, y, px, py) {
  if (!inRoom(x, y)) {
    const pad = x >= -0.22 && x <= RW + 0.22 && y >= -0.22 && y <= depthAt(Math.min(RW, Math.max(0, x))) + 0.22;
    return pad ? rgb(...C.outline) : 0;
  }
  floorId("floor", px, py);
  // square terracotta tiles, painted in short horizontal dabs
  const T = 0.3, tx = Math.floor(x / T), ty = Math.floor(y / T), fx = x / T - tx, fy = y / T - ty;
  const ramp = rampOf((tx + ty) & 1 ? C.floor : C.floor2);
  if (fx < 0.05 || fy < 0.05) return rampOf(C.outline)[3];
  const row = Math.floor(y / 0.035), off = hash(row, 3.1) * 0.14, j = Math.floor((x + off) / 0.14);
  const v = 0.9 * (hash(row * 1.7, j * 2.3) - 0.5) + 0.3 * (hash(tx, ty) - 0.5);
  return ramp[clamp(Math.floor(3.1 + v + (bayerAt(px, py) - 0.5) * 0.4), 0, 4)];
}

// ---- furniture ---------------------------------------------------------------------------------
function chair(x, y, yaw) {
  // a rush-seated ladder-back chair, like the one in "Van Gogh's Chair"
  const m = mStroke(C.wood, 0.08, 0.02, 0.8, true), rush = mStroke([206, 168, 84], 0.06, 0.02, 1.1);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (f, l) => [x + c * f - s * l, y + s * f + c * l];
  for (const [f, l] of [[0.2, 0.2], [0.2, -0.2], [-0.2, 0.2], [-0.2, -0.2]]) {
    const [px, py] = at(f, l), top = f < 0 ? 0.98 : 0.44;
    box(px - 0.025, py - 0.025, 0, px + 0.025, py + 0.025, top, m, m);
  }
  const [cx, cy] = at(0, 0);
  box(cx - 0.22, cy - 0.22, 0.42, cx + 0.22, cy + 0.22, 0.46, rush, mFlat([180, 140, 70]));
  for (const z of [0.62, 0.76, 0.9]) {
    const [a0, b0] = at(-0.2, -0.2), [a1, b1] = at(-0.2, 0.2);
    box(Math.min(a0, a1) - 0.02, Math.min(b0, b1) - 0.02, z, Math.max(a0, a1) + 0.02, Math.max(b0, b1) + 0.02, z + 0.04, m, m);
  }
  for (const z of [0.15, 0.3]) {
    const [a0, b0] = at(0.2, -0.2), [a1, b1] = at(-0.2, 0.2);
    box(Math.min(a0, a1) + 0.03, Math.min(b0, b1) + 0.03, z, Math.max(a0, a1) - 0.03, Math.max(b0, b1) - 0.03, z + 0.02, m, null);
  }
  block(cx - 0.25, cy - 0.25, cx + 0.25, cy + 0.25, 0.1);
}
function bed() {
  const x0 = RW - 1.38, x1 = RW - 0.04, yf = 1.25, yh = 3.35;
  const m = mStroke(C.wood, 0.12, 0.03, 0.8, true), mh = mStroke(C.wood, 0.14, 0.03, 0.8);
  setId("bed");
  for (const [x, y, h] of [[x0, yf, 0.95], [x1 - 0.08, yf, 0.95], [x0, yh - 0.08, 1.3], [x1 - 0.08, yh - 0.08, 1.3]]) box(x, y, 0, x + 0.08, y + 0.08, h, m, m);
  box(x0 + 0.08, yh - 0.07, 0.32, x1 - 0.08, yh - 0.01, 1.2, mh, mh); // headboard
  box(x0 + 0.08, yf + 0.01, 0.32, x1 - 0.08, yf + 0.07, 0.88, mh, mh); // footboard
  for (const x of [x0, x1 - 0.08]) box(x, yf + 0.08, 0.28, x + 0.08, yh - 0.08, 0.46, m, m);
  setId("sheets");
  box(x0 + 0.06, yf + 0.08, 0.46, x1 - 0.06, yh - 0.08, 0.6, mStroke(C.sheet, 0.12, 0.03, 0.7), mStroke(C.sheet, 0.1, 0.03, 0.7, true));
  setId("pillows");
  for (const [a, b] of [[x0 + 0.1, x0 + 0.66], [x0 + 0.7, x1 - 0.1]]) box(a, yh - 0.55, 0.6, b, yh - 0.1, 0.78, mStroke(C.sheet, 0.08, 0.03, 0.6, false, 0.3), mStroke(C.sheet, 0.08, 0.03, 0.6, true, 0.3));
  setId("coverlet");
  const mc = mStroke(C.cover, 0.12, 0.035, 0.9);
  box(x0 + 0.03, yf + 0.1, 0.6, x1 - 0.03, yh - 0.62, 0.67, mc, mc);
  box(x0 - 0.01, yf + 0.1, 0.3, x0 + 0.03, yh - 0.62, 0.67, mc, mc);
  block(x0, yf, x1, yh, 0.12);
}
// small framed pictures on the right wall (its inner face looks toward -x)
function picture(y0, y1, z0, z1, paint) {
  const fr = rampOf([150, 110, 60]);
  panel("w", RW - 0.006, y0, y1, z0, z1, (l, u, v, px, py) => {
    const w = y1 - y0, h = z1 - z0;
    if (u < 0.035 || v < 0.035 || u > w - 0.035 || v > h - 0.035) return fr[clamp(Math.floor(l + 0.4), 0, 4)];
    return paint(u / w, v / h, l, px, py);
  });
}
const portrait = (bg, coat, face, hat) => (u, v, l, px, py) => {
  const dx = u - 0.5, head = (dx * dx) / 0.03 + ((v - 0.62) * (v - 0.62)) / 0.05 < 1;
  if (hat && v > 0.74 && v < 0.86 && Math.abs(dx) < 0.18) return rampOf(hat)[3];
  if (head) return rampOf(face)[clamp(Math.floor(l + (bayerAt(px, py) - 0.5) * 0.6), 0, 4)];
  if (v < 0.42 - 0.6 * Math.abs(dx) * 0) if (Math.abs(dx) < 0.42 && v < 0.44) return rampOf(coat)[clamp(Math.floor(l - 0.3 + (bayerAt(px, py) - 0.5) * 0.6), 0, 4)];
  const star = bg.stars && hash(Math.floor(u * 9), Math.floor(v * 11)) > 0.86;
  return star ? rampOf([240, 220, 120])[4] : rampOf(bg.c)[clamp(Math.floor(l + 0.8 * (hash(Math.floor(u * 12), Math.floor(v * 14)) - 0.5)), 0, 4)];
};
const landscape = (u, v, l, px, py) => {
  if (v > 0.55) return rampOf([150, 190, 210])[clamp(Math.floor(l + 0.5 * (hash(Math.floor(u * 20), Math.floor(v * 10)) - 0.5)), 0, 4)];
  if (v > 0.45 - 0.08 * Math.sin(u * 9)) return rampOf([90, 140, 80])[3];
  return rampOf([214, 180, 80])[clamp(Math.floor(l + 0.8 * (hash(Math.floor(u * 18), Math.floor(v * 12)) - 0.5)), 0, 4)];
};
function windowSashes(open) {
  // casement window in the opening of the slanted wall: green frame, light coming through
  const fr = rampOf(C.window), lite = rampOf([214, 230, 170]);
  const ww = WIN[1] - WIN[0], wh = HEAD - SILL;
  const sash = (l, u, v, px, py, w) => {
    const edge = u < 0.05 || u > w - 0.05 || v < 0.05 || v > wh - 0.05 || Math.abs(v - wh / 3) < 0.025 || Math.abs(v - (2 * wh) / 3) < 0.025;
    return edge ? fr[clamp(Math.floor(l + 0.3), 0, 4)] : lite[clamp(Math.floor(3 + 0.7 * (hash(Math.floor(u * 30), Math.floor(v * 24)) - 0.5) + v * 0.3), 0, 4)];
  };
  setId("window");
  // right sash closed, in the wall plane
  const [rx, ry] = onWall(WIN[0] + ww / 2);
  quad(rx, ry, SILL, WX * (ww / 2), WY * (ww / 2), 0, 0, 0, wh, NX, NY, 0, (l, u, v, px, py) => sash(l, u, v, px, py, ww / 2));
  // left sash swung open into the room
  const [lx, ly] = onWall(WIN[0]), a = open, dx = WX * Math.cos(a) + NX * Math.sin(a), dy = WY * Math.cos(a) + NY * Math.sin(a);
  quad(lx, ly, SILL, dx * (ww / 2), dy * (ww / 2), 0, 0, 0, wh, -dy, dx, 0, (l, u, v, px, py) => sash(l, u, v, px, py, ww / 2));
  quad(lx + dx * (ww / 2), ly + dy * (ww / 2), SILL, -dx * (ww / 2), -dy * (ww / 2), 0, 0, 0, wh, dy, -dx, 0, (l, u, v, px, py) => sash(l, u, v, px, py, ww / 2));
  // sill and the view out: plane trees on Place Lamartine
  const [sx, sy] = onWall(WIN[0]);
  quad(sx + NX * 0.06, sy + NY * 0.06, SILL, WX * ww, WY * ww, 0, -NX * 0.3, -NY * 0.3, 0, 0, 0, 1, mFlat(C.window));
  const [ox, oy] = onWall(WIN[0]);
  quad(ox - NX * 0.22, oy - NY * 0.22, SILL, WX * ww, WY * ww, 0, 0, 0, wh, NX, NY, 0, (l, u, v, px, py) => {
    const tree = hash(Math.floor(u * 6), Math.floor(v * 5)) + (v < 0.9 ? 0.35 : -0.2);
    return tree > 0.75 ? rampOf([86, 140, 72])[clamp(Math.floor(2.6 + (bayerAt(px, py) - 0.5)), 0, 4)] : rampOf([196, 222, 214])[clamp(Math.floor(3.2 + (bayerAt(px, py) - 0.5) * 0.6), 0, 4)];
  });
}
let LIGHTS = [];
let CANDLE = null;
function build({ nav }) {
  NAV = nav;
  LIGHTS = [];
  nav.open(0, 0, RW, DR);
  for (let x = 0; x <= RW; x += 0.1) nav.block(x - 0.05, depthAt(x), x + 0.05, DR + 0.5, 0.15);
  setId(null);
  // the floor slab follows the slanted window wall in steps
  for (let i = 0; i < 8; i++) {
    const a = (RW + 0.44) * (i / 8) - 0.22, b = (RW + 0.44) * ((i + 1) / 8) - 0.22;
    box(a, -0.22, -0.3, b, depthAt(Math.max(0, Math.min(RW, a))) + 0.22, 0, null, mFlat(C.outline));
  }
  const mWall = mStroke(C.wall, 0.16, 0.035, 0.8, true), mTop = mFlat([110, 96, 130]);
  setId("wall");
  const W = { h: CEIL, mat: mWall, top: mTop, cap: mTop, cut: 1.0, nav };
  wall(-0.2, -0.2, RW + 0.2, 0, { ...W, outward: "s" });
  wall(-0.2, 0, 0, DL, { ...W, outward: "w", doors: [[LDOOR[0], LDOOR[1], 2.1]] });
  wall(RW, 0, RW + 0.2, DR, { ...W, outward: "e", doors: [[RDOOR[0], RDOOR[1], 2.1]] });
  const winFull = !facesCamera(-NX, -NY);
  wallLine(0, DL, RW, DR, { h: winFull ? CEIL : 1.0, t: 0.2, side: -1, inner: mWall, outer: mWall, top: mTop, nav, mask: (u, v) => !(u > WIN[0] && u < WIN[1] && v > SILL && v < HEAD) });
  // doors, closed, in their openings (lilac)
  setId("door_right");
  const md = (l, u, v, px, py) => {
    const pnl = (u > 0.08 && u < 0.72 && ((v > 0.15 && v < 0.95) || (v > 1.1 && v < 1.95))) ? -0.4 : 0;
    return rampOf(C.door)[clamp(Math.floor(l + 0.5 + pnl + 0.35 * (hash(Math.floor(u * 14), Math.floor(v * 5)) - 0.5) + (bayerAt(px, py) - 0.5) * 0.3), 0, 4)];
  };
  panel("w", RW + 0.08, RDOOR[0], RDOOR[1], 0, 2.1, md);
  setId("door_left");
  panel("e", -0.08, LDOOR[0], LDOOR[1], 0, 2.1, md);
  windowSashes(1.1);

  bed();
  setId("pictures");
  picture(2.55, 3.3, 1.45, 1.98, landscape);
  setId("boch");
  picture(1.95, 2.35, 1.5, 1.98, portrait({ c: [40, 60, 130], stars: true }, [70, 80, 60], [214, 188, 110]));
  setId("milliet");
  picture(1.45, 1.85, 1.5, 1.98, portrait({ c: [70, 130, 80] }, [50, 60, 90], [210, 160, 120], [200, 50, 40]));
  // pegs with clothes near the right-hand corner
  setId("clothes");
  box(RW - 0.04, 0.3, 1.66, RW, 1.15, 1.7, mFlat([120, 90, 60]), mFlat([120, 90, 60]));
  box(RW - 0.13, 0.4, 0.95, RW - 0.02, 0.8, 1.68, mStroke([70, 104, 176], 0.1, 0.03, 0.9, true), mStroke([70, 104, 176], 0.1, 0.03, 0.9, true));
  sphere(RW - 0.12, 1.0, 1.55, 0.13, [226, 196, 96], "rough");
  // the toilet table by the window: jug and basin, bottles, a brush
  setId("table");
  const mt = mStroke(C.table, 0.1, 0.03, 0.8);
  box(0.04, 2.85, 0.72, 0.64, 3.58, 0.78, mt, mt);
  for (const [x, y] of [[0.07, 2.88], [0.57, 2.88], [0.07, 3.51], [0.57, 3.51]]) box(x, y, 0, x + 0.04, y + 0.04, 0.72, mt, mt);
  block(0.04, 2.85, 0.64, 3.58, 0.12);
  setId("basin");
  cyl(0.34, 3.22, 0.78, 0.88, 0.16, 0.22, mStroke(C.basin, 0.06, 0.02, 0.7), mFlat([150, 180, 220]));
  cyl(0.34, 3.22, 0.84, 1.1, 0.07, 0.06, mStroke(C.basin, 0.05, 0.02, 0.6, true), mFlat(C.basin));
  setId("bottles");
  for (const [x, y, c] of [[0.16, 2.98, [90, 150, 90]], [0.27, 2.95, [70, 120, 110]], [0.5, 3.0, [200, 160, 80]]]) cyl(x, y, 0.78, 0.98, 0.035, 0.03, mFlat(c), mFlat([60, 60, 60]));
  box(0.45, 3.45, 0.78, 0.6, 3.51, 0.81, mFlat([120, 80, 50]), mFlat([120, 80, 50]));
  CANDLE = { x: 0.52, y: 3.15, z: 0.95 };
  setId("candle");
  cyl(0.52, 3.15, 0.78, 0.92, 0.025, 0.025, mFlat([240, 232, 200]), mFlat([240, 232, 200]));
  // mirror and towel on the left wall (seen when the view is turned)
  setId("mirror");
  const glass = rampOf([170, 200, 214]), mf = rampOf([150, 110, 60]);
  panel("e", 0.006, 2.95, 3.5, 1.25, 1.8, (l, u, v, px, py) => (u < 0.04 || v < 0.04 || u > 0.51 || v > 0.51 ? mf[3] : glass[clamp(Math.floor(3 + ((px + py) % 9 === 0 ? 1 : 0) + (bayerAt(px, py) - 0.5) * 0.5), 0, 4)]));
  setId("towel");
  box(0, 2.5, 1.0, 0.04, 2.75, 1.62, mStroke([232, 228, 200], 0.08, 0.02, 0.5, true), mStroke([232, 228, 200], 0.08, 0.02, 0.5, true));
  box(0, 2.5, 1.08, 0.045, 2.75, 1.13, mFlat([200, 70, 60]), mFlat([200, 70, 60]));
  setId("chair");
  chair(0.98, 2.65, 0);
  chair(1.95, 0.85, PI / 2 + 0.3);
  setId(null);
}

// ---- the day -----------------------------------------------------------------------------------
const DAY = 300; // seconds for a whole day
const START = 0.3; // the scene opens mid-morning
const tod = (clock) => (clock / DAY + START) % 1; // 0 = midnight, 0.5 = noon
// for testing in the console: __place.crowd.clock = clockAt(0.8) jumps to 7 pm
export const clockAt = (t) => (((t - START) % 1) + 1) % 1 * DAY;
const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function ambient(clock) {
  const t = tod(clock), NIGHT = [0.38, 0.42, 0.66], DAY_ = [1, 1, 1], GOLD = [1.02, 0.86, 0.68];
  if (t < 0.22 || t > 0.86) return NIGHT;
  if (t < 0.28) return lerp3(NIGHT, GOLD, (t - 0.22) / 0.06);
  if (t < 0.34) return lerp3(GOLD, DAY_, (t - 0.28) / 0.06);
  if (t < 0.72) return DAY_;
  if (t < 0.79) return lerp3(DAY_, GOLD, (t - 0.72) / 0.07);
  return lerp3(GOLD, NIGHT, (t - 0.79) / 0.07);
}
function overlay(clock) {
  const t = tod(clock), list = [];
  // sunlight through the window: a warm patch that slides across the floor through the day
  const sun = t > 0.26 && t < 0.78 ? Math.sin(((t - 0.26) / 0.52) * PI) : 0;
  if (sun > 0.02) {
    const [wx, wy] = onWall((WIN[0] + WIN[1]) / 2), drift = ((t - 0.52) / 0.26) * 0.8;
    list.push({ x: wx + NX * 1.1 + drift, y: wy + NY * 1.1, z: 0.02, r: 1.3, c: [120, 100, 50], k: 0.55 * sun });
  }
  // the candle, lit in the evening while Vincent is up
  const v = VINCENT;
  if ((t > 0.74 || t < 0.08) && v && !(v.task && v.task.sleep)) {
    list.push({ x: CANDLE.x, y: CANDLE.y, z: 1.0, r: 2.6, c: [170, 110, 40], k: 0.8, flicker: true });
    sphere(CANDLE.x, CANDLE.y, 0.95 + 0.005 * Math.sin(clock * 13), 0.02, [255, 220, 120], "solid");
  }
  glows(list, clock);
}

// ---- Vincent and Gauguin -----------------------------------------------------------------------
let VINCENT = null, GAUGUIN = null;
const SPOT = {
  bedside: [2.05, 2.3],
  basin: { x: 0.95, y: 3.25, yaw: PI },
  window: { x: 1.55, y: depthAt(1.55) - 0.45, yaw: PI / 2 - 0.2 },
  rightDoor: { x: RW - 0.3, y: (RDOOR[0] + RDOOR[1]) / 2, yaw: 0 },
  leftDoor: { x: 0.3, y: (LDOOR[0] + LDOOR[1]) / 2, yaw: PI },
  desk: { x: 0.98, y: 2.65, yaw: PI },
  chair2: { x: 1.95, y: 0.85, yaw: PI / 2 + 0.3 + PI },
  middle: { x: 1.6, y: 1.7 },
};
const left = (clock, until) => {
  const t = tod(clock);
  return ((until - t + 1) % 1) * DAY;
};
function toBed(a, crowd, until, label) {
  return {
    x: SPOT.bedside[0], y: SPOT.bedside[1], yaw: 0, dur: 0.6, label: "getting into bed", walkLabel: "going to bed",
    then: () => ({ direct: true, x: RW - 0.7, y: 1.4, z: 0.62, yaw: PI / 2, pose: { lie: 1 }, sleep: true, dur: Math.max(8, left(crowd.clock, until)), label }),
  };
}
function vincentBrain(a, crowd) {
  const t = tod(crowd.clock);
  a.look.hat = null;
  a.look.pipe = null;
  if (a.task && a.task.sleep) {
    // getting up: step off the bed
    return { direct: true, x: SPOT.bedside[0], y: SPOT.bedside[1], z: null, yaw: PI, dur: 1.5, label: "waking up", walkLabel: "getting up" };
  }
  if (t >= 0.88 || t < 0.25) return toBed(a, crowd, 0.27, "asleep");
  if (t < 0.31 && !a.washed) {
    a.washed = true;
    return { ...SPOT.basin, pose: { right: "hold", left: "hold" }, dur: 12, label: "washing at the basin", walkLabel: "going to wash" };
  }
  if (t < 0.36 && !a.lookedOut) {
    a.lookedOut = true;
    a.look.pipe = [120, 80, 50];
    return { ...SPOT.window, pose: { right: "rest" }, dur: 14, label: "looking out at Place Lamartine with his pipe", walkLabel: "going to the window" };
  }
  if (t < 0.55 && !a.wentOut) {
    a.wentOut = true;
    a.look.hat = [226, 196, 96];
    a.awayLabel = "out painting in the fields";
    return { ...SPOT.rightDoor, hide: true, dur: Math.max(10, left(crowd.clock, 0.56)), label: "going out to paint", walkLabel: "heading out with his easel" };
  }
  if (t < 0.88) {
    const r = Math.random();
    if (r < 0.4) return { ...SPOT.desk, pose: { sit: 1, right: "hold", left: "rest" }, dur: 22, label: "writing to Theo", walkLabel: "sitting down to write" };
    if (r < 0.6) {
      a.look.pipe = [120, 80, 50];
      return { ...SPOT.chair2, pose: { sit: 1, right: "rest", left: "rest" }, dur: 18, label: "smoking his pipe, thinking", walkLabel: "sitting down" };
    }
    if (r < 0.75) return toBed(a, crowd, (t + 0.05) % 1, "napping");
    if (r < 0.9) {
      a.look.pipe = [120, 80, 50];
      return { ...SPOT.window, pose: { right: "rest" }, dur: 12, label: "looking out of the window", walkLabel: "going to the window" };
    }
    return { x: SPOT.middle.x, y: SPOT.middle.y, face: [RW - 0.1, 1.9], pose: { right: "rest", left: "rest" }, dur: 10, label: "studying the portraits above the bed", walkLabel: "crossing the room" };
  }
  return toBed(a, crowd, 0.27, "asleep");
}
function gauguinBrain(a) {
  a.awayLabel = "in his room next door";
  return { ...SPOT.leftDoor, hide: true, dur: 1e9, label: "in his room" };
}
function people(crowd) {
  VINCENT = crowd.add({
    key: "vincent", name: "Vincent van Gogh", short: "Vincent", role: "Painter, 35", k: 0.98,
    desc: "He moved into the Yellow House in 1888 and painted this room in October that year, to suggest rest and sleep.",
    look: { skin: [226, 180, 142], hair: [200, 112, 56], hairStyle: "thin", beard: [200, 112, 56], beardLen: 0.06, top: [70, 104, 178], bottom: [92, 84, 70], shoes: [80, 60, 44] },
    x: 1.6, y: 1.7, yaw: 0, speed: 0.75, brain: vincentBrain,
  });
  GAUGUIN = crowd.add({
    key: "gauguin", name: "Paul Gauguin", short: "Gauguin", role: "Painter, 40", k: 1.0,
    desc: "He arrived on 23 October 1888 to share the house and had to cross Vincent's room to reach his own.",
    look: { skin: [214, 170, 132], hair: [50, 40, 34], beard: [50, 40, 34], beardLen: 0.03, beret: [40, 50, 70], top: [70, 60, 56], bottom: [56, 52, 50], shoes: [40, 34, 30] },
    x: SPOT.leftDoor.x, y: SPOT.leftDoor.y, yaw: 0, speed: 0.85, brain: gauguinBrain,
  });
}
function update(dt, crowd, api) {
  const t = tod(crowd.clock), g = GAUGUIN, v = VINCENT;
  // a new day: reset Vincent's morning
  if (t > 0.2 && t < 0.24) v.washed = v.lookedOut = v.wentOut = false;
  if (!g.task) return;
  // Gauguin goes out through the room in the morning, and comes home through it in the evening
  if (t > 0.33 && t < 0.35 && !g.out && g.hidden) {
    g.out = true;
    g.awayLabel = "out painting";
    crowd.assign(g, { route: [[0.5, 0.8], [1.6, 1.6], [RW - 0.4, 3.3]], ...SPOT.rightDoor, hide: true, dur: 1e9, label: "out painting", walkLabel: "crossing the room on his way out" });
  }
  if (t > 0.74 && t < 0.76 && g.out && g.hidden) {
    g.out = false;
    g.x = SPOT.rightDoor.x;
    g.y = SPOT.rightDoor.y;
    const awake = !(v.task && v.task.sleep) && !v.hidden;
    crowd.assign(g, {
      x: 1.75, y: 1.9, faceAgent: awake ? v : null, yaw: PI, pose: { right: awake ? "point" : "rest" }, dur: awake ? 14 : 3,
      label: awake ? "arguing with Vincent about painting" : "tiptoeing past", walkLabel: "coming home through Vincent's room",
      then: () => ({ ...SPOT.leftDoor, hide: true, dur: 1e9, label: "in his room", walkLabel: "going to his room" }),
    });
    if (awake) api.say("<b>Gauguin is home</b><span>He crosses Vincent's room to reach his own.</span>");
  }
}

// ---- things ------------------------------------------------------------------------------------
const THINGS = {
  floor: { name: "Floor", sub: "red tiles", text: "Van Gogh's letter calls the floor red tiles. In the painting the red has faded toward brown and green." },
  wall: { name: "Walls", sub: "pale violet in the letter", text: "The walls have faded to blue in all three versions of the painting." },
  bed: { name: "The bed", text: "A big wooden bed painted butter yellow, which Van Gogh bought for the house." },
  sheets: { name: "Sheets", text: "A very pale lemon green." },
  pillows: { name: "Pillows", text: "Lemon green, like the sheets." },
  coverlet: { name: "Blanket", text: "Scarlet: the strongest colour in the room." },
  window: { name: "Window", text: "Green frames, looking out over Place Lamartine and its public garden." },
  door_right: { name: "Door to the stairs", text: "Lilac, according to the letter." },
  door_left: { name: "Door to the guest room", text: "Gauguin's room. To get to it he had to walk through here." },
  pictures: { name: "Landscape", text: "One of Van Gogh's own canvases hanging above the bed." },
  boch: { name: "Portrait of Eugène Boch", sub: "“The Poet”", text: "A Belgian painter friend, shown against a starry blue sky. It hangs above the bed in the 1888 version." },
  milliet: { name: "Portrait of Paul-Eugène Milliet", sub: "“The Lover”", text: "A Zouave second lieutenant who took drawing lessons from Van Gogh." },
  clothes: { name: "Clothes on pegs", text: "A blue work smock and a straw hat for painting outdoors." },
  table: { name: "Toilet table", text: "Orange in the letter." },
  basin: { name: "Jug and basin", text: "Blue. There was no running water upstairs." },
  bottles: { name: "Bottles", text: "" },
  candle: { name: "Candle", text: "For writing letters at night." },
  mirror: { name: "Mirror", text: "A small mirror above the toilet table." },
  towel: { name: "Towel", text: "Hanging on a nail by the mirror." },
  chair: { name: "Chair", text: "A plain rush-seated chair. Van Gogh painted one on its own that winter." },
};

function scene(key, title, subtitle) {
  return {
    title, subtitle, short: key === "described" ? "the room as described" : "the room today",
    view: { S: 90, bounds: [-0.4, -0.4, RW + 0.4, DR + 0.4], top: CEIL + 0.1, below: 0.35, shadow: [0.3, -0.12], light: { base: 1.75, k: 1.6 }, edge: 0.06, outline: PALETTES[key].outline, shadeGround: [0.8, 0.76, 0.88], shadeObj: [0.86, 0.84, 0.92] },
    rot: 2,
    focus: [RW / 2, DR / 2, 0.8],
    things: THINGS,
    floor: (x, y, px, py) => ((C = PALETTES[key]), floor(x, y, px, py)),
    build: (o) => ((C = PALETTES[key]), build(o)),
    people,
    update,
    overlay,
    ambient,
    roster: true,
    story: {
      paras: [
        "Van Gogh painted his bedroom in October 1888, after a few days ill in bed, wanting a picture that would rest the eye.",
        "In a letter to his brother Theo he listed the colours: pale violet walls, red tiles, butter-yellow wood, lemon-green sheets, a scarlet blanket.",
        "A day passes here in five minutes.",
      ],
    },
  };
}
mount({
  title: "Van Gogh's Bedroom",
  subtitle: "The Yellow House, 2 Place Lamartine, Arles, October 1888",
  start: "described",
  menu: [
    { scene: "described", label: "colours as described" },
    { scene: "today", label: "colours today" },
  ],
  scenes: {
    described: scene("described", "Van Gogh's Bedroom", "Arles, October 1888, in the colours from his letter to Theo"),
    today: scene("today", "Van Gogh's Bedroom", "The same room, in the faded colours the paintings show today"),
  },
});
