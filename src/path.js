// A* path finding on the tile grid, 8 directions, no cutting corners past walls.

const SQRT2 = Math.SQRT2;
const NB = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p];
      i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        let mk = lk;
        if (l < n && k[l] < mk) { m = l; mk = k[l]; }
        if (r < n && k[r] < mk) { m = r; mk = k[r]; }
        if (m === i) break;
        k[i] = k[m]; v[i] = v[m];
        i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

/**
 * Returns an array of {cx, cy} cells from start (exclusive) to goal (inclusive),
 * or null if the goal can't be reached. `walkable(cx, cy)` decides passability.
 */
export function findPath(grid, sx, sy, gx, gy, walkable = (x, y) => grid.walkable(x, y)) {
  const w = grid.w, h = grid.h;
  if (sx === gx && sy === gy) return [];
  if (!walkable(gx, gy)) return null;
  const n = w * h;
  const g = new Float32Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const start = sy * w + sx;
  const goal = gy * w + gx;
  g[start] = 0;
  const open = new Heap();
  const hfn = (x, y) => {
    const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
    return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
  };
  open.push(hfn(sx, sy), start);
  while (open.size) {
    const cur = open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w, cy = (cur / w) | 0;
    for (const [dx, dy, cost] of NB) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (!walkable(nx, ny)) continue;
      if (dx && dy && (!walkable(cx + dx, cy) || !walkable(cx, cy + dy))) continue;
      const ni = ny * w + nx;
      if (closed[ni]) continue;
      const ng = g[cur] + cost;
      if (ng < g[ni]) {
        g[ni] = ng;
        from[ni] = cur;
        open.push(ng + hfn(nx, ny), ni);
      }
    }
  }
  if (from[goal] === -1) return null;
  const path = [];
  for (let c = goal; c !== start; c = from[c]) path.push({ cx: c % w, cy: (c / w) | 0 });
  path.reverse();
  return path;
}

/** Nearest walkable cell to (cx, cy), searching outwards in rings. */
export function nearestWalkable(grid, cx, cy, walkable = (x, y) => grid.walkable(x, y)) {
  if (walkable(cx, cy)) return { cx, cy };
  for (let r = 1; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (walkable(cx + dx, cy + dy)) return { cx: cx + dx, cy: cy + dy };
      }
    }
  }
  return null;
}
