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

/**
 * A straight wall slab between any two floor points (not just along the grid), for rooms that
 * aren't rectangular. o = { h, t (thickness), inner, outer, top (materials), side: 1 or -1 (which
 * side of a->b is the room: 1 = left of the direction a->b), mask(u, v) for openings on the inner
 * face (u runs from a to b), nav }.
 */
export function wallLine(ax, ay, bx, by, o) {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  const side = o.side ?? 1, nx = -uy * side, ny = ux * side; // normal pointing into the room
  const t = o.t ?? 0.2, h = o.h, ox = -nx * t, oy = -ny * t;
  // inner face, seen from the room: u runs a -> b if the room is on the left of a->b, else b -> a
  if (side > 0) quad(bx, by, 0, -dx, -dy, 0, 0, 0, h, nx, ny, 0, o.inner, o.mask && ((u, v) => o.mask(len - u, v)));
  else quad(ax, ay, 0, dx, dy, 0, 0, 0, h, nx, ny, 0, o.inner, o.mask);
  // outer face
  if (side > 0) quad(ax + ox, ay + oy, 0, dx, dy, 0, 0, 0, h, -nx, -ny, 0, o.outer || o.inner, o.mask);
  else quad(bx + ox, by + oy, 0, -dx, -dy, 0, 0, 0, h, -nx, -ny, 0, o.outer || o.inner, o.mask && ((u, v) => o.mask(len - u, v)));
  // top and the two ends
  if (o.top) quad(ax, ay, h, dx, dy, 0, ox, oy, 0, 0, 0, 1, o.top);
  const end = o.outer || o.inner;
  quad(ax + ox, ay + oy, 0, -ox, -oy, 0, 0, 0, h, -ux, -uy, 0, end);
  quad(bx, by, 0, ox, oy, 0, 0, 0, h, ux, uy, 0, end);
  if (o.nav) {
    const n = Math.ceil(len / 0.1);
    for (let i = 0; i <= n; i++) {
      const x = ax + (dx * i) / n + ox / 2, y = ay + (dy * i) / n + oy / 2;
      if (!o.mask || !o.navGap || !o.navGap((i / n) * len)) o.nav.block(x - 0.05, y - 0.05, x + 0.05, y + 0.05, o.grow ?? 0.12);
    }
  }
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

// ---- walls from a traced floor plan ------------------------------------------------------------
/** Point-in-polygon (polygon as [[x, y], ...]). */
export function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/**
 * Build walls from a floor plan instead of drawing each one. Everything inside the footprint that
 * isn't a room (or a door) becomes wall, so angled and octagonal rooms come out right. Outer walls
 * are full height where they face away from the camera and cut down where they face it; inner
 * walls are cut down so the rooms can be seen.
 *
 * o = { cell (m, default 0.1), bounds:[x0,y0,x1,y1], footprint: polygon, rooms: [{ key, poly }],
 *       openings: [{ rect:[x0,y0,x1,y1], kind: "door" | "window", sill, head }],
 *       h (full height), cut (near outer walls), inner (inner walls), mat, top, glass, nav,
 *       dryRun (classify only, draw nothing) }
 * Returns { roomAt(x, y) } for colouring floors.
 */
export function rasterPlan(o) {
  const c = o.cell ?? 0.1, [bx0, by0, bx1, by1] = o.bounds;
  const nx = Math.ceil((bx1 - bx0) / c), ny = Math.ceil((by1 - by0) / c);
  const T = new Uint8Array(nx * ny); // 0 outside, 1 wall, 2 room, 3 window, 4 door
  const RM = new Int16Array(nx * ny).fill(-1);
  const cx = (i) => bx0 + (i + 0.5) * c, cy = (j) => by0 + (j + 0.5) * c;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const x = cx(i), y = cy(j), k = j * nx + i;
      if (!inPoly(x, y, o.footprint)) continue;
      T[k] = 1;
      for (let r = 0; r < o.rooms.length; r++)
        if (inPoly(x, y, o.rooms[r].poly)) {
          T[k] = 2;
          RM[k] = r;
          break;
        }
    }
  for (const op of o.openings || []) {
    const [x0, y0, x1, y1] = op.rect;
    for (let j = Math.max(0, Math.floor((y0 - by0) / c)); j < Math.min(ny, Math.ceil((y1 - by0) / c)); j++)
      for (let i = Math.max(0, Math.floor((x0 - bx0) / c)); i < Math.min(nx, Math.ceil((x1 - bx0) / c)); i++) {
        const k = j * nx + i;
        if (T[k] === 1) T[k] = op.kind === "window" ? 3 : 4;
      }
  }
  // outer walls: spread "faces outward in direction n" from cells touching the outside, a few cells deep
  const OUT = new Int8Array(nx * ny * 2), dist = new Uint8Array(nx * ny).fill(255), q = [];
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (T[k] !== 1 && T[k] !== 3) continue;
      let ox = 0, oy = 0;
      for (const [di, dj] of N4) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= ny || T[b * nx + a] === 0) (ox += di), (oy += dj);
      }
      if (ox || oy) {
        OUT[2 * k] = Math.sign(ox);
        OUT[2 * k + 1] = Math.sign(oy);
        dist[k] = 0;
        q.push(k);
      }
    }
  for (let h = 0; h < q.length; h++) {
    const k = q[h], i = k % nx, j = (k / nx) | 0;
    if (dist[k] >= (o.depth ?? 7)) continue;
    for (const [di, dj] of N4) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const m = b * nx + a;
      if ((T[m] === 1 || T[m] === 3) && dist[m] === 255) {
        dist[m] = dist[k] + 1;
        OUT[2 * m] = OUT[2 * k];
        OUT[2 * m + 1] = OUT[2 * k + 1];
        q.push(m);
      }
    }
  }
  // height class per wall cell: 1 = full, 2 = cut (outer near), 3 = inner
  const H = new Uint8Array(nx * ny);
  for (let k = 0; k < nx * ny; k++) {
    if (T[k] !== 1 && T[k] !== 3) continue;
    if (dist[k] === 255) H[k] = 3;
    else H[k] = facesCamera(OUT[2 * k], OUT[2 * k + 1]) ? 2 : 1;
  }
  const heights = { 1: o.h, 2: o.cut ?? 1.0, 3: o.inner ?? o.cut ?? 1.2 };
  // greedy rectangles of identical (type, height) cells
  const used = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (used[k] || (T[k] !== 1 && T[k] !== 3)) continue;
      const lab = T[k] * 10 + H[k];
      let w = 1;
      while (i + w < nx && !used[k + w] && T[k + w] * 10 + H[k + w] === lab) w++;
      let hgt = 1;
      grow: for (; j + hgt < ny; hgt++) {
        for (let a = 0; a < w; a++) {
          const m = (j + hgt) * nx + i + a;
          if (used[m] || T[m] * 10 + H[m] !== lab) break grow;
        }
      }
      for (let b = 0; b < hgt; b++) for (let a = 0; a < w; a++) used[(j + b) * nx + i + a] = 1;
      const x0 = bx0 + i * c, y0 = by0 + j * c, x1 = x0 + w * c, y1 = y0 + hgt * c, top = heights[H[k]];
      if (o.dryRun) continue;
      if (T[k] === 3) {
        const sill = o.sill ?? 0.9, head = Math.min(top, o.head ?? 3.2);
        box(x0, y0, 0, x1, y1, Math.min(sill, top), o.top, o.mat);
        if (top > sill) {
          if (o.glass) box(x0, y0, sill, x1, y1, head, null, o.glass);
          if (top > head) box(x0, y0, head, x1, y1, top, o.top, o.mat);
        }
      } else box(x0, y0, 0, x1, y1, top, o.top, o.mat);
      if (o.nav) o.nav.block(x0, y0, x1, y1, o.grow ?? 0.1);
    }
  return {
    roomAt(x, y) {
      const i = Math.floor((x - bx0) / c), j = Math.floor((y - by0) / c);
      if (i < 0 || j < 0 || i >= nx || j >= ny) return null;
      const r = RM[j * nx + i];
      return r >= 0 ? o.rooms[r] : null;
    },
    /** Wall height class at a point: 0 none, 1 full, 2 cut (outer, near), 3 inner. For debugging. */
    heightClassAt(x, y) {
      const i = Math.floor((x - bx0) / c), j = Math.floor((y - by0) / c);
      return i < 0 || j < 0 || i >= nx || j >= ny ? 0 : H[j * nx + i];
    },
    typeAt(x, y) {
      const i = Math.floor((x - bx0) / c), j = Math.floor((y - by0) / c);
      return i < 0 || j < 0 || i >= nx || j >= ny ? 0 : T[j * nx + i];
    },
  };
}
