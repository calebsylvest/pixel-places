// People (and animals: give an agent its own draw/walkPose/pickH) who walk between tasks. A task is
// { x, y, yaw | face:[x,y], pose, dur, label, item, hide, z (fixed height), direct (walk straight,
// no pathfinding), route: [[x, y], ...] (fixed waypoints ending at x, y), follow: agent, near: metres }. When a task ends the agent's brain(agent, crowd) picks the next one.
import { drawPerson } from "./figure.js";
import { projectP, inView, S, COS } from "./render.js";

const TAU = Math.PI * 2;
const angDiff = (a, b) => ((((b - a) % TAU) + 3 * Math.PI) % TAU) - Math.PI;

export class Crowd {
  constructor(nav) {
    this.nav = nav;
    /** Optional (x, y) => floor height, for ramps and stairs. */
    this.ground = null;
    this.list = [];
    this.picks = [];
    this.clock = 0;
  }
  add(def) {
    const a = Object.assign(
      { x: 0, y: 0, z: 0, yaw: 0, k: 1, speed: 1.15, t: Math.random() * 10, task: null, path: [], state: "idle", pose: {}, hidden: false, label: "" },
      def,
    );
    a.id = this.list.length;
    this.list.push(a);
    return a;
  }
  /** Replace an agent's current task right away. */
  assign(a, task) {
    a.task = task;
    a.hidden = false;
    a.item = task.item ?? null;
    a.label = task.label || "";
    a.timer = task.dur ?? 10;
    if (task.follow) {
      a.state = "follow";
      a.path = [];
      a.repath = 0;
      return;
    }
    if (task.x == null) {
      a.state = "do";
      return;
    }
    a.path = task.route ? task.route.map((p) => [p[0], p[1]]) : task.direct ? [[task.x, task.y]] : this.nav.find(a.x, a.y, task.x, task.y);
    a.state = a.path.length ? "walk" : "do";
    if (task.walkLabel) a.label = task.walkLabel;
  }
  next(a) {
    const t = a.brain ? a.brain(a, this) : { dur: 5, label: "standing" };
    this.assign(a, t);
  }
  /** Teleport an agent onto its task spot (used to start the scene mid-day). */
  settle(a) {
    if (!a.task) this.next(a);
    const t = a.task;
    if (t.x != null) (a.x = t.x), (a.y = t.y);
    a.path = [];
    a.state = "do";
    a.label = t.label || "";
    this.face(a, 1e3);
    a.pose = t.pose || {};
    a.hidden = !!t.hide;
    a.z = t.z || 0;
  }
  face(a, dt) {
    const t = a.task;
    let target = t.yaw;
    if (t.face) target = Math.atan2(t.face[1] - a.y, t.face[0] - a.x);
    if (t.faceAgent) target = Math.atan2(t.faceAgent.y - a.y, t.faceAgent.x - a.x);
    if (target == null) return;
    const d = angDiff(a.yaw, target), step = 6 * dt;
    a.yaw += Math.abs(d) < step ? d : Math.sign(d) * step;
  }
  stepAlong(a, dt, speed) {
    const p = a.path[0], dx = p[0] - a.x, dy = p[1] - a.y, d = Math.hypot(dx, dy), step = speed * dt;
    if (d <= step) {
      a.x = p[0];
      a.y = p[1];
      a.path.shift();
    } else {
      a.x += (dx / d) * step;
      a.y += (dy / d) * step;
    }
    if (d > 0.01) {
      const yd = angDiff(a.yaw, Math.atan2(dy, dx)), r = 9 * dt;
      a.yaw += Math.abs(yd) < r ? yd : Math.sign(yd) * r;
    }
    a.phase = (a.phase || 0) + dt * speed * (a.stride ? 5.2 / a.stride : 5.2);
    const s = Math.sin(a.phase);
    a.pose = a.walkPose ? a.walkPose(a, s) : { stance: 0.55 * s, armR: 0.45 * s, armL: -0.45 * s };
    a.moving = true;
    a.z = a.task && a.task.z != null ? a.task.z : this.groundAt(a.x, a.y);
  }
  update(dt) {
    this.clock += dt;
    for (const a of this.list) {
      a.t += dt;
      if (!a.task) this.next(a);
      const t = a.task;
      if (a.state === "walk") {
        if (!a.path.length) {
          a.state = "do";
          a.label = t.label || "";
          continue;
        }
        this.stepAlong(a, dt, a.speed);
      } else if (a.state === "follow") {
        const o = t.follow, near = t.near ?? 2.2, d = Math.hypot(o.x - a.x, o.y - a.y);
        a.repath -= dt;
        if (o.hidden || d < near) {
          a.path = [];
          a.pose = t.pose || {};
          a.moving = false;
          a.z = this.groundAt(a.x, a.y);
          const yd = angDiff(a.yaw, Math.atan2(o.y - a.y, o.x - a.x));
          a.yaw += Math.abs(yd) < 5 * dt ? yd : Math.sign(yd) * 5 * dt;
        } else {
          if (a.repath <= 0 || !a.path.length) {
            const ang = Math.atan2(a.y - o.y, a.x - o.x), gx = o.x + Math.cos(ang) * (near - 0.3), gy = o.y + Math.sin(ang) * (near - 0.3);
            a.path = this.nav.find(a.x, a.y, gx, gy);
            a.repath = 1;
          }
          if (a.path.length) this.stepAlong(a, dt, a.speed * 1.1);
        }
        a.timer -= dt;
        if (a.timer <= 0) this.next(a);
      } else if (a.state === "do") {
        this.face(a, dt);
        a.pose = t.pose || {};
        a.moving = false;
        a.z = t.z ?? this.groundAt(a.x, a.y);
        a.hidden = !!t.hide;
        if (t.update) t.update(a, dt, this);
        a.timer -= dt;
        if (a.timer <= 0) {
          if (t.then) this.assign(a, t.then(a, this));
          else this.next(a);
        }
      }
    }
    this.separate(dt);
  }
  groundAt(x, y) {
    return this.ground ? this.ground(x, y) : 0;
  }
  /** Walking people step around each other. */
  separate(dt) {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.hidden || a.noPush || (a.state !== "walk" && a.state !== "follow")) continue;
      for (let j = 0; j < L.length; j++) {
        if (i === j) continue;
        const b = L[j];
        if (b.hidden) continue;
        const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy), r = (a.radius || 0.25) + (b.radius || 0.25);
        if (d > 0.01 && d < r) {
          const push = (r - d) * 2.5 * dt, nx = a.x + (dx / d) * push, ny = a.y + (dy / d) * push;
          if (this.nav.ok(nx, ny)) (a.x = nx), (a.y = ny);
        }
      }
    }
  }
  draw() {
    this.picks.length = 0;
    for (const a of this.list) {
      if (a.hidden) continue;
      const p = projectP(a.x, a.y, a.z);
      if (!inView(p.sx, p.sy)) continue;
      (a.draw || drawPerson)(a);
      const h = (a.pickH ? a.pickH(a) : (a.pose.sit ? 1.45 : 1.85) * (a.k || 1)) * COS * S;
      this.picks.push({ sx: p.sx, sy: p.sy, h, w: (a.pickW || 0.32) * S, d: p.d, ref: a });
    }
    this.picks.sort((p, q) => p.d - q.d);
  }
  /** Front-most person under a canvas pixel. */
  at(px, py) {
    for (let i = this.picks.length - 1; i >= 0; i--) {
      const p = this.picks[i];
      if (px >= p.sx - p.w && px <= p.sx + p.w && py <= p.sy + 2 && py >= p.sy - p.h) return p.ref;
    }
    return null;
  }
}
