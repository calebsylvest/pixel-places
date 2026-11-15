// People built from dithered spheres and capsules, in metres. A figure is
// { x, y, z, yaw, k (height scale), girth, look, pose, item }.
// look: { skin, hair, hairStyle, top, shirt, tie, bottom, skirt, shoes, glasses,
//         robe (ankle-length garment), sash, mantle (cloak over the back), beard, beardLen, headwrap, veil,
//         hat (brimmed), hatBrim, beret, pipe }
// pose.lie lays the figure on its back: (x, y) is then the feet and yaw points to the head.
// pose: { sit, stance (walk swing -1..1), armR, armL (swing angles), type, phone, present, headTurn }
import { capsule, pendingShadows } from "./render.js";

export function drawPerson(f) {
  const cs = Math.cos(f.yaw), sn = Math.sin(f.yaw);
  const ox = f.x, oy = f.y, k = f.k || 1, z0 = f.z || 0, g = f.girth || 1;
  // local frame: fw = forward, sd = to the figure's left, up = height (metres before scaling)
  const L = f.look, pose = f.pose || {};
  const P = pose.lie
    ? (fw, sd, up) => [ox + (cs * up - sn * sd) * k, oy + (sn * up + cs * sd) * k, z0 + (fw + 0.17) * k]
    : (fw, sd, up) => [ox + (cs * fw - sn * sd) * k, oy + (sn * fw + cs * sd) * k, z0 + up * k];
  const seg = (a, b, r0, r1, col) => {
    capsule(a, b, r0 * k, r1 * k, col);
    pendingShadows.push(a, r0 * k, b, r1 * k);
  };
  const sit = pose.sit ? 1 : 0;
  const hip = sit ? 0.5 : 0.92, sh = hip + 0.5, head = sh + 0.22;
  const st = pose.stance || 0;
  const tw = 0.17 * g; // torso half-width
  // legs
  const legC = L.bottom || L.robe || L.skirt || L.top, shoe = L.shoes || legC;
  const legs = (side, s) => {
    const hp = P(0, side * 0.09 * g, hip);
    let knee, foot;
    if (sit) {
      knee = P(0.42, side * 0.11, hip + 0.02);
      foot = P(0.48, side * 0.12, 0.08);
    } else {
      knee = P(0.18 * s, side * 0.1, 0.5);
      foot = P(0.3 * s, side * 0.1, 0.07);
    }
    if (L.robe && !sit) {
      // legs are hidden under the robe; only the feet show
    } else if (L.skirt && !sit) {
      seg(knee, foot, 0.06, 0.055, L.legs || L.skin);
    } else {
      seg(hp, knee, 0.085 * g, 0.07, legC);
      seg(knee, foot, 0.07, 0.06, L.robe ? L.robe : L.skirt ? L.legs || L.skin : legC);
    }
    const toe = sit ? P(0.6, side * 0.12, 0.05) : P(0.3 * s + 0.12, side * 0.1, 0.04);
    seg(foot, toe, 0.05, 0.045, shoe);
  };
  legs(1, -st);
  legs(-1, st);
  if (L.robe) {
    if (sit) seg(P(0, 0, hip), P(0.4, 0, hip + 0.02), 0.18 * g, 0.16, L.robe);
    else {
      seg(P(0, 0, hip + 0.05), P(0.02, 0, 0.45), 0.18 * g, 0.21 * g, L.robe);
      seg(P(0.02, 0, 0.45), P(0.02 + 0.08 * st, 0, 0.13), 0.21 * g, 0.22 * g, L.robe);
    }
  } else if (L.skirt) {
    if (sit) seg(P(0, 0, hip), P(0.36, 0, hip + 0.02), 0.17, 0.15, L.skirt);
    else seg(P(0, 0, hip + 0.05), P(0.02, 0, 0.5), 0.17 * g, 0.2 * g, L.skirt);
  }
  // torso
  const top = L.top || L.robe;
  seg(P(0, 0, hip + 0.06), P(0, 0, sh - 0.06), tw, tw + 0.02, top);
  if (L.sash) seg(P(0, 0, hip + 0.12), P(0, 0, hip + 0.16), tw + 0.02, tw + 0.02, L.sash);
  if (L.mantle) seg(P(-0.07, 0, sh + 0.02), P(-0.11, 0, sit ? hip : hip - 0.25), tw + 0.04, tw + 0.06, L.mantle);
  if (L.shirt) seg(P(0.11 * g, 0, sh - 0.04), P(0.13 * g, 0, sh - 0.2), 0.055, 0.035, L.shirt);
  if (L.tie) seg(P(0.15 * g, 0, sh - 0.08), P(0.17 * g, 0, hip + 0.18), 0.03, 0.035, L.tie);
  // neck + head
  const hf = pose.headF || 0, ht = pose.headTurn || 0;
  seg(P(0, 0, sh), P(0, 0, sh + 0.08), 0.055, 0.055, L.skin);
  const hc = P(hf, ht * 0.02, head);
  seg(hc, hc, 0.115, 0.115, L.skin);
  if (L.headwrap) {
    seg(P(hf - 0.02, 0, head + 0.04), P(hf - 0.02, 0, head + 0.04), 0.13, 0.13, L.headwrap);
    if (L.veil) seg(P(hf - 0.08, 0, head), P(hf - 0.12, 0, sh - 0.08), 0.12, 0.15, L.headwrap);
  } else hair(P, seg, L, head, hf);
  if (L.hat) {
    const br = L.hatBrim ?? 0.21;
    seg(P(hf - 0.02, 0, head + 0.1), P(hf - 0.02, 0, head + 0.16), 0.115, 0.1, L.hat);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      seg(P(hf - 0.02 + Math.cos(a) * br, Math.sin(a) * br, head + 0.07), P(hf - 0.02 + Math.cos(a) * br, Math.sin(a) * br, head + 0.07), 0.05, 0.05, L.hat);
    }
  }
  if (L.beret) seg(P(hf - 0.03, 0.03, head + 0.1), P(hf - 0.05, -0.04, head + 0.11), 0.115, 0.11, L.beret);
  if (L.pipe) {
    seg(P(hf + 0.11, 0.035, head - 0.07), P(hf + 0.2, 0.04, head - 0.1), 0.014, 0.014, [70, 50, 40]);
    seg(P(hf + 0.21, 0.04, head - 0.09), P(hf + 0.21, 0.04, head - 0.06), 0.03, 0.03, L.pipe);
  }
  if (L.beard) seg(P(hf + 0.07, 0, head - 0.07), P(hf + 0.09, 0, head - 0.07 - (L.beardLen ?? 0.12)), 0.075, 0.05, L.beard);
  if (L.glasses) seg(P(hf + 0.1, 0, head + 0.01), P(hf + 0.1, 0, head + 0.01), 0.04, 0.04, L.glasses);
  // arms
  const arm = (side, swing, mode) => {
    const s0 = P(0, side * (tw + 0.05), sh - 0.03);
    let el, hd;
    if (mode === "type") {
      el = P(0.14, side * (tw + 0.04), sh - 0.26);
      hd = P(0.4, side * 0.1, sh - 0.22 + 0.02 * Math.sin((f.t || 0) * 18 + side));
    } else if (mode === "phone") {
      el = P(0.12, side * (tw + 0.1), sh - 0.22);
      hd = P(0.06, side * 0.13, head - 0.02);
    } else if (mode === "point") {
      el = P(0.25, side * (tw + 0.08), sh + 0.02);
      hd = P(0.52, side * (tw + 0.1), sh + 0.12);
    } else if (mode === "hold") {
      el = P(0.1, side * (tw + 0.05), sh - 0.28);
      hd = P(0.32, side * 0.12, sh - 0.22);
    } else if (mode === "shoulder") {
      el = P(0.1, side * (tw + 0.1), sh + 0.02);
      hd = P(0.18, side * 0.15, head - 0.05);
    } else if (mode === "rest") {
      el = P(0.08, side * (tw + 0.05), sh - 0.3);
      hd = P(0.32, side * 0.12, sh - 0.36);
    } else {
      el = P(0.22 * Math.sin(swing), side * (tw + 0.06), sh - 0.3 * Math.cos(swing) - 0.02);
      hd = P(0.44 * Math.sin(swing + 0.15), side * (tw + 0.07), sh - 0.56 * Math.cos(swing + 0.15));
    }
    seg(s0, el, 0.065, 0.055, L.sleeve || top);
    seg(el, hd, 0.055, 0.05, L.shortSleeve ? L.skin : L.sleeve || top);
    seg(hd, hd, 0.05, 0.05, L.skin);
    return hd;
  };
  const hR = arm(1, pose.armR ?? 0, pose.right);
  const hL = arm(-1, pose.armL ?? 0, pose.left);
  // item in the right hand
  const it = f.item;
  if (it === "mug") seg([hR[0], hR[1], hR[2] + 0.03 * k], [hR[0], hR[1], hR[2] + 0.1 * k], 0.045, 0.045, f.itemColor || [236, 232, 222]);
  else if (it === "papers") seg(P(0.3, -0.05, sh - 0.25), P(0.3, 0.12, sh - 0.25), 0.07, 0.07, [244, 242, 236]);
  else if (it === "camera") {
    seg(P(-0.02, 0.18, head + 0.02), P(0.32, 0.18, head + 0.02), 0.1, 0.09, [44, 44, 50]);
    seg(P(0.34, 0.18, head + 0.02), P(0.42, 0.18, head + 0.02), 0.06, 0.06, [24, 24, 30]);
  } else if (it === "box") seg(P(0.3, 0, sh - 0.2), P(0.3, 0, sh - 0.2), 0.2, 0.2, [184, 150, 104]);
  else if (it === "basket") seg(P(0.3, 0.05, sh - 0.3), P(0.3, 0.05, sh - 0.22), 0.17, 0.17, [190, 152, 92]);
  else if (it === "jar") seg(P(-0.02, 0.2, sh + 0.08), P(-0.06, 0.2, sh + 0.46), 0.13, 0.08, [184, 104, 70]);
  else if (it === "hay") seg(P(-0.02, 0.24, sh + 0.12), P(-0.02, -0.24, sh + 0.14), 0.15, 0.15, [214, 186, 104]);
  else if (it === "pail") seg([hR[0], hR[1], hR[2] - 0.16 * k], [hR[0], hR[1], hR[2] - 0.04 * k], 0.1, 0.11, [130, 96, 64]);
  else if (it === "staff") seg([hR[0], hR[1], z0 + 0.04 * k], [hR[0], hR[1], hR[2] + 0.55 * k], 0.03, 0.03, [118, 88, 60]);
  else if (it === "lamp") seg([hR[0], hR[1], hR[2] + 0.02 * k], [hR[0], hR[1], hR[2] + 0.07 * k], 0.06, 0.04, [196, 140, 80]);
  return [ox, oy];
}

function hair(P, seg, L, head, hf) {
  const c = L.hair, st = L.hairStyle || "short";
  if (st === "bald") {
    seg(P(hf - 0.06, 0.06, head - 0.02), P(hf - 0.06, -0.06, head - 0.02), 0.07, 0.07, c);
    return;
  }
  if (st === "thin") {
    seg(P(hf - 0.05, 0, head + 0.03), P(hf - 0.05, 0, head + 0.03), 0.1, 0.1, c);
    return;
  }
  const r = st === "curly" ? 0.13 : st === "big" ? 0.135 : 0.118;
  seg(P(hf - 0.025, 0, head + 0.035), P(hf - 0.025, 0, head + 0.035), r, r, c);
  if (st === "long") seg(P(hf - 0.07, 0, head), P(hf - 0.09, 0, head - 0.3), 0.11, 0.1, c);
  else if (st === "shoulder") seg(P(hf - 0.06, 0, head), P(hf - 0.07, 0, head - 0.18), 0.12, 0.11, c);
  else if (st === "bun") seg(P(hf - 0.13, 0, head + 0.06), P(hf - 0.13, 0, head + 0.06), 0.06, 0.06, c);
  else if (st === "ponytail") seg(P(hf - 0.13, 0, head + 0.02), P(hf - 0.16, 0, head - 0.2), 0.05, 0.04, c);
}

