// Fallingwater, c. 1940. See BRIEF.md for sources; the floors are traced in plan.js.
// x runs west -> east, y runs south -> north (metres, as on the HABS sheets); z up from the pool below
// the falls. Inside, each floor is drawn on its own with its floor at z = 0.
import { mount } from "../../engine/app.js";
import { box, cyl, sphere, patch, quad, rampOf, mFlat, mMottle, mBands, tone4, shadeTones, floorId, setId, hash, noise, bayerAt, clamp, rgb, glows, camDepth, lerp, setShadows } from "../../engine/render.js";
import { inPoly } from "../../engine/build.js";
import * as PL from "./plan.js";

const { X, Y, P, K, FLOORS, WD, WU, FL1, FL2, FL3, ROOF, TOWER, PLAT, SLAB } = PL;
const PI = Math.PI, HP = PI / 2;
const pick = (l) => l[Math.floor(Math.random() * l.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const LEVEL = { 1: FL1, 2: FL2, 3: FL3 };
const STOREY = { 1: FL2 - SLAB - FL1, 2: FL3 - SLAB - FL2, 3: ROOF - 0.35 - FL3 };
const inR = (x, y, r, m = 0) => x >= r[0] - m && x <= r[2] + m && y >= r[1] - m && y <= r[3] + m;
const cx = (r) => (r[0] + r[2]) / 2, cy = (r) => (r[1] + r[3]) / 2;

// ---- palette -----------------------------------------------------------------------------------
const CONC = [226, 202, 150]; // the trays: reinforced concrete painted a light ochre
const STONE = [150, 132, 108]; // Pottsville sandstone, quarried on the property
const RED = [156, 52, 40]; // "Cherokee red" steel window frames
const GLASS = [58, 74, 82];
const mConc = mMottle(CONC, 0.6, 0.18);
const mConcTop = mMottle(shadeTones(CONC)[3], 0.8, 0.12);
const mRed = mFlat(RED);
const mStone = (() => {
  // thin courses of rough-split stone, some sticking out: dark joints, light top edges
  const tones = [[150, 132, 108], [136, 122, 104], [164, 146, 118], [124, 112, 98], [158, 142, 124]].map(rampOf);
  return (l, u, v, px, py) => {
    const row = Math.floor(v / 0.09), t = v / 0.09 - row, len = 0.35 + 0.5 * hash(row, 3.1);
    const j = Math.floor((u + hash(row, 9.7) * 2) / len), s = (u + hash(row, 9.7) * 2) / len - j, h = hash(j, row);
    if (t < 0.16 + (h > 0.8 ? 0.2 : 0) || s < 0.03) return tones[3][clamp(Math.floor(l - 1.6), 0, 4)];
    const out = h > 0.86 ? 0.6 : 0;
    return tones[Math.floor(h * 5)][clamp(Math.floor(l + (t > 0.82 ? 0.7 : 0) + out + (bayerAt(px, py) - 0.5) * 0.5), 0, 4)];
  };
})();
const mStoneTop = mMottle(STONE, 0.3, 0.4);
// window walls: red mullions every 0.7 m, transoms at 0.9 m and 2.1 m, glass catching the sky
const mWin = (() => {
  const gl = rampOf(GLASS), fr = rampOf(RED);
  return (l, u, v, px, py) => {
    const mu = u % 0.7, d = (px + 2 * py) % 19;
    if (mu < 0.05 || v < 0.06 || Math.abs(v - 0.9) < 0.03 || Math.abs(v - 2.1) < 0.03) return fr[clamp(Math.floor(l + 0.2), 0, 4)];
    return gl[clamp(Math.floor(l + 0.4 + (d === 0 ? 1.8 : d < 3 ? 0.7 : 0) + (v > 2.1 ? 0.5 : 0)), 0, 4)];
  };
})();
const FLAG = [[118, 110, 98], [132, 124, 110], [146, 138, 122], [160, 152, 136]]; // waxed flagstone floors
function flag(x, y, px, py, bright = 0) {
  // irregular flags: a jittered grid, with dark joints between them
  const s = 0.62, gx = x / s, gy = y / s, ix = Math.floor(gx + 0.35 * noise(gy * 1.7, 3.3)), iy = Math.floor(gy + 0.35 * noise(gx * 1.7, 8.1));
  const fx = gx + 0.35 * noise(gy * 1.7, 3.3) - ix, fy = gy + 0.35 * noise(gx * 1.7, 8.1) - iy;
  if (fx < 0.06 || fy < 0.06) return rgb(84, 78, 70);
  const shine = (px + py * 3) % 29 === 0 ? 0.35 : 0;
  return tone4(FLAG, clamp(0.42 + bright + 0.4 * (hash(ix, iy) - 0.5) + shine, 0, 1), px, py);
}

// ---- the day ------------------------------------------------------------------------------------
const DAY = 360, START = 0.36;
const tod = (clock) => (clock / DAY + START) % 1;
const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function ambient(clock) {
  const t = tod(clock), NIGHT = [0.38, 0.44, 0.64], DAYL = [1, 1, 1], GOLD = [1.04, 0.9, 0.74];
  if (t < 0.22 || t > 0.88) return NIGHT;
  if (t < 0.28) return lerp3(NIGHT, GOLD, (t - 0.22) / 0.06);
  if (t < 0.34) return lerp3(GOLD, DAYL, (t - 0.28) / 0.06);
  if (t < 0.74) return DAYL;
  if (t < 0.81) return lerp3(DAYL, GOLD, (t - 0.74) / 0.07);
  return lerp3(GOLD, NIGHT, (t - 0.81) / 0.07);
}
const night = (t) => t > 0.9 || t < 0.25;
const DINNER = (t) => t > 0.8 && t < 0.86;
const SWIM = (t) => t > 0.56 && t < 0.66;

// ---- people ------------------------------------------------------------------------------------
const SK = { a: [228, 190, 158], b: [216, 172, 136], c: [196, 150, 116], d: [132, 92, 66] };
const CAST = {
  edgar: { name: "Edgar J. Kaufmann", role: "Owner of Kaufmann's department store, Pittsburgh", k: 1.0, girth: 1.05,
    desc: "He commissioned the house in 1934–35 as a weekend retreat on land the family already used for a summer camp.",
    look: { skin: SK.a, hair: [170, 160, 150], hairStyle: "thin", top: [110, 92, 70], shirt: [236, 232, 220], bottom: [120, 120, 116], shoes: [70, 50, 40] } },
  liliane: { name: "Liliane Kaufmann", role: "Edgar's wife", k: 0.95,
    desc: "The master bedroom, with its terrace over the falls, was hers.",
    look: { skin: SK.a, hair: [70, 50, 40], hairStyle: "bun", top: [176, 60, 56], bottom: [60, 60, 70], skirt: [60, 60, 70], legs: [210, 180, 160], shoes: [60, 40, 36] } },
  junior: { name: "Edgar Kaufmann jr.", role: "Their son", k: 1.02, girth: 0.9,
    desc: "He had been an apprentice in Wright's Taliesin Fellowship and introduced his parents to Wright. The third floor was his. In 1963 he gave the house to the Western Pennsylvania Conservancy.",
    look: { skin: SK.a, hair: [60, 44, 34], top: [70, 80, 96], shirt: [230, 226, 214], bottom: [196, 186, 160], shoes: [90, 66, 48] } },
  wright: { name: "Frank Lloyd Wright", role: "The architect, visiting; in his seventies", k: 0.94, girth: 0.9,
    desc: "He designed the house in 1935 after walking the site with the Kaufmanns. It was built in 1936–37, with the guest house added up the hill in 1939.",
    look: { skin: SK.a, hair: [236, 234, 228], top: [64, 60, 58], shirt: [240, 236, 226], bottom: [64, 60, 58], shoes: [40, 34, 30], mantle: [56, 52, 52], hat: [70, 64, 58], hatBrim: 0.14 } },
  guest: { name: "A weekend guest", role: "Friend of the family", k: 0.98,
    desc: "The Kaufmanns brought friends out from Pittsburgh for weekends in the Laurel Highlands.",
    look: { skin: SK.b, hair: [150, 110, 70], hairStyle: "shoulder", top: [220, 200, 120], bottom: [220, 200, 120], skirt: [220, 200, 120], legs: [210, 180, 160], shoes: [120, 80, 60] } },
  cook: { name: "The cook", role: "Household staff", k: 0.96, girth: 1.05,
    desc: "Meals were cooked in the kitchen against the hill on the north side; the servants' rooms were beside it.",
    look: { skin: SK.d, hair: [40, 32, 28], hairStyle: "bun", top: [240, 238, 232], bottom: [200, 196, 186], skirt: [200, 196, 186], legs: [120, 90, 70], shoes: [50, 44, 40] } },
  maid: { name: "A housemaid", role: "Household staff", k: 0.94,
    desc: "Kept the rooms, made the beds, and served at table.",
    look: { skin: SK.c, hair: [60, 44, 34], hairStyle: "bun", top: [60, 70, 90], bottom: [60, 70, 90], skirt: [60, 70, 90], legs: [150, 120, 100], shoes: [40, 34, 30] } },
  caretaker: { name: "The caretaker", role: "Looked after the grounds", k: 1.02,
    desc: "Raked the drive, kept the paths, and watched the stream after storms.",
    look: { skin: SK.b, hair: [110, 90, 70], top: [96, 110, 80], shortSleeve: true, shirt: [200, 190, 170], bottom: [80, 70, 60], shoes: [60, 46, 36], hat: [150, 130, 90], hatBrim: 0.16 } },
};
const SHORT = { edgar: "Mr. Kaufmann", liliane: "Mrs. Kaufmann", junior: "Edgar jr.", wright: "Wright", guest: "Guest", cook: "Cook", maid: "Maid", caretaker: "Caretaker" };
const add = (crowd, key, extra) => crowd.add({ key, ...CAST[key], short: SHORT[key], speed: 1.0, ...extra });

// ---- shared furniture helpers --------------------------------------------------------------------
let NAV = null, LIGHTS = [];
const block = (r, g = 0.1) => NAV && NAV.block(r[0], r[1], r[2], r[3], g);
const WOOD = [150, 104, 64]; // North Carolina black walnut built-ins
const mWood = mBands(WOOD, 0.12, 0.08, 0.5);
function cushionBench(r, z0, h, color) {
  box(r[0], r[1], z0, r[2], r[3], z0 + h - 0.12, mWood, mWood);
  box(r[0] + 0.03, r[1] + 0.03, z0 + h - 0.12, r[2] - 0.03, r[3] - 0.03, z0 + h, mFlat(color), mFlat(shadeTones(color)[1]));
  block(r);
}
function seat(x, y, z0, color, r = 0.24) {
  cyl(x, y, z0, z0 + 0.38, r, r, mFlat(shadeTones(color)[1]), mFlat(color)); // people sit on these, so they don't block
}
function desk(r, z0, h = 0.74) {
  box(r[0], r[1], z0 + h - 0.05, r[2], r[3], z0 + h, mWood, mWood);
  box(r[0], r[1], z0, r[0] + 0.06, r[3], z0 + h - 0.05, mWood, mWood);
  box(r[2] - 0.5, r[1], z0, r[2], r[3], z0 + h - 0.05, mWood, mWood);
  block(r);
}
function bed(r, z0, cover, head = "n") {
  box(r[0], r[1], z0, r[2], r[3], z0 + 0.42, mFlat([236, 232, 220]), mWood);
  const hr = { n: [r[0], r[3] - 0.45, r[2], r[3] - 0.08], s: [r[0], r[1] + 0.08, r[2], r[1] + 0.45], w: [r[0] + 0.08, r[1], r[0] + 0.45, r[3]], e: [r[2] - 0.45, r[1], r[2] - 0.08, r[3]] }[head];
  const cr = { n: [r[0], r[1], r[2], r[3] - 0.5], s: [r[0], r[1] + 0.5, r[2], r[3]], w: [r[0] + 0.5, r[1], r[2], r[3]], e: [r[0], r[1], r[2] - 0.5, r[3]] }[head];
  box(cr[0], cr[1], z0 + 0.42, cr[2], cr[3], z0 + 0.5, mFlat(cover), mFlat(shadeTones(cover)[1]));
  box(hr[0], hr[1], z0 + 0.42, hr[2], hr[3], z0 + 0.54, mFlat([246, 244, 238]), mFlat([246, 244, 238]));
  block(r, 0.05);
}
function shelves(r, z0, h) {
  const cols = [[176, 60, 50], [80, 96, 120], [210, 190, 140], [70, 96, 70], [140, 110, 80]].map(rampOf), sh = rampOf(WOOD);
  const books = (l, u, v) => {
    const row = Math.floor(v / 0.34), t = v - row * 0.34;
    if (t < 0.04) return sh[3];
    const b = Math.floor(u / 0.045), hh = hash(b, row);
    return t > 0.34 * (0.6 + 0.35 * hash(b, row + 5)) ? sh[1] : cols[Math.floor(hh * 5)][clamp(Math.floor(l + 0.3 * (hash(row, b) - 0.5)), 0, 4)];
  };
  box(r[0], r[1], z0, r[2], r[3], z0 + h, mWood, books);
  block(r);
}
function lounger(x, y, z0, yaw, color = [230, 120, 60]) {
  // a low chaise on the terraces
  const c = Math.cos(yaw), s = Math.sin(yaw), L = 0.9, W = 0.32;
  const r = [x - Math.abs(c) * L - Math.abs(s) * W, y - Math.abs(s) * L - Math.abs(c) * W, x + Math.abs(c) * L + Math.abs(s) * W, y + Math.abs(s) * L + Math.abs(c) * W];
  box(r[0], r[1], z0 + 0.18, r[2], r[3], z0 + 0.3, mFlat(color), mFlat(shadeTones(color)[1]));
  box(x + c * 0.7 - 0.3, y + s * 0.7 - 0.3, z0 + 0.3, x + c * 0.7 + 0.3, y + s * 0.7 + 0.3, z0 + 0.5, mFlat(color), mFlat(shadeTones(color)[1]));
  NAV && NAV.block(r[0], r[1], r[2], r[3], 0.05);
}
function planter(x, y, z0, s = 1) {
  box(x - 0.3 * s, y - 0.3 * s, z0, x + 0.3 * s, y + 0.3 * s, z0 + 0.4 * s, mConcTop, mConc);
  for (let i = 0; i < 5; i++) sphere(x + Math.cos(i * 2.4) * 0.14 * s, y + Math.sin(i * 2.4) * 0.14 * s, z0 + (0.55 + 0.1 * (i % 3)) * s, 0.2 * s, [[66, 110, 56], [86, 128, 64], [56, 94, 52]][i % 3], "rough");
}

// ================================================================================================
// THE SITE: Bear Run, the falls, the ledges and the wooded slopes, as a height field
// ================================================================================================
const SX = (x) => x / K + 170, SY = (y) => 600 - y / K; // world -> sheet pixels
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
function along(pts, x, ix, iy) {
  // value of pts[.][iy] at pts[.][ix] = x, linear between points (pts sorted on ix either way)
  const asc = pts[0][ix] < pts[pts.length - 1][ix], l = asc ? pts : [...pts].reverse();
  if (x <= l[0][ix]) return l[0][iy];
  for (let i = 1; i < l.length; i++) if (x <= l[i][ix]) return lerp(l[i - 1][iy], l[i][iy], (x - l[i - 1][ix]) / (l[i][ix] - l[i - 1][ix]));
  return l[l.length - 1][iy];
}
const hillY = (x) => along(PL.HILL, x, 0, 1);
const LIP_S = [[300, 425], [312, 470], [325, 520], [340, 555], [365, 580], [400, 595], [430, 600]];
const lipSX = (sy) => along(LIP_S, sy, 1, 0);
const nbD = (sx) => 455 + (300 - sx) * 0.12; // north bank of the stream below the falls
const sbD = (sx) => 640 + (300 - sx) * 0.08; // south bank below the falls
const sbU = (sx) => 588 + 8 * Math.sin(sx * 0.02); // south bank above the falls
const isDown = (sx, sy) => (sy >= 425 && sy <= 600 ? sx < lipSX(sy) : sy > 600 && sx < 440);

function heightRaw(x, y) {
  const sx = SX(x), sy = SY(y), n = noise(x * 0.35, y * 0.35) - 0.5, n2 = noise(x * 1.1 + 7, y * 1.1) - 0.5;
  const hy = hillY(x);
  if (y > hy) return FL1 - 0.15 + Math.min(5, (y - hy) * 0.7) + 0.8 * n * Math.min(1, (y - hy) / 3);
  if (sx < 300 && sy < nbD(sx)) {
    if (inPoly(x, y, PL.BOULDER)) return FL1 + 1.2 + 0.5 * n;
    if (sy < 330) return FL1 - 0.35 + 0.3 * n;
    const t = (sy - 330) / (nbD(sx) - 330), st = (Math.floor(t * 3) + smooth((t * 3 - Math.floor(t * 3) - 0.55) * 4)) / 3; // three ledges
    return lerp(FL1 - 0.35, WD + 0.1, st) + 0.2 * n2;
  }
  if (sy < 330) return FL1 - 0.15 + 0.1 * n;
  const down = isDown(sx, sy);
  if (!down && sy < 445) {
    if (sx > 620) return sy < 400 ? FL1 - 0.15 + 0.1 * n : lerp(FL1 - 0.15, WU - 0.4, smooth((sy - 400) / 42)) + 0.25 * n2;
    const a = sy < 360 ? lerp(FL1 - 0.15, WU + 0.5, smooth((sy - 330) / 30)) : sy < 437 ? WU + 0.5 + 0.15 * n2 : lerp(WU + 0.5, WU - 0.5, (sy - 437) / 8);
    if (sx < 590) return a;
    return lerp(a, sy < 400 ? FL1 - 0.15 : lerp(FL1 - 0.15, WU - 0.4, smooth((sy - 400) / 42)), (sx - 590) / 30);
  }
  const upSouth = (s) => WU - 0.2 + Math.min(FL1 + 2 - WU, (sy - sbU(s)) * K * 0.6) + 0.6 * n;
  if (!down) return sy < sbU(sx) ? WU - 0.5 + 0.2 * n2 : upSouth(sx);
  // below the falls
  if (sy < nbD(sx)) return lerp(WD + 0.1, WU - 0.3, smooth((nbD(sx) - sy) / 20)) + 0.2 * n2;
  if (sy < sbD(sx)) return 0.05 + 0.1 * n2;
  const dz = WD + Math.min(FL1 + 1.5 - WD, (sy - sbD(sx)) * K * 0.9) + 0.6 * n;
  if (sy > 600 && sx > 380) return lerp(dz, upSouth(Math.max(sx, 440)), smooth((sx - 380) / 100));
  return dz;
}
// paths: the drive (from the south, over the bridge, round under the trellis to the loggia) and the
// footpath downstream to the view of the house over the falls
const DRIVE = [[851, 790], [851, 600], [851, 415], [820, 375], [760, 335], [700, 300], [600, 268], [500, 255]].map(([a, b]) => P(a, b));
const VIEWPATH = [[836, 612], [720, 640], [600, 655], [470, 662], [380, 680], [300, 700], [235, 712]].map(([a, b]) => P(a, b));
const VIEWSPOT = P(232, 716);
function distPoly(x, y, pts) {
  let d = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return d;
}
// the height field, sampled once
const TC = 0.5, [TX0, TY0, TX1, TY1] = PL.SITE, TNX = Math.ceil((TX1 - TX0) / TC) + 1, TNY = Math.ceil((TY1 - TY0) / TC) + 1;
const HF = new Float32Array(TNX * TNY);
for (let j = 0; j < TNY; j++) for (let i = 0; i < TNX; i++) HF[j * TNX + i] = heightRaw(TX0 + i * TC, TY0 + j * TC);
function terrainZ(x, y) {
  const fi = clamp((x - TX0) / TC, 0, TNX - 1.001), fj = clamp((y - TY0) / TC, 0, TNY - 1.001), i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
  const k = j * TNX + i;
  return lerp(lerp(HF[k], HF[k + 1], u), lerp(HF[k + TNX], HF[k + TNX + 1], u), v);
}
// the diorama's edge: a rounded block, cut down to the pool level so the strata show
const SITE_C = [(TX0 + TX1) / 2, (TY0 + TY1) / 2], SITE_R = [(TX1 - TX0) / 2 - 0.6, (TY1 - TY0) / 2 - 0.6];
const inSite = (x, y) => ((x - SITE_C[0]) / SITE_R[0]) ** 4 + ((y - SITE_C[1]) / SITE_R[1]) ** 4 < 1;

const GROUND = [[[84, 104, 56], [98, 116, 62], [112, 126, 70], [128, 138, 80]], [[104, 92, 64], [118, 104, 72], [132, 116, 80], [146, 128, 90]], [[70, 96, 58], [82, 110, 64], [96, 122, 70], [110, 134, 78]]];
const mGround = (l, u, v, px, py) => {
  const w = noise(px * 0.21, py * 0.21), k = w < 0.4 ? 1 : w < 0.7 ? 0 : 2; // moss, leaf litter, ferns
  return tone4(GROUND[k], clamp(0.25 + 0.17 * (l - 2) + 0.35 * (hash(px >> 1, py >> 1) - 0.5), 0, 1), px, py);
};
const ROCK = [[118, 110, 98], [134, 124, 108], [150, 140, 122], [168, 158, 138]];
const mRock = (l, u, v, px, py) => tone4(ROCK, clamp(0.3 + 0.22 * (l - 2) + 0.3 * (noise(px * 0.3, py * 0.15) - 0.5) + ((py + (px >> 3)) % 7 === 0 ? -0.25 : 0), 0, 1), px, py);
const GRAVEL = [[150, 140, 120], [166, 156, 134], [180, 170, 148], [194, 184, 160]];
const mGravel = (l, u, v, px, py) => tone4(GRAVEL, clamp(0.4 + 0.15 * (l - 2) + 0.4 * (hash(px, py) - 0.5), 0, 1), px, py);
const mStrata = (l, u, v, px, py) => tone4(v % 0.7 < 0.1 ? [[90, 76, 60], [100, 84, 66], [110, 92, 72], [120, 100, 78]] : ROCK, clamp(0.25 + 0.2 * (l - 2) + 0.25 * (hash(px >> 1, py) - 0.5), 0, 1), px, py);
const WATER = [[44, 78, 88], [58, 96, 104], [78, 118, 124], [120, 156, 160]];
const mWater = (fast) => (l, u, v, px, py) => {
  const r = noise(px * 0.12, py * (fast ? 0.6 : 0.35));
  return tone4(WATER, clamp(0.38 + 0.12 * (l - 2) + 0.5 * (r - 0.5) + ((px * 7 + py * 13) % 41 === 0 ? 0.6 : 0), 0, 1), px, py);
};

function buildTerrain() {
  setId("woods");
  const wU = mWater(true), wD = mWater(false);
  for (let j = 0; j < TNY - 1; j++)
    for (let i = 0; i < TNX - 1; i++) {
      const x = TX0 + i * TC, y = TY0 + j * TC, xm = x + TC / 2, ym = y + TC / 2;
      if (!inSite(xm, ym)) continue;
      const k = j * TNX + i, z00 = HF[k], z10 = HF[k + 1], z01 = HF[k + TNX], z11 = HF[k + TNX + 1];
      const slope = Math.max(Math.abs(z10 - z00), Math.abs(z01 - z00), Math.abs(z11 - z10), Math.abs(z11 - z01)) / TC;
      const sx = SX(xm), sy = SY(ym), down = isDown(sx, sy), lvl = down ? WD : WU, zmin = Math.min(z00, z10, z01, z11);
      const onDrive = distPoly(xm, ym, DRIVE) < 1.5 && ym < hillY(xm), onPath = distPoly(xm, ym, VIEWPATH) < 0.7;
      let mat = slope > 1.0 ? mRock : onDrive ? mGravel : onPath ? mGravel : mGround;
      let id = slope > 1.0 ? "ledges" : onDrive ? "drive" : onPath ? "path" : inPoly(xm, ym, PL.BOULDER) ? "boulder" : "woods";
      if (inPoly(xm, ym, PL.BOULDER)) mat = slope > 0.6 ? mRock : mMottle([140, 132, 112], 0.3, 0.4);
      if (zmin < lvl + 0.02 && (down || sy > 430)) {
        setId(down ? "pool" : "bearRun");
        patch([x, y, lvl], [x + TC, y, lvl], [x, y + TC, lvl], [x + TC, y + TC, lvl], down ? wD : wU, [0, 0, 1]);
        if (Math.max(z00, z10, z01, z11) < lvl) continue;
      }
      setId(id);
      patch([x, y, z00], [x + TC, y, z10], [x, y + TC, z01], [x + TC, y + TC, z11], mat);
      // the cut edge of the block
      setId("ledges");
      const edge = (ax, ay, za, bx, by, zb, nx, ny) => {
        patch([ax, ay, -0.6], [bx, by, -0.6], [ax, ay, za], [bx, by, zb], mStrata, [nx, ny, 0]);
        if (down || sy > 430) {
          const wl = lvl;
          if (Math.min(za, zb) < wl) patch([ax, ay, Math.min(za, zb)], [bx, by, Math.min(za, zb)], [ax, ay, wl], [bx, by, wl], wD, [nx, ny, 0]);
        }
      };
      if (!inSite(xm, ym - TC)) edge(x, y, z00, x + TC, y, z10, 0, -1);
      if (!inSite(xm, ym + TC)) edge(x + TC, y + TC, z11, x, y + TC, z01, 0, 1);
      if (!inSite(xm - TC, ym)) edge(x, y + TC, z01, x, y, z00, -1, 0);
      if (!inSite(xm + TC, ym)) edge(x + TC, y, z10, x + TC, y + TC, z11, 1, 0);
    }
}
// The falls: water drawn every frame over the lip, so it moves.
let FALL_T = 0;
const mFalls = (() => {
  const w = rampOf([150, 190, 200]), f = rampOf([236, 244, 246]);
  return (l, u, v, px, py) => {
    const col = Math.floor(u / 0.06), ph = hash(col, 1.3), s = (((v * 1.4 - FALL_T * (1.8 + ph) + ph * 7) % 1) + 1) % 1;
    if (s < 0.3) return f[clamp(Math.floor(l + 0.6), 0, 4)];
    return w[clamp(Math.floor(l + (s < 0.55 ? 0.3 : -0.5) + (bayerAt(px, py) - 0.5) * 0.6), 0, 4)];
  };
})();
const LIP_W = PL.LIP;
function drawFalls(t) {
  FALL_T = t;
  for (let i = 0; i < LIP_W.length - 1; i++) {
    const [ax, ay] = LIP_W[i], [bx, by] = LIP_W[i + 1], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy), ox = dy / l, oy = -dx / l;
    quad(ax, ay, WU + 0.04, dx, dy, 0, ox * 0.9, oy * 0.9, WD - WU - 0.04, ox, oy, 0.35, mFalls);
  }
  // spray at the foot of the falls
  for (let i = 0; i < 14; i++) {
    const s = (i + 0.5) / 14, seg = Math.min(LIP_W.length - 2, Math.floor(s * (LIP_W.length - 1))), f = s * (LIP_W.length - 1) - seg;
    const [ax, ay] = LIP_W[seg], [bx, by] = LIP_W[seg + 1], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
    const ph = Math.sin(t * 5 + i * 2.1), x = lerp(ax, bx, f) + (dy / l) * (1.1 + 0.2 * ph), y = lerp(ay, by, f) - (dx / l) * (1.1 + 0.2 * ph);
    sphere(x, y, WD + 0.25 + 0.15 * Math.sin(t * 7 + i), 0.32 + 0.08 * ph, [236, 242, 244], "rough");
  }
}

// ================================================================================================
// THE HOUSE, from outside
// ================================================================================================
const mFlagTop = (x0, y0) => (l, u, v, px, py) => flag(x0 + u, y0 + v, px, py, 0.08 * (l - 2));
function tray(r, z, top) {
  box(r[0], r[1], z - SLAB, r[2], r[3], z, top, mConc);
}
function parapets(r, z, edges, h = 0.95, t = 0.22) {
  // a parapet continues the tray's outer face upward, so each tray reads as one deep band
  if (edges.includes("n")) box(r[0], r[3] - t, z, r[2], r[3], z + h, mConcTop, mConc);
  if (edges.includes("s")) box(r[0], r[1], z, r[2], r[1] + t, z + h, mConcTop, mConc);
  if (edges.includes("e")) box(r[2] - t, r[1], z, r[2], r[3], z + h, mConcTop, mConc);
  if (edges.includes("w")) box(r[0], r[1], z, r[0] + t, r[3], z + h, mConcTop, mConc);
}
const parapetStrips = (r, edges, t = 0.22) => [...edges].map((e) => ({ n: [r[0], r[3] - t, r[2], r[3]], s: [r[0], r[1], r[2], r[1] + t], e: [r[2] - t, r[1], r[2], r[3]], w: [r[0], r[1], r[0] + t, r[3]] })[e]);
const DECK = FL1 - 0.45, WALK_Z = [FL1 - 0.2, FL1 - 0.35];
function tree(x, y, s, kind) {
  const z = terrainZ(x, y);
  if (kind === "rhodo") {
    // rosebay rhododendron, the evergreen thicket along Bear Run, in bloom in early summer
    for (let i = 0; i < 6; i++) {
      const a = i * 2.4 + s, r = 0.5 * s;
      sphere(x + Math.cos(a) * r, y + Math.sin(a) * r, z + (0.55 + 0.25 * (i % 3)) * s, (0.5 + 0.12 * (i % 2)) * s, [[44, 84, 54], [56, 98, 62], [38, 74, 50]][i % 3], "rough");
      if (i % 2 === 0) sphere(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3, z + (0.95 + 0.2 * (i % 3)) * s, 0.13 * s, i % 4 ? [236, 196, 210] : [246, 236, 240], "rough");
    }
    NAV && NAV.block(x - 0.6 * s, y - 0.6 * s, x + 0.6 * s, y + 0.6 * s);
    return;
  }
  const H = (kind === "hemlock" ? 6 : 7) * s;
  cyl(x, y, z - 0.3, z + H * 0.75, 0.22 * s, 0.14 * s, mBands([96, 80, 66], 0.3, 0.2, 0.4, true), null);
  if (kind === "hemlock") {
    for (let i = 0; i < 5; i++) sphere(x, y, z + H * (0.35 + 0.14 * i), (1.5 - 0.26 * i) * s, [[38, 70, 56], [46, 82, 62]][i % 2], "rough");
  } else {
    const G = [[74, 112, 58], [92, 130, 66], [64, 100, 54]];
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39, r = (0.6 + 0.45 * (i % 3)) * s;
      sphere(x + Math.cos(a) * r, y + Math.sin(a) * r, z + H * 0.8 + (0.5 * (i % 4) - 0.6) * s, (1.05 + 0.25 * (i % 2)) * s, G[i % 3], "rough");
    }
  }
  NAV && NAV.block(x - 0.35 * s, y - 0.35 * s, x + 0.35 * s, y + 0.35 * s);
}
const HOUSE_ZONE = PL.R(150, 150, 740, 600);
const TREES = (() => {
  const list = [];
  for (let gy = TY0 + 1; gy < TY1 - 1; gy += 2.4)
    for (let gx = TX0 + 1; gx < TX1 - 1; gx += 2.4) {
      const h = hash(gx * 1.3, gy * 0.7), x = gx + (hash(gx, gy) - 0.5) * 2, y = gy + (hash(gy, gx) - 0.5) * 2, sx = SX(x), sy = SY(y);
      if (!inSite(x, y) || h < 0.3) continue;
      const SR = (TX1 - TX0) / 2, edge = ((x - SITE_C[0]) / SITE_R[0]) ** 4 + ((y - SITE_C[1]) / SITE_R[1]) ** 4;
      if (edge > 0.8) continue;
      if (inR(x, y, HOUSE_ZONE, 1.2) || inR(x, y, PL.BRIDGE.deck, 2) || PL.WALKS.some((w) => inR(x, y, w, 1.5))) continue;
      if (distPoly(x, y, DRIVE) < 2.6 || distPoly(x, y, VIEWPATH) < 1.6 || Math.hypot(x - VIEWSPOT[0], y - VIEWSPOT[1]) < 3) continue;
      if (inR(x, y, PL.R(400, 60, 540, 180), 1)) continue; // the bridge and stair up the hill
      const z = heightRaw(x, y), wet = isDown(sx, sy) ? z < WD + 0.4 : sy > 430 && z < WU + 0.3;
      if (wet) continue;
      const north = y > hillY(x) + 1.5, south = sy > 600;
      let kind = h > 0.8 ? "hemlock" : h > 0.55 ? "broad" : "rhodo";
      if (south && sx > 120 && sx < 960) kind = "rhodo"; // keep the view from the south open
      if (!north && !south && kind === "broad" && h < 0.7) kind = "rhodo";
      list.push([x, y, kind === "rhodo" ? 0.9 + 0.5 * hash(x, 2) : 0.8 + 0.45 * hash(y, 3), kind]);
    }
  return list;
})();

function buildHouse() {
  for (const f of [1, 2, 3]) {
    const L = LEVEL[f], F = FLOORS[f], H = STOREY[f];
    setId("trays");
    for (const r of F.interior) tray(r, L, mConcTop);
    for (const t of F.terraces) {
      setId(t.key);
      tray(t.r, L, mFlagTop(t.r[0], t.r[1]));
    }
    setId("parapets");
    for (const t of F.terraces) parapets(t.r, L, t.edges);
    setId("stone");
    for (const r of F.stone) box(r[0], r[1], L, r[2], r[3], L + H + SLAB, mStoneTop, mStone);
    setId("windows");
    for (const r of F.glass) box(r[0], r[1], L, r[2], r[3], L + H, mRed, mWin);
  }
  // ceilings of the lower floors (the trays above cover most of them)
  setId("trays");
  for (const r of FLOORS[1].interior) box(r[0], r[1], FL2 - SLAB, r[2], r[3], FL2 - 0.03, mConcTop, mConc);
  for (const r of FLOORS[2].interior) box(r[0], r[1], FL3 - SLAB, r[2], r[3], FL3 - 0.03, mConcTop, mConc);
  setId("roof");
  for (const r of PL.ROOFS) box(r[0], r[1], ROOF - 0.35, r[2], r[3], ROOF, mConcTop, mConc);
  setId("band");
  const B = PL.BAND;
  box(B[0], B[1], FL3 - 0.5, B[2], B[3], FL3 + 0.35, mConcTop, mConc);
  setId("chimney");
  const C = PL.R(307, 297, 332, 385);
  box(C[0], C[1], ROOF - 0.4, C[2], C[3], TOWER, mStoneTop, mStone);
  // the study's walls rise above the roof as a second, lower stone mass
  const S3 = PL.R(240, 222, 330, 237);
  box(S3[0], S3[1], ROOF - 0.4, S3[2], S3[3], ROOF + 1.1, mStoneTop, mStone);
  // under the living room: the bolsters on the ledge, and the foundation wall behind
  setId("bolsters");
  for (const r of PL.BOLSTERS) {
    const w = r[2] - r[0], z0 = WU + 0.3;
    box(r[0], r[1] + w / 2, z0, r[2], r[3], FL1 - SLAB, mConcTop, mConc);
    cyl(cx(r), r[1] + w / 2, z0, FL1 - SLAB, w / 2, w / 2, mConc, mConcTop, PI, 2 * PI);
  }
  setId("stone");
  const FW = PL.R(318, 328, 535, 336);
  box(FW[0], FW[1], WU + 0.3, FW[2], FW[3], FL1 - SLAB, mStoneTop, mStone);
  // the hatch: a stair hung from the living room floor down to a platform just above the water
  setId("hatchStair");
  const HS = PL.HATCH.stair, HP_ = PL.HATCH.platform, n = 12, run = (HS[2] - HS[0]) / n;
  for (let i = 0; i < n; i++) {
    const zt = FL1 - ((i + 1) * (FL1 - PLAT)) / (n + 1);
    box(HS[0] + i * run, HS[1] + 0.08, zt - 0.05, HS[0] + (i + 1) * run, HS[3] - 0.08, zt, mConcTop, mConc);
  }
  for (const y of [HS[1], HS[3] - 0.08]) patch([HS[0], y, FL1 - 0.1], [HS[2], y, PLAT + 0.05], [HS[0], y, FL1 + 0.2], [HS[2], y, PLAT + 0.4], mRed, [0, y === HS[1] ? -1 : 1, 0]);
  box(HP_[0], HP_[1], PLAT - 0.2, HP_[2], HP_[3], PLAT, mFlagTop(HP_[0], HP_[1]), mConc);
  for (const [x, y] of [[HP_[2] - 0.1, HP_[1] + 0.1], [HP_[2] - 0.1, HP_[3] - 0.1]]) box(x - 0.03, y - 0.03, PLAT, x + 0.03, y + 0.03, FL2 - 0.3, mRed, mRed);
  // trellises: over the hatch, over the drive (bent round a tree), and over the boulder
  setId("trellis");
  for (const r of PL.TRELLIS_HATCH) box(r[0], r[1], FL2 - 0.3, r[2], r[3], FL2 + 0.05, mConcTop, mConc);
  for (const r of PL.TRELLIS_DRIVE) {
    const near = PL.TRELLIS_TREES.find(([tx]) => Math.abs(cx(r) - tx) < 0.7);
    if (near) {
      box(r[0], r[1], FL2 - 0.25, r[2], near[1] - 0.75, FL2 + 0.1, mConcTop, mConc);
      box(r[0], near[1] + 0.75, FL2 - 0.25, r[2], r[3], FL2 + 0.1, mConcTop, mConc);
    } else box(r[0], r[1], FL2 - 0.25, r[2], r[3], FL2 + 0.1, mConcTop, mConc);
  }
  const TB = PL.R(478, 183, 690, 187);
  box(TB[0], TB[1], FL2 - 0.4, TB[2], TB[3], FL2 - 0.25, mConcTop, mConc); // the beam they rest on at the hill end
  for (const r of PL.TRELLIS_WEST) box(r[0], r[1], FL2 + 0.6, r[2], r[3], FL2 + 0.9, mConcTop, mConc);
  setId("trellisTree");
  for (const [x, y] of PL.TRELLIS_TREES) tree(x, y, 1.1, "broad");
  // the bridge over Bear Run, and the walk up from it to the loggia
  setId("bridge");
  const BD = PL.BRIDGE.deck;
  box(BD[0], BD[1], DECK - 0.45, BD[2], BD[3], DECK, mFlagTop(BD[0], BD[1]), mConc);
  for (const w of PL.BRIDGE.walls) box(w[0], w[1], DECK - 0.45, w[2], w[3], DECK + 0.85, mStoneTop, mStone);
  for (const r of [PL.R(805, 400, 897, 425), PL.R(805, 580, 897, 605)]) box(r[0], r[1], WU - 0.6, r[2], r[3], DECK - 0.45, mStoneTop, mStone);
  setId("walk");
  PL.WALKS.forEach((r, i) => box(r[0], r[1], WU - 0.3, r[2], r[3], WALK_Z[i], mFlagTop(r[0], r[1]), mStone));
  // the bridge at the second floor to the hillside, the half-round stair, and the canopy stepping up
  setId("canopy");
  const SP = P(490, 138);
  cyl(SP[0], SP[1], FL1, FL2 + 1.0, 1.55, 1.55, mStone, mStoneTop, -HP, HP);
  for (let k = 0; k < 3; k++) {
    const r = PL.R(418, 112 - 24 * (k + 1), 474, 112 - 24 * k), z = FL2 + 2.5 + 0.45 * k;
    box(r[0], r[1], z - 0.18, r[2], r[3], z, mConcTop, mConc);
    for (const x of [r[0] + 0.1, r[2] - 0.15]) box(x, r[1] + 0.1, terrainZ(x, r[1]) - 0.2, x + 0.06, r[1] + 0.16, z - 0.18, mRed, mRed);
  }
}

// ================================================================================================
// THE WEEKEND: one timetable for everyone, so every scene agrees on where people are
// ================================================================================================
const sp = (f, sx, sy, o = {}) => ({ f, x: X(sx), y: Y(sy), ...o });
const faceS = (sx, sy) => P(sx, sy);
const SIT = { sit: 1, right: "rest", left: "rest" };
const BED = (sx, sy, yaw) => [X(sx), Y(sy), yaw, 0.5];
const PLATFORM = PL.HATCH.platform;
const SPOTS = {
  // main floor
  fireA: sp(1, 360, 400, { face: faceS(331, 352), pose: SIT, label: "sitting by the fire" }),
  fireB: sp(1, 372, 345, { face: faceS(331, 352), pose: SIT, label: "sitting by the fire" }),
  fireC: sp(1, 481, 375, { yaw: PI, pose: SIT, label: "on the built-in seat by the east wall" }),
  hearthStand: sp(1, 354, 372, { face: faceS(337, 352), pose: { right: "point" }, label: "looking at the hearth boulder" }),
  southBench1: sp(1, 372, 516, { yaw: HP, pose: SIT, label: "on the window seat over the falls" }),
  southBench2: sp(1, 428, 516, { yaw: HP, pose: { sit: 1, right: "hold", left: "hold" }, item: "papers", label: "reading on the window seat" }),
  westSeat: sp(1, 322, 415, { yaw: 0, pose: { sit: 1, right: "hold", left: "hold" }, item: "papers", label: "reading by the west windows" }),
  hatchTop: sp(1, 500, 447, { yaw: -HP, pose: { right: "point" }, label: "looking down the hatch at the stream" }),
  dineW: sp(1, 364, 311, { yaw: 0, pose: { sit: 1, right: "hold", left: "rest" }, label: "at the table" }),
  dineE: sp(1, 426, 311, { yaw: PI, pose: { sit: 1, right: "hold", left: "rest" }, label: "at the head of the table" }),
  dineN1: sp(1, 384, 290, { yaw: -HP, pose: { sit: 1, right: "hold", left: "rest" }, label: "at the table" }),
  dineN2: sp(1, 406, 290, { yaw: -HP, pose: { sit: 1, right: "hold", left: "rest" }, label: "at the table" }),
  dineS1: sp(1, 395, 332, { yaw: HP, pose: { sit: 1, right: "point", left: "rest" }, label: "at the table, holding forth" }),
  serveDining: sp(1, 440, 311, { face: faceS(395, 311), pose: { right: "hold", left: "hold" }, item: "box", label: "serving at the table" }),
  tidyLiving: sp(1, 450, 480, { yaw: PI, pose: { right: "hold", left: "hold" }, label: "tidying the living room" }),
  kitchenStove: sp(1, 300, 250, { yaw: HP, pose: { right: "hold", left: "hold" }, label: "cooking" }),
  kitchenTable: sp(1, 289, 306, { yaw: HP, pose: { right: "hold", left: "hold" }, item: "basket", label: "preparing food" }),
  kitchenSink: sp(1, 268, 285, { yaw: PI, pose: { right: "hold", left: "hold" }, label: "washing up" }),
  servants1: sp(1, 212, 250, { yaw: -HP, pose: SIT, label: "resting in the servants' sitting room" }),
  terraceE1: sp(1, 565, 470, { out: true, yaw: 0, pose: { right: "rest", left: "rest" }, label: "on the east terrace, over Bear Run" }),
  terraceW1: sp(1, 268, 500, { out: true, yaw: PI, pose: { right: "rest", left: "rest" }, label: "on the west terrace, above the falls" }),
  // second floor
  masterLie: sp(2, 393, 356, { lie: BED(376, 334, 0), label: "asleep", night: true }),
  masterDesk: sp(2, 353, 383, { yaw: -HP, pose: { sit: 1, right: "type", left: "hold" }, label: "writing letters" }),
  masterRail: sp(2, 392, 566, { out: true, yaw: -HP, pose: { right: "rest", left: "rest" }, label: "on her terrace, over the falls" }),
  masterLounge: sp(2, 352, 455, { out: true, lie: [X(340), Y(470), 0, 0.3], label: "sunning on the terrace" }),
  dressingLie: sp(2, 274, 278, { lie: [X(286), Y(259), PI, 0.5], label: "asleep", night: true }),
  dressingDesk: sp(2, 281, 312, { yaw: -HP, pose: { sit: 1, right: "type", left: "hold" }, label: "going through the store's papers" }),
  westTerrace2: sp(2, 160, 250, { out: true, yaw: PI, pose: { right: "rest", left: "rest" }, label: "on the west terrace, over the boulder" }),
  guestLie: sp(2, 512, 356, { lie: [X(486), Y(368), HP, 0.5], label: "asleep", night: true }),
  guestTerrace: sp(2, 640, 392, { out: true, yaw: -HP, pose: { right: "point" }, label: "on the guest terrace, looking down Bear Run" }),
  makeMaster: sp(2, 393, 356, { face: faceS(393, 334), pose: { right: "hold", left: "hold" }, label: "making the bed" }),
  makeGuest: sp(2, 512, 356, { face: faceS(486, 356), pose: { right: "hold", left: "hold" }, label: "making the guest bed" }),
  makeDressing: sp(2, 274, 278, { face: faceS(274, 259), pose: { right: "hold", left: "hold" }, label: "making the bed" }),
  // third floor
  studyDesk: sp(3, 279, 280, { yaw: -HP, pose: { sit: 1, right: "type", left: "hold" }, label: "at his desk" }),
  studyShelves: sp(3, 270, 258, { yaw: PI, pose: { right: "hold", left: "hold" }, item: "papers", label: "taking down a book" }),
  alcoveLie: sp(3, 450, 291, { lie: [X(437), Y(270), 0, 0.5], label: "asleep", night: true }),
  makeAlcove: sp(3, 450, 291, { face: faceS(450, 270), pose: { right: "hold", left: "hold" }, label: "making the bed" }),
  terrace3a: sp(3, 470, 345, { out: true, yaw: -HP, pose: { right: "rest", left: "rest" }, label: "on the third-floor terrace" }),
  terrace3b: sp(3, 385, 345, { out: true, yaw: -HP, pose: { sit: 1, right: "hold", left: "hold" }, item: "papers", label: "reading on the terrace" }),
  gallery: sp(3, 352, 295, { yaw: -HP, pose: { right: "rest", left: "rest" }, label: "in the gallery" }),
  // outside
  bridge: sp(0, 851, 505, { face: P(420, 500), pose: { right: "rest", left: "rest" }, label: "on the bridge, looking at the house" }),
  bridge2: sp(0, 846, 455, { face: P(600, 500), pose: { right: "point" }, label: "watching the swimmers from the bridge" }),
  viewSpot: sp(0, 232, 716, { face: P(380, 480), pose: { sit: 1, right: "type", left: "hold" }, item: "papers", label: "sketching the house over the falls" }),
  viewStand: sp(0, 250, 702, { face: P(380, 480), pose: { right: "point" }, label: "looking up at the house from below the falls" }),
  drive1: sp(0, 560, 245, { yaw: PI, pose: { right: "hold", left: "hold" }, label: "raking the drive under the trellis" }),
  drive2: sp(0, 650, 268, { yaw: 0, pose: { right: "rest", left: "rest" }, label: "walking the drive" }),
  drive3: sp(0, 770, 335, { yaw: -HP, pose: { right: "hold", left: "hold" }, label: "clearing leaves from the drive" }),
  pathMid: sp(0, 600, 655, { face: P(450, 470), pose: { right: "rest", left: "rest" }, label: "walking down to the view of the falls" }),
  southDrive: sp(0, 851, 700, { yaw: -HP, pose: { right: "hold", left: "hold" }, label: "checking the drive after the rain" }),
  platform: sp(0, 560, 480, { tele: true, z: PLAT, yaw: -HP, pose: { right: "rest", left: "rest" }, label: "on the platform at the foot of the hatch stair" }),
  swim1: sp(0, 600, 486, { tele: true, lie: [X(600), Y(486), PI * 0.9, WU - 0.26], label: "swimming in Bear Run" }),
  swim2: sp(0, 640, 525, { tele: true, lie: [X(640), Y(525), -PI * 0.2, WU - 0.26], label: "swimming in Bear Run" }),
  swim3: sp(0, 590, 548, { tele: true, lie: [X(590), Y(548), PI * 0.5, WU - 0.26], label: "floating in Bear Run" }),
  away: { f: -1, label: "away" },
};
for (const k in SPOTS) SPOTS[k].key = k;
const KEYS = ["edgar", "liliane", "junior", "wright", "guest", "cook", "maid", "caretaker"];
const SEAT = { edgar: "dineE", liliane: "dineW", junior: "dineN1", wright: "dineS1", guest: "dineN2" };
function plan(key, t) {
  const slot = Math.floor(t * 40), r = hash(slot * 1.7 + 0.3, KEYS.indexOf(key) * 3.1 + 0.7), of = (l) => l[Math.floor(r * l.length) % l.length];
  const meal = (t > 0.33 && t < 0.37) || DINNER(t), dark = night(t);
  if (key === "cook") return dark ? "away" : of(["kitchenStove", "kitchenTable", "kitchenSink", ...(DINNER(t) ? ["kitchenStove"] : ["servants1"])]);
  if (key === "maid") {
    if (dark) return "away";
    if (meal || t < 0.33) return "serveDining";
    if (t < 0.48) return of(["makeMaster", "makeGuest", "makeDressing", "makeAlcove"]);
    return of(t > 0.86 ? ["kitchenSink"] : ["kitchenTable", "tidyLiving", "serveDining"]);
  }
  if (key === "caretaker") return dark || t > 0.84 || t < 0.28 ? "away" : of(["drive1", "drive2", "drive3", "bridge", "pathMid", "southDrive"]);
  if (meal) return SEAT[key];
  if (dark) return { edgar: "dressingLie", liliane: "masterLie", junior: "alcoveLie", wright: "guestLie", guest: "away" }[key];
  const T = {
    edgar: [["dressingDesk"], ["westSeat", "bridge", "terraceE1", "westTerrace2", "fireA"], ["swim1", "swim1", "platform"], ["masterRail", "fireA", "drive2", "terraceE1"], ["fireA"]],
    liliane: [["masterDesk"], ["masterLounge", "masterRail", "southBench1", "drive2"], ["swim2", "swim2", "platform"], ["masterLounge", "masterDesk", "southBench1", "masterRail"], ["fireB"]],
    junior: [["studyDesk"], ["studyDesk", "viewSpot", "terrace3a", "studyShelves"], ["swim3", "platform", "swim3"], ["viewSpot", "studyDesk", "terrace3b", "gallery"], ["westSeat"]],
    wright: [["hearthStand"], ["bridge", "viewStand", "hatchTop", "fireC", "guestTerrace"], ["bridge2", "terraceE1"], ["viewStand", "hearthStand", "terrace3a", "bridge"], ["fireC"]],
    guest: [["away"], ["southBench2", "terraceE1", "drive2", "guestTerrace"], ["swim1", "platform"], ["southBench2", "pathMid", "terraceW1"], ["southBench2"]],
  }[key];
  return of(t < 0.33 ? T[0] : t < 0.56 ? T[1] : SWIM(t) ? T[2] : t < 0.8 ? T[3] : T[4]);
}
// a task for standing, sitting or lying at a spot; zBase is the floor height (0 inside, the level outside)
function spotTask(s, zBase, direct) {
  if (s.lie) {
    const [lx, ly, lyaw, lz] = s.lie, lieTask = () => ({ direct: true, x: lx, y: ly, z: (zBase ?? 0) + lz, yaw: lyaw, pose: { lie: 1 }, dur: rand(8, 12), label: s.label, lying: true });
    if (direct) return lieTask();
    return { x: s.x, y: s.y, face: [lx, ly], dur: 0.6, label: s.night ? "going to bed" : s.label, walkLabel: s.night ? "going to bed" : "walking", then: lieTask };
  }
  return { x: s.x, y: s.y, yaw: s.yaw, face: s.face, pose: s.pose || {}, item: s.item, label: s.label, walkLabel: s.walk || "walking", dur: rand(6, 10), z: zBase ?? undefined, direct };
}
const stay = (a) => ({ dur: rand(5, 9), label: a.task.label, pose: a.task.pose, z: a.task.z, lying: a.task.lying, yaw: a.yaw, item: a.task.item });
function whereLabel(s, here) {
  if (!s || s.f < 0) return "not here";
  if (s.f === 0) return s.tele ? "down at Bear Run" : "outside";
  return s.f > here ? "upstairs" : "downstairs";
}

// ================================================================================================
// OUTSIDE: people on the drive, the bridge, the terraces and in the stream
// ================================================================================================
const F1_TER = FLOORS[1].terraces;
function outsideGround(x, y) {
  if (F1_TER.some((t) => inR(x, y, t.r))) return FL1;
  if (inR(x, y, PL.WALKS[0])) return WALK_Z[0];
  if (inR(x, y, PL.WALKS[1])) return WALK_Z[1];
  if (inR(x, y, PL.BRIDGE.deck)) return DECK;
  return terrainZ(x, y);
}
const HOUSE_RECTS = [...FLOORS[1].interior, ...FLOORS[1].stone];
function walkableOut(x, y) {
  if (!inSite(x, y)) return false;
  if (F1_TER.some((t) => inR(x, y, t.r)) || PL.WALKS.some((w) => inR(x, y, w)) || inR(x, y, PL.BRIDGE.deck)) return true;
  if (HOUSE_RECTS.some((r) => inR(x, y, r, 0.1))) return false;
  const sx = SX(x), sy = SY(y);
  if (sy < 345 && sx > 330 && sx < 940 && y < hillY(x) - 0.3) return true;
  if (sy > 590 && distPoly(x, y, DRIVE) < 1.3) return true;
  return distPoly(x, y, VIEWPATH) < 0.8 || Math.hypot(x - VIEWSPOT[0], y - VIEWSPOT[1]) < 1.6;
}
const LOGGIA = { x: X(565), y: Y(322) }, LANE_END = { x: X(851), y: Y(765) };
function outsideBrain(a, crowd) {
  const t = tod(crowd.clock), sk = plan(a.key, t), s = SPOTS[sk];
  if (a.spotKey === sk && a.task && !a.hidden && a.state === "do") return stay(a);
  a.spotKey = sk;
  const up = a.hidden || (a.task && a.task.z != null);
  if (!s || s.f < 0 || (s.f > 0 && !s.out)) {
    const home = a.key === "caretaker" || a.key === "guest" ? LANE_END : LOGGIA, lab = a.key === "caretaker" ? "gone home for the night" : a.key === "guest" ? "up at the guest house" : "indoors";
    if (up) (a.x = home.x), (a.y = home.y);
    return { x: home.x, y: home.y, hide: true, dur: 5, label: lab, walkLabel: a.key === "caretaker" ? "heading home" : "going indoors" };
  }
  if (s.tele || s.f > 0) {
    // the upper terraces and the stream are reached through the house: appear there
    const zb = s.f > 0 ? LEVEL[s.f] : 0;
    a.x = s.lie ? s.lie[0] : s.x;
    a.y = s.lie ? s.lie[1] : s.y;
    if (s.lie) return spotTask(s, zb, true);
    return { ...spotTask(s, zb, true), z: s.z ?? zb };
  }
  if (up) {
    const start = a.key === "caretaker" || a.key === "guest" ? LANE_END : LOGGIA;
    a.x = start.x;
    a.y = start.y;
  }
  return spotTask(s, null, false);
}
function outsidePeople(crowd) {
  crowd.ground = outsideGround;
  for (const k of ["edgar", "liliane", "junior", "wright", "guest", "caretaker"]) add(crowd, k, { x: LOGGIA.x, y: LOGGIA.y, yaw: 0, brain: outsideBrain });
}
function outsideBuild({ nav }) {
  NAV = nav;
  LIGHTS = [];
  const [x0, y0, x1, y1] = PL.SITE;
  nav.open(x0, y0, x1, y1);
  for (let x = x0; x < x1; x += 0.2) for (let y = y0; y < y1; y += 0.2) if (!walkableOut(x + 0.1, y + 0.1)) nav.block(x, y, x + 0.2, y + 0.2, 0);
  for (const t of F1_TER) for (const r of parapetStrips(t.r, t.edges)) nav.block(r[0], r[1], r[2], r[3], 0.05);
  for (const w of PL.BRIDGE.walls) nav.block(w[0], w[1], w[2], w[3], 0.05);
  buildTerrain();
  buildHouse();
  for (const [x, y, s, kind] of TREES) {
    setId(kind === "rhodo" ? "rhodo" : "trees");
    tree(x, y, s, kind);
  }
  setId(null);
  // window light at dusk
  for (const f of [1, 2, 3]) for (const r of FLOORS[f].rooms) LIGHTS.push({ x: cx(r.r), y: cy(r.r), z: LEVEL[f] + 1.2, r: 2.4, c: [170, 110, 40], k: 0.45, flicker: r.key === "living" });
}

// ================================================================================================
// INSIDE: each floor cut away on its own
// ================================================================================================
const CUT = 1.0;
function onSlab(f, x, y) {
  const F = FLOORS[f];
  return F.interior.some((r) => inR(x, y, r)) || F.terraces.some((t) => inR(x, y, t.r));
}
// a wall stays full height only where it is an outside wall on the far side of the floor
function farWall(f, r) {
  for (const [nx, ny] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (facesCameraN(nx, ny)) continue;
    const px = nx > 0 ? r[2] + 0.4 : nx < 0 ? r[0] - 0.4 : cx(r), py = ny > 0 ? r[3] + 0.4 : ny < 0 ? r[1] - 0.4 : cy(r);
    if (!onSlab(f, px, py)) return true;
  }
  return false;
}
const facesCameraN = (nx, ny) => camDepth(nx, ny) > camDepth(0, 0);
const HATCH_HOLE = PL.R(472, 453, 545, 497);
function floorPaint(f) {
  const F = FLOORS[f];
  return (x, y, px, py) => {
    if (f === 1 && inR(x, y, HATCH_HOLE)) {
      // looking down the hatch: the top of the stair, then the stream
      floorId("hatchStair", px, py);
      const u = (x - HATCH_HOLE[0]) / (HATCH_HOLE[2] - HATCH_HOLE[0]);
      if (u < 0.62) return tone4(shadeTones([150, 136, 110]), clamp(0.75 - u - ((x / 0.32) % 1 < 0.25 ? 0.35 : 0), 0, 1), px, py);
      return tone4(WATER, clamp(0.25 + 0.4 * (noise(px * 0.2, py * 0.5) - 0.5), 0, 1), px, py);
    }
    for (const t of F.terraces) if (inR(x, y, t.r)) return floorId(t.key, px, py), flag(x, y, px, py, 0.06);
    if (!F.interior.some((r) => inR(x, y, r))) return 0;
    const room = F.rooms.find((r) => inR(x, y, r.r));
    floorId(room ? room.key : null, px, py);
    if (room && (room.key.startsWith("bath") || room.key === "kitchen")) {
      const tile = (Math.floor(x / 0.3) + Math.floor(y / 0.3)) & 1;
      return tone4(shadeTones(room.key === "kitchen" ? [176, 150, 118] : [196, 170, 130]), 0.5 + (tile ? 0.12 : -0.1), px, py);
    }
    return flag(x, y, px, py, -0.04);
  };
}
function floorBuild(f) {
  return ({ nav }) => {
    NAV = nav;
    LIGHTS = [];
    const F = FLOORS[f], H = STOREY[f], [bx0, by0, bx1, by1] = VIEWS[f].bounds;
    nav.open(bx0, by0, bx1, by1);
    for (let x = bx0; x < bx1; x += 0.2) for (let y = by0; y < by1; y += 0.2) if (!onSlab(f, x + 0.1, y + 0.1) || (f === 1 && inR(x + 0.1, y + 0.1, HATCH_HOLE))) nav.block(x, y, x + 0.2, y + 0.2, 0);
    // the trays' edges, below the floor
    setId("trays");
    for (const r of [...F.interior, ...F.terraces.map((t) => t.r)]) box(r[0], r[1], -SLAB, r[2], r[3], -0.002, null, mConc);
    setId("parapets");
    for (const t of F.terraces) {
      parapets(t.r, 0, t.edges);
      for (const r of parapetStrips(t.r, t.edges)) nav.block(r[0], r[1], r[2], r[3], 0.08);
    }
    setId("stone");
    for (const r of F.stone) {
      box(r[0], r[1], 0, r[2], r[3], farWall(f, r) ? H : CUT, mStoneTop, mStone);
      nav.block(r[0], r[1], r[2], r[3], 0.1);
    }
    setId("partitions");
    for (const r of F.partitions || []) {
      box(r[0], r[1], 0, r[2], r[3], 1.1, mFlat([214, 200, 170]), mWood);
      nav.block(r[0], r[1], r[2], r[3], 0.1);
    }
    setId("windows");
    for (const r of F.glass) {
      box(r[0], r[1], 0, r[2], r[3], farWall(f, r) ? H : 0.9, mRed, mWin);
      nav.block(r[0], r[1], r[2], r[3], 0.1);
    }
    FURNISH[f]();
    setId(null);
  };
}
const RR = (a, b, c, d) => PL.R(a, b, c, d);
const FURNISH = {
  1: () => {
    // the hearth: the boulder the family used to sit on, left where it was and rising through the floor
    setId("hearth");
    const [hx, hy] = P(337, 352);
    for (let i = 0; i < 7; i++) sphere(hx + Math.cos(i * 2.2) * 0.35, hy + Math.sin(i * 2.2) * 0.45, 0.08 + 0.05 * (i % 2), 0.32 + 0.06 * (i % 3), [[132, 122, 104], [150, 138, 116], [118, 110, 96]][i % 3], "rough");
    NAV.block(hx - 0.6, hy - 0.7, hx + 0.6, hy + 0.7, 0.05);
    const FP = RR(331, 335, 334, 372);
    box(FP[0], FP[1], 0, FP[2], FP[3], 1.1, mFlat([40, 34, 30]), mFlat([30, 26, 24]));
    setId("kettle");
    const [kx, ky] = P(344, 366);
    box(kx - 0.02, ky - 0.02, 0, kx + 0.02, ky + 0.02, 0.9, mRed, mRed);
    box(kx - 0.02, ky - 0.4, 0.86, kx + 0.02, ky + 0.02, 0.9, mRed, mRed);
    sphere(kx, ky - 0.4, 0.62, 0.22, RED, "gloss");
    setId("builtins");
    cushionBench(RR(330, 522, 456, 538), 0, 0.42, [214, 120, 44]);
    cushionBench(RR(304, 385, 316, 445), 0, 0.42, [196, 64, 50]);
    cushionBench(RR(490, 345, 505, 405), 0, 0.42, [222, 170, 60]);
    seat(...P(360, 400), 0, [196, 64, 50]);
    seat(...P(372, 345), 0, [222, 170, 60]);
    shelves(RR(304, 447, 316, 452), 0, 1.2);
    setId("diningTable");
    desk(RR(372, 298, 418, 324), 0, 0.72);
    setId("chairs");
    for (const k of ["dineW", "dineE", "dineN1", "dineN2", "dineS1"]) {
      const s = SPOTS[k];
      cyl(s.x - Math.cos(s.yaw) * 0.12, s.y - Math.sin(s.yaw) * 0.12, 0, 0.42, 0.2, 0.2, mWood, mFlat([196, 64, 50]));
    }
    setId("kitchenFittings");
    for (const r of [RR(282, 232, 318, 240), RR(254, 240, 262, 300)]) {
      box(r[0], r[1], 0, r[2], r[3], 0.9, mFlat([226, 222, 210]), mFlat([200, 196, 186]));
      NAV.block(r[0], r[1], r[2], r[3], 0.08);
    }
    const ST = RR(292, 232, 308, 240);
    box(ST[0], ST[1], 0.9, ST[2], ST[3], 0.95, mFlat([60, 60, 64]), mFlat([60, 60, 64]));
    desk(RR(278, 286, 300, 300), 0, 0.86);
    setId("servantsRoom");
    seat(...P(212, 246), 0, [120, 110, 90], 0.2);
    // the hatch: glass lids over a stair down to Bear Run
    setId("planters");
    planter(...P(590, 538), 0, 0.9);
    planter(...P(244, 458), 0, 0.9);
    LIGHTS.push({ x: hx + 0.5, y: hy, z: 0.5, r: 4.5, c: [210, 120, 40], k: 0.75, flicker: true });
    for (const [a, b] of [[400, 520], [495, 375], [395, 307], [310, 415], [290, 270]]) LIGHTS.push({ ...{ x: X(a), y: Y(b) }, z: 1.2, r: 2.6, c: [170, 110, 44], k: 0.5 });
  },
  2: () => {
    setId("beds");
    bed(RR(372, 318, 414, 350), 0, [214, 120, 44], "e");
    bed(RR(258, 250, 292, 268), 0, [96, 110, 70], "w");
    bed(RR(472, 340, 500, 372), 0, [190, 70, 50], "n");
    setId("desks");
    desk(RR(338, 388, 368, 402), 0);
    desk(RR(262, 316, 300, 326), 0);
    seat(...P(353, 383), 0, [196, 64, 50], 0.18);
    seat(...P(281, 312), 0, [222, 170, 60], 0.18);
    setId("built-ins");
    shelves(RR(256, 238, 300, 243), 0, 1.6);
    shelves(RR(505, 395, 528, 408), 0, 0.9);
    setId("baths");
    for (const r of [RR(424, 350, 438, 378), RR(340, 230, 356, 244)]) box(r[0], r[1], 0, r[2], r[3], 0.5, mFlat([240, 240, 236]), mFlat([226, 226, 222]));
    setId("terraceFurniture");
    lounger(...P(352, 470), 0, 0, [214, 120, 44]);
    lounger(...P(352, 520), 0, 0, [222, 170, 60]);
    lounger(...P(600, 395), 0, -HP, [190, 70, 50]);
    planter(...P(450, 570), 0);
    planter(...P(690, 405), 0);
    planter(...P(90, 290), 0);
    for (const [a, b] of [[353, 390], [281, 312], [500, 400]]) LIGHTS.push({ x: X(a), y: Y(b), z: 1.1, r: 2.4, c: [170, 110, 44], k: 0.5 });
  },
  3: () => {
    setId("beds");
    bed(RR(434, 259, 468, 280), 0, [70, 96, 120], "e");
    setId("desks");
    desk(RR(258, 284, 300, 296), 0);
    seat(...P(279, 280), 0, [196, 64, 50], 0.18);
    setId("built-ins");
    shelves(RR(253, 240, 262, 275), 0, 1.9);
    shelves(RR(334, 284, 356, 288), 0, 1.0);
    setId("terraceFurniture");
    lounger(...P(420, 352), 0, PI, [214, 120, 44]);
    planter(...P(520, 372), 0);
    planter(...P(345, 372), 0);
    for (const [a, b] of [[279, 285], [450, 291]]) LIGHTS.push({ x: X(a), y: Y(b), z: 1.1, r: 2.4, c: [170, 110, 44], k: 0.5 });
  },
};
// the people of each floor, and how they come and go
const EXITS = {
  1: { up: sp(1, 460, 291), out: sp(1, 565, 322), hatch: sp(1, 466, 476), staff: sp(1, 212, 250), guest: sp(1, 565, 322) },
  2: { up: sp(2, 490, 290), down: sp(2, 490, 290), out: sp(2, 490, 290) },
  3: { down: sp(3, 398, 272) },
};
function insideBrain(f) {
  return (a, crowd) => {
    const t = tod(crowd.clock), sk = plan(a.key, t), s = SPOTS[sk];
    if (a.spotKey === sk && a.task && !a.hidden && a.state === "do") return stay(a);
    if (s && s.f === f) {
      a.spotKey = sk;
      if (a.hidden) {
        const e = EXITS[f].up || EXITS[f].down;
        if (a.key === "cook" || a.key === "maid") (a.x = EXITS[f].staff ? EXITS[f].staff.x : e.x), (a.y = EXITS[f].staff ? EXITS[f].staff.y : e.y);
      }
      return spotTask(s, 0, false);
    }
    a.spotKey = null;
    const E = EXITS[f];
    let e = E.up || E.down, walk = "going upstairs";
    if (f === 1) {
      if (!s || s.f < 0) (e = a.key === "cook" || a.key === "maid" ? E.staff : E.out), (walk = a.key === "cook" || a.key === "maid" ? "going to the servants' rooms" : "leaving");
      else if (s.f === 0) (e = s.tele ? E.hatch : E.out), (walk = s.tele ? "going down the hatch to swim" : "going outside");
    } else if (s && s.f >= 0 && s.f < f) walk = "going downstairs";
    if (a.hidden) (a.x = e.x), (a.y = e.y);
    return { x: e.x, y: e.y, hide: true, dur: 4, label: s && s.f >= 0 ? `${whereLabel(s, f)}: ${s.label}` : "away", walkLabel: walk };
  };
}
const FLOOR_CAST = { 1: ["edgar", "liliane", "junior", "wright", "guest", "cook", "maid"], 2: ["edgar", "liliane", "junior", "wright", "guest", "maid"], 3: ["junior", "wright", "liliane", "maid"] };
const floorPeople = (f) => (crowd) => {
  for (const k of FLOOR_CAST[f]) {
    const e = EXITS[f].up || EXITS[f].down;
    add(crowd, k, { x: e.x, y: e.y, yaw: 0, brain: insideBrain(f) });
  }
};

// ---- things --------------------------------------------------------------------------------------
const TERRACE_TEXT = {
  terraceW: ["West terrace", "Off the living room, cantilevered out over the top of the falls."],
  terraceE: ["East terrace", "Wrapped round the hatch, over Bear Run."],
  loggia: ["Loggia", "The covered way in from the drive."],
  terraceM: ["Master terrace", "The largest of the cantilevers, off Mrs. Kaufmann's bedroom, projecting over the falls."],
  terraceG: ["Guest terrace", "Off the guest bedroom, looking upstream toward the bridge."],
  terraceW2: ["West terrace", "Off Mr. Kaufmann's dressing room, above the boulder and the kitchen."],
  bridge2: ["Bridge", "From the second floor to the hillside, where a half-round stair climbs to the covered walk up to the guest house (1939)."],
  terrace3: ["Third-floor terrace", "Edgar jr.'s terrace, over his parents' rooms."],
};
const COMMON_THINGS = {
  trays: { name: "Concrete trays", text: "Reinforced concrete floors and terraces cantilevered from the stone piers, with deep parapets; painted a light ochre." },
  parapets: { name: "Parapets", text: "Each terrace's edge turns up into a parapet, so the floors read as stacked horizontal bands." },
  stone: { name: "Sandstone walls", text: "Local sandstone, quarried on the property and laid in thin courses, some stones left projecting." },
  windows: { name: "Window walls", text: "Steel casements painted Cherokee red. At some corners glass meets glass with no post." },
};
const ROOM_TEXT = {
  living: "The house is mostly this one room. The floor is flagstone, waxed to look wet, like rocks in the stream; the ceilings are low, to send the eye out to the woods.",
  dining: "The dining table stands at the north end of the living room, by the kitchen.",
  kitchen: "Against the hill on the north side, beside the servants' rooms.",
  servants: "Staff quarters next to the kitchen.",
  entry: "The front door comes in from the loggia under the trellis, into a low, dark entry before the big room opens up.",
  coats: "",
  hatch: "Glass panels slide back to open a stair down to Bear Run. It ends at a platform just above the water.",
  dressing: "Mr. Kaufmann slept here, next to his wife's room.",
  master: "Mrs. Kaufmann's room, with the fireplace on the chimney stack and the big terrace over the falls.",
  hall2: "", stair2: "", bathN: "", bathA: "", bathB: "", bath3: "", stair3: "",
  guest: "Wright stayed in this room on his visits.",
  study: "Edgar jr.'s study.",
  gallery: "A corridor of windows along the third floor.",
  alcove: "Edgar jr.'s bed, in an alcove off the gallery.",
};
function floorThings(f) {
  const th = { ...COMMON_THINGS, partitions: { name: "Partition", text: "" } };
  for (const r of FLOORS[f].rooms) th[r.key] = { name: r.name, text: ROOM_TEXT[r.key] || "" };
  for (const t of FLOORS[f].terraces) th[t.key] = { name: TERRACE_TEXT[t.key][0], text: TERRACE_TEXT[t.key][1] };
  Object.assign(th, {
    hearth: { name: "Hearth boulder", text: "The family used to sit on this boulder above the falls. Wright kept it where it was and built the fireplace round it; it is left unwaxed, so it looks dry beside the floor." },
    kettle: { name: "Kettle", text: "A red spherical kettle on a swinging arm, to heat over the fire." },
    builtins: { name: "Built-in seats", text: "Walnut and cushions along the windows and walls; most of the furniture is built in." },
    diningTable: { name: "Dining table", text: "" },
    chairs: { name: "Stools", text: "Three-legged stools for the table." },
    kitchenFittings: { name: "Kitchen", text: "Counters and the stove." },
    servantsRoom: { name: "Chair", text: "" },
    hatchStair: { name: "Hatch stair", text: "Hung from the floor, down to Bear Run." },
    bearRunBelow: { name: "Bear Run", text: "The stream, just below the house." },
    planters: { name: "Planter", text: "" },
    beds: { name: "Bed", text: "Low built-in beds of walnut." },
    desks: { name: "Desk", text: "" },
    "built-ins": { name: "Shelves", text: "" },
    baths: { name: "Bath", text: "The bathrooms are lined with cork." },
    terraceFurniture: { name: "Terrace chairs", text: "" },
    walls: { name: "Walls", text: "" },
  });
  return th;
}
const outsideThings = {
  ...Object.fromEntries(Object.entries(COMMON_THINGS).map(([k, v]) => [k, { ...v, enter: "floor1", enterLabel: "inside" }])),
  ...Object.fromEntries(Object.entries(TERRACE_TEXT).map(([k, [name, text]]) => {
    const f = FLOORS[1].terraces.some((t) => t.key === k) ? 1 : FLOORS[2].terraces.some((t) => t.key === k) ? 2 : 3;
    return [k, { name, text, enter: "floor" + f, enterLabel: "floor " + f }];
  })),
  roof: { name: "Roof", text: "Flat roofs over the third floor." },
  band: { name: "Third-floor band", text: "A long concrete band at the third level, shading the bedrooms below." },
  chimney: { name: "Chimney stack", sub: "about 33' above the main floor", text: "The stone core of the house: it carries the fireplaces of all three floors and rises highest of all.", enter: "floor1", enterLabel: "inside" },
  bolsters: { name: "Bolsters", text: "Four piers on the ledge under the living room. The floors cantilever out from them over the stream." },
  hatchStair: { name: "Hatch stair", text: "From the living room down to a platform just above the water, for swimming." },
  trellis: { name: "Trellis", text: "Concrete beams over the drive, the hatch and the boulder. Over the drive they bend round a tree that was already growing there." },
  trellisTree: { name: "Tree", text: "The trellis beams bend round it." },
  bridge: { name: "Bridge", text: "The drive crosses Bear Run here and arrives at the house's back door, under the trellis. Most first views of the house were from here." },
  walk: { name: "Walk", text: "Steps up from the bridge to the loggia and the front door." },
  canopy: { name: "Covered walk", text: "A canopy steps up the hill to the guest house of 1939 (beyond the edge of the model)." },
  woods: { name: "Woods", text: "Oak, tulip poplar, hemlock and rhododendron on the slopes of Bear Run." },
  trees: { name: "Tree", text: "" },
  rhodo: { name: "Rhododendron", text: "Rosebay rhododendron, thick along the stream, flowering in early summer." },
  ledges: { name: "Sandstone ledges", text: "The same rock the house is built of. The falls drop over one ledge; the house stands on the one above." },
  boulder: { name: "Boulder", text: "A big outcrop west of the kitchen, under the west terrace's trellis." },
  drive: { name: "Drive", text: "Up from the road, over the bridge and round under the trellis to the loggia." },
  path: { name: "Path", text: "Down the south bank to the classic view of the house over the falls." },
  bearRun: { name: "Bear Run", text: "A mountain stream in the Laurel Highlands. Above the falls it runs under the east terraces and the hatch." },
  pool: { name: "Below the falls", text: "From down here the terraces seem to float over the water." },
  house: { name: "Fallingwater", sub: "Frank Lloyd Wright, 1935–37", text: "A weekend house for the Kaufmann family of Pittsburgh, built over the falls of Bear Run rather than facing them.", enter: "floor1", enterLabel: "inside" },
};

function story(where) {
  const lead = {
    outside: "Fallingwater on Bear Run, traced from the Historic American Buildings Survey drawings: three floors of concrete terraces anchored to a stone core, cantilevered over the falls.",
    floor1: "The main floor: one big living room, with the kitchen against the hill. Walls are cut away to show the rooms. The hatch opens on a stair down to the stream.",
    floor2: "The second floor: the parents' bedrooms and the guest room, each with its own terrace.",
    floor3: "The third floor: Edgar jr.'s study, gallery and sleeping alcove, with a terrace over his parents' rooms.",
  }[where];
  return { paras: [lead, "A summer weekend about 1940, when the Kaufmanns came out from Pittsburgh to the woods they had long used for a summer camp. Frank Lloyd Wright is visiting.", "A day passes in six minutes. In the afternoon the family swims in Bear Run; dinner is at seven."] };
}

const VIEWS = {
  1: { S: 22, bounds: RR(165, 210, 725, 565), top: 2.8, below: 0.6, shadow: [0.3, -0.12], light: { base: 1.7, k: 1.8 }, edge: 0.12, shadeGround: [0.76, 0.72, 0.86], shadeObj: [0.86, 0.84, 0.92] },
  2: { S: 16, bounds: RR(60, 100, 720, 595), top: 2.6, below: 0.6, shadow: [0.3, -0.12], light: { base: 1.7, k: 1.8 }, edge: 0.12, shadeGround: [0.76, 0.72, 0.86], shadeObj: [0.86, 0.84, 0.92] },
  3: { S: 26, bounds: RR(225, 210, 545, 395), top: 2.2, below: 0.6, shadow: [0.3, -0.12], light: { base: 1.7, k: 1.8 }, edge: 0.12, shadeGround: [0.76, 0.72, 0.86], shadeObj: [0.86, 0.84, 0.92] },
};
const insideUpdate = (dt, crowd, api) => {
  const t = tod(crowd.clock);
  if (DINNER(t) && !crowd.dinnerSaid) (crowd.dinnerSaid = true), api.say("<b>Dinner</b><span>Seven o'clock: everyone gathers at the table at the north end of the living room.</span>");
  if (!DINNER(t)) crowd.dinnerSaid = false;
};
const floorScene = (f, title, short) => ({
  title: `Fallingwater: ${title}`, subtitle: "Mill Run, Pennsylvania, c. 1940", short,
  view: VIEWS[f], rot: 2, focus: [cx(VIEWS[f].bounds), cy(VIEWS[f].bounds), 0.5], things: floorThings(f), floor: floorPaint(f), build: floorBuild(f), people: floorPeople(f),
  update: f === 1 ? insideUpdate : undefined,
  overlay: (t) => {
    const tt = tod(t);
    if (tt > 0.76 || tt < 0.24) glows(LIGHTS, t);
  },
  ambient, roster: true, story: story("floor" + f),
});

mount({
  title: "Fallingwater",
  subtitle: "Mill Run, Pennsylvania, c. 1940",
  start: "outside",
  menu: [
    { scene: "outside", label: "outside" },
    { scene: "floor1", label: "main floor" },
    { scene: "floor2", label: "second floor" },
    { scene: "floor3", label: "third floor" },
  ],
  scenes: {
    outside: {
      title: "Fallingwater", subtitle: "Bear Run, Mill Run, Pennsylvania, c. 1940", short: "outside",
      view: { S: 11, bounds: PL.SITE, top: 21, below: 1.2, shadow: [-0.75, -0.4], light: { dir: [0.36, 0.42, 1], base: 1.5, k: 2.0 }, edge: 0.25 },
      rot: 2, focus: [X(470), Y(430), FL1], things: outsideThings, floor: () => 0, build: outsideBuild, people: outsidePeople,
      overlay: (t) => {
        drawFalls(t);
        const tt = tod(t);
        if (tt > 0.78 || tt < 0.24) glows(LIGHTS, t);
      },
      ambient, roster: true, story: story("outside"),
    },
    floor1: floorScene(1, "the main floor", "the main floor"),
    floor2: floorScene(2, "the second floor", "the second floor"),
    floor3: floorScene(3, "the third floor", "the third floor"),
  },
});
window.__fallingwater = { tod, plan, SPOTS, terrainZ, outsideGround, walkableOut };
