// Mounts a Place: builds the HUD, owns the viewport (pan, zoom, four-way turn), hover/click
// descriptions, scene switching and the main loop.
//
// place = {
//   title, subtitle, start: "sceneKey",
//   home: "../../",                            // optional: where the "all places" link goes
//   scenes: { key: {
//     title, subtitle,                         // HUD text while in this scene
//     view: { S, bounds:[x0,y0,x1,y1], top, below, shadow, light, edge, shadeGround, shadeObj },
//     rot, focus:[x,y,z],                      // starting turn and the point to centre on
//     things: { key: { name, sub, text, enter } },
//     floor(x, y, px, py) -> packed colour | 0,
//     build({ nav }),                          // draw static geometry, mark walkable/blocked areas
//     people(crowd),                           // add agents (once)
//     update(dt, crowd, ctx),                  // optional per-frame logic (events)
//     overlay(clock),                          // optional per-frame drawing (e.g. glows)
//     ambient(clock) -> [r, g, b],             // optional light multipliers (time of day)
//     roster: true,                            // list people in the side panel
//     story: { paras: [...] },                 // optional text for the side panel
//   } },
//   menu: [{ scene, label }],                  // optional tabs (e.g. decks); number keys switch
// }
import * as R from "./render.js";
import { Nav } from "./nav.js";
import { Crowd } from "./agents.js";

const h = (tag, attrs = {}, html = "") => {
  const e = document.createElement(tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  e.innerHTML = html;
  return e;
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function mount(place) {
  document.title = place.title;
  const canvas = h("canvas", { id: "c", tabindex: "0", "aria-label": `${place.title}, an animated pixel diorama. Drag to look around, scroll to zoom, Q and E to turn.` });
  const title = h("div", { id: "title", class: "halo" });
  const bottom = h("div", { id: "bottom", class: "halo" });
  const info = h("div", { id: "info", role: "status", "aria-live": "polite" });
  const controls = h(
    "div",
    { id: "controls" },
    `<button id="back" type="button" hidden>&larr; back</button>
     <button id="rosterBtn" type="button" aria-pressed="false">who&rsquo;s here</button>
     <button id="turnL" type="button" aria-label="Turn the view left">&#8634; turn</button>
     <button id="turnR" type="button" aria-label="Turn the view right">turn &#8635;</button>
     <button id="zoomOut" type="button" aria-label="Zoom out">&minus;</button>
     <button id="zoomIn" type="button" aria-label="Zoom in">+</button>
     <button id="pause" type="button" aria-pressed="false">pause</button>`,
  );
  const panel = h("aside", { id: "panel", hidden: "", "aria-label": "People and story" });
  const loading = h("div", { id: "loading", class: "halo" }, "setting up&hellip;");
  const levels = h("nav", { id: "levels", class: "halo", "aria-label": "Scenes" });
  if (place.menu) {
    levels.innerHTML = place.menu.map((m, i) => `<button type="button" data-scene="${m.scene}" title="${i + 1}">${m.label}</button>`).join("");
    document.body.append(levels);
  }
  bottom.append(info, controls);
  document.body.append(canvas, title, bottom, panel, loading);
  const ctx = canvas.getContext("2d", { alpha: false });
  const $ = (id) => document.getElementById(id);

  // ---- state ----
  let key = null, scene = null, crowd = null, nav = null;
  const states = {};
  let dev = 0, VW = 0, VH = 0, vx = 0, vy = 0;
  let paused = false, pinned = null, follow = null, rosterOpen = false;
  const touch = matchMedia("(pointer: coarse)").matches;
  const HINT = touch
    ? "<i>drag to look around · pinch to zoom · tap anyone to name them</i>"
    : "<i>drag to look around · scroll to zoom · Q / E to turn · point at anything to name it</i>";
  const showHint = () => (info.innerHTML = HINT);

  // ---- viewport ----
  function fitDev() {
    const dpr = devicePixelRatio || 1;
    return R.clamp(Math.floor(Math.min((innerWidth * dpr * 0.96) / R.W, (innerHeight * dpr * 0.86) / R.H)), 1, 12);
  }
  function fit() {
    const dpr = devicePixelRatio || 1;
    if (!dev) dev = fitDev();
    const cx = vx + VW / 2, cy = vy + VH / 2;
    VW = Math.ceil((innerWidth * dpr) / dev);
    VH = Math.ceil((innerHeight * dpr) / dev);
    canvas.width = VW;
    canvas.height = VH;
    canvas.style.width = (VW * dev) / dpr + "px";
    canvas.style.height = (VH * dev) / dpr + "px";
    vx = Math.round(cx - VW / 2);
    vy = Math.round(cy - VH / 2);
    clampView();
  }
  function clampView() {
    vx = Math.round(R.clamp(vx, -VW / 2, R.W - VW / 2));
    vy = Math.round(R.clamp(vy, -VH / 2, R.H - VH / 2));
  }
  function panelPx() {
    return !panel.hidden && innerWidth > 760 ? panel.getBoundingClientRect().right : 0;
  }
  function centerOn(x, y, z = 0) {
    const p = R.projectP(x, y, z), dpr = devicePixelRatio || 1;
    vx = Math.round(p.sx - VW / 2 - (panelPx() * dpr) / dev / 2);
    vy = Math.round(p.sy - VH / 2);
    clampView();
  }
  function zoom(d, cx, cy) {
    const dpr = devicePixelRatio || 1, n = R.clamp(dev + d, 1, 12);
    if (n === dev) return;
    const ax = vx + (cx == null ? VW / 2 : (cx * dpr) / dev), ay = vy + (cy == null ? VH / 2 : (cy * dpr) / dev);
    dev = n;
    VW = VH = vx = vy = 0;
    fit();
    vx = Math.round(ax - (cx == null ? VW / 2 : (cx * dpr) / dev));
    vy = Math.round(ay - (cy == null ? VH / 2 : (cy * dpr) / dev));
    clampView();
  }
  function viewCenterWorld() {
    return R.unproject(vx + VW / 2, vy + VH / 2, 0);
  }

  // ---- scenes ----
  function rebake() {
    nav.walk.fill(0);
    R.bake(scene.floor, () => scene.build({ nav }));
  }
  function loadingThen(text, fn) {
    loading.textContent = text;
    loading.hidden = false;
    requestAnimationFrame(() =>
      setTimeout(() => {
        fn();
        loading.hidden = true;
      }, 20),
    );
  }
  function enter(k, first = false) {
    const prev = key;
    if (prev) states[prev].view = { vx, vy, dev, rot: R.ROT, center: viewCenterWorld() };
    key = k;
    scene = place.scenes[k];
    R.resetThings();
    for (const t in scene.things || {}) R.thing(t, scene.things[t]);
    R.configure(scene.view);
    let st = states[k];
    const fresh = !st;
    if (fresh) {
      st = states[k] = { nav: new Nav(scene.view.bounds, scene.view.navCell || 0.2), crowd: null };
      st.crowd = new Crowd(st.nav);
    }
    nav = st.nav;
    crowd = st.crowd;
    R.setRot(st.view ? st.view.rot : scene.rot || 0);
    rebake();
    if (fresh && scene.people) {
      scene.people(crowd);
      for (const a of crowd.list) crowd.settle(a);
      for (let i = 0; i < 30; i++) step(0.1);
    }
    title.innerHTML = `<a id="home" href="${esc(place.home || "../../")}">&larr; all places</a><b>${esc(scene.title || place.title)}</b><span>${esc(scene.subtitle || place.subtitle || "")}</span>`;
    $("back").hidden = k === place.start || !!place.menu;
    levels.querySelectorAll("button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.scene === k)));
    $("back").innerHTML = `&larr; back to ${esc(place.scenes[place.start].short || place.scenes[place.start].title || "start")}`;
    $("rosterBtn").hidden = !scene.roster && !scene.story;
    pinned = null;
    follow = null;
    if (first || fresh) {
      dev = fitDev();
      VW = VH = 0;
    }
    fit();
    if (st.view && !first) {
      dev = st.view.dev;
      VW = VH = 0;
      fit();
      centerOn(...st.view.center);
    } else centerOn(...(scene.focus || [0, 0, 0]));
    renderPanel();
    showHint();
  }
  function turn(d) {
    const [x, y] = viewCenterWorld();
    R.setRot(R.ROT + d);
    info.innerHTML = "<i>turning the model&hellip;</i>";
    requestAnimationFrame(() =>
      setTimeout(() => {
        rebake();
        centerOn(x, y, 0);
        showHint();
      }, 0),
    );
  }

  // ---- panel (roster + story) ----
  let rosterTimer = 0;
  function renderPanel() {
    if (!rosterOpen || (!scene.roster && !scene.story)) {
      panel.hidden = true;
      $("rosterBtn").setAttribute("aria-pressed", "false");
      document.body.classList.remove("inside");
      return;
    }
    panel.hidden = false;
    document.body.classList.add("inside");
    $("rosterBtn").setAttribute("aria-pressed", "true");
    const story = scene.story ? `<div class="story">${scene.story.paras.map((p) => `<p>${p}</p>`).join("")}</div>` : "";
    const people = scene.roster
      ? `<h3>Who&rsquo;s here</h3><ul>${crowd.list
          .filter((a) => !a.extra)
          .map((a) => `<li><button type="button" data-a="${a.id}"${follow === a ? ' aria-pressed="true"' : ""}><b>${esc(a.name)}</b> <i>${esc(a.hidden ? a.awayLabel || "away" : a.label || "")}</i></button></li>`)
          .join("")}</ul>`
      : "";
    panel.innerHTML = `<header><h2>${esc(scene.title || place.title)}</h2><i>${esc(scene.subtitle || "")}</i></header>${story}${people}`;
    panel.querySelectorAll("li button").forEach(
      (b) =>
        (b.onclick = () => {
          const a = crowd.list[+b.dataset.a];
          follow = follow === a ? null : a;
          if (follow) {
            centerOn(a.x, a.y, 1);
            pinned = a;
            info.innerHTML = describePerson(a);
          } else pinned = null;
          renderPanel();
        }),
    );
  }

  // ---- describing ----
  function describePerson(a) {
    const now = a.hidden ? a.awayLabel || "away from the floor" : a.label;
    return `<b>${esc(a.name)}</b>${a.role ? `<i>${esc(a.role)}</i>` : ""}<span>${esc(a.desc || "")}</span>${now ? `<i>now: ${esc(now)}</i>` : ""}`;
  }
  function describeAt(px, py) {
    const a = crowd.at(px, py);
    if (a) return { html: describePerson(a), person: a };
    const t = R.thingAt(px, py);
    if (!t) return null;
    const go = t.enter ? `<i>click to go ${esc(t.enterLabel || "inside")} &rarr;</i>` : "";
    return { html: `<b>${esc(t.name)}</b>${t.sub ? `<i>${esc(t.sub)}</i>` : ""}${t.text ? `<span>${t.text}</span>` : ""}${go}`, thing: t };
  }
  function worldAt(e) {
    const r = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    return [vx + Math.floor(((e.clientX - r.left) * dpr) / dev), vy + Math.floor(((e.clientY - r.top) * dpr) / dev)];
  }

  // ---- input ----
  let drag = null, moved = false;
  const pointers = new Map();
  function endPointer(e) {
    const click = drag && !drag.pinch && !moved;
    pointers.delete(e.pointerId);
    if (!pointers.size) {
      drag = null;
      canvas.classList.remove("drag");
    }
    if (!click) return;
    const [px, py] = worldAt(e), d = describeAt(px, py);
    if (d && d.thing && d.thing.enter) return void go(d.thing.enter);
    const id = d ? d.person || d.thing : null;
    pinned = id && pinned !== id ? id : null;
    info.innerHTML = pinned ? d.html : d ? d.html : HINT;
  }
  canvas.addEventListener("pointerdown", (e) => {
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 1) {
      drag = { x: e.clientX, y: e.clientY, vx, vy };
      moved = false;
      canvas.classList.add("drag");
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      drag = { pinch: Math.hypot(a[0] - b[0], a[1] - b[1]), dev };
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (drag && drag.pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()], n = R.clamp(Math.round((drag.dev * Math.hypot(a[0] - b[0], a[1] - b[1])) / drag.pinch), 1, 12);
      if (n !== dev) zoom(n - dev, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      return;
    }
    if (drag && !drag.pinch) {
      const dpr = devicePixelRatio || 1, dx = ((e.clientX - drag.x) * dpr) / dev, dy = ((e.clientY - drag.y) * dpr) / dev;
      if (Math.abs(dx) + Math.abs(dy) > 2) {
        moved = true;
        follow = null;
      }
      vx = Math.round(drag.vx - dx);
      vy = Math.round(drag.vy - dy);
      clampView();
      return;
    }
    if (pinned || e.pointerType === "touch") return;
    const [px, py] = worldAt(e), d = describeAt(px, py);
    info.innerHTML = d ? d.html : HINT;
    canvas.style.cursor = d && d.thing && d.thing.enter ? "pointer" : "";
  });
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", () => pinned || drag || showHint());
  canvas.addEventListener("wheel", (e) => (e.preventDefault(), zoom(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY)), { passive: false });
  addEventListener("keydown", (e) => {
    if (e.target.tagName === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
    const k = e.key.toLowerCase();
    if (k === "escape") {
      if (key !== place.start) loadingThen("heading back…", () => enter(place.start));
      else if (pinned) (pinned = null), showHint();
    } else if (k === "q") turn(-1);
    else if (k === "e") turn(1);
    else if (k === "+" || k === "=") zoom(1);
    else if (k === "-" || k === "_") zoom(-1);
    else if (k === "arrowleft") vx -= 24;
    else if (k === "arrowright") vx += 24;
    else if (k === "arrowup") vy -= 24;
    else if (k === "arrowdown") vy += 24;
    else if (k === " ") togglePause();
    else if (place.menu && /^[1-9]$/.test(k) && place.menu[+k - 1]) go(place.menu[+k - 1].scene);
    else return;
    e.preventDefault();
    clampView();
  });
  function togglePause() {
    paused = !paused;
    $("pause").textContent = paused ? "play" : "pause";
    $("pause").setAttribute("aria-pressed", String(paused));
  }
  $("turnL").onclick = () => turn(-1);
  $("turnR").onclick = () => turn(1);
  $("zoomIn").onclick = () => zoom(1);
  $("zoomOut").onclick = () => zoom(-1);
  $("pause").onclick = togglePause;
  $("back").onclick = () => loadingThen("heading back…", () => enter(place.start));
  function go(k) {
    if (k === key || !place.scenes[k]) return;
    const sc = place.scenes[k];
    loadingThen(sc.enterText || `going to ${sc.short || sc.title}…`, () => enter(k));
  }
  levels.querySelectorAll("button").forEach((b) => (b.onclick = () => go(b.dataset.scene)));
  $("rosterBtn").onclick = () => {
    rosterOpen = !rosterOpen;
    renderPanel();
  };
  addEventListener("resize", () => fit());

  // ---- loop ----
  const api = { enter: (k) => enter(k), get crowd() { return crowd; }, get scene() { return scene; }, say: (html) => (info.innerHTML = html) };
  function step(dt) {
    crowd.update(dt);
    if (scene.update) scene.update(dt, crowd, api);
  }
  function draw() {
    R.beginFrame(vx, vy, VW, VH);
    crowd.draw();
    if (scene.overlay) scene.overlay(crowd.clock);
    R.endFrame(ctx, vx, vy, VW, VH, scene.ambient ? scene.ambient(crowd.clock) : null);
  }
  const frameErrors = new Set();
  function start() {
    enter(place.start, true);
    loading.hidden = true;
    let last = performance.now();
    requestAnimationFrame(function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      try {
        if (!paused) step(dt);
        if (follow && !follow.hidden && !drag) {
          const p = R.projectP(follow.x, follow.y, 1), dpr = devicePixelRatio || 1;
          const tx = p.sx - VW / 2 - (panelPx() * dpr) / dev / 2, ty = p.sy - VH / 2;
          vx = Math.round(vx + (tx - vx) * Math.min(1, dt * 4));
          vy = Math.round(vy + (ty - vy) * Math.min(1, dt * 4));
          clampView();
        }
        if (pinned && pinned.name && pinned.task) info.innerHTML = describePerson(pinned);
        rosterTimer -= dt;
        if (rosterOpen && rosterTimer <= 0) {
          rosterTimer = 1;
          renderPanel();
        }
        draw();
      } catch (err) {
        // keep the loop alive; report each distinct error once
        if (!frameErrors.has(String(err))) frameErrors.add(String(err)), console.error(err);
      }
      requestAnimationFrame(frame);
    });
  }
  // Debug handle for the console: __place.turn(1), __place.zoom(2), __place.view ...
  Object.assign(api, { R, turn, zoom, centerOn });
  Object.defineProperty(api, "view", { get: () => ({ vx, vy, VW, VH, dev }) });
  window.__place = api;
  requestAnimationFrame(() => setTimeout(start, 30));
}
