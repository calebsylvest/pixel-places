// Software isometric pixel renderer.
// Techniques adapted from the Forum Romanum diorama (distant-rapids-j68a.here.now): every surface is sampled into
// points and depth-tested into a pixel buffer, coloured from 5-step cool-to-warm ramps with Bayer
// dithering. Shadows come from a sun-skewed height map. The static scene is baked once per camera
// turn; each frame copies the bake, draws moving things on top, then runs edge shading and a
// colour grade.

export const SIN = 0.5, COS = Math.sqrt(3) / 2, R2 = Math.SQRT2, HP = Math.PI / 2;

// ---- view state (read-only outside this module) -------------------------------------------------
export let S = 20, W = 0, H = 0, ROT = 0;
let C = 1, Sn = 0, CX = 0, CY = 0, OX = 0, OY = 0;
let SHX = 0.5, SHY = -0.17;
let STEP = 0.03, EDGE = 0.15, GRADIENT_Y = 0;
let LX = -0.22, LY = 0.39, LZ = 1, LB = 1.45, LK = 2.15;
let SHADE_GROUND = [0.62, 0.6, 0.78], SHADE_OBJ = [0.8, 0.79, 0.9];
let HM0 = 0, HMC = 0.1, HMN = 0;

export let image, pix, zb, ids;
let bakedPix, bakedZ, ground, groundZ, shadowMask, staticShadow, pz, lit, hm;

// Clip rectangle (pixels). Full canvas while baking, the viewport while drawing frames.
export let KX0 = 0, KY0 = 0, KX1 = 0, KY1 = 0;
export let BAKE = false;
let SHADOWS = true;
let BIAS = 0;
/** Depth bias for decals mounted flat on another surface (windows, signs), so they always win. */
export function setBias(b) {
  BIAS = b;
}
/** Turn shadow casting off for see-through things (glass), then back on. */
export function setShadows(on) {
  SHADOWS = on;
}

// ---- colour helpers ------------------------------------------------------------------------------
export const rgb = (r, g, b) =>
  ((255 << 24) | (Math.min(255, Math.max(0, b | 0)) << 16) | (Math.min(255, Math.max(0, g | 0)) << 8) | Math.min(255, Math.max(0, r | 0))) >>> 0;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => t * t * (3 - 2 * t);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayerAt = (x, y) => BAYER[4 * (3 & y) + (3 & x)];
export function hash(x, y) {
  const h = 43758.5453 * Math.sin(127.1 * x + 311.7 * y);
  return h - Math.floor(h);
}
export function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = ease(x - ix), fy = ease(y - iy);
  return lerp(lerp(hash(ix, iy), hash(ix + 1, iy), fx), lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy);
}

const COOL = [46, 38, 84], WARM = [255, 232, 180];
const ramps = new Map();
/** Five packed colours from deep cool shadow (0) through base (3) to warm highlight (4). */
export function rampOf(c) {
  const key = c.join(",");
  let r = ramps.get(key);
  if (r) return r;
  const m = (k, to, t) => rgb(lerp(c[0] * k, to[0], t), lerp(c[1] * k, to[1], t), lerp(c[2] * k, to[2], t));
  r = [m(0.4, COOL, 0.34), m(0.62, COOL, 0.18), m(0.84, COOL, 0.05), m(1, WARM, 0), m(1.1, WARM, 0.22)];
  ramps.set(key, r);
  return r;
}
/** Pick a floor tone 0..1 from a 4-colour list, with dither. */
export function tone4(list, t, px, py) {
  return rgb(...list[clamp(Math.floor(4 * t + 0.7 * (bayerAt(px, py) - 0.5)), 0, 3)]);
}
export const shadeTones = (c) => [c.map((v) => 0.8 * v), c.map((v) => 0.9 * v), c.map((v) => 0.98 * v), c.map((v) => Math.min(255, 1.05 * v))];

// ---- materials ---------------------------------------------------------------------------------
// A material is (light, u, v, px, py) => packed colour, or 0 to leave the pixel empty.
// light is about 0..4 (3 = fully lit side), u/v are distances in metres along the surface.
const dz = (px, py, k = 0.45) => (bayerAt(px, py) - 0.5) * k;
export function mFlat(c, bias = 0) {
  const r = rampOf(c);
  return (l, u, v, px, py) => r[clamp(Math.floor(l + bias + dz(px, py, 0.5)), 0, 4)];
}
export function mSolid(c, bias = 0) {
  const r = rampOf(c);
  return (l) => r[clamp(Math.floor(l + bias), 0, 4)];
}
/** Mottled surface: per-cell random value shifts the light band. */
export function mMottle(c, cell = 0.4, amt = 0.5, bias = 0) {
  const r = rampOf(c);
  return (l, u, v, px, py) => r[clamp(Math.floor(l + bias + amt * (hash(Math.floor(u / cell), Math.floor(v / cell)) - 0.5) + dz(px, py, 0.35)), 0, 4)];
}
/** Horizontal or vertical banding (planks, slats, blinds). */
export function mBands(c, period, frac = 0.2, depth = 0.7, vertical = false, bias = 0) {
  const r = rampOf(c);
  return (l, u, v, px, py) => {
    const t = (vertical ? u : v) / period;
    return r[clamp(Math.floor(l + bias - (t - Math.floor(t) < frac ? depth : 0) + dz(px, py, 0.35)), 0, 4)];
  };
}
/** Combine: pick material by a predicate on the surface coords. */
export const mSplit = (test, a, b) => (l, u, v, px, py) => (test(u, v) ? a : b)(l, u, v, px, py);

// ---- camera ------------------------------------------------------------------------------------
export function setRot(r) {
  ROT = ((r % 4) + 4) % 4;
  C = [1, 0, -1, 0][ROT];
  Sn = [0, 1, 0, -1][ROT];
}
export function toR(x, y) {
  const a = x - CX, b = y - CY;
  return [C * a + Sn * b, -Sn * a + C * b];
}
export function fromR(a, b) {
  return [C * a - Sn * b + CX, Sn * a + C * b + CY];
}
export function project(a, b, z) {
  const s = (a + b) / R2;
  return { sx: OX - ((a - b) / R2) * S, sy: OY + (s * SIN - z * COS) * S, d: s * COS + z * SIN };
}
export function projectP(x, y, z) {
  const [a, b] = toR(x, y);
  return project(a, b, z);
}
/** World point under a canvas pixel on the plane z (default floor). */
export function unproject(px, py, z = 0) {
  const u = (OX - px - 0.5) / S, v = ((py + 0.5 - OY) / S + z * COS) / SIN;
  return fromR((u + v) / R2, (v - u) / R2);
}
/** Larger = nearer the camera. */
export function camDepth(x, y) {
  const [a, b] = toR(x, y);
  return a + b;
}
/** True if a surface with this outward (world) normal faces the camera. */
export function facesCamera(nx, ny) {
  return C * nx + Sn * ny + (-Sn * nx + C * ny) > 0.01;
}

// ---- scene setup -------------------------------------------------------------------------------
/**
 * Size the buffers for a scene. bounds = [x0, y0, x1, y1] in metres; S = pixels per metre;
 * top/below = tallest point above and deepest point below the floor, in metres.
 */
export function configure(o) {
  S = o.S;
  const [x0, y0, x1, y1] = o.bounds;
  CX = (x0 + x1) / 2;
  CY = (y0 + y1) / 2;
  const half = (x1 - x0 + (y1 - y0)) / 2 / R2, m = o.margin ?? 16, top = o.top ?? 4, below = o.below ?? 1;
  W = Math.ceil(2 * half * S) + 2 * m;
  OX = W / 2;
  OY = m + top * COS * S + half * S * SIN;
  H = Math.ceil(OY + half * S * SIN + below * COS * S + m);
  [SHX, SHY] = o.shadow || [0.5, -0.17];
  const L = o.light || {};
  [LX, LY, LZ] = L.dir || [-0.22, 0.39, 1];
  LB = L.base ?? 1.45;
  LK = L.k ?? 2.15;
  SHADE_GROUND = o.shadeGround || [0.62, 0.6, 0.78];
  SHADE_OBJ = o.shadeObj || [0.8, 0.79, 0.9];
  STEP = Math.min(0.11, 0.62 / S);
  EDGE = o.edge ?? 0.15;
  GRADIENT_Y = COS / (S * SIN);
  HMC = o.hmCell ?? Math.max(0.05, 2 / S);
  const reach = Math.max(x1 - x0, y1 - y0) / 2 + top * Math.max(Math.abs(SHX), Math.abs(SHY)) + 2;
  HM0 = -reach;
  HMN = Math.ceil((2 * reach) / HMC);
  const n = W * H;
  image = new ImageData(W, H);
  pix = new Uint32Array(image.data.buffer);
  zb = new Float32Array(n);
  ids = new Uint16Array(n);
  bakedPix = new Uint32Array(n);
  bakedZ = new Float32Array(n);
  ground = new Uint8Array(n);
  groundZ = new Float32Array(n);
  shadowMask = new Uint8Array(n);
  staticShadow = new Uint8Array(n);
  pz = new Float32Array(n);
  lit = new Uint8Array(n);
  hm = new Float32Array(HMN * HMN);
  vigW = vigH = -1;
}

// ---- things (named, hoverable parts of the scene) ---------------------------------------------
export const THINGS = [null];
const THING_KEYS = {};
let CUR = 0;
/** Register a describable thing. info = { name, sub, text, enter }. */
export function thing(key, info) {
  if (THING_KEYS[key]) return Object.assign(THINGS[THING_KEYS[key]], info);
  THING_KEYS[key] = THINGS.length;
  THINGS.push(Object.assign({ key }, info));
}
/** Everything drawn after this call is tagged with the thing (null for untagged). */
export function setId(key) {
  CUR = key == null ? 0 : THING_KEYS[key] || 0;
  if (key != null && !CUR) console.warn("unknown thing", key);
}
export function thingAt(px, py) {
  if (px < 0 || py < 0 || px >= W || py >= H) return null;
  return THINGS[ids[py * W + px]] || null;
}
export function resetThings() {
  THINGS.length = 1;
  for (const k in THING_KEYS) delete THING_KEYS[k];
  CUR = 0;
}

// ---- primitives --------------------------------------------------------------------------------
function heightAt(a, b, z) {
  if (!SHADOWS) return;
  const i = ((a + SHX * z - HM0) / HMC) | 0, j = ((b + SHY * z - HM0) / HMC) | 0;
  if (i >= 0 && j >= 0 && i < HMN && j < HMN) {
    const k = j * HMN + i;
    if (hm[k] < z) hm[k] = z;
  }
}
function putM(x, y, z, mat, light, u, v) {
  const xa = x - CX, ya = y - CY, a = C * xa + Sn * ya, b = -Sn * xa + C * ya;
  heightAt(a, b, z);
  const s = (a + b) / R2, sx = OX - ((a - b) / R2) * S, sy = OY + (s * SIN - z * COS) * S;
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return;
  const px = sx | 0, py = sy | 0, k = py * W + px, d = s * COS + z * SIN + BIAS;
  if (d <= zb[k]) return;
  const col = mat(light, u, v, px, py);
  if (!col) return;
  zb[k] = d;
  pix[k] = col;
  ids[k] = CUR;
  pz[k] = z;
  lit[k] = 10 * light;
}
function shadeN(nx, ny, nz) {
  const a = C * nx + Sn * ny, b = -Sn * nx + C * ny;
  return [a + b, LB + LK * (a * LX + b * LY + nz * LZ)];
}
function shadowOnly(x, y, z, ax, ay, az, bx, by, bz, mask) {
  const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz);
  const nu = Math.max(1, Math.ceil(la / (HMC * 1.5))), nv = Math.max(1, Math.ceil(lb / (HMC * 1.5)));
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) {
      const p = i / nu, q = j / nv;
      if (mask && !mask(p * la, q * lb)) continue;
      const zz = z + az * p + bz * q, xa = x + ax * p + bx * q - CX, ya = y + ay * p + by * q - CY;
      heightAt(C * xa + Sn * ya, -Sn * xa + C * ya, zz);
    }
}
/**
 * A parallelogram from corner (x,y,z) spanned by edge vectors a and b, with outward normal n.
 * u runs along a and v along b, in metres. mask(u, v) can cut holes.
 */
export function quad(x, y, z, ax, ay, az, bx, by, bz, nx, ny, nz, mat, mask) {
  if (!mat) return;
  const [facing, light] = shadeN(nx, ny, nz);
  if (facing <= 0.02 && nz < 0.3) return void shadowOnly(x, y, z, ax, ay, az, bx, by, bz, mask);
  const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz);
  const nu = Math.max(1, Math.ceil(la / STEP)), nv = Math.max(1, Math.ceil(lb / STEP));
  for (let i = 0; i <= nu; i++) {
    const p = i / nu, u = p * la;
    for (let j = 0; j <= nv; j++) {
      const q = j / nv, v = q * lb;
      if (mask && !mask(u, v)) continue;
      putM(x + ax * p + bx * q, y + ay * p + by * q, z + az * p + bz * q, mat, light, u, v);
    }
  }
}
/**
 * Axis-aligned box. top/side are materials (top may be null). faces = { n, s, e, w } overrides
 * per side (n = +y, s = -y, e = +x, w = -x). On every side face u runs left-to-right as seen from
 * outside and v runs up from the bottom.
 */
export function box(x0, y0, z0, x1, y1, z1, top, side, faces = {}) {
  const dx = x1 - x0, dy = y1 - y0, dh = z1 - z0;
  if (top) quad(x0, y0, z1, dx, 0, 0, 0, dy, 0, 0, 0, 1, top);
  quad(x1, y1, z0, -dx, 0, 0, 0, 0, dh, 0, 1, 0, faces.n || side);
  quad(x0, y0, z0, dx, 0, 0, 0, 0, dh, 0, -1, 0, faces.s || side);
  quad(x1, y0, z0, 0, dy, 0, 0, 0, dh, 1, 0, 0, faces.e || side);
  quad(x0, y1, z0, 0, -dy, 0, 0, 0, dh, -1, 0, 0, faces.w || side);
}
/** Cylinder or cone frustum around a vertical axis, with an optional top cap. */
export function cyl(x, y, z0, z1, r0, r1, mat, capMat = mat, a0 = 0, a1 = 2 * Math.PI) {
  const h = z1 - z0, rm = Math.max(r0, r1);
  const nu = Math.max(6, Math.ceil(((a1 - a0) * rm) / STEP)), nv = Math.max(1, Math.ceil(Math.hypot(h, r1 - r0) / STEP));
  for (let i = 0; i <= nu; i++) {
    const t = a0 + ((a1 - a0) * i) / nu, cs = Math.cos(t), sn = Math.sin(t);
    const slope = (r0 - r1) / Math.max(1e-6, h);
    const [facing, light] = shadeN(cs, sn, slope * 0.6);
    const back = facing <= 0.02;
    for (let j = 0; j <= nv; j++) {
      const q = j / nv, r = lerp(r0, r1, q), z = z0 + h * q, px = x + cs * r, py = y + sn * r;
      if (back) {
        const xa = px - CX, ya = py - CY;
        heightAt(C * xa + Sn * ya, -Sn * xa + C * ya, z);
      } else putM(px, py, z, mat, light, t * rm, q * h);
    }
  }
  if (capMat && r1 > 0) disc(x, y, z1, r1, capMat);
}
export function disc(x, y, z, r, mat) {
  const [, light] = shadeN(0, 0, 1);
  const nr = Math.max(1, Math.ceil(r / STEP));
  for (let i = 0; i <= nr; i++) {
    const rr = (r * i) / nr, na = Math.max(1, Math.ceil((2 * Math.PI * rr) / STEP));
    for (let j = 0; j < na; j++) {
      const t = (2 * Math.PI * j) / na;
      putM(x + Math.cos(t) * rr, y + Math.sin(t) * rr, z, mat, light, x + Math.cos(t) * rr, y + Math.sin(t) * rr);
    }
  }
}

// Screen-space dithered sphere. Used for people, foliage, small round things.
export function sphere(x, y, z, r, color, mode = "solid") {
  const ramp = rampOf(color), p = projectP(x, y, z), rr = Math.max(r * S, 0.75);
  const y0 = Math.max(KY0, Math.floor(p.sy - rr)), y1 = Math.min(KY1 - 1, Math.ceil(p.sy + rr));
  const x0 = Math.max(KX0, Math.floor(p.sx - rr)), x1 = Math.min(KX1 - 1, Math.ceil(p.sx + rr));
  for (let py = y0; py <= y1; py++)
    for (let px = x0; px <= x1; px++) {
      const u = (px + 0.5 - p.sx) / rr, v = (py + 0.5 - p.sy) / rr, q = u * u + v * v;
      if (q > 1) continue;
      const h = Math.sqrt(1 - q), d = p.d + r * h, k = py * W + px;
      if (d <= zb[k]) continue;
      let l = clamp(-0.55 * u - 0.6 * v + 0.58 * h, 0, 1);
      if (mode === "rough") l += 0.55 * (hash(px, py) - 0.5);
      if (v > 0.35) l = Math.max(l, 0.12 + 0.24 * v);
      zb[k] = d;
      pix[k] =
        mode === "gloss" && l > 0.86
          ? rgb(255, 248, 214)
          : mode === "solid"
            ? ramp[clamp(Math.floor(4.4 * l + 0.2), 1, 4)]
            : ramp[clamp(Math.floor(4.4 * l + 0.2 + 0.7 * (bayerAt(px, py) - 0.5)), 0, 4)];
      if (BAKE) {
        ids[k] = CUR;
        pz[k] = z;
        lit[k] = 30;
      }
    }
  if (BAKE) {
    const [a, b] = toR(x, y);
    for (let i = -r; i <= r; i += HMC) for (let j = -r; j <= r; j += HMC) if (i * i + j * j <= r * r) heightAt(a + i, b + j, z + r * 0.6);
  }
}
/** Chain of spheres from p to q (world [x,y,z]), radius r0 -> r1. */
export function capsule(p, q, r0, r1, color, mode) {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  const n = Math.max(1, Math.ceil(len / (0.45 * Math.min(r0, r1))));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    sphere(lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t), lerp(r0, r1, t), color, mode);
  }
}

// ---- moving shadows ----------------------------------------------------------------------------
export const pendingShadows = [];
/** Soft ground blob for something of radius r at height z (world coords). */
export function castShadow(x, y, z, r, strength = 1, fuzz = 0.4) {
  const [a, b] = toR(x, y), p = project(a + SHX * z, b + SHY * z, 0);
  const rx = r * S * 1.05, ry = rx * SIN + 1;
  const y0 = Math.max(KY0, Math.floor(p.sy - ry)), y1 = Math.min(KY1 - 1, Math.ceil(p.sy + ry));
  const x0 = Math.max(KX0, Math.floor(p.sx - rx)), x1 = Math.min(KX1 - 1, Math.ceil(p.sx + rx));
  for (let py = y0; py <= y1; py++)
    for (let px = x0; px <= x1; px++) {
      const u = (px + 0.5 - p.sx) / rx, v = (py + 0.5 - p.sy) / ry;
      if (u * u + v * v + (bayerAt(px, py) - 0.5) * fuzz > 1) continue;
      const k = py * W + px;
      if (shadowMask[k] < strength) shadowMask[k] = strength;
    }
}
function flushShadows() {
  for (let i = 0; i < pendingShadows.length; i += 4) {
    const p = pendingShadows[i], r = pendingShadows[i + 1], q = pendingShadows[i + 2];
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) / 0.12));
    for (let j = 0; j <= n; j++) {
      const t = j / n;
      castShadow(lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t), 0.9 * r, 1, 0);
    }
  }
  pendingShadows.length = 0;
}
function tint(k, r, g, b) {
  const c = pix[k];
  pix[k] = rgb((255 & c) * r, ((c >> 8) & 255) * g, ((c >> 16) & 255) * b);
}
function applyShadows() {
  const [r, g, b] = SHADE_GROUND;
  for (let y = KY0; y < KY1; y++)
    for (let k = y * W + KX0, e = y * W + KX1; k < e; k++) {
      const m = shadowMask[k];
      if (!m) continue;
      shadowMask[k] = 0;
      if (ground[k] && zb[k] === groundZ[k] && !staticShadow[k]) tint(k, r * 1.05, g * 1.05, b * 1.02);
    }
}
function shadeEdges() {
  for (let y = Math.max(1, KY0); y < Math.min(H - 1, KY1); y++)
    for (let x = Math.max(1, KX0); x < Math.min(W - 1, KX1); x++) {
      const k = y * W + x, d = zb[k];
      if (d < -1e8 || d === groundZ[k]) continue;
      const up = k - W, dn = k + W, lf = k - 1, rt = k + 1;
      if (zb[up] === groundZ[up] || zb[dn] === groundZ[dn] || zb[lf] === groundZ[lf] || zb[rt] === groundZ[rt]) tint(k, 0.68, 0.66, 0.76);
      else if (d - zb[up] - GRADIENT_Y > EDGE || d - zb[lf] > EDGE) {
        const c = pix[k];
        pix[k] = rgb(lerp(255 & c, WARM[0], 0.42), lerp((c >> 8) & 255, WARM[1], 0.38), lerp((c >> 16) & 255, WARM[2], 0.22));
      } else if (zb[rt] - d > EDGE || zb[dn] - GRADIENT_Y - d > EDGE) tint(k, 0.74, 0.72, 0.82);
    }
}
function bakeOcclusion() {
  const taps = [];
  for (const r of [2, 4]) for (let i = 0; i < 8; i++) taps.push([Math.round(Math.cos((i * Math.PI) / 4) * r), Math.round(Math.sin((i * Math.PI) / 4) * r * 0.7)]);
  for (let y = 4; y < H - 4; y++)
    for (let x = 4; x < W - 4; x++) {
      const k = y * W + x;
      if (!ground[k] || zb[k] !== groundZ[k]) continue;
      let n = 0;
      for (const [dx, dy] of taps) {
        const j = (y + dy) * W + x + dx;
        if (zb[j] !== groundZ[j] && zb[j] > groundZ[j]) n++;
      }
      if (n) n >= 8 ? tint(k, 0.7, 0.68, 0.8) : n / 8 > bayerAt(x, y) && tint(k, 0.84, 0.82, 0.9);
    }
}

// ---- bake --------------------------------------------------------------------------------------
/**
 * Render the static scene. floor(x, y, px, py) colours the z=0 plane (return 0 for empty);
 * build() draws everything else with the primitives above.
 */
export function bake(floor, build) {
  BAKE = true;
  KX0 = 0; KY0 = 0; KX1 = W; KY1 = H;
  zb.fill(-1e9);
  pix.fill(rgb(255, 255, 255));
  hm.fill(-1);
  ids.fill(0);
  ground.fill(0);
  shadowMask.fill(0);
  staticShadow.fill(0);
  pz.fill(0);
  pendingShadows.length = 0;
  CUR = 0;
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const u = (OX - px - 0.5) / S, v = (py + 0.5 - OY) / (S * SIN), a = (u + v) / R2, b = (v - u) / R2;
      const [x, y] = fromR(a, b), k = py * W + px;
      const c = floor(x, y, px, py);
      if (c) {
        pix[k] = c;
        ground[k] = 1;
        zb[k] = ((a + b) / R2) * COS;
      }
    }
  groundZ.set(zb);
  // Floor pixels belong to whatever thing the floor callback tagged them with.
  build();
  CUR = 0;
  flushShadows();
  bakeOcclusion();
  const [gr, gg, gb] = SHADE_GROUND, [or, og, ob] = SHADE_OBJ;
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const k = py * W + px;
      if (zb[k] < -1e8) continue;
      const isGround = ground[k] && zb[k] === groundZ[k], h = isGround ? 0 : pz[k];
      const u = (OX - px - 0.5) / S, v = ((py + 0.5 - OY) / S + h * COS) / SIN;
      const i = (((u + v) / R2 + SHX * h - HM0) / HMC) | 0, j = (((v - u) / R2 + SHY * h - HM0) / HMC) | 0;
      const inShade = i >= 0 && j >= 0 && i < HMN && j < HMN && hm[j * HMN + i] > h + (isGround ? 0.05 : 0.25);
      if (isGround) {
        if (inShade || shadowMask[k]) {
          tint(k, gr, gg, gb);
          staticShadow[k] = 1;
        }
      } else if (inShade) lit[k] >= 20 ? tint(k, gr * 1.1, gg * 1.1, gb * 1.05) : tint(k, or, og, ob);
      shadowMask[k] = 0;
    }
  bakedPix.set(pix);
  bakedZ.set(zb);
  BAKE = false;
}
/** Tag floor pixels during bake: call from inside floor() before returning a colour. */
export function floorId(key, px, py) {
  ids[py * W + px] = key == null ? 0 : THING_KEYS[key] || 0;
}

// ---- per-frame ---------------------------------------------------------------------------------
/** Restore the baked image inside the view rectangle (vx, vy, vw, vh in canvas pixels). */
export function beginFrame(vx, vy, vw, vh) {
  KX0 = clamp(vx, 0, W); KY0 = clamp(vy, 0, H);
  KX1 = clamp(vx + vw, 0, W); KY1 = clamp(vy + vh, 0, H);
  for (let y = KY0; y < KY1; y++) {
    const r = y * W;
    pix.set(bakedPix.subarray(r + KX0, r + KX1), r + KX0);
    zb.set(bakedZ.subarray(r + KX0, r + KX1), r + KX0);
  }
  pendingShadows.length = 0;
}
export function inView(sx, sy, pad = 40) {
  return sx > KX0 - pad && sx < KX1 + pad && sy > KY0 - pad && sy < KY1 + 2 * pad;
}
/** Point light glows (lamps, screens): [{x,y,z,r,c:[r,g,b],k}] */
export function glows(list, t) {
  for (let i = 0; i < list.length; i++) {
    const g = list[i], p = projectP(g.x, g.y, g.z), rad = g.r * S;
    if (p.sx < KX0 - rad || p.sx > KX1 + rad || p.sy < KY0 - rad || p.sy > KY1 + rad) continue;
    const amp = g.k * (g.flicker ? 0.86 + 0.14 * Math.sin(11 * t + 3 * i) * Math.sin(7.3 * t + i) : 1);
    const y0 = Math.max(KY0, (p.sy - rad) | 0), y1 = Math.min(KY1 - 1, (p.sy + rad) | 0);
    const x0 = Math.max(KX0, (p.sx - rad) | 0), x1 = Math.min(KX1 - 1, (p.sx + rad) | 0);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const k = y * W + x;
        if (zb[k] < -1e8) continue;
        const u = (x - p.sx) / rad, v = (y - p.sy) / (0.8 * rad), q = u * u + v * v;
        if (q >= 1) continue;
        const a = (1 - Math.sqrt(q)) ** 2 * amp + 0.06 * (bayerAt(x, y) - 0.5);
        if (a <= 0.02) continue;
        const c = pix[k];
        pix[k] = rgb((255 & c) + g.c[0] * a, ((c >> 8) & 255) + g.c[1] * a, ((c >> 16) & 255) + g.c[2] * a);
      }
  }
}

// Colour grade: gentle S-curve, warm highlights / cool shadows split-tone, dithered vignette.
const GRADE = new Uint8Array(1024), SPLIT = new Int16Array(768), CL = new Uint8Array(1024);
for (let i = 0; i < 1024; i++) {
  const t = clamp(i - 384, 0, 255) / 255, s = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
  GRADE[i] = Math.round(255 * lerp(t, s, 0.34));
  CL[i] = clamp(i - 384, 0, 255);
}
for (let i = 0; i < 256; i++) {
  const t = i / 255, lo = (1 - t) * (1 - t), hi = t * t;
  SPLIT[3 * i] = Math.round(-7 * lo + 18 * hi + 3);
  SPLIT[3 * i + 1] = Math.round(-5 * lo + 8 * hi);
  SPLIT[3 * i + 2] = Math.round(16 * lo - 12 * hi);
}
let vig = new Uint16Array(0), vigW = -1, vigH = -1;
function buildVignette(vw, vh) {
  vigW = vw; vigH = vh;
  vig = new Uint16Array(vw * vh);
  for (let y = 0; y < vh; y++)
    for (let x = 0; x < vw; x++) {
      const u = (x - vw / 2) / (0.62 * vw), v = (y - vh / 2) / (0.62 * vh), n = clamp((u * u + v * v - 0.42) / 1.1, 0, 1);
      vig[y * vw + x] = Math.round(256 * (1 - (0.28 * Math.floor(6 * n + bayerAt(x, y))) / 6));
    }
}
function postFX(vx, vy, vw, vh) {
  if (vigW !== vw || vigH !== vh) buildVignette(vw, vh);
  for (let y = KY0; y < KY1; y++) {
    const row = (y - vy) * vw - vx;
    for (let x = KX0, k = y * W + KX0; x < KX1; x++, k++) {
      if (zb[k] < -1e8) continue;
      const c = pix[k], r = 255 & c, g = (c >> 8) & 255, b = (c >> 16) & 255, l = (77 * r + 150 * g + 29 * b) >> 8, h = 3 * l;
      const R = GRADE[384 + l + ((146 * (r - l)) >> 7)] + SPLIT[h], G = GRADE[384 + l + ((146 * (g - l)) >> 7)] + SPLIT[h + 1], B = GRADE[384 + l + ((146 * (b - l)) >> 7)] + SPLIT[h + 2];
      const m = vig[row + x];
      pix[k] = (0xff000000 | (CL[384 + ((B * m) >> 8) + ((256 - m) >> 5)] << 16) | (CL[384 + ((G * m) >> 8)] << 8) | CL[384 + ((R * m) >> 8)]) >>> 0;
    }
  }
}
/** Finish the frame: moving shadows, edge shading, grade, and blit to the 2D context. */
export function endFrame(ctx, vx, vy, vw, vh) {
  flushShadows();
  applyShadows();
  shadeEdges();
  postFX(vx, vy, vw, vh);
  if (vx < 0 || vy < 0 || vx + vw > W || vy + vh > H) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, vw, vh);
  }
  if (KX1 > KX0 && KY1 > KY0) ctx.putImageData(image, -vx, -vy, KX0, KY0, KX1 - KX0, KY1 - KY0);
}

// ---- drifting cloud shadows on the ground (outdoor scenes) -------------------------------------
const CLOUD_N = 128, CLOUD = new Float32Array(CLOUD_N * CLOUD_N);
{
  const wrapNoise = (x, y, p) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = ease(x - ix), fy = ease(y - iy);
    const h = (i, j) => hash(((i % p) + p) % p, ((j % p) + p) % p);
    return lerp(lerp(h(ix, iy), h(ix + 1, iy), fx), lerp(h(ix, iy + 1), h(ix + 1, iy + 1), fx), fy);
  };
  for (let j = 0; j < CLOUD_N; j++)
    for (let i = 0; i < CLOUD_N; i++) {
      let v = 0, amp = 0.5, f = 4;
      for (let o = 0; o < 4; o++, amp *= 0.5, f *= 2) v += amp * wrapNoise((i * f) / CLOUD_N, (j * f) / CLOUD_N, f);
      CLOUD[j * CLOUD_N + i] = v / 0.94;
    }
}
/**
 * Darken ground pixels under moving clouds. scale = metres per cloud tile, wind = [x, y] metres per
 * second, cover = 0..1 (higher = fewer clouds), strength = how dark the shadow gets.
 */
export function cloudShade(t, o = {}) {
  const scale = o.scale ?? 120, [wx, wy] = o.wind ?? [-3, 1], cover = o.cover ?? 0.5, str = o.strength ?? 0.28;
  const ox = t * wx, oy = t * wy;
  for (let py = KY0; py < KY1; py++)
    for (let px = KX0, k = py * W + KX0; px < KX1; px++, k++) {
      if (!ground[k] || zb[k] !== groundZ[k]) continue;
      const u = (OX - px - 0.5) / S, v = (py + 0.5 - OY) / (S * SIN), a = (u + v) / R2, b = (v - u) / R2;
      const x = C * a - Sn * b + CX - ox, y = Sn * a + C * b + CY - oy;
      const i = ((Math.floor((x / scale) * CLOUD_N) % CLOUD_N) + CLOUD_N) % CLOUD_N, j = ((Math.floor((y / scale) * CLOUD_N) % CLOUD_N) + CLOUD_N) % CLOUD_N;
      const c = clamp((CLOUD[j * CLOUD_N + i] - cover) * 4, 0, 1);
      if (c > bayerAt(px, py)) tint(k, 1 - str, 1 - str, 1 - str * 0.6);
    }
}
