// Architectural helpers shared by Places: walls with door gaps and cutaway heights, flat panels
// mounted on walls (windows, signs, boards), glass, and a 3x5 pixel font.
import { box, quad, rampOf, clamp, bayerAt, rgb, facesCamera, setShadows, setBias, projectP, S, R2, COS } from "./render.js";

/**
 * Flat panel facing outward along `face` ('n' = +y, 's' = -y, 'e' = +x, 'w' = -x), lying in the
 * plane at coordinate c, spanning a0..a1 along the other horizontal axis and z0..z1. u runs
 * left-to-right as seen by someone facing the panel; v runs up.
 */
export function panel(face, c, a0, a1, z0, z1, mat, mask) {
  const w = a1 - a0, h = z1 - z0;
  setBias(0.06);
  if (face === "n") quad(a1, c, z0, -w, 0, 0, 0, 0, h, 0, 1, 0, mat, mask);
  else if (face === "s") quad(a0, c, z0, w, 0, 0, 0, 0, h, 0, -1, 0, mat, mask);
  else if (face === "e") quad(c, a0, z0, 0, w, 0, 0, 0, h, 1, 0, 0, mat, mask);
  else quad(c, a1, z0, 0, -w, 0, 0, 0, h, -1, 0, 0, mat, mask);
  setBias(0);
}

/**
 * Axis-aligned wall slab x0..x1 by y0..y1. o = { h, mat, top (cut-face material), doors: [[s0, s1,
 * doorH?]], outward: 'n'|'s'|'e'|'w' (outer walls: full height when they face away from the
 * camera, cut down when they face it), cut: height used when cut, low: always cut, nav, grow }.
 * Returns true if the wall was drawn at full height.
 */
export function wall(x0, y0, x1, y1, o) {
  const alongX = x1 - x0 >= y1 - y0;
  const s0 = alongX ? x0 : y0, s1 = alongX ? x1 : y1;
  let full = !o.low;
  if (o.outward) {
    const n = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[o.outward];
    full = !facesCamera(n[0], n[1]);
  }
  const H = full ? o.h : o.cut ?? 1.1;
  const top = full ? o.cap || o.top : o.top;
  const seg = (a, b, z0, z1) => {
    if (b - a < 0.001) return;
    if (alongX) box(a, y0, z0, b, y1, z1, top, o.mat, o.faces);
    else box(x0, a, z0, x1, b, z1, top, o.mat, o.faces);
  };
  // walls block a thin margin so narrow doors stay passable
  const grow = o.grow ?? 0.12;
  let p = s0;
  const doors = (o.doors || []).slice().sort((a, b) => a[0] - b[0]);
  for (const [d0, d1, dh = 2.15] of doors) {
    seg(p, d0, 0, H);
    if (o.nav) alongX ? o.nav.block(p, y0, d0, y1, grow) : o.nav.block(x0, p, x1, d0, grow);
    if (H > dh) seg(d0, d1, dh, H);
    p = d1;
  }
  seg(p, s1, 0, H);
  if (o.nav) alongX ? o.nav.block(p, y0, s1, y1, grow) : o.nav.block(x0, p, x1, s1, grow);
  return full;
}

/** Glass: faint diagonal glints, otherwise see-through. Draw both faces; casts no shadow. */
export function mGlass(tint = [200, 224, 236]) {
  const r = rampOf(tint);
  return (l, u, v, px, py) => {
    const d = (px + py * 2) % 23;
    return d === 0 || d === 1 ? r[clamp(Math.floor(l + 0.6), 0, 4)] : 0;
  };
}
export function glassPane(face, c, a0, a1, z0, z1, mat) {
  setShadows(false);
  const back = { n: "s", s: "n", e: "w", w: "e" }[face];
  panel(face, c, a0, a1, z0, z1, mat);
  panel(back, c, a0, a1, z0, z1, mat);
  setShadows(true);
}

// ---- 3x5 pixel font ----------------------------------------------------------------------------
const GLYPHS = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
  F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010",
  K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010",
  P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
  U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
  Z: "111001010100111", " ": "000000000000000", "'": "010010000000000", "-": "000000111000000", ".": "000000000000010",
  "!": "010010010000010", 0: "111101101101111", 1: "010110010010111", 2: "110001010100111", 3: "110001010001110",
  4: "101101111001001", 5: "111100110001110", 6: "011100111101111", 7: "111001010010010", 8: "111101111101111", 9: "111101111001110",
};
/**
 * Text material. Letters are `cw` metres per column (3 columns + 1 gap each) and `ch` per row;
 * bg null leaves the surface behind showing. Centre it by sizing the panel to textWidth().
 */
export function mText(str, fg, bg, cw = 0.07, ch = 0.06) {
  const f = rampOf(fg), b = bg ? rampOf(bg) : null, s = str.toUpperCase();
  return (l, u, v, px, py) => {
    const col = Math.floor(u / cw), row = 4 - Math.floor(v / ch);
    const i = Math.floor(col / 4), cx = col % 4;
    if (i >= 0 && i < s.length && cx < 3 && row >= 0 && row < 5) {
      const g = GLYPHS[s[i]] || GLYPHS[" "];
      if (g[row * 3 + cx] === "1") return f[clamp(Math.floor(l + 0.4), 0, 4)];
    }
    return b ? b[clamp(Math.floor(l + (bayerAt(px, py) - 0.5) * 0.4), 0, 4)] : 0;
  };
}
export const textWidth = (str, cw = 0.07) => str.length * 4 * cw - cw;
export const textHeight = (ch = 0.06) => 5 * ch;

/**
 * Wall lettering snapped to the screen's pixel grid, so it stays crisp on slanted isometric walls:
 * each font column is `colPx` pixels wide; letters stay upright and each one steps down the wall.
 * lines = ["DUNDER", "MIFFLIN"], centred on `mid` along the wall, bottom at zBottom.
 */
export function sign(face, c, mid, zBottom, lines, fg, o = {}) {
  const colPx = o.colPx ?? 2, rowPx = o.rowPx ?? 1;
  const cw = (colPx * R2) / S, ch = rowPx / (COS * S);
  const cols = Math.max(...lines.map((l) => l.length)) * 4 - 1, rows = lines.length * 6 - 1;
  const width = cols * cw, height = rows * ch, a0 = mid - width / 2, a1 = mid + width / 2, zt = zBottom + height;
  const [ox, oy, ux, uy] = { n: [a1, c, -1, 0], s: [a0, c, 1, 0], e: [c, a0, 0, 1], w: [c, a1, 0, -1] }[face];
  const p0 = projectP(ox, oy, zt), p1 = projectP(ox + ux, oy + uy, zt);
  const du = p1.sx - p0.sx, dv = p1.sy - p0.sy, f = rampOf(fg);
  const text = lines.map((l) => l.toUpperCase().padStart(l.length + Math.floor((cols / 4 + 0.25 - l.length) / 2)));
  const mat = (l, u, v, px, py) => {
    const col = Math.floor((px + 0.5 - p0.sx) / (du * cw) + 1e-6);
    const row = Math.floor((py + 0.5 - (p0.sy + Math.round(dv * (col - (col % 4) + 1) * cw))) / rowPx); // upright letters, stepped baseline
    if (col < 0 || col >= cols || row < 0 || row >= rows || col % 4 === 3 || row % 6 === 5) return 0;
    const g = GLYPHS[text[Math.floor(row / 6)]?.[Math.floor(col / 4)]];
    return g && g[(row % 6) * 3 + (col % 4)] === "1" ? f[clamp(Math.floor(l + 0.3), 0, 4)] : 0;
  };
  panel(face, c, a0 - cw, a1 + cw, zBottom - 4 * ch, zt + 4 * ch, mat);
}

/** Two materials stacked: below `at` metres (v) use a, above use b. */
export const mStack = (at, a, b) => (l, u, v, px, py) => (v < at ? a : b)(l, u, v, px, py);
export { rgb };
