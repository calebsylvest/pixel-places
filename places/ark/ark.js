// Noah's Ark, built to the dimensions in Genesis 6:15-16: 300 cubits long, 50 wide, 30 high, with
// three decks, a window finished a cubit from the top, and a door in the side. One cubit is taken as
// 18 inches (0.4572 m); change CUBIT to rescale everything.
// Coordinates: x runs along the length (bow at +x), y across the beam, z up, in metres.
import { mount } from "../../engine/app.js";
import { box, cyl, disc, sphere, quad, rampOf, mFlat, mMottle, mBands, tone4, shadeTones, floorId, setId, hash, bayerAt, clamp, rgb, glows, cloudShade, setShadows, lerp } from "../../engine/render.js";
import { panel } from "../../engine/build.js";
import { drawBeast, beastHeight } from "../../engine/beast.js";
import { SPECIES, individuals } from "./species.js";

export const CUBIT = 0.4572;
const LEN = 300 * CUBIT, BEAM = 50 * CUBIT, HGT = 30 * CUBIT, DECK = HGT / 3;
const HX = LEN / 2, HY = BEAM / 2, T = 0.35, IN = HY - T; // hull half-length, half-beam, wall thickness, inner face
const AISLE = 1.6; // half-width of the central aisle
const PI = Math.PI, HP = PI / 2;
const pick = (l) => l[Math.floor(Math.random() * l.length)];
const rand = (a, b) => a + Math.random() * (b - a);

// ---- palette -----------------------------------------------------------------------------------
const PITCH = [92, 70, 54], TIMBER = [132, 98, 66], STRAW = [214, 186, 112], PLANK = [158, 122, 84];
const mPitchOut = (() => {
  const r = rampOf(PITCH);
  return (l, u, v, px, py) => {
    const row = Math.floor(v / 0.32), t = v / 0.32 - row, joint = (u + row * 1.7) % 4.2 < 0.06;
    return r[clamp(Math.floor(l + 0.35 + (t < 0.12 ? -0.9 : 0) + (joint ? -0.7 : 0) + 0.25 * (hash(row, Math.floor((u + row * 1.7) / 4.2)) - 0.5) + (bayerAt(px, py) - 0.5) * 0.3), 0, 4)];
  };
})();
const mHullIn = (() => {
  const plank = rampOf([88, 66, 50]), rib = rampOf([118, 88, 62]);
  return (l, u, v, px, py) => {
    if (u % 1.5 < 0.2) return rib[clamp(Math.floor(l + 0.2 + (bayerAt(px, py) - 0.5) * 0.3), 0, 4)];
    const row = Math.floor(v / 0.3), t = v / 0.3 - row;
    return plank[clamp(Math.floor(l + (t < 0.1 ? -0.7 : 0) + 0.3 * (hash(row, Math.floor(u / 3)) - 0.5) + (bayerAt(px, py) - 0.5) * 0.3), 0, 4)];
  };
})();
const mTimber = mMottle(TIMBER, 0.3, 0.35), mDarkTimber = mMottle([96, 72, 52], 0.3, 0.3), mCut = mFlat([70, 54, 44]);
const mRoof = mBands([74, 58, 46], 0.4, 0.12, 0.6, true);
const mClay = mMottle([180, 112, 76], 0.25, 0.3), mStraw = mMottle(STRAW, 0.2, 0.5), mVoid = mFlat([22, 18, 20]);
const PLANK_T = shadeTones(PLANK), PLANK_D = shadeTones([132, 100, 70]), STRAW_T = shadeTones(STRAW), STRAW_D = shadeTones([190, 160, 92]);
const GRASS_T = [[84, 112, 60], [100, 128, 66], [118, 144, 74], [136, 156, 84]], DIRT_T = shadeTones([164, 136, 100]);

let NAV = null;
const block = (x0, y0, x1, y1, g) => NAV && NAV.block(x0, y0, x1, y1, g);

// ---- deck layout -------------------------------------------------------------------------------
// Each deck has pens and stores along both sides of a central aisle. The south side keeps a bay at
// midships (x -10..10) for the ramps between decks; the middle deck keeps a cross-aisle at the door.
const RAMP_BAY = [-10, 10], DOOR_X = -30;
const STORE_KINDS = { 1: ["water", "hay", "hay", "water", "grain"], 2: ["grain", "hay", "water", "fruit"], 3: ["grain", "fruit", "water", "timber"] };
function deckLayout(d) {
  const items = [];
  const segs = {
    n: d === 3 ? [[-HX + 1.2, 40]] : [[-HX + 1.2, HX - 1.2]],
    s: d === 2 ? [[-HX + 1.2, DOOR_X - 2], [DOOR_X + 2, RAMP_BAY[0]], [RAMP_BAY[1], HX - 1.2]] : d === 3 ? [[-HX + 1.2, RAMP_BAY[0]], [RAMP_BAY[1], 40]] : [[-HX + 1.2, RAMP_BAY[0]], [RAMP_BAY[1], HX - 1.2]],
  };
  let storeN = 0;
  for (const side of ["n", "s"]) {
    const kinds = SPECIES.filter((sp) => sp.deck === d && sp.side === side);
    let si = 0, x = segs[side][0][0];
    const sgn = side === "n" ? 1 : -1;
    const span = (y0, y1) => (side === "n" ? [y0, y1] : [-y1, -y0]);
    for (const sp of kinds) {
      while (si < segs[side].length && x + sp.pen > segs[side][si][1]) {
        si++;
        if (si < segs[side].length) x = segs[side][si][0];
      }
      if (si >= segs[side].length) break;
      const depth = sp.bird || sp.pen <= 6 ? 4.6 : IN - AISLE;
      const [y0, y1] = span(AISLE, AISLE + depth);
      items.push({ kind: "pen", sp, side, sgn, x0: x, x1: x + sp.pen, y0, y1 });
      if (depth < IN - AISLE - 1) {
        const [b0, b1] = span(AISLE + depth + 0.3, IN);
        items.push({ kind: "store", store: sp.bird ? "seed" : "grain", side, sgn, x0: x, x1: x + sp.pen, y0: b0, y1: b1, back: true });
      }
      x += sp.pen;
    }
    // fill what's left with stores
    for (; si < segs[side].length; si++) {
      if (si > 0 && x < segs[side][si][0]) x = segs[side][si][0];
      const end = segs[side][si][1];
      while (end - x > 3) {
        const w = Math.min(end - x, 10 + (storeN % 3) * 2);
        const [y0, y1] = span(AISLE, IN);
        const kind = STORE_KINDS[d][storeN++ % STORE_KINDS[d].length];
        items.push({ kind: "store", store: kind, side, sgn, x0: x, x1: x + w, y0, y1 });
        x += w;
      }
      if (si + 1 < segs[side].length) x = segs[side][si + 1][0];
    }
  }
  if (d === 3) {
    items.push({ kind: "room", room: "noah", side: "n", sgn: 1, x0: 40, x1: 53, y0: AISLE, y1: IN });
    items.push({ kind: "room", room: "shem", side: "n", sgn: 1, x0: 53, x1: HX - 1.2, y0: AISLE, y1: IN });
    items.push({ kind: "room", room: "kitchen", side: "s", sgn: -1, x0: 40, x1: 51, y0: -IN, y1: -AISLE });
    items.push({ kind: "room", room: "ham", side: "s", sgn: -1, x0: 51, x1: 59, y0: -IN, y1: -AISLE });
    items.push({ kind: "room", room: "japheth", side: "s", sgn: -1, x0: 59, x1: HX - 1.2, y0: -IN, y1: -AISLE });
  }
  for (const it of items) {
    it.cx = (it.x0 + it.x1) / 2;
    it.gate = [it.cx, it.sgn * (AISLE - 0.55)];
  }
  return items;
}
const LAYOUT = { 1: deckLayout(1), 2: deckLayout(2), 3: deckLayout(3) };

// ---- deck building -----------------------------------------------------------------------------
function fenceLine(ax, ay, bx, by, type, h = 1.3) {
  const alongX = Math.abs(bx - ax) >= Math.abs(by - ay), len = Math.hypot(bx - ax, by - ay);
  const at = (t) => [lerp(ax, bx, t), lerp(ay, by, t)];
  const rail = (z0, z1, th) => (alongX ? box(Math.min(ax, bx), ay - th, z0, Math.max(ax, bx), ay + th, z1, mTimber, mTimber) : box(ax - th, Math.min(ay, by), z0, ax + th, Math.max(ay, by), z1, mTimber, mTimber));
  if (type === "low") {
    rail(0, 0.6, 0.03);
  } else if (type === "mesh") {
    const H = 2.3, n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) {
      const [x, y] = at(i / n);
      box(x - 0.05, y - 0.05, 0, x + 0.05, y + 0.05, H, mTimber, mTimber);
    }
    rail(H - 0.08, H, 0.05);
    rail(0, 0.15, 0.04);
    const net = rampOf([150, 130, 100]);
    const mat = (l, u, v) => (u % 0.14 < 0.022 || v % 0.14 < 0.022 ? net[clamp(Math.floor(l + 0.4), 0, 4)] : 0);
    setShadows(false);
    for (const f of alongX ? ["n", "s"] : ["e", "w"]) panel(f, alongX ? ay : ax, alongX ? Math.min(ax, bx) : Math.min(ay, by), alongX ? Math.max(ax, bx) : Math.max(ay, by), 0.15, H - 0.08, mat);
    setShadows(true);
  } else {
    const n = Math.max(1, Math.round(len / 1.6));
    for (let i = 0; i <= n; i++) {
      const [x, y] = at(i / n);
      box(x - 0.07, y - 0.07, 0, x + 0.07, y + 0.07, h + 0.1, mDarkTimber, mDarkTimber);
    }
    for (const f of [0.35, 0.68, 1]) rail(h * f - 0.07, h * f, 0.035);
  }
  block(Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by), 0.15);
}
function pen(it) {
  const sp = it.sp, type = typeof sp.fence === "number" ? "rail" : sp.fence, h = typeof sp.fence === "number" ? sp.fence : 1;
  setId("pen_" + sp.key);
  const front = it.sgn > 0 ? it.y0 : it.y1, back = it.sgn > 0 ? it.y1 : it.y0;
  fenceLine(it.x0, front, it.x1, front, type, h);
  fenceLine(it.x0, it.y0, it.x0, it.y1, type, h);
  fenceLine(it.x1, it.y0, it.x1, it.y1, type, h);
  if (Math.abs(back) < IN - 0.2) fenceLine(it.x0, back, it.x1, back, type, h);
  // a feed trough just inside the gate, and a heap of hay at the back
  const big = sp.spec.h > 1.2, tw = big ? 1.6 : 0.8, ty = front + it.sgn * (big ? 0.7 : 0.4);
  if (!sp.bird) {
    box(it.cx - tw / 2, ty - 0.2, 0, it.cx + tw / 2, ty + 0.2, big ? 0.6 : 0.3, mFlat([150, 116, 80]), mTimber);
    box(it.cx - tw / 2 + 0.06, ty - 0.14, big ? 0.55 : 0.25, it.cx + tw / 2 - 0.06, ty + 0.14, big ? 0.62 : 0.32, mStraw, mStraw);
    if (type !== "low") for (let i = 0; i < 4; i++) sphere(it.x0 + 0.8 + i * 0.5, back - it.sgn * 0.8, 0.25, 0.45, STRAW, "rough");
  }
  it.trough = [it.cx, ty + it.sgn * (big ? 0.9 : 0.5)];
  // perches for birds
  it.perches = [];
  if (sp.bird) {
    for (const [f, z] of [[0.35, 1.05], [0.7, 1.65]]) {
      const y = lerp(front, back, f);
      box(it.x0 + 0.2, y - 0.03, z - 0.03, it.x1 - 0.2, y + 0.03, z + 0.03, mTimber, mTimber);
      it.perches.push({ y, z: z + 0.03 });
    }
    for (let x = it.x0 + 0.6; x < it.x1 - 0.4; x += 1.2) box(x - 0.2, back - it.sgn * 0.3 - 0.2, 1.3, x + 0.2, back - it.sgn * 0.3 + 0.2, 1.6, mFlat([170, 136, 92]), mTimber);
  }
  if (sp.key === "hippo") box(it.x0 + 1, back - it.sgn * 3.5, 0, it.x1 - 1, back - it.sgn * 0.6, 0.5, mFlat([70, 110, 120]), mTimber);
}
function store(it) {
  setId("store_" + it.store);
  const x0 = it.x0 + 0.5, x1 = it.x1 - 0.5, yA = it.sgn > 0 ? it.y0 + (it.back ? 0.2 : 0.8) : it.y1 - (it.back ? 0.2 : 0.8), yB = it.sgn > 0 ? it.y1 - 0.2 : it.y0 + 0.2;
  const ylo = Math.min(yA, yB), yhi = Math.max(yA, yB);
  if (it.store === "hay") {
    for (let x = x0; x + 1.1 <= x1; x += 1.15)
      for (let y = ylo; y + 0.55 <= yhi; y += 0.58) {
        const n = 1 + Math.floor(hash(x, y) * 3);
        for (let k = 0; k < n; k++) box(x, y, k * 0.45, x + 1.1, y + 0.55, (k + 1) * 0.45, mStraw, mBands(STRAW, 0.15, 0.2, 0.6, true));
      }
  } else if (it.store === "water") {
    for (let x = x0 + 0.8; x <= x1 - 0.8; x += 1.8)
      for (let y = ylo + 0.8; y <= yhi - 0.8; y += 1.8) {
        cyl(x, y, 0, 1.6, 0.72, 0.72, mClay, mFlat([60, 90, 100]));
        cyl(x, y, 1.6, 1.75, 0.5, 0.5, mClay, mFlat([50, 76, 88]));
      }
  } else if (it.store === "grain" || it.store === "seed") {
    const sp = it.back ? 1.25 : 0.95;
    for (let x = x0 + 0.4; x <= x1 - 0.4; x += sp)
      for (let y = ylo + 0.4; y <= yhi - 0.4; y += sp) {
        if (hash(x * 3, y) < (it.back ? 0.45 : 0.2)) continue;
        const h = 0.7 + 0.4 * hash(x, y * 3);
        cyl(x, y, 0, h, 0.3, 0.22, mClay, mFlat([110, 70, 50]));
        cyl(x, y, h, h + 0.12, 0.12, 0.12, mClay, mFlat([90, 60, 44]));
      }
  } else if (it.store === "fruit") {
    for (let x = x0 + 0.4; x <= x1 - 0.4; x += 0.9)
      for (let y = ylo + 0.4; y <= yhi - 0.4; y += 0.9) {
        cyl(x, y, 0, 0.45, 0.32, 0.36, mBands([190, 152, 92], 0.08, 0.3, 0.6), null);
        for (let i = 0; i < 3; i++) sphere(x + (i - 1) * 0.12, y + 0.05 * i, 0.5, 0.1, [[190, 60, 50], [120, 140, 60], [220, 160, 60]][i], "solid");
      }
  } else if (it.store === "timber") {
    for (let k = 0; k < 4; k++) for (let y = ylo; y + 0.3 <= yhi; y += 0.36) box(x0, y, k * 0.3, x1, y + 0.3, (k + 1) * 0.3, mTimber, mTimber);
  }
  block(it.x0 + 0.3, ylo, it.x1 - 0.3, yhi, 0.15);
}
function room(it) {
  setId("room_" + it.room);
  const front = it.sgn > 0 ? it.y0 : it.y1, mid = it.cx;
  const wall = mFlat([150, 116, 82]);
  // low timber partitions with a curtain doorway onto the aisle
  for (const x of [it.x0, it.x1]) box(x - 0.08, it.y0, 0, x + 0.08, it.y1, 1.5, mDarkTimber, wall), block(x - 0.08, it.y0, x + 0.08, it.y1, 0.12);
  box(it.x0, front - 0.08, 0, mid - 0.8, front + 0.08, 1.5, mDarkTimber, wall);
  box(mid + 0.8, front - 0.08, 0, it.x1, front + 0.08, 1.5, mDarkTimber, wall);
  block(it.x0, front - 0.08, mid - 0.8, front + 0.08, 0.12);
  block(mid + 0.8, front - 0.08, it.x1, front + 0.08, 0.12);
  const curtain = { noah: [150, 60, 50], shem: [70, 90, 140], ham: [180, 120, 60], japheth: [70, 120, 90], kitchen: [160, 140, 110] }[it.room];
  box(mid - 0.8, front - 0.03, 1.2, mid + 0.8, front + 0.03, 1.5, mFlat(curtain), mFlat(curtain));
  const back = it.sgn > 0 ? it.y1 : it.y0;
  if (it.room === "kitchen") {
    // hearth on a stone slab, a pot, a low table and jars
    const hx = it.x0 + 2.2, hy = back - it.sgn * 1.6;
    box(hx - 1, hy - 1, 0, hx + 1, hy + 1, 0.25, mFlat([150, 146, 140]), mFlat([130, 126, 120]));
    for (let i = 0; i < 6; i++) sphere(hx + Math.cos(i) * 0.45, hy + Math.sin(i) * 0.45, 0.35, 0.16, [120, 116, 112], "rough");
    cyl(hx, hy, 0.25, 0.7, 0.3, 0.26, mFlat([60, 52, 50]), mFlat([40, 36, 34]));
    FIRES.push({ x: hx, y: hy, z: 0.4, r: 4.5, c: [150, 80, 20], k: 0.75, flicker: true });
    box(it.x0 + 4.5, back - it.sgn * 3.2, 0, it.x0 + 7.5, back - it.sgn * 1.6, 0.45, mTimber, mDarkTimber);
    block(hx - 1, hy - 1, hx + 1, hy + 1);
    block(it.x0 + 4.5, Math.min(back - it.sgn * 3.2, back - it.sgn * 1.6), it.x0 + 7.5, Math.max(back - it.sgn * 3.2, back - it.sgn * 1.6));
    for (let i = 0; i < 6; i++) cyl(it.x1 - 0.6, back - it.sgn * (0.6 + i * 0.75), 0, 0.9, 0.28, 0.2, mClay, mFlat([110, 70, 50]));
    it.hearth = [hx + 1.4, hy];
    it.seats = [[it.x0 + 6, back - it.sgn * 3.8, it.sgn > 0 ? HP : -HP], [it.x0 + 6, back - it.sgn * 1.0, it.sgn > 0 ? -HP : HP]];
  } else {
    // two sleeping mats with blankets, a chest, a lamp
    const blanket = curtain;
    it.seats = [];
    for (const [i, off] of [[0, 1.4], [1, 3.0]]) {
      const y = back - it.sgn * off;
      box(it.x0 + 1, y - 0.55, 0, it.x0 + 3.2, y + 0.55, 0.15, mFlat([200, 180, 140]), mFlat([170, 150, 112]));
      box(it.x0 + 1.9, y - 0.5, 0.15, it.x0 + 3.2, y + 0.5, 0.22, mFlat(blanket), mFlat(blanket));
      it.seats.push([it.x0 + 1.5, y, 0]);
    }
    box(it.x1 - 1.6, back - it.sgn * 1.2 - 0.4, 0, it.x1 - 0.6, back - it.sgn * 1.2 + 0.4, 0.6, mTimber, mDarkTimber);
    cyl(it.x1 - 1.1, back - it.sgn * 2.4, 0, 0.8, 0.26, 0.2, mClay, mFlat([110, 70, 50]));
    block(it.x0 + 1, Math.min(back, back - it.sgn * 3.6), it.x0 + 3.2, Math.max(back, back - it.sgn * 3.6), 0.05);
  }
}
let FIRES = [];

function deckFloor(d) {
  const items = LAYOUT[d];
  return (x, y, px, py) => {
    if (Math.abs(x) > HX + 0.4 || Math.abs(y) > HY + 0.4) return 0;
    if (Math.abs(x) > HX || Math.abs(y) > HY) return rgb(...PLANK_D[0]);
    if (d > 1 && x > RAMP_BAY[0] + 2 && x < RAMP_BAY[1] - 2 && y > -10.6 && y < -7.4) return 0; // opening down to the deck below
    let it = null;
    for (const i of items) if (x >= i.x0 && x <= i.x1 && y >= i.y0 && y <= i.y1) { it = i; break; }
    if (it && it.kind === "pen") {
      floorId("pen_" + it.sp.key, px, py);
      return tone4(STRAW_T, 0.5 + 0.45 * (hash(px >> 1, py) - 0.5), px, py);
    }
    floorId(it ? (it.kind === "room" ? "room_" + it.room : "store_" + it.store) : Math.abs(y) < AISLE ? "aisle" : "deck", px, py);
    const board = Math.floor((y + 20) / 0.28), t = (y + 20) / 0.28 - board, joint = (x + board * 2.3) % 5 < 0.05;
    const tones = it && it.kind === "room" ? shadeTones([176, 140, 100]) : PLANK_T;
    return tone4(t < 0.08 || joint ? PLANK_D : tones, 0.55 + 0.25 * (hash(board, Math.floor((x + board * 2.3) / 5)) - 0.5), px, py);
  };
}
function deckBuild(d) {
  return ({ nav }) => {
    NAV = nav;
    FIRES = [];
    nav.open(-HX + T, -IN, HX - T, IN);
    setId("hull");
    box(-HX - 0.1, -HY - 0.1, -0.6, HX + 0.1, HY + 0.1, 0, null, mPitchOut);
    // hull walls: the far side full height (inner face shows ribs), the near side cut low
    const sides = [
      { r: [-HX, -HY, HX, -IN], n: [0, -1], f: "n" },
      { r: [-HX, IN, HX, HY], n: [0, 1], f: "s" },
      { r: [-HX, -IN, -HX + T, IN], n: [-1, 0], f: "e" },
      { r: [HX - T, -IN, HX, IN], n: [1, 0], f: "w" },
    ];
    const window = d === 3 ? CUBIT : 0;
    for (const s of sides) {
      const near = facesCamera(...s.n), h = near ? 1.2 : DECK - window, [x0, y0, x1, y1] = s.r;
      box(x0, y0, 0, x1, y1, h, near ? mCut : mDarkTimber, mPitchOut, { [s.f]: mHullIn });
      nav.block(x0, y0, x1, y1, 0.12);
      if (!near && window) {
        // the window: a cubit-high opening all round, just under the roof (Genesis 6:16)
        const len = Math.max(x1 - x0, y1 - y0), n = Math.round(len / 2.5);
        for (let i = 0; i <= n; i++) {
          const t = i / n, px = lerp(x0, x1, t), py = lerp(y0, y1, t);
          box(px - 0.12, py - 0.12, DECK - window, px + 0.12, py + 0.12, DECK, mDarkTimber, mDarkTimber);
        }
        setId("window");
        const sky = rampOf([196, 214, 226]);
        const c = s.f === "n" ? y1 - 0.25 : s.f === "s" ? y0 + 0.25 : s.f === "e" ? x1 - 0.25 : x0 + 0.25;
        const [a0, a1] = s.f === "n" || s.f === "s" ? [x0, x1] : [y0, y1];
        panel(s.f, c, a0, a1, DECK - window, DECK, (l, u, v, px, py) => sky[clamp(Math.floor(3 + (bayerAt(px, py) - 0.5) * 0.6 + v), 0, 4)]);
        setId("hull");
      }
    }
    // pens, stores, rooms
    for (const it of LAYOUT[d]) (it.kind === "pen" ? pen : it.kind === "store" ? store : room)(it);
    // posts along the aisle, and lamps
    setId("post");
    for (let x = -HX + 3; x < HX - 2; x += 6) {
      for (const y of [-AISLE - 0.15, AISLE + 0.15]) {
        if (y < 0 && x > RAMP_BAY[0] - 0.5 && x < RAMP_BAY[1] + 0.5) continue;
        box(x - 0.15, y - 0.15, 0, x + 0.15, y + 0.15, DECK, mTimber, mDarkTimber);
        block(x - 0.15, y - 0.15, x + 0.15, y + 0.15, 0.12);
      }
      if (Math.round((x + HX) / 6) % 2 === 0) {
        setId("lamp");
        const ly = AISLE + 0.32;
        box(x - 0.05, ly - 0.05, 2.0, x + 0.05, ly + 0.25, 2.06, mDarkTimber, mDarkTimber);
        sphere(x, ly + 0.2, 1.97, 0.07, [196, 140, 80], "solid");
        FIRES.push({ x, y: ly + 0.2, z: 1.97, r: d === 3 ? 3 : 4.2, c: [120, 76, 26], k: d === 1 ? 0.38 : 0.3, flicker: true });
        setId("post");
      }
    }
    // the midships bay: a ramp up to the deck above, and the opening down to the deck below
    setId(d < 3 ? "ramp_up" : "bay");
    if (d < 3) {
      const y0 = -6.0, y1 = -3.2, steps = 24;
      for (let i = 0; i < steps; i++) {
        const xa = -8 + (16 * i) / steps, z = (DECK * (i + 1)) / steps;
        box(xa, y0, 0, xa + 16 / steps + 0.02, y1, z, mFlat([150, 116, 80]), mTimber);
      }
      for (const y of [y0 - 0.06, y1 + 0.06]) for (let i = 0; i <= 8; i++) {
        const xa = -8 + 2 * i, z = (DECK * (xa + 8)) / 16;
        box(xa - 0.05, y - 0.05, z, xa + 0.05, y + 0.05, z + 1.0, mDarkTimber, mDarkTimber);
      }
      nav.block(-8.5, y0 - 0.1, 8.2, y1 + 0.1, 0.15);
    }
    if (d > 1) {
      setId("ramp_down");
      const x0 = RAMP_BAY[0] + 2, x1 = RAMP_BAY[1] - 2, y0 = -10.6, y1 = -7.4, D = -1.6;
      box(x0 - 0.1, y0 - 0.1, D, x1 + 0.1, y0, 0, null, mDarkTimber);
      box(x0 - 0.1, y1, D, x1 + 0.1, y1 + 0.1, 0, null, mDarkTimber);
      box(x0 - 0.1, y0, D, x0, y1, 0, null, mDarkTimber);
      box(x1, y0, D, x1 + 0.1, y1, 0, null, mDarkTimber);
      quad(x0, y0, D, x1 - x0, 0, 0, 0, y1 - y0, 0, 0, 0, 1, mVoid);
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        const xa = x1 - ((x1 - x0) * (i + 1)) / steps, z = -(0.16 * (i + 1));
        box(xa, y0, D, xa + (x1 - x0) / steps, y1, z, mFlat([140, 108, 76]), mDarkTimber);
      }
      for (const [ax, ay, bx, by] of [[x0, y0, x1, y0], [x0, y1, x1 - 2.5, y1], [x0, y0, x0, y1], [x1, y0, x1, y1]]) fenceLine(ax, ay, bx, by, "rail", 1.0);
      nav.block(x0, y0, x1, y1, 0.15);
    }
    if (d === 2) {
      setId("door_in");
      box(DOOR_X - 1.8, -IN - 0.1, 0, DOOR_X + 1.8, -IN + 0.4, 0.06, mFlat([170, 134, 94]), mTimber);
      if (!facesCamera(0, -1)) panel("n", -IN + 0.01, DOOR_X - 1.8, DOOR_X + 1.8, 0, 4.0, mVoid);
    }
    setId(null);
  };
}
import { facesCamera } from "../../engine/render.js";

// ---- people and animals aboard ------------------------------------------------------------------
const SKIN = [[196, 150, 112], [176, 128, 92], [150, 104, 76], [214, 170, 132]];
const FAMILY = {
  noah: { name: "Noah", role: "Six hundred years old (Genesis 7:6)", desc: "A righteous man, perfect in his generations, who walked with God (Genesis 6:9). He built the ark as he was told.", k: 1.0,
    look: { skin: SKIN[0], hair: [236, 232, 226], hairStyle: "thin", robe: [206, 192, 164], mantle: [120, 92, 64], sash: [150, 70, 50], beard: [240, 238, 232], beardLen: 0.3, shoes: [110, 80, 56] } },
  wife: { name: "Noah's wife", role: "Her name isn't given in Genesis", desc: "Mother of Shem, Ham and Japheth. She runs the household on the upper deck.", k: 0.94, female: true,
    look: { skin: SKIN[0], robe: [150, 92, 72], headwrap: [214, 200, 172], veil: true, sash: [90, 70, 60], shoes: [110, 80, 56] } },
  shem: { name: "Shem", role: "Noah's son", desc: "Ancestor of Abraham, through the line traced in Genesis 11.", k: 1.02,
    look: { skin: SKIN[1], hair: [56, 42, 32], robe: [176, 154, 122], mantle: [86, 92, 122], sash: [60, 60, 70], beard: [56, 42, 32], beardLen: 0.16, shoes: [110, 80, 56] } },
  ham: { name: "Ham", role: "Noah's son", desc: "Father of Cush, Mizraim, Phut and Canaan (Genesis 10:6).", k: 1.03,
    look: { skin: SKIN[2], hair: [36, 30, 26], robe: [192, 142, 92], mantle: [140, 62, 52], sash: [70, 50, 40], beard: [36, 30, 26], beardLen: 0.14, shoes: [110, 80, 56] } },
  japheth: { name: "Japheth", role: "Noah's son", desc: "Ancestor of the peoples of the coastlands (Genesis 10:5).", k: 1.04,
    look: { skin: SKIN[3], hair: [132, 92, 58], robe: [212, 202, 182], mantle: [82, 112, 92], sash: [120, 90, 50], beard: [132, 92, 58], beardLen: 0.12, shoes: [110, 80, 56] } },
  shemWife: { name: "Shem's wife", role: "Daughter-in-law of Noah", desc: "One of the eight people aboard (1 Peter 3:20).", k: 0.93, female: true,
    look: { skin: SKIN[1], robe: [120, 130, 160], headwrap: [230, 222, 200], veil: true, sash: [150, 70, 50], shoes: [110, 80, 56] } },
  hamWife: { name: "Ham's wife", role: "Daughter-in-law of Noah", desc: "One of the eight people aboard (1 Peter 3:20).", k: 0.92, female: true,
    look: { skin: SKIN[2], robe: [196, 120, 80], headwrap: [222, 196, 140], veil: true, sash: [80, 60, 50], shoes: [110, 80, 56] } },
  japhethWife: { name: "Japheth's wife", role: "Daughter-in-law of Noah", desc: "One of the eight people aboard (1 Peter 3:20).", k: 0.95, female: true,
    look: { skin: SKIN[3], robe: [104, 140, 112], headwrap: [236, 230, 214], veil: true, sash: [150, 120, 60], shoes: [110, 80, 56] } },
};
const CREW = { 1: ["shem", "japheth"], 2: ["ham", "hamWife"], 3: ["noah", "wife", "shemWife", "japhethWife"] };

function animalLabel(a) {
  const p = a.pose || {};
  if (a.spec.plan === "bird" && !a.groundBird) return a.moving ? "fluttering" : p.graze ? "preening" : "perched";
  if (a.moving) return "pacing the pen";
  if (p.lie) return a.t % 60 < 30 ? "lying down" : "asleep";
  if (p.graze) return "eating";
  if (p.display) return "showing off his train";
  return "standing";
}
function animalBrain(a) {
  const P = a.pen, m = Math.min(1.2, (a.spec.len || 0.4) / 2 + 0.35), sp = a.species;
  const x = () => rand(P.x0 + m, P.x1 - m), y = () => rand(Math.min(P.y0, P.y1) + m, Math.max(P.y0, P.y1) - m);
  if (sp.bird && !sp.ground) {
    if (Math.random() < 0.3 || !a.perch) {
      a.perch = pick(P.perches);
      return { direct: true, x: x(), y: a.perch.y + rand(-0.03, 0.03), z: a.perch.z, yaw: Math.random() < 0.5 ? 0 : PI, dur: rand(6, 20), pose: {} };
    }
    return { dur: rand(5, 15), z: a.z, yaw: a.yaw, pose: Math.random() < 0.4 ? { graze: 1 } : {} };
  }
  const r = Math.random(), slow = sp.spec.plan === "tortoise" || sp.spec.plan === "snake";
  if (r < 0.22 && !slow) return { direct: true, x: x(), y: y(), yaw: rand(-PI, PI), dur: rand(4, 12), pose: {} };
  if (r < 0.45 && P.trough && !sp.bird) return { direct: true, x: P.trough[0] + rand(-0.5, 0.5), y: P.trough[1], face: [P.trough[0], P.trough[1] - (P.sgn || 1) * 1], dur: rand(8, 20), pose: { graze: 1 } };
  if (r < 0.62) return { dur: rand(15, 40), yaw: a.yaw, pose: { lie: 1 } };
  if (sp.key === "peacock" && a.sex === "male" && Math.random() < 0.5) return { dur: rand(6, 12), yaw: a.yaw, pose: { display: 1 } };
  return { dur: rand(6, 16), yaw: a.yaw + rand(-1, 1), pose: Math.random() < 0.3 ? { alert: 1 } : sp.bird ? { graze: 1 } : {} };
}
function addAnimal(crowd, sp, ind, x, y, extra = {}) {
  const spec = ind.spec, plan = spec.plan || "quad";
  const flying = plan === "bird" && !sp.ground;
  return crowd.add({
    name: `${sp.name.replace(/s$/, "").replace(/ee$/, "eep")} (${ind.sex})`, role: sp.clean ? "one of seven pairs" : "one of a pair", desc: sp.desc,
    species: sp, spec, sex: ind.sex, k: ind.k, x, y, yaw: rand(-PI, PI), seed: Math.random() * 10,
    draw: drawBeast, pickH: beastHeight, pickW: Math.max(0.25, (spec.len || spec.r * 2) * 0.45),
    walkPose: flying ? () => ({ fly: 1 }) : () => ({}), stride: Math.max(0.35, (spec.h || spec.r * 2) * 0.7),
    speed: plan === "tortoise" ? 0.12 : plan === "snake" ? 0.2 : flying ? 1.8 : 0.45 + Math.min(0.6, (spec.len || 0.5) * 0.18),
    radius: Math.max(0.15, (spec.len || spec.r * 2) * 0.32), groundBird: !!sp.ground, extra: true,
    ...extra,
  });
}
function nameOf(sp) {
  const map = { Sheep: "Sheep", Cattle: "Cattle", Deer: "Deer", Peafowl: "Peafowl", Wildcats: "Wildcat", Foxes: "Fox", Rhinoceroses: "Rhinoceros", Hippopotamuses: "Hippopotamus", Ostriches: "Ostrich" };
  return map[sp.name] || sp.name.replace(/s$/, "");
}

function familyBrain(d) {
  return (a, crowd) => {
    const items = LAYOUT[d], pens = items.filter((i) => i.kind === "pen"), stores = items.filter((i) => i.kind === "store" && !i.back);
    const r = Math.random();
    if (a.key === "noah" && r < 0.15) return { x: rand(-30, 30), y: 0, yaw: HP, pose: { right: "point", left: "point" }, dur: rand(8, 14), label: "praying", walkLabel: "walking the aisle" };
    if (d === 3 && a.female && r < 0.35) {
      const kitchen = items.find((i) => i.room === "kitchen");
      if (Math.random() < 0.6) return { x: kitchen.hearth[0], y: kitchen.hearth[1], face: [kitchen.hearth[0] - 1.4, kitchen.hearth[1]], pose: { right: "hold", left: "hold" }, dur: rand(10, 20), label: "cooking at the hearth", walkLabel: "going to the hearth" };
      const [sx, sy, yaw] = pick(kitchen.seats);
      return { x: sx, y: sy, yaw, pose: { sit: 1, right: "hold" }, dur: rand(10, 20), label: "eating", walkLabel: "going to eat" };
    }
    if (r < 0.55 && pens.length) {
      const p = pick(pens), it = p.sp.bird ? "basket" : p.sp.spec.h > 1.4 ? "hay" : pick(["pail", "basket", "hay"]);
      return { x: p.gate[0] + rand(-1, 1), y: p.gate[1], face: [p.gate[0], p.gate[1] + p.sgn * 2], item: it, pose: { right: "hold", left: "hold" }, dur: rand(6, 12), label: `feeding the ${p.sp.name.toLowerCase()}`, walkLabel: `taking food to the ${p.sp.name.toLowerCase()}` };
    }
    if (r < 0.85 && stores.length) {
      const s = pick(stores), what = { hay: "hay", water: "water", grain: "grain", fruit: "fruit", timber: "timber", seed: "seed" }[s.store];
      return { x: s.gate[0] + rand(-1.5, 1.5), y: s.gate[1], face: [s.gate[0], s.gate[1] + s.sgn * 2], pose: { right: "hold", left: "hold" }, dur: rand(5, 10), label: `fetching ${what}`, walkLabel: `going for ${what}`, item: what === "water" ? "jar" : null };
    }
    if (d === 3) {
      const rooms = items.filter((i) => i.kind === "room" && i.room !== "kitchen"), rm = pick(rooms), [sx, sy] = pick(rm.seats);
      return { x: sx, y: sy, yaw: 0, pose: { sit: 1, right: "rest", left: "rest" }, dur: rand(12, 25), label: "resting", walkLabel: "going to rest" };
    }
    return { x: rand(-50, 50), y: rand(-0.8, 0.8), yaw: Math.random() < 0.5 ? 0 : PI, pose: {}, dur: rand(4, 8), label: "checking the hull", walkLabel: "walking the aisle" };
  };
}
function deckPeople(d) {
  return (crowd) => {
    for (const it of LAYOUT[d]) {
      if (it.kind !== "pen") continue;
      it.trough = it.trough || [it.cx, it.gate[1] + it.sgn * 1.4];
      const inds = individuals(it.sp);
      inds.forEach((ind, i) => {
        const a = addAnimal(crowd, it.sp, ind, rand(it.x0 + 0.8, it.x1 - 0.8), rand(Math.min(it.y0, it.y1) + 0.8, Math.max(it.y0, it.y1) - 0.8), { pen: it, brain: animalBrain });
        a.name = `${nameOf(it.sp)} (${ind.sex})`;
      });
    }
    for (const k of CREW[d]) {
      const f = FAMILY[k];
      crowd.add({ key: k, ...f, short: f.name.split(" ")[0], x: rand(-20, 20), y: 0, yaw: 0, speed: k === "noah" ? 0.8 : 1.0, brain: familyBrain(d) });
    }
  };
}

// ---- the outside: the seventh day, the animals going in two by two (Genesis 7:7-9) -----------
const HULL_Z = 0.9, EAVE = HULL_Z + HGT, RIDGE = EAVE + 1.4;
const RAMP = { x0: DOOR_X - 1.8, x1: DOOR_X + 28.2, y0: -HY - 3.9, y1: -HY - 0.3, top: HULL_Z + DECK };
const rampZ = (x, y) => {
  if (y < RAMP.y0 || y > RAMP.y1 + 0.3 || x < RAMP.x0 || x > RAMP.x1) return 0;
  if (x <= DOOR_X + 1.8) return RAMP.top;
  return RAMP.top * (1 - (x - (DOOR_X + 1.8)) / (RAMP.x1 - (DOOR_X + 1.8)));
};
const ROUTE_Y = (RAMP.y0 + RAMP.y1) / 2;

function outsideFloor(x, y, px, py) {
  const dx = x / 88, dy = (y + 11) / 34;
  const edge = dx * dx + dy * dy + 0.12 * (hash(Math.floor(x / 3), Math.floor(y / 3)) - 0.5);
  if (edge > 1) return 0;
  // a trodden path from the east field to the foot of the ramp
  const onPath = pathDist(x, y) < 2.4 + 0.6 * (hash(Math.floor(x), Math.floor(y)) - 0.5);
  const nearArk = Math.abs(x) < HX + 6 && Math.abs(y) < HY + 6;
  if (onPath || nearArk) {
    floorId(onPath ? "path" : "yard", px, py);
    return tone4(DIRT_T, 0.5 + 0.35 * (hash(px, py) - 0.5) + (nearArk && !onPath ? 0.1 : 0), px, py);
  }
  floorId("field", px, py);
  const n = hash(Math.floor(x / 1.5), Math.floor(y / 1.5));
  return tone4(GRASS_T, 0.45 + 0.3 * (n - 0.5) + 0.25 * (hash(px, py) - 0.5), px, py);
}
const PATH = [[74, -18], [52, -28], [26, -24], [RAMP.x1 + 4, ROUTE_Y - 1.2]];
function pathDist(x, y) {
  let best = 1e9;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, ay] = PATH[i], [bx, by] = PATH[i + 1], dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return best;
}
function tree(x, y, s = 1, dark = false) {
  cyl(x, y, 0, 2.2 * s, 0.22 * s, 0.16 * s, mFlat([96, 76, 58]), null);
  const G = dark ? [[44, 78, 56], [56, 92, 62], [40, 70, 50]] : [[66, 112, 62], [82, 130, 70], [58, 100, 58]];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39, r = (0.6 + 0.5 * (i % 3)) * s;
    sphere(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, (2.4 + 0.5 * (i % 4)) * s, (0.9 + 0.2 * (i % 2)) * s, G[i % 3], "rough");
  }
  NAV && NAV.block(x - 0.4 * s, y - 0.4 * s, x + 0.4 * s, y + 0.4 * s);
}
function outsideBuild({ nav }) {
  NAV = nav;
  FIRES = [];
  nav.open(-90, -46, 90, 24);
  setId("cradle");
  for (let x = -HX + 4; x <= HX - 4; x += 8) box(x - 0.5, -HY - 0.4, 0, x + 0.5, HY + 0.4, HULL_Z, mTimber, mDarkTimber);
  nav.block(-HX - 0.5, -HY - 0.5, HX + 0.5, HY + 0.5, 0.3);
  setId("ark");
  // hull walls up to the window, pitched inside and out (Genesis 6:14)
  const wTop = EAVE - CUBIT;
  box(-HX, -HY, HULL_Z, HX, HY, wTop, mDarkTimber, mPitchOut);
  // the window: a cubit-high gap under the roof all the way round, with posts holding the roof up
  setId("window");
  box(-HX + 0.4, -HY + 0.4, wTop, HX - 0.4, HY - 0.4, EAVE, mVoid, mVoid);
  for (let x = -HX; x <= HX + 0.01; x += 3) for (const y of [-HY + 0.15, HY - 0.15]) box(x - 0.15, y - 0.15, wTop, x + 0.15, y + 0.15, EAVE, mPitchOut, mPitchOut);
  for (let y = -HY; y <= HY + 0.01; y += 3) for (const x of [-HX + 0.15, HX - 0.15]) box(x - 0.15, y - 0.15, wTop, x + 0.15, y + 0.15, EAVE, mPitchOut, mPitchOut);
  // roof: two gentle slopes with an overhang, and triangular gables at the ends
  setId("roof");
  const o = 0.8, Rh = RIDGE - EAVE, rn = Math.hypot(Rh, HY + o);
  quad(-HX - o, -HY - o, EAVE, LEN + 2 * o, 0, 0, 0, HY + o, Rh, 0, -Rh / rn, (HY + o) / rn, mRoof);
  quad(HX + o, HY + o, EAVE, -(LEN + 2 * o), 0, 0, 0, -(HY + o), Rh, 0, Rh / rn, (HY + o) / rn, mRoof);
  for (const [x, sgn] of [[HX + o, 1], [-HX - o, -1]]) {
    const mask = (u, v) => v <= Rh * (1 - Math.abs(u - (HY + o)) / (HY + o)) + 0.02;
    if (sgn > 0) quad(x, -HY - o, EAVE, 0, BEAM + 2 * o, 0, 0, 0, Rh, 1, 0, 0, mPitchOut, mask);
    else quad(x, HY + o, EAVE, 0, -(BEAM + 2 * o), 0, 0, 0, Rh, -1, 0, 0, mPitchOut, mask);
  }
  // the door in the side, open, at the level of the middle deck
  setId("door");
  const dz0 = HULL_Z + DECK, dz1 = dz0 + 4.0;
  panel("s", -HY - 0.01, DOOR_X - 1.8, DOOR_X + 1.8, dz0, dz1, (l, u, v, px, py) => rampOf([30, 24, 24])[clamp(Math.floor(1 + v * 0.3 + (bayerAt(px, py) - 0.5) * 0.4), 0, 4)]);
  box(DOOR_X - 2.0, -HY - 3.7, dz0, DOOR_X - 1.8, -HY, dz1, mTimber, mDarkTimber, { e: mBands(TIMBER, 0.3, 0.12, 0.7, true) });
  // the ramp up to the door
  setId("ramp");
  const rx0 = DOOR_X + 1.8, rlen = RAMP.x1 - rx0, top = RAMP.top;
  box(RAMP.x0, RAMP.y0, 0, rx0, RAMP.y1, top, mFlat([150, 116, 80]), mDarkTimber);
  const rampN = Math.hypot(rlen, top);
  quad(RAMP.x1, RAMP.y0, 0, -rlen, 0, top, 0, RAMP.y1 - RAMP.y0, 0, top / rampN, 0, rlen / rampN, mBands([150, 116, 80], 0.5, 0.15, 0.6, true));
  for (const [y, f] of [[RAMP.y0, "s"], [RAMP.y1, "n"]]) {
    const mask = (u, v) => v <= top * (f === "s" ? 1 - u / rlen : u / rlen);
    panel(f, y, rx0, RAMP.x1, 0, top, mDarkTimber, mask);
  }
  for (let x = rx0 + 3; x < RAMP.x1 - 2; x += 4) {
    const z = rampZ(x, ROUTE_Y);
    for (const y of [RAMP.y0 - 0.06, RAMP.y1 + 0.06]) box(x - 0.06, y - 0.06, z, x + 0.06, y + 0.06, z + 1.0, mDarkTimber, mDarkTimber);
  }
  nav.open(RAMP.x0, RAMP.y0, RAMP.x1 + 1, RAMP.y1);
  // the family's camp, a timber yard and the forest the wood came from
  setId("camp");
  for (const [x, y, c] of [[-79, -2, [200, 182, 150]], [-82, -10, [180, 150, 120]], [-75, -15, [210, 196, 170]]]) {
    cyl(x, y, 0, 2.6, 2.2, 0.05, mMottle(c, 0.4, 0.4), null);
    block(x - 2.2, y - 2.2, x + 2.2, y + 2.2);
  }
  sphere(-77, -8, 0.2, 0.35, [110, 100, 92], "rough");
  FIRES.push({ x: -77, y: -8, z: 0.4, r: 3, c: [150, 80, 20], k: 0.7, flicker: true });
  setId("timber");
  for (let k = 0; k < 4; k++) for (let i = 0; i < 6 - k; i++) box(-66, -30 + i * 0.66 + k * 0.33, k * 0.6, -54, -29.4 + i * 0.66 + k * 0.33, k * 0.6 + 0.58, mTimber, mFlat([180, 140, 96]));
  block(-66, -30, -54, -26);
  setId("stump");
  for (let i = 0; i < 14; i++) {
    const x = -60 + hash(i, 1) * 40, y = 13 + hash(i, 2) * 3.5;
    cyl(x, y, 0, 0.5, 0.4, 0.4, mFlat([120, 96, 70]), mFlat([200, 170, 120]));
  }
  setId("tree");
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * PI * 2, x = Math.cos(a) * (80 + 6 * hash(i, 3)), y = -11 + Math.sin(a) * (30 + 4 * hash(i, 4));
    if (pathDist(x, y) < 6) continue;
    tree(x, y, 0.9 + 0.5 * hash(i, 5), i % 3 === 0);
  }
  setId("stores");
  for (let i = 0; i < 8; i++) {
    const x = RAMP.x1 + 6 + (i % 4) * 1.3, y = -20 - Math.floor(i / 4) * 1.3;
    box(x, y, 0, x + 1.1, y + 0.55, 0.45, mStraw, mBands(STRAW, 0.15, 0.2, 0.6, true));
    cyl(x + 0.5, y - 3, 0, 0.9, 0.3, 0.22, mClay, mFlat([110, 70, 50]));
  }
  block(RAMP.x1 + 6, -24, RAMP.x1 + 11.5, -18.6);
  setId(null);
}

// Procession: pairs walk in from the east field, up the ramp and through the door.
const OUT = { next: 0, queue: [], qi: 0 };
function outsidePeople(crowd) {
  crowd.ground = rampZ;
  OUT.queue = SPECIES.slice();
  for (let i = 0; i < 18; i++) {
    const a = addAnimal(crowd, SPECIES[0], individuals(SPECIES[0])[0], 200, 0, { brain: () => ({ dur: 1e9, hide: true }), noPush: true });
    a.hidden = true;
    a.free = true;
  }
  const spots = {
    noah: { x: DOOR_X + 0.4, y: ROUTE_Y + 0.6, yaw: 0, pose: { right: "point" }, label: "welcoming the animals at the door", item: "staff" },
    wife: { x: DOOR_X - 0.6, y: ROUTE_Y - 0.6, yaw: 0, pose: { right: "rest", left: "rest" }, label: "watching from the door" },
    shem: { x: 48, y: -27, yaw: PI * 0.9, pose: { right: "point" }, label: "guiding the animals along the path", item: "staff" },
    ham: { x: 16, y: -20.5, yaw: PI * 0.85, pose: {}, label: "guiding the animals to the ramp", item: "staff" },
    japheth: { x: RAMP.x1 + 2, y: ROUTE_Y - 3.2, yaw: HP, pose: { right: "point" }, label: "waving the animals up the ramp", item: "staff" },
  };
  for (const k in FAMILY) {
    const f = FAMILY[k], s = spots[k];
    const a = crowd.add({ key: k, ...f, short: f.name.split(" ")[0], x: s ? s.x : RAMP.x1 + 8, y: s ? s.y : -21, yaw: 0, speed: 1.0 });
    a.brain = s ? () => ({ ...s, dur: rand(10, 20), pose: Math.random() < 0.5 ? s.pose : {} }) : carrierBrain;
  }
}
function carrierBrain(a) {
  // the daughters-in-law carry food aboard (Genesis 6:21) and come back down for more
  if (a.carrying) {
    a.carrying = false;
    return { route: [[RAMP.x1 - 0.5, ROUTE_Y + 1.1], [DOOR_X + 2.2, ROUTE_Y + 1.1], [DOOR_X, -HY - 0.6]], x: DOOR_X, y: -HY - 0.6, hide: true, dur: rand(6, 12), item: pick(["basket", "jar", "hay"]), label: "inside, stowing food", walkLabel: "carrying food aboard" };
  }
  a.carrying = true;
  return { route: [[DOOR_X + 2.2, ROUTE_Y + 1.1], [RAMP.x1 - 0.5, ROUTE_Y + 1.1], [RAMP.x1 + 7, -18]], x: RAMP.x1 + 7, y: -18, face: [RAMP.x1 + 8, -20], pose: { right: "hold", left: "hold" }, dur: rand(4, 8), label: "picking up more food", walkLabel: "heading back down the ramp" };
}
function outsideUpdate(dt, crowd) {
  OUT.next -= dt;
  if (OUT.next > 0) return;
  const free = crowd.list.filter((a) => a.free);
  if (free.length < 2) return;
  const sp = OUT.queue[OUT.qi++ % OUT.queue.length], inds = individuals(sp).slice(0, 2);
  const flying = sp.bird && !sp.ground;
  OUT.next = flying ? 3 : 5 + Math.min(4, (sp.spec.len || 0.5) * 1.2);
  inds.forEach((ind, i) => {
    const a = free[i], side = i === 0 ? -0.7 : 0.7, wide = Math.max(0.6, (ind.spec.r || 0.3) * 1.3);
    Object.assign(a, { species: sp, spec: ind.spec, sex: ind.sex, k: ind.k, groundBird: !!sp.ground, free: false, hidden: false, moving: true });
    a.name = `${nameOf(sp)} (${ind.sex})`;
    a.role = "going aboard two by two";
    a.desc = sp.desc;
    a.pickW = Math.max(0.25, (ind.spec.len || ind.spec.r * 2) * 0.45);
    a.radius = Math.max(0.15, (ind.spec.len || ind.spec.r * 2) * 0.32);
    a.walkPose = flying ? () => ({ fly: 1 }) : () => ({});
    a.stride = Math.max(0.35, (ind.spec.h || ind.spec.r * 2) * 0.7);
    a.speed = (ind.spec.plan === "tortoise" ? 0.5 : ind.spec.plan === "snake" ? 0.6 : flying ? 3.2 : 1.0 + Math.min(0.5, (ind.spec.len || 0.5) * 0.1)) * (0.95 + 0.1 * i);
    const s = side * wide;
    if (flying) {
      a.x = 88 + rand(0, 4);
      a.y = -30 + s * 2;
      a.z = 7.5;
      a.brain = (b) => {
        b.free = true;
        return { dur: 1e9, hide: true };
      };
      crowd.assign(a, { route: [[DOOR_X + 6, -HY - 2 + s], [DOOR_X, -HY - 0.4]], x: DOOR_X, y: -HY - 0.4, z: 7.5, hide: true, dur: 0.5, label: "flying in", walkLabel: "flying to the door" });
    } else {
      a.x = PATH[0][0] + rand(0, 2);
      a.y = PATH[0][1] + s;
      a.brain = (b) => {
        b.free = true;
        return { dur: 1e9, hide: true };
      };
      crowd.assign(a, {
        route: [[PATH[1][0], PATH[1][1] + s], [PATH[2][0], PATH[2][1] + s], [RAMP.x1 + 1, ROUTE_Y + s * 0.8], [DOOR_X + 2, ROUTE_Y + s * 0.8], [DOOR_X, -HY - 0.4]],
        x: DOOR_X, y: -HY - 0.4, hide: true, dur: 0.5, label: "going in", walkLabel: "walking to the ark",
      });
    }
  });
}

// ---- things you can point at -------------------------------------------------------------------
const PEN_THINGS = {};
for (const sp of SPECIES) PEN_THINGS["pen_" + sp.key] = { name: sp.name, sub: sp.clean ? "seven pairs (clean)" : "one pair", text: sp.desc };
const DECK_THINGS = {
  ...PEN_THINGS,
  hull: { name: "Hull", sub: "Gopher wood, pitched within and without (Genesis 6:14)", text: `${LEN.toFixed(0)} m long and ${BEAM.toFixed(1)} m wide: 300 by 50 cubits.` },
  deck: { name: "Deck", text: `Each of the three decks is about ${DECK.toFixed(1)} m (10 cubits) high.` },
  aisle: { name: "Centre aisle", text: "The family's road from one end of the ship to the other. It takes a couple of minutes to walk." },
  post: { name: "Post", text: "Timber posts carry the deck above." },
  lamp: { name: "Oil lamp", text: "Small clay lamps light the aisle." },
  window: { name: "The window", sub: "Genesis 6:16", text: "“A window shalt thou make to the ark, and in a cubit shalt thou finish it above.” A cubit-high opening runs all round under the roof." },
  ramp_up: { name: "Ramp up", text: "To the deck above.", enter: null },
  ramp_down: { name: "Ramp down", text: "To the deck below.", enter: null },
  bay: { name: "Midships", text: "The ramp from below comes up here." },
  door_in: { name: "The door", sub: "Genesis 6:16, 7:16", text: "The only door, in the side of the ark. “And the LORD shut him in.”", enter: "outside", enterLabel: "outside" },
  store_hay: { name: "Hay", text: "“Take thou unto thee of all food that is eaten” (Genesis 6:21). Bales for the grazing animals." },
  store_water: { name: "Water jars", text: "Fresh water for a voyage of more than a year (Genesis 7:11, 8:14)." },
  store_grain: { name: "Grain", text: "Jars of grain and seed, sealed against damp and mice." },
  store_seed: { name: "Seed", text: "Seed and grain for the birds and small animals." },
  store_fruit: { name: "Dried fruit", text: "Baskets of figs, dates and raisins." },
  store_timber: { name: "Spare timber", text: "Gopher wood for repairs." },
  room_noah: { name: "Noah's room", text: "Noah and his wife sleep here." },
  room_shem: { name: "Shem's room", text: "Shem and his wife." },
  room_ham: { name: "Ham's room", text: "Ham and his wife." },
  room_japheth: { name: "Japheth's room", text: "Japheth and his wife." },
  room_kitchen: { name: "Hearth", text: "The family cooks and eats here, on a stone slab so the fire can't reach the deck." },
};
function deckThings(d) {
  const t = JSON.parse(JSON.stringify(DECK_THINGS));
  t.ramp_up.enter = d < 3 ? "deck" + (d + 1) : null;
  t.ramp_up.enterLabel = "up";
  t.ramp_down.enter = d > 1 ? "deck" + (d - 1) : null;
  t.ramp_down.enterLabel = "down";
  return t;
}
const OUT_THINGS = {
  ark: { name: "The ark", sub: "300 × 50 × 30 cubits (Genesis 6:15)", text: `About ${LEN.toFixed(0)} × ${BEAM.toFixed(1)} × ${HGT.toFixed(1)} m with an 18-inch cubit. Gopher wood, pitched within and without.`, enter: "deck2", enterLabel: "aboard" },
  window: { name: "The window", sub: "Genesis 6:16", text: "“In a cubit shalt thou finish it above.” A cubit-high opening runs all round under the roof." },
  roof: { name: "Roof", text: "A covering over the top deck. Noah removes part of it when the waters go down (Genesis 8:13)." },
  door: { name: "The door", sub: "“The door of the ark shalt thou set in the side thereof” (Genesis 6:16)", text: "It opens onto the middle deck.", enter: "deck2", enterLabel: "aboard" },
  ramp: { name: "Ramp", text: "Timber ramp up to the door, long enough for an elephant." },
  cradle: { name: "Cradle", text: "Timber blocks hold the hull off the ground until the waters lift it (Genesis 7:17)." },
  camp: { name: "The family's tents", text: "Where Noah's family lived while the ark was built." },
  timber: { name: "Timber yard", text: "What's left of the gopher wood." },
  stump: { name: "Stumps", text: "A forest went into the hull." },
  tree: { name: "Tree", text: "" },
  stores: { name: "Food for the voyage", text: "“Gather it to thee; and it shall be for food for thee, and for them” (Genesis 6:21)." },
  path: { name: "Path", text: "Trodden flat by the animals coming in, two by two." },
  yard: { name: "Building yard", text: "Wood chips and pitch stains." },
  field: { name: "Field", text: "" },
};

// ---- scenes ------------------------------------------------------------------------------------
const deckView = (d) => ({
  S: 11, bounds: [-HX - 0.6, -HY - 0.6, HX + 0.6, HY + 0.6], top: DECK + 0.2, below: 1.8, shadow: [0.25, -0.1],
  light: d === 3 ? { base: 1.6, k: 1.8 } : d === 2 ? { base: 1.35, k: 1.7 } : { base: 1.15, k: 1.6 },
  edge: 0.2, shadeGround: [0.7, 0.66, 0.8], shadeObj: [0.82, 0.8, 0.9],
});
const DECK_NAMES = { 1: "Lower deck", 2: "Middle deck", 3: "Upper deck" };
const DECK_SUB = {
  1: "The largest animals, fresh water and fodder, low in the ship",
  2: "Beasts of the field, and the door in the side",
  3: "Birds, small animals and the family's quarters, under the window",
};
function deckScene(d) {
  return {
    title: `The Ark: ${DECK_NAMES[d].toLowerCase()}`,
    subtitle: DECK_SUB[d],
    short: DECK_NAMES[d].toLowerCase(),
    view: deckView(d),
    rot: 3,
    focus: [d === 3 ? 30 : 0, 0, 1],
    things: deckThings(d),
    floor: deckFloor(d),
    build: deckBuild(d),
    people: deckPeople(d),
    overlay: (t) => glows(FIRES, t),
    roster: true,
    story: { paras: [`${DECK_NAMES[d]} of three (Genesis 6:16). Each deck is 300 cubits long and about 10 cubits high.`, d === 3 ? "Daylight comes in through the window, a cubit-high gap under the roof." : "Below the window, the only light comes from oil lamps."] },
  };
}

mount({
  title: "Noah's Ark",
  subtitle: "300 cubits by 50 by 30, as described in Genesis 6",
  start: "outside",
  menu: [
    { scene: "outside", label: "outside" },
    { scene: "deck3", label: "upper deck" },
    { scene: "deck2", label: "middle deck" },
    { scene: "deck1", label: "lower deck" },
  ],
  scenes: {
    outside: {
      title: "Noah's Ark",
      subtitle: "The seventh day: the animals going in two by two (Genesis 7:7-10)",
      short: "outside",
      view: { S: 7, bounds: [-88, -45, 88, 23], top: RIDGE + 1, below: 0.4, shadow: [-0.85, -0.4], light: { dir: [0.34, 0.4, 1], base: 1.4, k: 2.0 }, edge: 0.3 },
      rot: 3,
      focus: [-5, -12, 4],
      things: OUT_THINGS,
      floor: outsideFloor,
      build: outsideBuild,
      people: outsidePeople,
      update: outsideUpdate,
      overlay: (t) => {
        cloudShade(t, { scale: 140, wind: [-4, 1.2], cover: 0.42, strength: 0.3 });
        glows(FIRES, t);
      },
      roster: true,
      story: { paras: ["“They went in unto Noah into the ark, two and two of all flesh, wherein is the breath of life” (Genesis 7:15).", "Seven days after Noah's family went in, the fountains of the great deep broke up and the rain began (7:10-11)."] },
    },
    deck3: deckScene(3),
    deck2: deckScene(2),
    deck1: deckScene(1),
  },
});
