# Pixel Places

Animated isometric pixel dioramas you can turn, zoom, and point at. Each Place is a small data
file on top of a shared engine.

## Play

- [Dunder Mifflin, Scranton](https://calebsylvest.github.io/pixel-places/places/office/)
- [Noah's Ark](https://calebsylvest.github.io/pixel-places/places/ark/)
- [Van Gogh's Bedroom](https://calebsylvest.github.io/pixel-places/places/bedroom/)
- [Monticello](https://calebsylvest.github.io/pixel-places/places/monticello/)

The site is published from `main` with GitHub Pages; every push updates it.

## Run it

```sh
python3 serve.py        # http://127.0.0.1:8765/
```

The pages use ES modules, so they need to be served (opening the files directly won't work).
`serve.py` turns caching off so edits show up on reload.

## Layout

```
engine/
  render.js   software renderer: projection, depth buffer, shapes (incl. any 4-cornered patch),
              materials (incl. brushstrokes),
              shadows, contour outlines, colour grade, time-of-day tint, cloud shadows
  figure.js   people built from dithered spheres (clothes, robes, beards, head coverings, poses, held items)
  beast.js    animals from a species spec: four-legged, bird, hopper, tortoise and snake body plans
  agents.js   people who walk between tasks; a place's brain() decides what each does next
  nav.js      walkable grid, A* paths, and a reachability check
  build.js    walls (grid-aligned or at any angle) with doors and cutaways, panels, glass, signs,
              and rasterPlan: walls generated from a traced floor plan (rooms + doors + windows)
  app.js      mount(place): HUD, pan/zoom/turn, hover descriptions, roster panel, scene tabs/switching
  style.css   shared HUD styling
places/
  office/     Dunder Mifflin, Scranton (layout traced from a fan-drawn floorplan, not included)
  ark/        Noah's Ark at Genesis 6 dimensions: outside (boarding) plus three decks
              species.js is the animal roster; ark.js the hull, decks and routines
  bedroom/    Van Gogh's bedroom in Arles: a trapezoid room, painterly materials, a day cycle
  monticello/ Monticello c. 1815: plan.js is the first floor traced from the HABS drawings
              (references/, public domain); monticello.js the exterior, interior and household
  forum/      (local only, not in the repo) the original Forum Romanum reference file
```

## Making a Place

A Place calls `mount({ title, start, scenes })`. Each scene supplies:

- `view`: `S` (pixels per metre), `bounds`, `top` and `below` (tallest and deepest points), and light settings
- `floor(x, y, px, py)`: the colour of the ground at a point, or 0 for nothing
- `build({ nav })`: draws walls and furniture with `box`, `cyl`, `wall`, `panel` and the other helpers, and marks blocked areas on `nav`
- `things`: names and descriptions for anything tagged with `setId(key)` while building
- `people(crowd)`, `update(dt, crowd, api)`: the cast and any timed events

Units are metres. A scene can include a thing with `enter: "otherScene"`, which makes it clickable
and switches scenes. `menu: [{ scene, label }]` adds tabs at the top right, and number keys also switch.
Animals are agents with `draw: drawBeast` and a `spec`. Adding a species is just data; see
`places/ark/species.js`.

In the browser console, `__place` exposes `turn`, `zoom`, `centerOn`, `crowd` and `view` for debugging.

## Lessons from the first two Places

From building The Office and Noah's Ark.

### 1. Start with a reference, and know which kind it is

- **Documented places** (The Office, a real building): get a floorplan, blueprint or photos before
  building, and trace from them. The first Office layout was guessed. When the real plan arrived,
  the whole layout had to be redone, and the cast turned out to be from a different season than I'd
  assumed.
- **Described places** (Noah's Ark, a place from a book or legend): the text gives constraints, not a
  layout. Make a list of what the source fixes (300 × 50 × 30 cubits, three decks, one door, a
  cubit-high window), and treat everything else as an interpretation (cubit length, shape, how the
  interior is laid out). Use drawings and other people's reconstructions as reference, and record
  which interpretation you chose.
- **Invented places:** sketch a plan anyway. Even a rough one saves rework.

### 2. Write a short brief before the first build

Most rework in both builds came from decisions made on the fly. Settle these first:

- **Reference and units:** the plan or source, its scale (for example 50 px per metre), and the
  real-world size of the place.
- **Moment in time:** which era or scene (Office season 2 or season 7? the Ark boarding, or at sea?).
  This decides the cast and the props.
- **Cast:** who appears, how they look, and where each one sits or works.
- **Scenes:** one view, or several (rooms, decks, inside and outside)? How does the user move between them?
- **Hero view:** the default angle and what it should show. That angle also decides which walls are
  "far" (full height) and which are cut down.
- **Life:** the 5–10 things people and animals do, plus one or two timed events (the meeting, the
  interview, the procession). A few verbs with good labels go a long way.
- **Interpretations and liberties:** anything deliberately changed for readability or fit (the
  giraffes are young so they fit under the deck; plants were moved out of doorways).

### 3. Turn the reference into a coordinate table before drawing anything

List the rooms, walls, doors, furniture and seats as numbers in metres, measured from the reference.
Every later fix was easy where this existed (`STATIONS`, `SPOTS`, `SPECIES`), and slow where
coordinates were scattered through drawing code.

For a building with real drawings, trace room outlines (and door and window openings) and let
`rasterPlan` work out the walls; check the trace as an ASCII map before rendering anything. In
Monticello, a room rectangle drawn 10 cm narrower than the footprint produced a phantom wall.

### 4. Choose the scale from the smallest thing that matters

`S` (pixels per metre) is a trade-off between the whole place fitting on screen and small things
staying visible. Aim for the smallest important subject to be at least about 8 px tall, and keep the
world about 1,300 px wide or less, so it opens at a crisp 2× zoom.

- The Office at S = 24 is about 700 px wide, and people are about 40 px tall.
- The Ark is 137 m long, which forced S = 11, so doves are 2 px tall.

For very large places, consider splitting them into sections or giving small subjects a closer
scene of their own.

### 5. Walkability is the main way a layout breaks

Furniture and plants blocked doors at least five times in The Office.

- Keep doors at least 0.8 m wide.
- Add decorative clutter last.
- After every layout change, check that every destination is reachable:
  `__place.crowd.nav.unreachable(x, y, { name: [x, y], ... })` in the console lists the spots that
  can't be walked to from (x, y). It caught sealed doors in The Office and in Monticello.

### 6. Look at it in the browser after every step

Screenshots caught problems that reading the code didn't:
- a mirrored world
- signs losing depth fights with their wall
- a hull lit from behind
- tabs hidden under the canvas
- a crash that froze a whole deck

Check every turn of the camera and every scene, read the console for errors, and use the
`__place` console hooks to jump the clock forward or move the camera.

### 7. Smaller rules that held up

- **Camera and light:** put signs, windows and other important details on walls that are full height
  at the default angle. For each scene, light the side the camera faces.
- **Text:** use `sign()` (letters snapped to the pixel grid, at least 10 px tall). Ordinary textures
  turn letters into mush on slanted walls.
- **Content is most of the work.** The engine is roughly a tenth of each Place. Put Place-specific
  things in data tables and keep `engine/` generic.
- **Hover text carries the story.** A name, a short line, and "now: …" make every figure feel
  alive for very little code.
- **Copyrighted settings:** recreating a TV set like The Office is fine as a personal project. Keep
  descriptions in your own words, and think twice before publishing it widely.

### Brief template

```
Place:            what and where
Reference:        plan / blueprint / source text + links; scale (px per metre)
Fixed by source:  dimensions and features the reference pins down
Interpretations:  choices made where the source is silent
Moment:           era / scene / time of day
Scenes:           list, and how the user moves between them
Hero view:        default rotation, what's in frame, which walls are full height
Cast:             people and animals, looks, home spots
Life:             activities, plus 1–2 timed events
Scale:            S, smallest subject's size in px
Out of scope:     what this first pass won't include
```

## Notes

The rendering techniques come from the Forum Romanum diorama at
https://distant-rapids-j68a.here.now/. Its single-file source was the starting point for
`engine/render.js`. That file and the Office floorplan image belong to other people, so they're kept
out of this repo (see `.gitignore`).

## References

Github stuff:
https://github.com/amirmushichge/pixel-plays

People
- This guy makes a lot: https://x.com/N1njaCodex
- https://x.com/BeyondTheBoxCN

Examples:
- https://x.com/BeyondTheBoxCN/status/2117909717968396457
- https://game.domintai.com/

Quidditch Diorama
- X Post: https://x.com/N1njaCodex/status/2117754626850345307
- Webpage: https://broomfield-quidditch-vibecoded1.vercel.app/
- Prompt: https://x.com/N1njaCodex/status/2117755066102710779
