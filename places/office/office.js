// The Office: the Dunder Mifflin Scranton branch floor, as a pixel diorama.
// Coordinates are metres: x runs east 0..30, y runs north 0..20. The front doors are on the west wall.
import { mount } from "../../engine/app.js";
import { box, cyl, disc, sphere, quad, rampOf, mFlat, mSolid, mMottle, mBands, tone4, shadeTones, floorId, setId, hash, bayerAt, clamp, rgb, glows } from "../../engine/render.js";
import { wall, panel, glassPane, mGlass, sign, mStack } from "../../engine/build.js";
import { facesCamera } from "../../engine/render.js";

const PI = Math.PI;
const DIR = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] };
const YAW = { e: 0, n: PI / 2, w: PI, s: -PI / 2 };
const OPP = { n: "s", s: "n", e: "w", w: "e" };
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const rand = (a, b) => a + Math.random() * (b - a);

// ---- palette -----------------------------------------------------------------------------------
const WALL = [212, 202, 180], CUT = [92, 86, 84], BASE = [96, 88, 82], SLAB = [168, 162, 154];
const CARPET = shadeTones([124, 130, 138]), CARPET_B = shadeTones([116, 122, 132]);
const VINYL_A = shadeTones([218, 210, 190]), VINYL_B = shadeTones([196, 188, 168]), CONCRETE = shadeTones([178, 174, 166]);
const LAMINATE = [166, 128, 88], METAL = [138, 138, 140], CHAIR = [58, 58, 66], BEIGE = [206, 200, 182];
const FRAME = [190, 190, 196], SKY = [176, 204, 226], SLATS = [232, 228, 216];

const mWall = mStack(0.1, mFlat(BASE), mMottle(WALL, 0.6, 0.25));
const mCut = mFlat(CUT), mCap = mFlat([226, 220, 206]);
const mLam = mMottle(LAMINATE, 0.3, 0.3), mMetal = mFlat(METAL), mChair = mFlat(CHAIR), mBeige = mFlat(BEIGE);
const mWhite = mFlat([236, 236, 232]), mDark = mFlat([46, 46, 52]), mWood = mMottle([128, 92, 62], 0.25, 0.35);
const mDrawers = (c, n) => {
  const r = rampOf(c);
  return (l, u, v, px, py) => {
    const t = (v * n) % 1;
    const handle = Math.abs(t - 0.75) < 0.08 && Math.abs(u - 0.22) < 0.07;
    return r[clamp(Math.floor(l - (t < 0.06 ? 0.8 : 0) - (handle ? 1.2 : 0) + (bayerAt(px, py) - 0.5) * 0.3), 0, 4)];
  };
};
const mScreen = (() => {
  const r = rampOf([70, 110, 140]);
  return (l, u, v, px, py) => r[clamp(Math.floor(2.2 + (Math.floor(v / 0.04) % 3 === 0 ? 0.6 : 0) + (bayerAt(px, py) - 0.5) * 0.8), 0, 4)];
})();
function mWindow(w, h) {
  const fr = rampOf(FRAME), sk = rampOf(SKY), sl = rampOf(SLATS);
  return (l, u, v, px, py) => {
    if (u < 0.06 || u > w - 0.06 || v < 0.06 || v > h - 0.06 || Math.abs(u - w / 2) < 0.025) return fr[clamp(Math.floor(l + 0.3), 0, 4)];
    const closed = v > h * 0.62, t = (v / 0.09) % 1;
    if (closed || t < 0.55) return sl[clamp(Math.floor(l + (t < 0.12 ? -0.7 : 0) + (bayerAt(px, py) - 0.5) * 0.3), 0, 4)];
    return sk[clamp(Math.floor(3 + 0.6 * (v / h) + (bayerAt(px, py) - 0.5) * 0.5), 0, 4)];
  };
}
function mBooks(rowH = 0.36) {
  const shelf = rampOf([120, 86, 58]);
  const cols = [[150, 60, 50], [60, 80, 120], [200, 180, 120], [70, 110, 80], [180, 170, 160], [110, 70, 100], [220, 210, 190]].map(rampOf);
  return (l, u, v, px, py) => {
    const row = Math.floor(v / rowH), t = v - row * rowH;
    if (t < 0.04) return shelf[clamp(Math.floor(l + 0.4), 0, 4)];
    const b = Math.floor(u / 0.045), hh = hash(b, row * 7 + 3);
    if (hh < 0.12 || t > rowH * (0.6 + 0.35 * hash(b, row))) return shelf[clamp(Math.floor(l - 1.3), 0, 4)];
    return cols[Math.floor(hh * 7) % 7][clamp(Math.floor(l + ((u / 0.045) % 1 < 0.2 ? -0.6 : 0)), 0, 4)];
  };
}

// ---- furniture ---------------------------------------------------------------------------------
let NAV = null;
const block = (x0, y0, x1, y1) => NAV && NAV.block(x0, y0, x1, y1);

function rectAt(cx, cy, dir, depth, width) {
  return dir === "n" || dir === "s" ? [cx - width / 2, cy - depth / 2, cx + width / 2, cy + depth / 2] : [cx - depth / 2, cy - width / 2, cx + depth / 2, cy + width / 2];
}
function desk(r, top = mLam, h = 0.75) {
  const [x0, y0, x1, y1] = r, wide = x1 - x0 >= y1 - y0;
  box(x0, y0, h - 0.04, x1, y1, h, top, mFlat([140, 104, 70]));
  const ped = mDrawers([150, 148, 142], 3);
  if (wide) {
    box(x0 + 0.02, y0 + 0.04, 0, x0 + 0.44, y1 - 0.04, h - 0.04, mMetal, mMetal, { s: ped, n: ped });
    box(x1 - 0.06, y0 + 0.04, 0, x1 - 0.02, y1 - 0.04, h - 0.04, mMetal, mMetal);
  } else {
    box(x0 + 0.04, y0 + 0.02, 0, x1 - 0.04, y0 + 0.44, h - 0.04, mMetal, mMetal, { e: ped, w: ped });
    box(x0 + 0.04, y1 - 0.06, 0, x1 - 0.04, y1 - 0.02, h - 0.04, mMetal, mMetal);
  }
  block(x0, y0, x1, y1);
}
function chair(x, y, dir, c = CHAIR) {
  const [fx, fy] = DIR[dir], m = mFlat(c);
  box(x - 0.24, y - 0.24, 0.42, x + 0.24, y + 0.24, 0.5, m, m);
  const bx = x - fx * 0.25, by = y - fy * 0.25;
  const r = fx ? [bx - 0.03, by - 0.22, bx + 0.03, by + 0.22] : [bx - 0.22, by - 0.03, bx + 0.22, by + 0.03];
  box(r[0], r[1], 0.52, r[2], r[3], 1.02, m, m);
  cyl(x, y, 0.08, 0.42, 0.03, 0.03, mMetal, null);
  box(x - 0.28, y - 0.03, 0.03, x + 0.28, y + 0.03, 0.08, mChair, mChair);
  box(x - 0.03, y - 0.28, 0.03, x + 0.03, y + 0.28, 0.08, mChair, mChair);
}
/** A plain chair (kitchen, conference) — four legs and a back. */
function sideChair(x, y, dir, c = [110, 84, 60]) {
  const [fx, fy] = DIR[dir], m = mFlat(c);
  box(x - 0.21, y - 0.21, 0.42, x + 0.21, y + 0.21, 0.47, m, m);
  for (const [a, b] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) box(x + a - 0.02, y + b - 0.02, 0, x + a + 0.02, y + b + 0.02, 0.42, m, m);
  const bx = x - fx * 0.2, by = y - fy * 0.2;
  const r = fx ? [bx - 0.025, by - 0.2, bx + 0.025, by + 0.2] : [bx - 0.2, by - 0.025, bx + 0.2, by + 0.025];
  box(r[0], r[1], 0.47, r[2], r[3], 0.92, m, m);
}
function monitor(cx, cy, face) {
  box(cx - 0.12, cy - 0.12, 0.75, cx + 0.12, cy + 0.12, 0.79, mBeige, mBeige);
  box(cx - 0.2, cy - 0.2, 0.79, cx + 0.2, cy + 0.2, 1.13, mBeige, mBeige);
  const [fx, fy] = DIR[face];
  if (fx) panel(face, cx + fx * 0.205, cy - 0.16, cy + 0.16, 0.83, 1.09, mScreen);
  else panel(face, cy + fy * 0.205, cx - 0.16, cx + 0.16, 0.83, 1.09, mScreen);
  SCREENS.push({ x: cx + fx * 0.3, y: cy + fy * 0.3, z: 0.96, r: 0.45, c: [30, 60, 80], k: 0.35 });
}
function keyboard(cx, cy, dir) {
  const r = rectAt(cx, cy, dir, 0.16, 0.44);
  box(r[0], r[1], 0.75, r[2], r[3], 0.775, mFlat([220, 214, 196]), mBeige);
}
function papers(cx, cy, n = 3, seed = 1) {
  for (let i = 0; i < n; i++) {
    const ox = (hash(seed, i) - 0.5) * 0.25, oy = (hash(i, seed) - 0.5) * 0.25;
    box(cx + ox - 0.11, cy + oy - 0.15, 0.75, cx + ox + 0.11, cy + oy + 0.15, 0.76 + 0.012 * i, mWhite, mWhite);
  }
}
function mug(x, y, c = [236, 232, 222]) {
  cyl(x, y, 0.75, 0.86, 0.045, 0.045, mFlat(c), mDark);
}
function cabinet(x0, y0, x1, y1, h, face, n = 4) {
  const m = mDrawers([164, 162, 154], n / h);
  box(x0, y0, 0, x1, y1, h, mFlat([150, 148, 142]), mFlat([150, 148, 142]), { [face]: m });
  block(x0, y0, x1, y1);
}
function bookshelf(x0, y0, x1, y1, h, face) {
  box(x0, y0, 0, x1, y1, h, mWood, mWood, { [face]: mBooks() });
  block(x0, y0, x1, y1);
}
function plant(x, y, s = 1) {
  cyl(x, y, 0, 0.32 * s, 0.17 * s, 0.2 * s, mFlat([150, 92, 64]), mFlat([80, 62, 50]));
  const G = [[60, 112, 66], [74, 132, 70], [52, 98, 60]];
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, r = 0.12 * s * (i % 3);
    sphere(x + Math.cos(a) * r, y + Math.sin(a) * r, (0.55 + 0.12 * (i % 4)) * s, 0.2 * s, G[i % 3], "rough");
  }
  block(x - 0.2, y - 0.2, x + 0.2, y + 0.2);
}

function mWhiteboard() {
  const r = rampOf([240, 240, 236]), ink = rampOf([60, 80, 150]), red = rampOf([180, 60, 60]);
  return (l, u, v, px, py) => {
    if (u < 0.04 || v < 0.04 || u > 1.96 || v > 1.06) return rampOf([170, 170, 176])[3];
    const line = Math.abs(v - 0.85 + 0.02 * Math.sin(u * 30)) < 0.02 && u > 0.2 && u < 1.6;
    const l2 = Math.abs(v - 0.6 + 0.02 * Math.sin(u * 23)) < 0.02 && u > 0.3 && u < 1.2;
    const box2 = (Math.abs(u - 1.45) < 0.25 && Math.abs(v - 0.35) < 0.15 && (Math.abs(u - 1.45) > 0.22 || Math.abs(v - 0.35) > 0.12));
    if (line || l2) return ink[3];
    if (box2) return red[3];
    return r[clamp(Math.floor(l + 0.4), 0, 4)];
  };
}
function mSplit2() {
  const w = rampOf([240, 240, 236]), d = rampOf([40, 44, 50]);
  return (l, u, v) => (u > 0.08 && u < 0.42 && v > 0.06 && v < 0.26 ? d[2] : w[clamp(Math.floor(l + 0.3), 0, 4)]);
}
function mFridge() {
  const w = rampOf([236, 236, 232]), h = rampOf([150, 150, 156]);
  return (l, u, v, px, py) => {
    if (Math.abs(v - 1.15) < 0.02) return w[clamp(Math.floor(l - 1), 0, 4)];
    if (Math.abs(u - 0.72) < 0.025 && ((v > 0.75 && v < 1.05) || (v > 1.25 && v < 1.6))) return h[2];
    if (u > 0.15 && u < 0.32 && v > 1.3 && v < 1.48) return rampOf([230, 200, 90])[3];
    return w[clamp(Math.floor(l + 0.3 + (bayerAt(px, py) - 0.5) * 0.3), 0, 4)];
  };
}
function roundTable(x, y, r) {
  cyl(x, y, 0, 0.7, 0.05, 0.05, mMetal, null);
  cyl(x, y, 0.7, 0.75, r, r, mFlat([214, 208, 196]), mFlat([226, 220, 206]));
  disc(x, y, 0.02, 0.25, mMetal);
  block(x - r, y - r, x + r, y + r);
}
function couch(x0, y0, x1, y1, face, c) {
  const m = mMottle(c, 0.25, 0.3), [fx, fy] = DIR[face];
  box(x0, y0, 0, x1, y1, 0.42, m, m);
  // back cushion on the side opposite the facing direction
  const t = 0.22;
  const r = face === "w" ? [x1 - t, y0, x1, y1] : face === "e" ? [x0, y0, x0 + t, y1] : face === "s" ? [x0, y1 - t, x1, y1] : [x0, y0, x1, y0 + t];
  box(r[0], r[1], 0.42, r[2], r[3], 0.85, m, m);
  if (fx) {
    box(x0, y0, 0.42, x1, y0 + 0.16, 0.62, m, m);
    box(x0, y1 - 0.16, 0.42, x1, y1, 0.62, m, m);
  } else {
    box(x0, y0, 0.42, x0 + 0.16, y1, 0.62, m, m);
    box(x1 - 0.16, y0, 0.42, x1, y1, 0.62, m, m);
  }
  block(x0, y0, x1, y1);
}


// ---- layout (traced from a fan floorplan, kept locally, at ~50 px per metre) -------------------------------
// x runs left to right on the plan, y runs bottom to top. The main floor is 24.94 x 12.74 m; the
// elevator lobby juts out on the left, x -2.9..0, y 9.1..12.74.
const BX = 24.94, BY = 12.74;
const PIT = [13.7, 8.6, 17.1, 11.8]; // stairwell opening down to the warehouse
let SCREENS = [];

function region(x, y) {
  if (x < 0) return "lobby";
  if (x < 1.8 && y > 10.9) return "vestibule";
  if (y > 8.66 && x < 6.0) return "michael";
  if (y > 8.66 && x < 12.14) return "conference";
  if (x < 12.14) {
    if (x > 8.7 && y < 3.2) return "darryl";
    if (x < 2.9 && y < 4.3) return "accounting";
    if (x < 3.4 && y < 10.9) return "reception";
    return "bullpen";
  }
  if (x < 18.6) {
    if (y > 7.64) return "stairs";
    if (y > 4.8 || (x > 16.4 && y > 3.3)) return "kitchen";
    if (x < 14.3) return "mens";
    if (y > 3.3) return "ryan";
    return "womens";
  }
  if (x > 20.7 && y > 8.04) return "breakroom";
  return "annex";
}
const inBuilding = (x, y) => (x >= 0 && x <= BX && y >= 0 && y <= BY) || (x >= -2.9 && x < 0 && y >= 9.1 && y <= BY);
function floor(x, y, px, py) {
  if (!inBuilding(x, y)) {
    const pad = (x >= -0.2 && x <= BX + 0.2 && y >= -0.2 && y <= BY + 0.2) || (x >= -3.1 && x < 0 && y >= 8.9 && y <= BY + 0.2);
    return pad ? rgb(...CONCRETE[1]) : 0;
  }
  if (x > PIT[0] && x < PIT[2] && y > PIT[1] && y < PIT[3]) return 0;
  const r = region(x, y);
  floorId(r, px, py);
  if (r === "kitchen" || r === "breakroom") {
    const c = (Math.floor(x / 0.3) + Math.floor(y / 0.3)) & 1;
    return tone4(c ? VINYL_A : VINYL_B, 0.5 + 0.2 * (hash(Math.floor(x / 0.3), Math.floor(y / 0.3)) - 0.5), px, py);
  }
  if (r === "mens" || r === "womens") {
    const seam = x / 0.25 - Math.floor(x / 0.25) < 0.08 || y / 0.25 - Math.floor(y / 0.25) < 0.08;
    return tone4(TILE_T, seam ? 0.25 : 0.62 + 0.1 * (hash(px >> 1, py >> 1) - 0.5), px, py);
  }
  if (r === "lobby" || r === "vestibule" || r === "stairs") return tone4(CONCRETE, 0.5 + 0.3 * (hash(px >> 2, py >> 2) - 0.5), px, py);
  const tx = Math.floor(x / 0.6), ty = Math.floor(y / 0.6), alt = (tx + ty) & 1;
  const seam = x / 0.6 - tx < 0.035 || y / 0.6 - ty < 0.035;
  const t = 0.55 + 0.28 * (hash(px, py) - 0.5) - (seam ? 0.18 : 0);
  return tone4(alt ? CARPET : CARPET_B, t, px, py);
}
const TILE_T = shadeTones([214, 218, 214]);

// ---- workstations: chair [x, y, facing], desk rectangle, monitor offset ------------------------
const STATIONS = {
  jim: { chair: [5.5, 7.45, "s"], desk: [4.7, 6.36, 6.3, 7.04], mon: 0.3 },
  pam: { chair: [4.35, 5.6, "e"], desk: [4.7, 4.8, 5.5, 6.36], mon: 0.3 },
  dwight: { chair: [6.65, 5.6, "w"], desk: [5.5, 4.8, 6.3, 6.36], mon: -0.3 },
  andy: { chair: [8.35, 7.45, "s"], desk: [7.6, 6.36, 9.1, 7.04], mon: -0.3 },
  phyllis: { chair: [7.25, 5.6, "e"], desk: [7.6, 4.8, 8.35, 6.36], mon: 0.3 },
  stanley: { chair: [9.45, 5.6, "w"], desk: [8.35, 4.8, 9.1, 6.36], mon: -0.3 },
  meredith: { chair: [5.3, 1.6, "e"], desk: [5.6, 0.8, 6.4, 2.4], mon: 0.25 },
  creed: { chair: [7.4, 1.6, "w"], desk: [6.4, 0.8, 7.1, 2.4], mon: -0.25 },
  angela: { chair: [0.8, 3.85, "s"], desk: [0.12, 2.7, 1.62, 3.45], mon: -0.3 },
  kevin: { chair: [0.95, 1.6, "n"], desk: [0.12, 1.9, 1.62, 2.65], mon: 0.3 },
  oscar: { chair: [2.78, 2.7, "w"], desk: [1.66, 1.9, 2.42, 3.5], mon: -0.3 },
  darryl: { chair: [10.35, 1.3, "n"], desk: [9.6, 1.65, 11.1, 2.4], mon: 0.3, top: "wood" },
  ryan: { chair: [15.4, 4.32, "s"], desk: [14.85, 3.4, 15.95, 3.95], mon: 0 },
  gabe: { chair: [23.3, 6.9, "n"], desk: [22.5, 7.2, 24.1, 7.85], mon: 0.3 },
  toby: { chair: [23.75, 4.8, "e"], desk: [24.1, 3.95, 24.8, 5.65], mon: 0.3 },
  kelly: { chair: [23.85, 2.6, "s"], desk: [23.2, 1.45, 24.75, 2.15], mon: -0.3 },
};
const SEATS = {};
for (const k in STATIONS) {
  const [x, y, d] = STATIONS[k].chair;
  SEATS[k] = { x, y, yaw: YAW[d] };
}
SEATS.michael = { x: 4.0, y: 12.15, yaw: -PI / 2 };
SEATS.erin = { x: 1.75, y: 5.45, yaw: PI / 4 };

function station(key) {
  const st = STATIONS[key], [x, y, dir] = st.chair, [fx, fy] = DIR[dir], lx = -fy, ly = fx, r = st.desk;
  // distance from the chair to the far edge of the desk, along the facing direction
  const far = fx > 0 ? r[2] - x : fx < 0 ? x - r[0] : fy > 0 ? r[3] - y : y - r[1];
  const along = (d, side) => [x + fx * d + lx * side, y + fy * d + ly * side];
  setId("desk_" + key);
  desk(r, st.top === "wood" ? mWood : mLam);
  const [mx, my] = along(far - 0.24, st.mon);
  monitor(mx, my, OPP[dir]);
  const [kx, ky] = along(far - 0.58, st.mon);
  keyboard(kx, ky, dir);
  const [px_, py_] = along(far - 0.35, -st.mon * 1.9 || 0.45);
  papers(px_, py_, 1 + Math.floor(hash(x, y) * 3), x * 7);
  const [tx, ty] = along(far - 0.15, -st.mon * 2.3 || -0.5);
  box(tx - 0.07, ty - 0.07, 0.75, tx + 0.07, ty + 0.07, 0.8, mDark, mDark);
  if (hash(y, x) > 0.4) {
    const [ux, uy] = along(far - 0.6, -st.mon * 1.2 || 0.3);
    mug(ux, uy, [[236, 232, 222], [180, 60, 50], [70, 90, 140]][Math.floor(hash(x, 3) * 3)]);
  }
  DESK_EXTRAS[key]?.(along, far);
  setId("chair");
  chair(x, y, dir);
}
const DESK_EXTRAS = {
  dwight: (along, far) => {
    const [x, y] = along(far - 0.2, 0.5);
    sphere(x, y, 0.84, 0.06, [200, 160, 100], "solid");
  },
  kevin: (along, far) => {
    const [x, y] = along(far - 0.3, -0.62);
    cyl(x, y, 0.75, 0.95, 0.09, 0.09, mFlat([200, 120, 60]), mFlat([210, 70, 60]));
  },
  angela: (along, far) => {
    for (let i = 0; i < 3; i++) {
      const [x, y] = along(far - 0.12, 0.25 + 0.16 * i);
      box(x - 0.05, y - 0.05, 0.75, x + 0.05, y + 0.05, 0.9, mFlat([200, 170, 120]), mFlat([200, 170, 120]));
    }
  },
  phyllis: (along, far) => {
    const [x, y] = along(far - 0.55, -0.55);
    sphere(x, y, 0.82, 0.07, [180, 90, 120], "rough");
  },
  stanley: (along, far) => {
    const [x, y] = along(far - 0.7, 0);
    box(x - 0.12, y - 0.09, 0.755, x + 0.12, y + 0.09, 0.765, mFlat([226, 222, 210]), mWhite);
  },
  pam: (along, far) => {
    const [x, y] = along(far - 0.45, -0.5);
    box(x - 0.15, y - 0.11, 0.755, x + 0.15, y + 0.11, 0.765, mFlat([240, 236, 220]), mWhite);
  },
};

// ---- builders specific to this floor -----------------------------------------------------------
/** Glass partition along x (axis 'x', at y = c) or along y (axis 'y', at x = c). */
function glassWall(axis, c, a0, a1, doors, outward, blinds = true) {
  const full = !facesCamera(...DIR[outward]);
  const H = full ? 2.9 : 1.1, mMul = mFlat([170, 170, 176]);
  const bx = (a, b, z0, z1, t) => (axis === "x" ? box(a, c - t, z0, b, c + t, z1, mMul, mMul) : box(c - t, a, z0, c + t, b, z1, mMul, mMul));
  const segs = [];
  let p = a0;
  for (const [d0, d1] of doors) segs.push([p, d0]), (p = d1);
  segs.push([p, a1]);
  const paneFace = axis === "x" ? "n" : "e";
  const blindFace = OPP[outward];
  for (const [a, b] of segs) {
    if (b - a < 0.05) continue;
    bx(a, b, 0, 0.1, 0.06);
    if (NAV) axis === "x" ? NAV.block(a, c - 0.06, b, c + 0.06, 0.12) : NAV.block(c - 0.06, a, c + 0.06, b, 0.12);
    const n = Math.max(1, Math.round((b - a) / 1.3));
    for (let i = 0; i <= n; i++) {
      const s = a + ((b - a) * i) / n;
      bx(s - 0.03, s + 0.03, 0.1, H, 0.035);
    }
    glassPane(paneFace, c, a, b, 0.1, H, mGlass());
    if (full && blinds) panel(blindFace, c + DIR[blindFace][0] * 0.04 + DIR[blindFace][1] * 0.04, a + 0.03, b - 0.03, 1.95, 2.75, mBands([214, 210, 198], 0.07, 0.35, 0.8));
    else bx(a, b, H, H + 0.04, 0.05);
  }
  if (full) bx(a0, a1, 2.75, 2.9, 0.07);
}
function vending(x0, y0, x1, y1, c, face) {
  const body = rampOf(c), glass = rampOf([40, 46, 60]);
  const snacks = [[230, 180, 60], [200, 70, 60], [90, 150, 80], [80, 110, 180], [230, 230, 220]].map(rampOf);
  const w = face === "e" || face === "w" ? y1 - y0 : x1 - x0;
  const front = (l, u, v, px, py) => {
    if (u > 0.08 && u < w * 0.7 && v > 0.55 && v < 1.75) {
      const row = Math.floor((v - 0.55) / 0.2), t = (v - 0.55) / 0.2 - row, col = Math.floor((u - 0.08) / 0.1);
      if (t < 0.15) return glass[1];
      if (t < 0.75 && hash(col, row) > 0.2) return snacks[Math.floor(hash(row, col) * 5)][clamp(Math.floor(l + 0.2), 0, 4)];
      return glass[2];
    }
    if (u > w * 0.75 && u < w - 0.06 && v > 1.0 && v < 1.5) return glass[(Math.floor(v / 0.06) & 1) + 1];
    if (u > 0.1 && u < w * 0.7 && v > 0.2 && v < 0.4) return glass[0];
    return body[clamp(Math.floor(l + 0.2 + (bayerAt(px, py) - 0.5) * 0.3), 0, 4)];
  };
  box(x0, y0, 0, x1, y1, 1.85, mFlat(c), mFlat(c), { [face]: front });
  block(x0, y0, x1, y1);
}
/** Erin's curved reception desk: a quarter ring around (cx, cy), opening toward +x/+y. */
function ringDesk(cx, cy, r0, r1) {
  const top = mFlat([170, 132, 92]), front = mMottle([150, 116, 80], 0.2, 0.3), inner = mFlat([120, 110, 100]);
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * HPI, b = ((i + 1) / n) * HPI;
    const p = (r, t) => [cx + Math.cos(t) * r, cy + Math.sin(t) * r];
    const [ox0, oy0] = p(r1, a), [ox1, oy1] = p(r1, b), [ix0, iy0] = p(r0, a), [ix1, iy1] = p(r0, b), m = (a + b) / 2;
    quad(ox0, oy0, 0, ox1 - ox0, oy1 - oy0, 0, 0, 0, 1.08, Math.cos(m), Math.sin(m), 0, front);
    quad(ix1, iy1, 0, ix0 - ix1, iy0 - iy1, 0, 0, 0, 0.75, -Math.cos(m), -Math.sin(m), 0, inner);
    quad(ix0, iy0, 0.75, ox0 - ix0, oy0 - iy0, 0, ix1 - ix0, iy1 - iy0, 0, 0, 0, 1, top);
    const [lx0, ly0] = p(r1 - 0.12, a), [lx1, ly1] = p(r1 - 0.12, b);
    quad(lx0, ly0, 1.08, ox0 - lx0, oy0 - ly0, 0, lx1 - lx0, ly1 - ly0, 0, 0, 0, 1, top);
    quad(lx1, ly1, 0.75, lx0 - lx1, ly0 - ly1, 0, 0, 0, 0.33, -Math.cos(m), -Math.sin(m), 0, inner);
  }
  // ends
  box(cx + r0, cy - 0.04, 0, cx + r1, cy + 0.04, 1.08, top, front);
  box(cx - 0.04, cy + r0, 0, cx + 0.04, cy + r1, 1.08, top, front);
  if (NAV) for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * HPI, x = cx + Math.cos(t) * (r0 + r1) / 2, y = cy + Math.sin(t) * (r0 + r1) / 2;
    NAV.block(x - 0.25, y - 0.25, x + 0.25, y + 0.25, 0.2);
  }
}
const HPI = PI / 2;
function stairwell() {
  const [x0, y0, x1, y1] = PIT, D = -1.6, mConc = mFlat([150, 146, 140]), mStep = mBands([168, 164, 156], 0.26, 0.15, 0.9);
  setId("stairs");
  // pit walls and floor
  box(x0 - 0.1, y1, D, x1 + 0.1, y1 + 0.1, 0, null, mConc);
  box(x0 - 0.1, y0 - 0.1, D, x1 + 0.1, y0, 0, null, mConc);
  box(x0 - 0.1, y0, D, x0, y1, 0, null, mConc);
  box(x1, y0, D, x1 + 0.1, y1, 0, null, mConc);
  quad(x0, y0, D, x1 - x0, 0, 0, 0, y1 - y0, 0, 0, 0, 1, mFlat([120, 118, 114]));
  // one flight down along +y on the left half, a landing on the right
  const n = 10, xm = (x0 + x1) / 2;
  for (let i = 0; i < n; i++) {
    const ya = y0 + i * 0.26, z = -(i + 1) * 0.16;
    box(x0, ya, D, xm - 0.05, ya + 0.26, z, mFlat([176, 172, 164]), mConc);
  }
  box(xm - 0.05, y0, D, xm + 0.05, y1, 0.95, mFlat([90, 90, 96]), mFlat([110, 110, 116]));
  panel("n", y0 + 0.005, xm + 0.6, xm + 1.4, D, D + 1.4, mFlat([80, 84, 92]));
  // railing
  const mR = mFlat([90, 90, 96]);
  const rail = (ax, ay, bx, by) => {
    box(Math.min(ax, bx) - 0.025, Math.min(ay, by) - 0.025, 0.95, Math.max(ax, bx) + 0.025, Math.max(ay, by) + 0.025, 1.0, mR, mR);
    const len = Math.hypot(bx - ax, by - ay), k = Math.max(1, Math.round(len / 0.9));
    for (let i = 0; i <= k; i++) {
      const x = ax + ((bx - ax) * i) / k, y = ay + ((by - ay) * i) / k;
      box(x - 0.02, y - 0.02, 0, x + 0.02, y + 0.02, 0.95, mR, mR);
    }
  };
  rail(x0, y1, x1, y1);
  rail(x0, y0, x0, y1);
  rail(x1, y0, x1, y1);
  rail(xm, y0, x1, y0);
  block(x0 - 0.05, y0, x1 + 0.05, y1 + 0.05);
}
function toilet(x, y, face) {
  const [fx, fy] = DIR[face];
  cyl(x + fx * 0.12, y + fy * 0.12, 0, 0.4, 0.17, 0.2, mWhite, mFlat([240, 240, 236]));
  const tx = x - fx * 0.18, ty = y - fy * 0.18;
  box(tx - (fx ? 0.1 : 0.22), ty - (fy ? 0.1 : 0.22), 0, tx + (fx ? 0.1 : 0.22), ty + (fy ? 0.1 : 0.22), 0.75, mWhite, mWhite);
  block(x - 0.3, y - 0.3, x + 0.3, y + 0.3);
}
function sinkCounter(x0, y0, x1, y1, sinks) {
  box(x0, y0, 0, x1, y1, 0.85, mFlat([200, 196, 188]), mFlat([176, 170, 160]));
  for (const [x, y] of sinks) box(x - 0.18, y - 0.14, 0.8, x + 0.18, y + 0.14, 0.86, mFlat([226, 230, 232]), mWhite);
  block(x0, y0, x1, y1);
}
function stall(x0, y0, x1, y1) {
  const m = mFlat([150, 140, 126]);
  box(x0, y0, 0.15, x1, y1, 1.9, m, m);
  block(x0, y0, x1, y1);
}

function build({ nav }) {
  NAV = nav;
  SCREENS = [];
  nav.open(0, 0, BX, BY);
  nav.open(-2.9, 9.1, 0, BY);
  setId(null);
  box(-0.2, -0.2, -0.5, BX + 0.2, BY + 0.2, 0, null, mFlat(SLAB));
  box(-3.1, 8.9, -0.5, -0.2, BY + 0.2, 0, null, mFlat(SLAB));

  // ---- outer walls ----
  setId("wall");
  const O = { h: 2.9, mat: mWall, top: mCut, cap: mCap, cut: 1.0, nav };
  if (wall(-0.2, -0.2, BX + 0.2, 0, { ...O, outward: "s", doors: [[3.8, 4.9, 2.2], [19.1, 19.9, 2.2]] }))
    windowsAlong("n", 0.006, [6.4, 7.6, 10.2, 11.4, 20.9, 22.3, 23.7], 1.1);
  if (wall(-3.1, BY, BX + 0.2, BY + 0.2, { ...O, outward: "n" })) {
    windowsAlong("s", BY - 0.006, [0.9, 3.2, 4.6, 7.5, 9.0, 10.5, 15.6, 19.9, 21.9, 23.6], 1.1);
  }
  wall(-0.2, 0, 0, 9.1, { ...O, outward: "w" });
  wall(-0.15, 9.1, 0, BY, { ...O, low: true, cut: 1.1, outward: undefined, doors: [[11.4, 12.3]] });
  if (wall(BX, 0, BX + 0.2, BY, { ...O, outward: "e" })) windowsAlong("w", BX - 0.006, [5.0], 1.1);
  wall(-3.1, 9.1, -2.9, BY, { ...O, outward: "w" });
  wall(-3.1, 8.9, 0, 9.1, { ...O, outward: "s" });
  // exterior doors (glass, in the south wall)
  setId("doors");
  for (const [a, b] of [[3.8, 4.9], [19.1, 19.9]]) glassPane("n", -0.1, a, b, 0, 2.1, mGlass([190, 214, 226]));

  // ---- elevator lobby ----
  setId("elevator");
  const mSteel = mFlat([170, 172, 178]);
  box(-2.55, 9.1, 0, -0.3, 10.85, 2.9, mCut, mFlat([196, 190, 176]));
  panel("n", 10.85, -1.95, -0.85, 0, 2.15, (l, u, v, px, py) => (Math.abs(u - 0.55) < 0.02 ? rampOf([90, 92, 100])[2] : rampOf([176, 178, 186])[clamp(Math.floor(l + 0.3 + (bayerAt(px, py) - 0.5) * 0.3), 0, 4)]));
  box(-0.7, 10.85, 1.1, -0.6, 10.9, 1.3, mSteel, mSteel);
  block(-2.55, 9.1, -0.3, 10.85);
  setId("plant");
  plant(-2.6, 12.45, 1.0);

  // ---- interior walls (cut low so rooms stay visible) ----
  setId("wall");
  const P = { h: 2.9, mat: mWall, top: mCut, low: true, cut: 1.1, nav };
  wall(0, 10.83, 1.8, 10.97, { ...P, doors: [[0.5, 1.35]] }); // vestibule
  wall(1.73, 8.66, 1.87, BY, P); // Michael | vestibule
  wall(5.93, 8.66, 6.07, BY, P); // Michael | conference
  wall(12.07, 0, 12.21, BY, { ...P, doors: [[5.35, 6.15], [7.75, 8.55]] });
  wall(12.14, 7.57, 18.6, 7.71, P); // stair hall | kitchen
  wall(18.53, 0, 18.67, BY, { ...P, doors: [[6.0, 6.75], [11.7, 12.5]] });
  wall(12.14, 4.73, 14.3, 4.87, { ...P, doors: [[12.6, 13.35]] }); // men's room
  wall(14.23, 0, 14.37, 4.8, P);
  wall(14.3, 4.73, 16.4, 4.87, { ...P, doors: [[15.5, 16.33]] }); // Ryan's office
  wall(16.33, 3.3, 16.47, 4.8, P);
  wall(14.3, 3.23, 18.6, 3.37, { ...P, doors: [[17.0, 17.8]] }); // women's room
  wall(0, 4.23, 2.9, 4.37, { ...P, cut: 1.25 }); // accounting divider
  wall(20.63, 8.04, 20.77, BY, P); // break room
  wall(20.7, 7.97, BX, 8.11, { ...P, doors: [[21.0, 21.75]] });
  wall(22.33, 1.36, 22.47, 3.8, { ...P, cut: 1.45 }); // Kelly's cubicle
  wall(22.4, 3.73, BX, 3.87, { ...P, cut: 1.45 });
  setId("michael_glass");
  glassWall("x", 8.66, 1.87, 5.93, [[5.05, 5.93]], "s");
  setId("conf_glass");
  glassWall("x", 8.66, 6.07, 12.07, [[6.07, 6.9]], "s", false);
  setId("darryl_glass");
  glassWall("x", 3.2, 8.7, 12.07, [[9.9, 10.7]], "n", false);
  glassWall("y", 8.7, 0, 3.2, [], "w", false);

  // ---- Michael's office ----
  setId("desk_michael");
  desk([3.0, 10.8, 5.0, 11.7], mWood, 0.76);
  monitor(4.6, 11.45, "n");
  keyboard(4.5, 11.75, "s");
  papers(3.6, 11.2, 4, 3);
  setId("mug");
  mug(3.9, 11.45, [240, 240, 236]);
  setId("chair");
  chair(4.0, 12.15, "s", [40, 36, 40]);
  sideChair(3.5, 10.35, "n", [90, 64, 52]);
  sideChair(4.5, 10.35, "n", [90, 64, 52]);
  setId("dundies");
  bookshelf(1.9, 10.6, 2.3, 12.5, 1.8, "e");
  for (let i = 0; i < 5; i++) {
    const y = 10.8 + i * 0.38;
    cyl(2.1, y, 1.8, 1.86, 0.04, 0.04, mFlat([60, 50, 40]), null);
    sphere(2.1, y, 1.95, 0.06, [236, 186, 78], "gloss");
  }
  setId("plant");
  plant(2.2, 9.1, 1.0);

  // ---- conference room ----
  setId("conf_table");
  const mT = mWood;
  box(8.0, 10.6, 0.71, 10.0, 12.0, 0.76, mT, mFlat([110, 78, 52]));
  cyl(8.0, 11.3, 0.71, 0.76, 0.7, 0.7, mFlat([110, 78, 52]), mT, HPI, 3 * HPI);
  cyl(10.0, 11.3, 0.71, 0.76, 0.7, 0.7, mFlat([110, 78, 52]), mT, -HPI, HPI);
  disc(8.0, 11.3, 0.76, 0.7, mT);
  disc(10.0, 11.3, 0.76, 0.7, mT);
  box(8.2, 11.0, 0, 9.8, 11.6, 0.71, mFlat([90, 66, 46]), mFlat([90, 66, 46]));
  block(7.3, 10.6, 10.7, 12.0);
  setId("chair");
  for (const x of [8.1, 8.8, 9.5, 10.2]) chair(x, 12.25, "s"), chair(x, 10.25, "n");
  chair(11.05, 11.3, "w");
  for (let i = 0; i < 7; i++) chair(7.6 + i * 0.58, 9.05, "n", [70, 70, 80]);
  setId("tv");
  box(6.15, 11.6, 0, 6.6, 12.6, 0.8, mWood, mWood);
  box(6.3, 11.65, 0.8, 6.38, 12.55, 1.5, mDark, mDark, { e: mScreen });
  block(6.1, 11.6, 6.6, 12.6);
  setId("plant");
  plant(11.75, 9.15, 1.0);

  // ---- bullpen ----
  for (const k of ["jim", "pam", "dwight", "andy", "phyllis", "stanley", "meredith", "creed", "angela", "kevin", "oscar"]) station(k);
  setId("reception");
  ringDesk(1.1, 4.8, 1.35, 1.85);
  setId("monitor");
  monitor(1.6, 6.05, "s");
  setId("chair");
  chair(1.75, 5.45, "e");
  setId("jellybeans");
  sphere(2.36, 6.06, 1.17, 0.08, [230, 236, 240], "gloss");
  sphere(2.36, 6.06, 1.14, 0.05, [210, 80, 120], "rough");
  setId("sign");
  if (!facesCamera(-1, 0)) sign("e", 0.008, 5.9, 1.42, ["DUNDER", "MIFFLIN"], [44, 52, 86], { rowPx: 2 });
  setId("couch");
  couch(0.1, 7.5, 0.85, 9.6, "e", [96, 104, 120]);
  setId("cabinets");
  cabinet(0.1, 0.1, 3.7, 0.55, 1.0, "n", 3);
  cabinet(1.9, 7.95, 3.2, 8.55, 1.0, "s", 3);
  setId("credenza");
  box(7.6, 8.12, 0, 10.7, 8.55, 0.85, mFlat([170, 160, 146]), mDrawers([170, 160, 146], 2), { s: mDrawers([170, 160, 146], 2) });
  block(7.6, 8.12, 10.7, 8.55);
  setId("printer");
  box(9.8, 8.18, 0.85, 10.45, 8.52, 1.1, mFlat([60, 60, 66]), mFlat([70, 70, 76]));
  setId("copier");
  box(3.5, 3.7, 0, 4.3, 4.6, 1.0, mFlat([196, 196, 192]), mFlat([210, 210, 206]), { e: mDrawers([214, 212, 206], 3) });
  box(3.55, 3.8, 1.0, 4.25, 4.5, 1.12, mFlat([180, 180, 178]), mFlat([180, 180, 178]));
  block(3.5, 3.7, 4.3, 4.6);
  setId("cooler");
  box(3.1, 4.75, 0, 3.4, 5.05, 0.95, mWhite, mWhite);
  cyl(3.25, 4.9, 0.95, 1.4, 0.15, 0.15, mFlat([150, 196, 226]), mFlat([120, 170, 210]));
  block(3.05, 4.7, 3.45, 5.1);
  setId("cabinets");
  box(11.6, 3.6, 0, 12.05, 4.8, 1.3, mFlat([150, 148, 142]), mFlat([150, 148, 142]), { w: mDrawers([164, 162, 154], 3) });
  block(11.6, 3.6, 12.05, 4.8);
  setId("trash");
  box(8.6, 4.2, 0, 9.1, 4.7, 0.55, mDark, mFlat([60, 60, 66]));
  block(8.6, 4.2, 9.1, 4.7);
  box(5.6, 2.4, 0.75, 7.1, 2.6, 1.05, mFlat([150, 148, 142]), mFlat([150, 148, 142]));
  setId("plant");
  for (const [x, y] of [[0.3, 10.3], [5.4, 2.8], [9.0, 0.4], [0.3, 0.9], [11.8, 6.9], [7.25, 8.3]]) plant(x, y, 1.0);

  // ---- Darryl's office ----
  station("darryl");
  setId("darryl_cab");
  cabinet(11.4, 0.1, 12.0, 1.2, 1.32, "w");

  // ---- stair hall ----
  stairwell();
  setId("couch_annex");
  couch(18.75, 9.0, 19.45, 10.4, "e", [120, 96, 84]);
  setId("interview");
  sideChair(20.2, 12.25, "s", [60, 60, 66]);
  setId("plant");
  plant(18.9, 7.4, 1.0);

  // ---- kitchen ----
  setId("counter");
  const mCab = mBands([176, 142, 102], 0.6, 0.04, 0.8, true);
  box(12.25, 7.0, 0, 15.75, 7.57, 0.88, null, mCab);
  box(12.2, 6.95, 0.88, 15.8, 7.57, 0.92, mFlat([200, 194, 180]), mFlat([200, 194, 180]));
  block(12.2, 6.95, 15.8, 7.57);
  box(13.9, 7.05, 0.86, 14.6, 7.45, 0.925, mFlat([150, 156, 164]), mFlat([150, 156, 164]));
  box(14.2, 7.42, 0.92, 14.3, 7.52, 1.15, mMetal, mMetal);
  setId("microwave");
  box(15.0, 7.05, 0.92, 15.6, 7.5, 1.24, mWhite, mWhite, { s: mSplit2() });
  setId("coffee");
  box(12.4, 7.1, 0.92, 12.7, 7.45, 1.3, mDark, mDark);
  cyl(12.55, 7.12, 0.95, 1.08, 0.07, 0.07, mFlat([90, 60, 40]), mDark);
  setId("fridge");
  box(15.85, 6.8, 0, 16.7, 7.57, 1.82, mWhite, mWhite, { s: mFridge() });
  block(15.85, 6.8, 16.7, 7.57);
  setId("kitchen_table");
  roundTable(17.3, 6.0, 0.5);
  setId("chair");
  sideChair(17.3, 6.75, "s");
  sideChair(17.3, 5.25, "n");
  sideChair(16.55, 6.0, "e");
  setId("trash");
  cyl(14.0, 5.1, 0, 0.6, 0.2, 0.2, mFlat([70, 70, 74]), mDark);
  block(13.8, 4.9, 14.2, 5.3);
  setId("plant");
  plant(15.0, 5.15, 0.9);

  // ---- restrooms and Ryan's office ----
  setId("mens");
  sinkCounter(12.22, 0.3, 12.75, 2.1, [[12.48, 0.8], [12.48, 1.6]]);
  stall(13.2, 0.0, 13.25, 1.4);
  toilet(13.75, 0.4, "n");
  toilet(12.7 + 0.05, 3.1, "e");
  setId("womens");
  sinkCounter(18.0, 0.3, 18.53, 2.1, [[18.27, 0.8], [18.27, 1.6]]);
  stall(15.6, 0.0, 15.65, 1.4);
  stall(16.9, 0.0, 16.95, 1.4);
  toilet(14.95, 0.4, "n");
  toilet(16.25, 0.4, "n");
  station("ryan");

  // ---- annex ----
  for (const k of ["gabe", "toby", "kelly"]) station(k);
  setId("annex_table");
  desk([20.2, 4.9, 21.5, 6.3], mLam);
  setId("chair");
  chair(19.8, 5.6, "e");
  chair(21.9, 5.6, "w");
  setId("printer");
  box(19.0, 7.25, 0, 19.55, 7.8, 0.95, mFlat([60, 60, 66]), mFlat([70, 70, 76]));
  block(19.0, 7.25, 19.55, 7.8);
  setId("cabinets");
  cabinet(18.75, 1.2, 19.45, 3.2, 1.32, "e");
  cabinet(20.2, 0.08, 24.85, 0.55, 1.0, "n", 3);
  bookshelf(24.42, 5.85, 24.92, 7.9, 1.8, "w");
  setId("plant");
  plant(19.0, 4.0, 1.0);

  // ---- break room ----
  setId("vending");
  vending(24.25, 11.55, 24.92, 12.4, [200, 60, 50], "w");
  vending(24.25, 10.6, 24.92, 11.45, [50, 70, 130], "w");
  vending(24.25, 9.65, 24.92, 10.5, [60, 120, 80], "w");
  setId("break_table");
  roundTable(21.9, 11.6, 0.5);
  roundTable(23.1, 9.9, 0.5);
  setId("chair");
  for (const [x, y, d] of BREAK_CHAIRS) sideChair(x, y, d);
  setId("break_counter");
  box(22.9, 8.12, 0, 24.2, 8.62, 0.9, mFlat([200, 194, 180]), mCab);
  box(23.1, 8.2, 0.9, 23.6, 8.55, 1.18, mWhite, mWhite, { n: mSplit2() });
  block(22.9, 8.12, 24.2, 8.62);
  setId(null);
}
const BREAK_CHAIRS = [
  [21.9, 12.33, "s"], [21.9, 10.87, "n"], [21.17, 11.6, "e"], [22.63, 11.6, "w"],
  [23.1, 10.63, "s"], [23.1, 9.17, "n"], [22.37, 9.9, "e"], [23.83, 9.9, "w"],
];
function windowsAlong(face, c, centers, w = 1.6) {
  for (const a of centers) panel(face, c, a - w / 2, a + w / 2, 0.9, 2.3, mWindow(w, 1.4));
}

// ---- things you can point at -------------------------------------------------------------------
const THINGS = {
  bullpen: { name: "The bullpen", sub: "Sales floor", text: "Desks pushed together in clusters so salespeople face each other all day. It's good for teamwork and for pranks." },
  reception: { name: "Reception", text: "The curved front desk. The phones ring here first, and visitors stop here before anything else." },
  michael: { name: "Michael's office", sub: "Regional Manager", text: "Glass on the bullpen side, so the boss can see the floor and the floor can see the boss." },
  conference: { name: "Conference room", text: "An oval table and a row of extra chairs along the glass. Meetings here run long and rarely end with a decision." },
  vestibule: { name: "Entry", text: "The door in from the elevator lobby." },
  lobby: { name: "Elevator lobby", text: "Shared with the other tenants on the floor." },
  elevator: { name: "Elevator", text: "Slow, and the only way up for most visitors." },
  stairs: { name: "Stairwell", text: "Stairs down to the warehouse, where Darryl's crew loads the trucks." },
  kitchen: { name: "Kitchen", text: "Coffee, a microwave with a queue at noon, and a fridge with notes taped to it about whose yogurt is whose." },
  breakroom: { name: "Break room", text: "Vending machines and two round tables. People come here to eat, gossip, or hide for five minutes." },
  annex: { name: "The annex", text: "The back room. Human resources, customer service, and anyone corporate sends over." },
  accounting: { name: "Accounting", text: "Three desks tucked behind a low divider: Angela, Oscar and Kevin." },
  darryl: { name: "Darryl's office", text: "A glass office on the main floor, a step up from the warehouse." },
  ryan: { name: "Ryan's office", text: "Officially an office. Previously a closet." },
  mens: { name: "Men's room", text: "" },
  womens: { name: "Women's room", text: "" },
  wall: { name: "Wall", text: "Beige drywall. The windows look out over the business park on Slough Avenue." },
  sign: { name: "Company sign", sub: "Dunder Mifflin Paper Company", text: "A mid-sized paper supplier. This is the Scranton branch, at the Scranton Business Park." },
  doors: { name: "Side door", text: "Out to the parking lot." },
  michael_glass: { name: "Michael's office window", text: "Glass between Michael's office and the bullpen." },
  conf_glass: { name: "Conference room glass", text: "Everyone can see who's been called into a meeting." },
  darryl_glass: { name: "Darryl's office glass", text: "" },
  chair: { name: "Chair", text: "Rolling office chair, standard issue." },
  monitor: { name: "Computer", text: "Beige, heavy, and slow to start up." },
  desk_michael: { name: "Michael's desk", text: "Big wooden desk facing the door, for greeting visitors and for dramatic announcements." },
  desk_jim: { name: "Jim's desk", text: "Across from Dwight's, which keeps life interesting." },
  desk_pam: { name: "Pam's desk", text: "Moved from reception to the bullpen. Sketches are tucked under the keyboard." },
  desk_dwight: { name: "Dwight's desk", text: "Neat and well organised, with a bobblehead of its owner." },
  desk_andy: { name: "Andy's desk", text: "Faces the rest of the cluster. Sometimes there's a banjo under it." },
  desk_stanley: { name: "Stanley's desk", text: "A crossword puzzle is always in progress." },
  desk_phyllis: { name: "Phyllis's desk", text: "Has a ball of yarn and a family photo." },
  desk_meredith: { name: "Meredith's desk", text: "Supplier relations, handled from here." },
  desk_creed: { name: "Creed's desk", text: "Quality assurance. What's in the drawers is unclear." },
  desk_oscar: { name: "Oscar's desk", text: "Accounting. The spreadsheets are correct." },
  desk_angela: { name: "Angela's desk", text: "Accounting. Spotless, with framed cat photos." },
  desk_kevin: { name: "Kevin's desk", text: "Accounting. There is a big jar of candy." },
  desk_kelly: { name: "Kelly's desk", text: "Customer service, in a cubicle in the annex." },
  desk_toby: { name: "Toby's desk", text: "Human resources, in the annex." },
  desk_gabe: { name: "Gabe's desk", text: "Corporate's man in Scranton." },
  desk_darryl: { name: "Darryl's desk", text: "Neater than anyone expected." },
  desk_ryan: { name: "Ryan's desk", text: "Wedged into the old closet." },
  dundies: { name: "Dundie awards", text: "Michael's own annual office awards. A shelf of small gold trophies." },
  plant: { name: "Office plant", text: "Watered by whoever remembers." },
  couch: { name: "Reception couch", text: "For visitors waiting to be seen." },
  couch_annex: { name: "Couch", text: "In the hall outside the break room." },
  conf_table: { name: "Conference table", text: "Seats ten, with more chairs along the glass." },
  tv: { name: "TV", text: "For presentations, and the occasional movie Monday." },
  cabinets: { name: "Filing cabinets", text: "Invoices, contracts and a few years of order forms." },
  credenza: { name: "Credenza", text: "Supplies and the shared printer." },
  copier: { name: "Copier", text: "Jams at the worst possible moment." },
  printer: { name: "Printer", text: "The laser printer. Its paper tray is never quite full." },
  cooler: { name: "Water cooler", text: "Where office news gets around." },
  jellybeans: { name: "Candy dish", text: "On the reception counter. Everyone helps themselves." },
  vending: { name: "Vending machines", text: "Chips, candy and soda. One of them eats coins." },
  break_table: { name: "Break room table", text: "Lunch spot." },
  break_counter: { name: "Break room counter", text: "A second microwave, for the lunch rush." },
  interview: { name: "Interview chair", text: "Where the documentary crew films people one at a time." },
  counter: { name: "Kitchen counter", text: "Sink, coffee maker and a microwave." },
  microwave: { name: "Microwave", text: "Someone always reheats fish in it." },
  coffee: { name: "Coffee maker", text: "Whoever takes the last cup is supposed to make another pot." },
  fridge: { name: "Fridge", text: "Shared and crowded, with labelled lunches." },
  kitchen_table: { name: "Kitchen table", text: "Small round table for quick lunches." },
  annex_table: { name: "Annex table", text: "A shared work table in the annex." },
  darryl_cab: { name: "Filing cabinet", text: "Warehouse paperwork." },
  trash: { name: "Trash can", text: "" },
  mug: { name: "Coffee mug", text: "“World's Best Boss.” Michael bought it for himself." },
};

// ---- people ------------------------------------------------------------------------------------
const SKIN = { a: [236, 196, 166], b: [226, 182, 150], c: [200, 150, 112], d: [150, 104, 76], e: [110, 74, 54], f: [214, 168, 132] };
const PEOPLE = [
  { key: "michael", g: "m", name: "Michael Scott", role: "Regional Manager", desc: "Runs the branch and wants everyone to love working for him. Calls a lot of meetings.", k: 1.0,
    look: { skin: SKIN.b, hair: [62, 44, 32], top: [52, 56, 70], shirt: [236, 236, 236], tie: [150, 40, 52], bottom: [52, 56, 70], shoes: [30, 26, 24] },
    desk: ["at his desk, avoiding paperwork", "on the phone with corporate", "at his desk, planning a party"], deskDur: [14, 26],
    habits: { visit: 5, reception: 2, kitchen: 1, cooler: 1, wander: 2, restroom: 0.5, elevator: 0.4 } },
  { key: "dwight", g: "m", name: "Dwight Schrute", role: "Salesman", desc: "Top salesman. He takes rules, rank and beets very seriously.", k: 1.05,
    look: { skin: SKIN.a, hair: [106, 74, 46], top: [196, 162, 92], shortSleeve: true, tie: [96, 64, 40], bottom: [92, 74, 56], shoes: [40, 30, 24], glasses: [60, 60, 60] },
    desk: ["at his desk, closing a sale", "on the phone with a client", "updating his files"], deskDur: [18, 34],
    habits: { boss: 3, copier: 1, visit: 1, elevator: 1, warehouse: 0.6, restroom: 0.4 } },
  { key: "jim", g: "m", name: "Jim Halpert", role: "Salesman", desc: "Good at the job, but more interested in pranking Dwight and talking with Pam.", k: 1.08, girth: 0.92,
    look: { skin: SKIN.a, hair: [96, 64, 40], hairStyle: "big", top: [146, 168, 196], tie: [60, 72, 96], bottom: [70, 70, 78], shoes: [44, 34, 28] },
    desk: ["at his desk, looking at the camera", "on a sales call", "at his desk, planning a prank"], deskDur: [16, 30],
    habits: { visitPam: 3, kitchen: 1, cooler: 1.5, visit: 1, elevator: 0.4, restroom: 0.5 } },
  { key: "pam", g: "f", name: "Pam Halpert", role: "Office Administrator", desc: "Used to run reception. Now has a desk in the bullpen, across from Jim, and still draws when it's quiet.", k: 0.95, girth: 0.92,
    look: { skin: SKIN.a, hair: [150, 86, 54], hairStyle: "ponytail", top: [226, 204, 196], shirt: [236, 236, 232], bottom: [104, 100, 112], skirt: [104, 100, 112], legs: SKIN.a, shoes: [60, 44, 40] },
    desk: ["at her desk, sketching", "ordering supplies", "at her desk, sorting the mail"], deskDur: [22, 40],
    habits: { copier: 1.5, kitchen: 1, reception: 1, visit: 1, restroom: 0.5 } },
  { key: "erin", g: "f", name: "Erin Hannon", role: "Receptionist", desc: "Cheerful and eager. She answers the phones at the front desk.", k: 0.93, girth: 0.88,
    look: { skin: SKIN.a, hair: [196, 104, 60], hairStyle: "shoulder", top: [130, 170, 200], shirt: [240, 236, 226], bottom: [70, 70, 90], skirt: [70, 70, 90], legs: SKIN.a, shoes: [60, 44, 40] },
    desk: ["answering the phones", "at reception, greeting visitors", "at reception"], deskDur: [26, 44],
    habits: { visitPam: 1, kitchen: 1, visit: 1, restroom: 0.5 } },
  { key: "ryan", g: "m", name: "Ryan Howard", role: "Temp", desc: "The temp, again. Ambitious, mostly on his own behalf.", k: 1.0, girth: 0.92,
    look: { skin: SKIN.c, hair: [36, 30, 26], top: [72, 82, 100], shirt: [220, 220, 224], bottom: [50, 50, 56], shoes: [30, 26, 24] },
    desk: ["in his office, browsing", "in his office, texting"], deskDur: [16, 30], habits: { kitchen: 1, visitKelly: 1.5, elevator: 1, cooler: 0.5, restroom: 0.4 } },
  { key: "andy", g: "m", name: "Andy Bernard", role: "Salesman", desc: "Mentions Cornell a lot and sometimes sings.", k: 1.0,
    look: { skin: SKIN.a, hair: [126, 90, 54], top: [168, 58, 66], shirt: [236, 232, 220], bottom: [196, 176, 132], shoes: [96, 60, 40] },
    desk: ["at his desk, humming", "on a sales call"], deskDur: [14, 28], habits: { visit: 2, reception: 1.5, kitchen: 1, cooler: 1, restroom: 0.4 } },
  { key: "stanley", g: "m", name: "Stanley Hudson", role: "Salesman", desc: "A veteran salesman counting the days to retirement.", k: 1.0, girth: 1.22,
    look: { skin: SKIN.e, hair: [140, 136, 132], hairStyle: "bald", top: [196, 192, 176], tie: [120, 70, 50], bottom: [84, 80, 76], shoes: [30, 26, 24], glasses: [40, 40, 40] },
    desk: ["doing the crossword", "on the phone with a client", "doing the crossword"], deskPose: { sit: 1, right: "hold", left: "hold" }, deskDur: [40, 80],
    habits: { kitchen: 1, vending: 0.5, restroom: 0.4 } },
  { key: "phyllis", g: "f", name: "Phyllis Vance", role: "Saleswoman", desc: "A kind, quiet saleswoman who notices more than she lets on.", k: 0.93, girth: 1.15,
    look: { skin: SKIN.a, hair: [176, 156, 128], hairStyle: "curly", top: [186, 150, 176], bottom: [120, 100, 112], skirt: [120, 100, 112], legs: [210, 180, 160], shoes: [80, 60, 54] },
    desk: ["on a sales call", "knitting at her desk"], deskDur: [24, 44], habits: { kitchen: 1, visit: 1, copier: 1, restroom: 0.5 } },
  { key: "oscar", g: "m", name: "Oscar Martinez", role: "Accountant", desc: "The most level-headed person in the office.", k: 1.0,
    look: { skin: SKIN.c, hair: [36, 30, 26], top: [176, 196, 210], tie: [80, 100, 130], bottom: [70, 70, 76], shoes: [30, 26, 24] },
    desk: ["reconciling the books", "checking invoices"], deskDur: [22, 40], habits: { kitchen: 1, visit: 1, boss: 0.5, copier: 1, restroom: 0.4 } },
  { key: "angela", g: "f", name: "Angela Martin", role: "Head of Accounting", desc: "Strict, proper and in charge of the party planning committee. Very fond of cats.", k: 0.86, girth: 0.84,
    look: { skin: SKIN.a, hair: [226, 200, 140], hairStyle: "bun", top: [196, 186, 162], shirt: [240, 236, 226], bottom: [100, 84, 104], skirt: [100, 84, 104], legs: [220, 196, 176], shoes: [50, 40, 40] },
    desk: ["reviewing expense reports", "at her desk, disapproving"], deskDur: [26, 46], habits: { copier: 1.2, kitchen: 0.6, visit: 0.6, restroom: 0.4 } },
  { key: "kevin", g: "m", name: "Kevin Malone", role: "Accountant", desc: "An accountant who loves snacks and plays drums in a band.", k: 1.02, girth: 1.38,
    look: { skin: SKIN.a, hair: [110, 86, 64], hairStyle: "bald", top: [150, 166, 176], tie: [70, 80, 100], bottom: [76, 72, 70], shoes: [40, 34, 30] },
    desk: ["at his desk, snacking", "at his desk, doing math"], deskDur: [16, 30], habits: { vending: 3, kitchen: 2, cooler: 1, visit: 0.5, restroom: 0.6 } },
  { key: "meredith", g: "f", name: "Meredith Palmer", role: "Supplier Relations", desc: "Handles suppliers and never turns down a party.", k: 0.94,
    look: { skin: SKIN.a, hair: [176, 84, 54], hairStyle: "shoulder", top: [172, 112, 120], bottom: [70, 60, 72], skirt: [70, 60, 72], legs: [220, 190, 170], shoes: [50, 40, 40] },
    desk: ["on the phone with a supplier", "at her desk"], deskDur: [18, 34], habits: { elevator: 2, kitchen: 1, breakSit: 0.5, restroom: 0.6 } },
  { key: "creed", g: "m", name: "Creed Bratton", role: "Quality Assurance", desc: "Nobody knows exactly what Creed does, or where he goes.", k: 0.98, girth: 0.9,
    look: { skin: SKIN.a, hair: [216, 212, 206], hairStyle: "thin", top: [150, 142, 132], bottom: [60, 62, 70], shoes: [30, 26, 24] },
    desk: ["at his desk, doing something", "at his desk, staring"], deskDur: [12, 26], habits: { wander: 2, kitchen: 1, elevator: 0.8, warehouse: 0.5, breakSit: 0.5 } },
  { key: "kelly", g: "f", name: "Kelly Kapoor", role: "Customer Service", desc: "Customer service rep with strong opinions about celebrities and office gossip.", k: 0.9, girth: 0.88,
    look: { skin: SKIN.d, hair: [30, 24, 22], hairStyle: "long", top: [230, 110, 150], bottom: [70, 60, 92], skirt: [70, 60, 92], legs: SKIN.d, shoes: [40, 30, 34] },
    desk: ["on the phone with a customer", "at her desk, talking"], deskDur: [16, 30], habits: { visitRyan: 2, reception: 1.5, kitchen: 1, restroom: 0.5 } },
  { key: "toby", g: "m", name: "Toby Flenderson", role: "Human Resources", desc: "Human resources. Gentle, tired, and Michael's least favourite person.", k: 1.0,
    look: { skin: SKIN.a, hair: [104, 88, 76], hairStyle: "thin", top: [132, 122, 108], shirt: [220, 220, 214], bottom: [176, 160, 128], shoes: [70, 56, 44] },
    desk: ["at his desk in the annex", "filing a report"], deskDur: [24, 44], habits: { kitchen: 1, cooler: 1, breakSit: 1, boss: 0.3, restroom: 0.4 } },
  { key: "gabe", g: "m", name: "Gabe Lewis", role: "Corporate Liaison", desc: "Sent from corporate. Very tall, very polite, rarely listened to.", k: 1.12, girth: 0.82,
    look: { skin: SKIN.a, hair: [60, 46, 36], top: [70, 74, 86], shirt: [230, 230, 236], tie: [60, 90, 120], bottom: [70, 74, 86], shoes: [30, 26, 24] },
    desk: ["at his desk, writing a memo", "on a call with corporate"], deskDur: [20, 36], habits: { boss: 1.5, visit: 1, kitchen: 0.6, restroom: 0.4 } },
  { key: "darryl", g: "m", name: "Darryl Philbin", role: "Warehouse Foreman", desc: "Runs the warehouse, and now has an office upstairs too. Usually the calmest person in the room.", k: 1.06,
    look: { skin: SKIN.e, hair: [30, 26, 24], hairStyle: "thin", top: [92, 108, 140], shirt: [220, 220, 224], bottom: [60, 72, 104], shoes: [70, 56, 44] },
    desk: ["at his desk, scheduling deliveries", "on the phone with the warehouse"], deskDur: [20, 36], habits: { warehouse: 3, kitchen: 1, boss: 0.5, vending: 0.5, restroom: 0.4 } },
];

// Places people go when they leave their desks
const SPOTS = {
  reception: { x: 2.85, y: 6.55, yaw: -3 * PI / 4, label: "chatting at reception", walk: "heading to reception" },
  copier: { x: 4.75, y: 4.15, yaw: PI, label: "making copies", walk: "going to the copier", pose: { left: "hold", right: "hold" } },
  cooler: { x: 3.4, y: 5.55, yaw: -PI / 2 - 0.3, label: "at the water cooler", walk: "getting some water", pose: { right: "hold" }, item: "mug" },
  coffee: { x: 12.6, y: 6.55, yaw: PI / 2, label: "making coffee", walk: "going for coffee", pose: { right: "hold", left: "hold" } },
  fridge: { x: 16.25, y: 6.35, yaw: PI / 2, label: "looking in the fridge", walk: "going to the kitchen" },
  microwave: { x: 15.3, y: 6.55, yaw: PI / 2, label: "waiting on the microwave", walk: "going to the kitchen" },
  vending: { x: 23.75, y: 11.05, yaw: 0, label: "choosing a snack", walk: "going to the vending machines" },
  elevator: { x: -1.4, y: 11.45, yaw: -PI / 2, hide: true, walk: "heading for the elevator" },
  warehouse: { x: 14.5, y: 8.25, yaw: PI / 2, hide: true, walk: "heading down to the warehouse" },
  mens: { x: 13.6, y: 2.3, yaw: -PI / 2, hide: true, walk: "heading to the restroom" },
  womens: { x: 16.2, y: 2.4, yaw: -PI / 2, hide: true, walk: "heading to the restroom" },
  guest1: { x: 3.5, y: 10.35, yaw: PI / 2, pose: { sit: 1 }, label: "in Michael's office", walk: "going to see Michael" },
  guest2: { x: 4.5, y: 10.35, yaw: PI / 2, pose: { sit: 1 }, label: "in Michael's office", walk: "going to see Michael" },
  lunch1: { x: 17.3, y: 6.75, yaw: -PI / 2, pose: { sit: 1, right: "hold" }, label: "eating lunch", walk: "going to eat" },
  lunch2: { x: 17.3, y: 5.25, yaw: PI / 2, pose: { sit: 1, right: "hold" }, label: "eating lunch", walk: "going to eat" },
  lunch3: { x: 16.55, y: 6.0, yaw: 0, pose: { sit: 1, right: "hold" }, label: "eating lunch", walk: "going to eat" },
  couch1: { x: 19.25, y: 9.4, yaw: 0, pose: { sit: 1 }, label: "resting on the couch", walk: "taking a break" },
  couch2: { x: 19.25, y: 10.0, yaw: 0, pose: { sit: 1 }, label: "resting on the couch", walk: "taking a break" },
  interview: { x: 20.2, y: 12.25, yaw: -PI / 2, pose: { sit: 1, right: "rest", left: "rest" }, label: "talking to the camera", walk: "going to the interview chair" },
  camInterview: { x: 20.0, y: 10.55, yaw: PI / 2, pose: { right: "shoulder", left: "hold" }, label: "filming an interview" },
};
BREAK_CHAIRS.forEach(([x, y, d], i) => (SPOTS["break" + i] = { x, y, yaw: YAW[d], pose: { sit: 1, right: "hold" }, label: "on break in the break room", walk: "taking a break" }));
const AWAY = { elevator: ["out at a client meeting", "getting the mail", "out to lunch", "on a smoke break"], warehouse: ["down in the warehouse"], mens: ["in the restroom"], womens: ["in the restroom"] };
const WANDER = [[3.8, 7.6], [7.0, 3.6], [10.4, 4.0], [10.6, 7.3], [2.3, 0.9 + 0.3], [13.0, 10.5], [19.6, 6.0], [4.4, 2.2]];

const byKey = {};
const busy = (crowd, spot) => crowd.list.some((a) => a.task && a.task.spot === spot);
const at = (spotKey, extra = {}) => {
  const s = SPOTS[spotKey];
  return { spot: spotKey, x: s.x, y: s.y, yaw: s.yaw, pose: s.pose || {}, label: s.label, walkLabel: s.walk, hide: s.hide, item: s.item, ...extra };
};
const freeOf = (crowd, keys) => keys.filter((k) => !busy(crowd, k));

function deskTask(a) {
  const s = SEATS[a.key];
  a.atDesk = true;
  const phone = Math.random() < 0.25 && a.key !== "stanley";
  return {
    x: s.x, y: s.y, yaw: s.yaw, desk: true,
    pose: phone ? { sit: 1, right: "phone", left: "type" } : a.deskPose || { sit: 1, right: "type", left: "type" },
    dur: rand(...a.deskDur),
    label: phone ? "on the phone" : pick(a.desk),
    walkLabel: a.key === "michael" ? "heading back to his office" : a.key === "erin" ? "heading back to reception" : "heading back to the desk",
  };
}
function visitTask(a, crowd, who) {
  const others = crowd.list.filter((o) => o !== a && !o.hidden && o.task && o.task.desk && o.state === "do" && (!who || o.key === who) && !o.extra);
  const o = pick(others);
  if (!o) return null;
  const s = SEATS[o.key], lx = -Math.sin(s.yaw), ly = Math.cos(s.yaw);
  for (const [side, fwd] of [[1, 0.25], [-1, 0.25], [1, -0.5], [-1, -0.5]]) {
    const x = s.x + lx * 0.75 * side + Math.cos(s.yaw) * fwd, y = s.y + ly * 0.75 * side + Math.sin(s.yaw) * fwd;
    if (crowd.nav.ok(x, y) && !busy(crowd, "visit_" + o.key + side + fwd))
      return { spot: "visit_" + o.key + side + fwd, x, y, face: [s.x, s.y], pose: { right: Math.random() < 0.5 ? "rest" : null }, label: `talking with ${o.short}`, walkLabel: `going over to ${o.short}` };
  }
  return null;
}
function awayTask(a, key) {
  a.awayLabel = pick(AWAY[key]);
  return at(key, { label: SPOTS[key].walk, dur: key === "mens" || key === "womens" ? rand(15, 30) : rand(30, 70) });
}
function errand(a, crowd) {
  a.atDesk = false;
  const h = a.habits, choices = Object.entries(h);
  let r = Math.random() * choices.reduce((s, c) => s + c[1], 0), kind = choices[0][0];
  for (const [k, w] of choices) if ((r -= w) <= 0) { kind = k; break; }
  let t = null;
  switch (kind) {
    case "visit": t = visitTask(a, crowd); break;
    case "visitPam": t = visitTask(a, crowd, "pam"); break;
    case "visitKelly": t = visitTask(a, crowd, "kelly"); break;
    case "visitRyan": t = visitTask(a, crowd, "ryan"); break;
    case "reception": t = visitTask(a, crowd, "erin") || (busy(crowd, "reception") ? null : at("reception")); break;
    case "boss": {
      const m = byKey.michael;
      if (m && m.task && m.task.desk && m.state === "do") {
        const f = freeOf(crowd, ["guest1", "guest2"]);
        if (f.length) t = at(f[0]);
      }
      break;
    }
    case "kitchen": {
      const f = freeOf(crowd, Math.random() < 0.5 ? ["coffee", "fridge", "microwave"] : ["lunch1", "lunch2", "lunch3", "break0", "break1", "break2", "break3"]);
      if (f.length) t = at(pick(f));
      break;
    }
    case "breakSit": {
      const f = freeOf(crowd, ["break4", "break5", "break6", "break7", "couch1", "couch2"]);
      if (f.length) t = at(pick(f));
      break;
    }
    case "wander": {
      const [x, y] = pick(WANDER);
      t = { x, y, yaw: rand(-PI, PI), label: a.key === "michael" ? "looking for someone to talk to" : "wandering around", walkLabel: "wandering around", pose: {} };
      break;
    }
    case "restroom": t = awayTask(a, a.g === "f" ? "womens" : "mens"); break;
    case "elevator": t = awayTask(a, "elevator"); break;
    case "warehouse": t = awayTask(a, "warehouse"); break;
    default:
      if (SPOTS[kind] && !busy(crowd, kind)) t = at(kind);
  }
  if (!t) return deskTask(a);
  t.dur = t.dur ?? rand(8, 18);
  return t;
}

// ---- events ------------------------------------------------------------------------------------
const MEET = { on: false, end: 0, next: 70 };
const MEET_SEATS = [
  ...[8.1, 8.8, 9.5, 10.2].flatMap((x) => [[x, 12.25, -PI / 2], [x, 10.25, PI / 2]]),
  [11.05, 11.3, PI],
  ...Array.from({ length: 7 }, (_, i) => [7.6 + i * 0.58, 9.05, PI / 2]),
];
const MEET_STAND = [[11.6, 12.2, PI], [11.6, 10.0, PI], [6.55, 9.9, 0], [11.6, 11.1, PI]];
function meetingTask(a, i) {
  if (a.key === "michael") return { meeting: true, x: 6.75, y: 11.2, yaw: 0, pose: { right: "point" }, dur: 1e9, label: "running a meeting", walkLabel: "calling everyone into the conference room" };
  const seat = MEET_SEATS[i], [x, y, yaw] = seat || MEET_STAND[(i - MEET_SEATS.length) % MEET_STAND.length];
  return { meeting: true, x, y, yaw, pose: seat ? { sit: 1, right: "rest", left: "rest" } : { right: "rest" }, dur: 1e9, label: "in a meeting", walkLabel: "heading to the conference room" };
}
const INTERVIEW = { next: 35, on: null };

let CREW = null;
function crewBrain(a, crowd) {
  if (MEET.on) return { meeting: true, x: 11.55, y: 9.05, face: [8.5, 11.3], pose: { right: "shoulder", left: "hold" }, item: "camera", dur: 1e9, label: "filming the meeting", walkLabel: "hurrying to the meeting" };
  const targets = crowd.list.filter((o) => o !== a && !o.hidden);
  const o = Math.random() < 0.35 && !byKey.michael.hidden ? byKey.michael : pick(targets);
  if (!o) return { x: 7.0, y: 3.6, yaw: PI / 2, pose: { right: "shoulder", left: "hold" }, item: "camera", dur: 8, label: "filming the office" };
  return { follow: o, near: 2.3, pose: { right: "shoulder", left: "hold" }, item: "camera", dur: rand(18, 34), label: `filming ${o.short}` };
}

function people(crowd) {
  for (const p of PEOPLE) {
    const a = crowd.add({ ...p, short: p.name.split(" ")[0], speed: p.key === "stanley" ? 0.9 : p.key === "dwight" ? 1.35 : 1.15, brain });
    const s = SEATS[p.key];
    Object.assign(a, { x: s.x, y: s.y, yaw: s.yaw });
    byKey[p.key] = a;
  }
  CREW = crowd.add({
    key: "crew", g: "m", name: "Documentary crew", short: "the camera", role: "Camera operator",
    desc: "A documentary crew is filming daily life at the branch. Nobody is sure when it will air.",
    look: { skin: SKIN.f, hair: [70, 54, 40], top: [48, 50, 56], bottom: [44, 46, 52], shoes: [30, 28, 26] },
    x: 7.0, y: 3.6, yaw: PI / 2, brain: crewBrain, item: "camera",
  });
}
function brain(a, crowd) {
  if (MEET.on) return meetingTask(a, crowd.list.filter((o) => o.task && o.task.meeting && o.key !== "michael" && o !== CREW).length);
  return a.atDesk ? errand(a, crowd) : deskTask(a);
}

function update(dt, crowd, api) {
  const now = crowd.clock;
  if (!MEET.on && now >= MEET.next && !INTERVIEW.on) {
    MEET.on = true;
    MEET.end = now + 70;
    let i = 0;
    for (const a of crowd.list) {
      if (a.hidden) continue;
      if (a === CREW) crowd.assign(a, crewBrain(a, crowd));
      else if (a.key === "michael") crowd.assign(a, meetingTask(a));
      else crowd.assign(a, meetingTask(a, i++));
    }
    api.say("<b>Conference room, everybody</b><span>Michael has called a meeting.</span>");
  }
  if (MEET.on && now >= MEET.end) {
    MEET.on = false;
    MEET.next = now + rand(150, 230);
    for (const a of crowd.list) if (a.task && a.task.meeting) (a.atDesk = false), crowd.next(a);
  }
  if (!MEET.on && !INTERVIEW.on && now >= INTERVIEW.next) {
    const who = pick(crowd.list.filter((a) => a.task && a.task.desk && a.state === "do" && !a.hidden && a !== CREW));
    if (who) {
      INTERVIEW.on = who;
      crowd.assign(who, at("interview", { dur: 16, interview: true }));
      crowd.assign(CREW, at("camInterview", { item: "camera", dur: 1e9, walkLabel: "setting up for an interview" }));
      CREW.task.label = `filming ${who.short}'s interview`;
    }
    INTERVIEW.next = now + rand(80, 140);
  }
  if (INTERVIEW.on && !(INTERVIEW.on.task && INTERVIEW.on.task.interview)) {
    INTERVIEW.on = null;
    if (!MEET.on) crowd.next(CREW);
  }
}

function overlay(clock) {
  glows(SCREENS, clock);
}

mount({
  title: "Dunder Mifflin, Scranton",
  subtitle: "Scranton Business Park, 1725 Slough Avenue, on an ordinary weekday",
  start: "floor",
  scenes: {
    floor: {
      title: "Dunder Mifflin, Scranton",
      subtitle: "Scranton Business Park, 1725 Slough Avenue, on an ordinary weekday",
      short: "the office",
      view: {
        S: 24, bounds: [-3.3, -0.4, BX + 0.4, BY + 0.4], top: 3.1, below: 1.9, shadow: [0.32, -0.12],
        light: { base: 1.7, k: 1.9 }, edge: 0.12, shadeGround: [0.74, 0.72, 0.86], shadeObj: [0.84, 0.83, 0.92],
      },
      rot: 3,
      focus: [10, 6.5, 0],
      things: THINGS,
      floor,
      build,
      people,
      update,
      overlay,
      roster: true,
    },
  },
});
