// Animals built from dithered spheres, driven by a species spec (metres). One drawBeast() covers
// several body plans: "quad" (four legs), "bird", "hopper" (kangaroo, rabbit), "tortoise", "snake".
//
// spec = {
//   plan, len (body), h (height at the shoulder/back), hipH (height at the hips, default h), r (body
//   radius), leg (leg radius), color, belly, legColor, headColor, mode ("solid"|"rough"|"gloss"),
//   neck: { len, up (radians above horizontal), r }, head: { len, r, snout (tip radius ratio), tilt },
//   tail: { len, r, droop, tuft, bushy, color }, ears: { r, up, long, flat, color },
//   horns: { type: "ox"|"ram"|"goat"|"rhino"|"antlers"|"ossicones"|"comb", size, color },
//   trunk, tusks, mane: { color, r, along }, hump (count), stripes, patches, beak, train (peacock)
// }
// An animal agent is { x, y, z, yaw, spec, pose: { lie, graze, sit, fly, display }, phase, moving, t }.
import { capsule, sphere, pendingShadows, lerp, hash } from "./render.js";

export function drawBeast(a) {
  const s = a.spec, k = a.k || 1;
  const cs = Math.cos(a.yaw), sn = Math.sin(a.yaw), ox = a.x, oy = a.y, z0 = a.z || 0;
  const P = (fw, sd, up) => [ox + (cs * fw - sn * sd) * k, oy + (sn * fw + cs * sd) * k, z0 + up * k];
  const mode = s.mode || "solid";
  const shadow = s.shadow !== false;
  const seg = (p, q, r0, r1, col, m = mode) => {
    capsule(p, q, r0 * k, r1 * k, col, m);
    if (shadow) pendingShadows.push(p, r0 * k, q, r1 * k);
  };
  const dot = (p, r, col, m = mode) => {
    sphere(p[0], p[1], p[2], r * k, col, m);
    if (shadow) pendingShadows.push(p, r * k, p, r * k);
  };
  const ctx = { s, P, seg, dot, a, k, mode };
  const plan = s.plan || "quad";
  if (plan === "bird") bird(ctx);
  else if (plan === "hopper") hopper(ctx);
  else if (plan === "tortoise") tortoise(ctx);
  else if (plan === "snake") snake(ctx);
  else quad(ctx);
  return [ox, oy];
}

/** Body as a chain of spheres so stripes/patches can colour each bead. */
function body(ctx, from, to, r0, r1, col) {
  const { s, dot, a } = ctx;
  const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const n = Math.max(2, Math.ceil(len / (0.42 * Math.min(r0, r1) * ctx.k)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let c = col;
    if (s.stripes && i % 2 === 1) c = s.stripes;
    if (s.patches && hash(i * 1.7, a.seed || 1) > 0.58) c = s.patches;
    dot([lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t)], lerp(r0, r1, t), c);
  }
}

function quad(ctx) {
  const { s, P, seg, dot, a } = ctx;
  const pose = a.pose || {};
  const L = s.len, R = s.r, legR = s.leg || R * 0.28;
  const lie = !!pose.lie;
  const H = lie ? R * 1.05 : s.h, Hr = lie ? R * 1.0 : s.hipH ?? s.h;
  const zF = H - R, zR = Hr - R; // spine heights front and rear
  const col = s.color, legC = s.legColor || col, headC = s.headColor || col;
  const ph = a.phase || 0, walk = a.moving ? 1 : 0, t = a.t || 0;
  const swing = (o) => Math.sin(ph + o) * 0.22 * walk;
  // legs: front pair at +x, rear pair at -x; diagonal pairs move together
  const legX = L / 2 - R * 0.45, legY = R * 0.5;
  for (const [fx, side, off] of [[legX, 1, 0], [legX, -1, Math.PI], [-legX, 1, Math.PI], [-legX, -1, 0]]) {
    const zTop = (fx > 0 ? zF : zR) - R * 0.45;
    const top = P(fx, side * legY, zTop);
    if (lie) {
      seg(P(fx, side * legY * 1.1, R * 0.5), P(fx + (fx > 0 ? 0.35 : 0.1) * R * 2, side * legY * 1.25, legR), legR, legR * 0.85, legC);
      continue;
    }
    const legLen = zTop, sw = swing(off) * legLen;
    const knee = P(fx + sw * 0.5 + (fx > 0 ? 0 : -0.04 * legLen), side * legY, zTop * 0.48);
    const foot = P(fx + sw, side * legY, 0.04);
    seg(top, knee, legR * 1.15, legR, fx > 0 ? col : col);
    seg(knee, foot, legR, legR * 0.85, legC);
    if (s.hoof) dot(P(fx + sw + 0.02, side * legY, 0.04), legR * 0.95, s.hoof);
  }
  // body (with optional lighter belly underneath)
  const rear = P(-L / 2, 0, zR), front = P(L / 2, 0, zF);
  if (s.belly) body(ctx, P(-L / 2 + R * 0.3, 0, zR - R * 0.35), P(L / 2 - R * 0.3, 0, zF - R * 0.35), R * 0.72, R * 0.75, s.belly);
  body(ctx, rear, front, R * (s.rearR ?? 0.92), R, col);
  if (s.hump) for (let i = 0; i < s.hump; i++) {
    const hx = s.hump === 1 ? 0 : i === 0 ? -L * 0.2 : L * 0.2;
    dot(P(hx, 0, lerp(zR, zF, 0.5 + hx / L) + R * 0.75), R * 0.48, s.humpColor || col);
  }
  // tail
  if (s.tail) {
    const tl = s.tail, d = tl.droop ?? 1.2, wag = Math.sin(t * (tl.wag || 1.6)) * 0.25;
    const base = P(-L / 2 - R * 0.2, 0, zR + R * 0.3);
    const end = P(-L / 2 - R * 0.2 - Math.cos(d) * tl.len, Math.sin(wag) * tl.len * 0.5, Math.max(0.05, zR + R * 0.3 - Math.sin(d) * tl.len));
    seg(base, end, tl.r, tl.bushy ? tl.r * 1.6 : tl.r * 0.6, tl.color || col);
    if (tl.tuft) dot(end, tl.r * 1.8, tl.tuft === true ? col : tl.tuft);
  }
  // neck and head
  const nk = s.neck || { len: R, up: 0.5, r: R * 0.5 }, hd = s.head || { len: R, r: R * 0.5 };
  const base = P(L / 2 - R * 0.15, 0, zF + R * 0.25);
  let up = nk.up;
  if (pose.graze) {
    const want = (hd.r || 0.1) * 1.3 + 0.05 - (zF + R * 0.25);
    up = Math.max(-1.35, Math.asin(Math.max(-1, Math.min(1, want / nk.len))));
  }
  if (pose.alert) up = Math.min(1.4, up + 0.35);
  const nx = L / 2 - R * 0.15 + Math.cos(up) * nk.len, nz = zF + R * 0.25 + Math.sin(up) * nk.len;
  const tip = P(nx, 0, nz);
  if (s.mane && s.mane.along) seg(P(L / 2 - R * 0.5, 0, zF + R * 0.75), P(nx - 0.05, 0, nz + nk.r * 0.8), nk.r * 0.55, nk.r * 0.45, s.mane.color);
  seg(base, tip, nk.r, nk.r * 0.85, s.neckColor || col);
  const tilt = (pose.graze ? -1.2 : hd.tilt ?? -0.35) + (pose.graze ? 0 : Math.sin(t * 0.7 + (a.seed || 0)) * 0.08);
  const hx = nx + Math.cos(tilt) * hd.len, hz = nz + Math.sin(tilt) * hd.len;
  const snout = P(hx, 0, hz);
  seg(tip, snout, hd.r, hd.r * (hd.snout ?? 0.7), headC);
  if (s.mane && !s.mane.along) dot(P(nx - nk.r * 0.6, 0, nz - nk.r * 0.1), s.mane.r, s.mane.color, "rough");
  // ears
  if (s.ears) {
    const e = s.ears;
    for (const side of [1, -1]) {
      if (e.flat) seg(P(nx - hd.r * 0.6, side * hd.r * 1.0, nz + hd.r * 0.1), P(nx - hd.r * 0.9, side * hd.r * 1.2, nz - e.r * 0.9), e.r, e.r * 0.8, e.color || headC);
      else if (e.long) seg(P(nx - hd.r * 0.2, side * hd.r * 0.45, nz + hd.r * 0.7), P(nx - hd.r * 0.5, side * hd.r * 0.6, nz + hd.r * 0.7 + e.long), e.r, e.r * 0.7, e.color || headC);
      else dot(P(nx - hd.r * 0.3, side * hd.r * 0.7, nz + hd.r * (e.up ? 0.85 : 0.5)), e.r, e.color || headC);
    }
  }
  // horns, antlers, trunk, tusks
  const hn = s.horns;
  if (hn) {
    const hc = hn.color || [226, 214, 186], z = hn.size || 0.2;
    if (hn.type === "rhino") {
      seg(P(hx - hd.len * 0.12, 0, hz + hd.r * 0.6), P(hx - hd.len * 0.05, 0, hz + hd.r * 0.6 + z), 0.06, 0.015, hc);
      seg(P(hx - hd.len * 0.45, 0, hz + hd.r * 0.85), P(hx - hd.len * 0.42, 0, hz + hd.r * 0.85 + z * 0.5), 0.05, 0.015, hc);
    } else
      for (const side of [1, -1]) {
        const root = P(nx, side * hd.r * 0.45, nz + hd.r * 0.7);
        if (hn.type === "ox") seg(root, P(nx + z * 0.2, side * (hd.r * 0.45 + z), nz + hd.r * 0.7 + z * 0.5), 0.045, 0.02, hc);
        else if (hn.type === "goat") seg(root, P(nx - z * 0.8, side * hd.r * 0.55, nz + hd.r * 0.7 + z * 0.7), 0.04, 0.015, hc);
        else if (hn.type === "ram") {
          const c0 = P(nx - 0.04, side * hd.r * 0.8, nz + hd.r * 0.4);
          dot(c0, z * 0.45, hc, "rough");
        } else if (hn.type === "ossicones") seg(root, P(nx - 0.03, side * hd.r * 0.5, nz + hd.r * 0.7 + z), 0.035, 0.035, hc);
        else if (hn.type === "comb") dot(P(nx + 0.02, 0, nz + hd.r * 0.9), hd.r * 0.45, hc);
        else if (hn.type === "antlers") {
          const top = P(nx - z * 0.35, side * z * 0.55, nz + hd.r * 0.7 + z);
          seg(root, top, 0.03, 0.02, hc);
          for (let i = 1; i <= 2; i++) {
            const tt = i / 3, mid = P(lerp(nx, nx - z * 0.35, tt), side * lerp(hd.r * 0.45, z * 0.55, tt), nz + hd.r * 0.7 + z * tt);
            seg(mid, P(lerp(nx, nx - z * 0.35, tt) + z * 0.3, side * lerp(hd.r * 0.45, z * 0.55, tt), nz + hd.r * 0.7 + z * tt + z * 0.3), 0.02, 0.012, hc);
          }
        }
      }
  }
  if (s.trunk) {
    const tl = s.trunk, sway = Math.sin(t * 0.9 + (a.seed || 0)) * 0.12;
    const p1 = P(hx + 0.05, sway * 0.3, hz - tl * 0.35), p2 = P(hx + 0.1 + sway * 0.2, sway, hz - tl * 0.75), p3 = P(hx + 0.2, sway * 1.2, Math.max(0.15, hz - tl));
    seg(snout, p1, hd.r * 0.42, hd.r * 0.34, headC);
    seg(p1, p2, hd.r * 0.34, hd.r * 0.26, headC);
    seg(p2, p3, hd.r * 0.26, hd.r * 0.2, headC);
  }
  if (s.tusks) for (const side of [1, -1]) seg(P(hx - 0.1, side * hd.r * 0.35, hz - hd.r * 0.3), P(hx + s.tusks * 0.8, side * hd.r * 0.45, hz - hd.r * 0.3 + s.tusks * 0.2), 0.05, 0.03, [236, 230, 210]);
  if (s.eyeColor) for (const side of [1, -1]) dot(P(nx + hd.len * 0.3, side * hd.r * 0.6, nz + hd.r * 0.3), hd.r * 0.18, s.eyeColor, "solid");
}

function bird(ctx) {
  const { s, P, seg, dot, a } = ctx;
  const pose = a.pose || {};
  const L = s.len, R = s.r, legH = pose.sit ? 0 : s.legH ?? R * 0.9, fly = !!pose.fly, t = a.t || 0;
  const col = s.color, z = (fly ? 0 : legH) + R;
  const bob = a.moving ? Math.abs(Math.sin((a.phase || 0) * 1.5)) * R * 0.15 : 0;
  // legs
  if (!fly && legH > 0.02) {
    const ph = a.phase || 0, w = a.moving ? 0.25 : 0;
    for (const side of [1, -1]) {
      const sw = Math.sin(ph + (side > 0 ? 0 : Math.PI)) * w * legH;
      seg(P(0, side * R * 0.35, z - R * 0.6), P(sw, side * R * 0.35, 0.02), s.legR || Math.max(0.012, R * 0.12), s.legR || Math.max(0.01, R * 0.1), s.legColor || [190, 150, 90]);
    }
  }
  // tail / train
  if (s.train) {
    if (pose.display) {
      const tc = s.train, n = 9;
      for (let i = 0; i < n; i++) {
        const ang = -1.2 + (2.4 * i) / (n - 1);
        for (let j = 1; j <= 3; j++) dot(P(-L * 0.4 - 0.05 * j, Math.sin(ang) * s.train.len * j / 3, z + Math.cos(ang) * s.train.len * j / 3), 0.06 + 0.02 * j, j === 3 ? tc.eye : tc.color);
      }
    } else seg(P(-L * 0.4, 0, z), P(-L * 0.4 - s.train.len, 0, Math.max(0.03, z - 0.4)), R * 0.45, R * 0.3, s.train.color);
  } else if (s.tail) seg(P(-L * 0.45, 0, z + bob), P(-L * 0.45 - s.tail.len, 0, z + bob + (s.tail.up ?? 0.05)), s.tail.r, s.tail.r * 0.6, s.tail.color || col);
  // body
  body(ctx, P(-L * 0.4, 0, z + bob), P(L * 0.35, 0, z + bob + R * 0.15), R * 0.8, R, col);
  if (s.belly) dot(P(L * 0.15, 0, z + bob - R * 0.35), R * 0.7, s.belly);
  // wings
  const wc = s.wing || col;
  if (fly) {
    const flap = Math.sin(t * (s.flap || 14)) * 0.9;
    for (const side of [1, -1]) seg(P(0, side * R * 0.6, z + R * 0.3), P(-L * 0.1, side * (R + s.span * 0.5) * Math.cos(flap * 0.6), z + R * 0.3 + Math.sin(flap) * s.span * 0.4), R * 0.45, R * 0.25, wc);
  } else for (const side of [1, -1]) seg(P(L * 0.15, side * R * 0.65, z + bob + R * 0.2), P(-L * 0.45, side * R * 0.55, z + bob + R * 0.05), R * 0.42, R * 0.3, wc);
  // neck + head
  const nk = s.neck || { len: R * 0.6, up: 1.0, r: R * 0.45 }, peck = pose.graze ? Math.abs(Math.sin(t * 5)) : 0;
  const up = pose.graze ? lerp(nk.up, -0.9, peck) : nk.up;
  const hx = L * 0.35 + Math.cos(up) * nk.len, hz = z + bob + R * 0.3 + Math.sin(up) * nk.len;
  seg(P(L * 0.3, 0, z + bob + R * 0.3), P(hx, 0, hz), nk.r, nk.r * 0.85, s.neckColor || col);
  const hr = s.headR || R * 0.5;
  dot(P(hx, 0, hz), hr, s.headColor || col);
  if (s.crest) dot(P(hx - hr * 0.3, 0, hz + hr * 0.9), hr * 0.45, s.crest);
  if (s.horns) dot(P(hx + hr * 0.1, 0, hz + hr * 0.95), hr * 0.42, s.horns.color);
  const bl = s.beak?.len ?? hr * 0.8;
  seg(P(hx + hr * 0.6, 0, hz), P(hx + hr * 0.6 + bl, 0, hz - (s.beak?.down ?? 0.2) * bl), s.beak?.r ?? hr * 0.3, 0.008, s.beak?.color || [220, 170, 60]);
  if (s.eyeColor) for (const side of [1, -1]) dot(P(hx + hr * 0.45, side * hr * 0.55, hz + hr * 0.15), hr * 0.3, s.eyeColor);
}

function hopper(ctx) {
  const { s, P, seg, dot, a } = ctx;
  const pose = a.pose || {}, t = a.t || 0, R = s.r, H = s.h, col = s.color;
  const hop = a.moving ? Math.abs(Math.sin((a.phase || 0) * 0.8)) * H * 0.18 : 0;
  const lie = pose.lie;
  const hipZ = (lie ? R : R * 1.1) + hop, chestZ = lie ? R * 1.3 : H * 0.72;
  // big hind feet
  for (const side of [1, -1]) {
    seg(P(-R * 0.3, side * R * 0.45, hipZ - R * 0.2), P(-R * 0.1, side * R * 0.5, 0.05 + hop * 0.5), R * 0.5, R * 0.3, col);
    seg(P(-R * 0.1, side * R * 0.5, 0.04 + hop * 0.5), P(R * 0.9 * (s.foot ?? 1), side * R * 0.5, 0.03 + hop * 0.5), R * 0.22, R * 0.18, s.legColor || col);
  }
  if (s.tail) seg(P(-R * 0.6, 0, hipZ - R * 0.3), P(-R * 0.6 - s.tail.len, 0, 0.06 + hop * 0.3), s.tail.r, s.tail.r * 0.5, s.tail.color || col);
  body(ctx, P(-R * 0.2, 0, hipZ), P(lie ? R * 1.2 : R * 0.35, 0, chestZ), R, R * 0.75, col);
  if (s.belly) dot(P(R * 0.2, 0, lerp(hipZ, chestZ, 0.5)), R * 0.62, s.belly);
  // little arms
  if (!lie) for (const side of [1, -1]) seg(P(R * 0.5, side * R * 0.4, chestZ - R * 0.2), P(R * 0.75, side * R * 0.35, chestZ - R * 0.8), R * 0.15, R * 0.12, col);
  const hr = s.headR || R * 0.55, hx = lie ? R * 1.6 : R * 0.55, hz = chestZ + hr * 0.9;
  seg(P(hx - hr * 0.2, 0, hz), P(hx + hr * 0.7, 0, hz - hr * 0.25 + Math.sin(t * 2.2) * 0.01), hr, hr * 0.6, s.headColor || col);
  if (s.ears) for (const side of [1, -1]) seg(P(hx - hr * 0.3, side * hr * 0.4, hz + hr * 0.6), P(hx - hr * 0.6, side * hr * 0.55, hz + hr * 0.6 + s.ears.long), s.ears.r, s.ears.r * 0.7, s.ears.color || col);
}

function tortoise(ctx) {
  const { s, P, seg, dot, a } = ctx;
  const R = s.r, col = s.color, t = a.t || 0, w = a.moving ? Math.sin((a.phase || 0) * 0.6) * 0.04 : 0;
  for (const [fx, side] of [[0.6, 1], [0.6, -1], [-0.6, 1], [-0.6, -1]]) dot(P(fx * R + w * side, side * R * 0.75, R * 0.25), R * 0.22, s.legColor || [120, 110, 90]);
  const out = a.pose?.lie ? 0.2 : 1;
  seg(P(R * 0.7, 0, R * 0.4), P(R * (0.9 + 0.35 * out), 0, R * (0.45 + 0.1 * Math.sin(t * 0.5))), R * 0.2, R * 0.18, s.legColor || [120, 110, 90]);
  dot(P(0, 0, R * 0.55), R * 0.82, col, "rough");
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    dot(P(Math.cos(ang) * R * 0.45, Math.sin(ang) * R * 0.45, R * 0.45), R * 0.45, s.shell2 || col, "rough");
  }
  dot(P(0, 0, R * 0.8), R * 0.48, s.shell2 || col, "rough");
}

function snake(ctx) {
  const { s, P, seg, dot, a } = ctx;
  const R = s.r, col = s.color, n = s.beads || 26, t = a.t || 0, coil = !a.moving;
  let prev = null;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    let x, y, z = R;
    if (coil) {
      const ang = u * Math.PI * 4.2, rad = lerp(s.len * 0.12, s.len * 0.03, u);
      x = Math.cos(ang) * rad;
      y = Math.sin(ang) * rad;
      z = R + u * R * 1.6;
    } else {
      x = (u - 0.5) * s.len * 0.8;
      y = Math.sin(u * 9 - (a.phase || 0) * 1.2) * s.len * 0.06;
    }
    const p = P(x, y, z), c = s.stripes && i % 3 === 0 ? s.stripes : col;
    dot(p, R * lerp(0.7, 1, Math.sin(Math.PI * Math.min(1, u * 1.3))), c);
    prev = p;
  }
  const head = coil ? P(Math.cos(Math.PI * 4.2) * s.len * 0.03 + 0.05, 0, R * 2.8 + Math.sin(t * 1.3) * 0.02) : P(s.len * 0.42, Math.sin(9 - (a.phase || 0) * 1.2) * s.len * 0.06, R);
  seg(prev, head, R, R * 1.2, s.headColor || col);
}

/** Height (metres) of the clickable box for an animal. */
export function beastHeight(a) {
  const s = a.spec, k = a.k || 1;
  if (a.pose && a.pose.lie) return Math.max(0.3, s.r * 2.4) * k;
  if (s.plan === "bird") return ((s.legH ?? s.r) + s.r * 2.5 + (s.neck?.len || 0)) * k;
  if (s.plan === "tortoise" || s.plan === "snake") return s.r * 3 * k;
  const neckTop = s.neck ? s.h + Math.sin(s.neck.up) * s.neck.len : s.h;
  return Math.max(s.h, neckTop + (s.head?.r || 0)) * k;
}
