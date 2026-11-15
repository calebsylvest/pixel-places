// Walkable grid with A* and line-of-sight smoothing. Places mark blocked rectangles while building;
// people path between any two points. Coordinates are world metres.

export class Nav {
  constructor(bounds, cell = 0.2, radius = 0.22) {
    this.x0 = bounds[0];
    this.y0 = bounds[1];
    this.cell = cell;
    this.radius = radius;
    this.nx = Math.ceil((bounds[2] - bounds[0]) / cell);
    this.ny = Math.ceil((bounds[3] - bounds[1]) / cell);
    this.walk = new Uint8Array(this.nx * this.ny); // 0 = blocked
    this.g = new Float32Array(this.nx * this.ny);
    this.from = new Int32Array(this.nx * this.ny);
    this.seen = new Uint32Array(this.nx * this.ny);
    this.stamp = 0;
  }
  /** Mark a rectangle walkable (floor areas). */
  open(x0, y0, x1, y1) {
    this.fill(x0, y0, x1, y1, 1, 0);
  }
  /** Mark a rectangle blocked, grown by the walker radius. */
  block(x0, y0, x1, y1, grow = this.radius) {
    this.fill(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), 0, grow);
  }
  fill(x0, y0, x1, y1, v, grow) {
    const c = this.cell;
    const i0 = Math.max(0, Math.floor((x0 - grow - this.x0) / c)), i1 = Math.min(this.nx - 1, Math.ceil((x1 + grow - this.x0) / c) - 1);
    const j0 = Math.max(0, Math.floor((y0 - grow - this.y0) / c)), j1 = Math.min(this.ny - 1, Math.ceil((y1 + grow - this.y0) / c) - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.walk[j * this.nx + i] = v;
  }
  ij(x, y) {
    return [Math.floor((x - this.x0) / this.cell), Math.floor((y - this.y0) / this.cell)];
  }
  ok(x, y) {
    const [i, j] = this.ij(x, y);
    return i >= 0 && j >= 0 && i < this.nx && j < this.ny && this.walk[j * this.nx + i] === 1;
  }
  center(i, j) {
    return [this.x0 + (i + 0.5) * this.cell, this.y0 + (j + 0.5) * this.cell];
  }
  nearestOpen(x, y, maxR = 12) {
    const [ci, cj] = this.ij(x, y);
    for (let r = 0; r <= maxR; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di, j = cj + dj;
          if (i >= 0 && j >= 0 && i < this.nx && j < this.ny && this.walk[j * this.nx + i]) return [i, j];
        }
    return null;
  }
  /** Straight segment clear of blocked cells? */
  clear(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / (this.cell * 0.5));
    for (let s = 1; s < n; s++) if (!this.ok(ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n)) return false;
    return true;
  }
  /**
   * Path from (ax, ay) to (bx, by) as [[x, y], ...] ending exactly at the goal. Start and goal may
   * sit inside blocked cells (a chair tucked under a desk); the search steps out to the nearest
   * open cell.
   */
  find(ax, ay, bx, by) {
    const s = this.nearestOpen(ax, ay), e = this.nearestOpen(bx, by);
    if (!s || !e) return [[bx, by]];
    const nx = this.nx, start = s[1] * nx + s[0], goal = e[1] * nx + e[0];
    const stamp = ++this.stamp, g = this.g, from = this.from, seen = this.seen;
    if (!this.done || this.done.length !== g.length) this.done = new Uint32Array(g.length);
    const done = this.done, hx = e[0], hy = e[1];
    // binary min-heap of [f, cell]
    const heap = [];
    const push = (f, k) => {
      heap.push([f, k]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    const hdist = (k) => {
      const dx = Math.abs((k % nx) - hx), dy = Math.abs(((k / nx) | 0) - hy);
      return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
    };
    seen[start] = stamp;
    g[start] = 0;
    from[start] = -1;
    push(hdist(start), start);
    let found = false;
    while (heap.length) {
      const [, cur] = pop();
      if (done[cur] === stamp) continue;
      done[cur] = stamp;
      if (cur === goal) {
        found = true;
        break;
      }
      const ci = cur % nx, cj = (cur / nx) | 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= nx || j >= this.ny) continue;
          const k = j * nx + i;
          if (!this.walk[k] || done[k] === stamp) continue;
          if (di && dj && (!this.walk[cj * nx + i] || !this.walk[j * nx + ci])) continue;
          const ng = g[cur] + (di && dj ? 1.4142 : 1);
          if (seen[k] !== stamp || ng < g[k]) {
            seen[k] = stamp;
            g[k] = ng;
            from[k] = cur;
            push(ng + hdist(k), k);
          }
        }
    }
    if (!found) return [[bx, by]];
    const cells = [];
    for (let k = goal; k !== -1; k = from[k]) cells.push(this.center(k % nx, (k / nx) | 0));
    cells.reverse();
    // string-pull
    const pts = [[ax, ay], ...cells, [bx, by]], out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.clear(pts[i][0], pts[i][1], pts[j][0], pts[j][1])) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }
}
