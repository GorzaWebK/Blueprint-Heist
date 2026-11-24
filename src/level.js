// Turns a level definition (an ASCII floor plan plus a little config) into a
// world the game can run. No DOM: tested in Node.
//
// Map legend
//   #  wall               (space) outside the building
//   .  floor              S  start            X  exit         T  target item
//   $  loot               D  doorway          L  locked door  ~  creaky floorboard
//   @  security camera    -  laser across (horizontal beam)  |  laser (vertical beam)
//   F  fuse box           W  disguise (staff uniform locker)
//   a-z patrol waypoints (floor). Guards list their route as a string of these letters.

export const TILE = 32;

export const CELL = {
  FLOOR: 0,
  WALL: 1,
  VOID: 2,
  LOCKED: 3,
  DOOR: 4,
};

export class Grid {
  constructor(w, h, cells, tile = TILE) {
    this.w = w;
    this.h = h;
    this.cells = cells;
    this.tile = tile;
  }
  get(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return CELL.VOID;
    return this.cells[cy * this.w + cx];
  }
  set(cx, cy, v) {
    if (cx >= 0 && cy >= 0 && cx < this.w && cy < this.h) this.cells[cy * this.w + cx] = v;
  }
  /** Blocks sight. */
  opaque(cx, cy) {
    const c = this.get(cx, cy);
    return c === CELL.WALL || c === CELL.VOID || c === CELL.LOCKED;
  }
  /** Blocks movement. */
  solid(cx, cy) {
    return this.opaque(cx, cy);
  }
  /** Can a guard path through this cell? (Guards never pick locks.) */
  walkable(cx, cy) {
    return !this.solid(cx, cy);
  }
  isWallLike(cx, cy) {
    const c = this.get(cx, cy);
    return c === CELL.WALL || c === CELL.LOCKED;
  }
}

/** Cell centre in world units. */
export function centre(cx, cy, tile = TILE) {
  return { x: (cx + 0.5) * tile, y: (cy + 0.5) * tile };
}

const DIRS = { E: 0, SE: Math.PI / 4, S: Math.PI / 2, SW: (3 * Math.PI) / 4, W: Math.PI, NW: (-3 * Math.PI) / 4, N: -Math.PI / 2, NE: -Math.PI / 4 };

export function dirAngle(d) {
  if (typeof d === 'number') return (d * Math.PI) / 180;
  return DIRS[d] ?? 0;
}

/**
 * Parse a level definition. Throws with a readable message if the map is malformed,
 * so a broken level fails the tests instead of failing in someone's browser.
 */
export function parseLevel(def) {
  const rows = def.map.replace(/^\n+|\n+\s*$/g, '').split('\n');
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const cells = new Uint8Array(w * h);
  const grid = new Grid(w, h, cells);
  const out = {
    id: def.id,
    def,
    grid,
    w,
    h,
    start: null,
    exit: null,
    target: null,
    loot: [],
    creaky: new Set(),
    fuses: [],
    wardrobes: [],
    doors: [],
    cameras: [],
    lasers: [],
    guards: [],
    markers: {},
  };
  const laserCells = [];

  for (let cy = 0; cy < h; cy++) {
    const row = rows[cy];
    for (let cx = 0; cx < w; cx++) {
      const ch = row[cx] ?? ' ';
      let cell = CELL.FLOOR;
      switch (ch) {
        case '#': cell = CELL.WALL; break;
        case ' ': cell = CELL.VOID; break;
        case '.': break;
        case 'S': out.start = { cx, cy }; break;
        case 'X': out.exit = { cx, cy }; break;
        case 'T': out.target = { cx, cy }; break;
        case '$': out.loot.push({ cx, cy }); break;
        case 'D': cell = CELL.DOOR; out.doors.push({ cx, cy, locked: false }); break;
        case 'L': cell = CELL.LOCKED; out.doors.push({ cx, cy, locked: true }); break;
        case '~': out.creaky.add(cy * w + cx); break;
        case '@': out.cameras.push({ cx, cy }); break;
        case '-': laserCells.push({ cx, cy, h: true }); break;
        case '|': laserCells.push({ cx, cy, h: false }); break;
        case 'F': out.fuses.push({ cx, cy }); break;
        case 'W': out.wardrobes.push({ cx, cy }); break;
        default:
          if (ch >= 'a' && ch <= 'z') {
            out.markers[ch] = { cx, cy };
          } else {
            throw new Error(`${def.id}: unknown map character "${ch}" at ${cx},${cy}`);
          }
      }
      cells[cy * w + cx] = cell;
    }
  }

  if (!out.start) throw new Error(`${def.id}: no start (S)`);
  if (!out.exit) throw new Error(`${def.id}: no exit (X)`);
  if (!out.target) throw new Error(`${def.id}: no target (T)`);

  // Door orientation: walls left and right means the door sits in a horizontal wall.
  for (const d of out.doors) {
    d.horizontal = grid.isWallLike(d.cx - 1, d.cy) && grid.isWallLike(d.cx + 1, d.cy);
  }

  // Lasers: merge runs of laser cells into beams that stretch from wall to wall.
  const seen = new Set();
  const laserCfg = def.lasers || [];
  for (const lc of laserCells) {
    const key = lc.cy * w + lc.cx;
    if (seen.has(key)) continue;
    let x0 = lc.cx, x1 = lc.cx, y0 = lc.cy, y1 = lc.cy;
    const ch = lc.h ? '-' : '|';
    if (lc.h) {
      while ((rows[lc.cy][x1 + 1] ?? ' ') === ch) x1++;
      for (let x = x0; x <= x1; x++) seen.add(lc.cy * w + x);
    } else {
      while ((rows[y1 + 1]?.[lc.cx] ?? ' ') === ch) y1++;
      for (let y = y0; y <= y1; y++) seen.add(y * w + lc.cx);
    }
    const cfg = laserCfg[out.lasers.length] || {};
    const T = TILE;
    const beam = lc.h
      ? { ax: x0 * T, ay: (lc.cy + 0.5) * T, bx: (x1 + 1) * T, by: (lc.cy + 0.5) * T }
      : { ax: (lc.cx + 0.5) * T, ay: y0 * T, bx: (lc.cx + 0.5) * T, by: (y1 + 1) * T };
    out.lasers.push({
      ...beam,
      horizontal: lc.h,
      // Pulsing lasers: on for `on` seconds, off for `off` seconds. Without timing they stay on.
      on: cfg.on ?? null,
      off: cfg.off ?? null,
      phase: cfg.phase ?? 0,
    });
  }

  // Cameras face away from the wall they hang on, unless the level says otherwise.
  const camCfg = def.cameras || [];
  out.cameras.forEach((cam, i) => {
    const cfg = camCfg[i] || {};
    let vx = 0, vy = 0;
    if (grid.isWallLike(cam.cx - 1, cam.cy)) vx += 1;
    if (grid.isWallLike(cam.cx + 1, cam.cy)) vx -= 1;
    if (grid.isWallLike(cam.cx, cam.cy - 1)) vy += 1;
    if (grid.isWallLike(cam.cx, cam.cy + 1)) vy -= 1;
    if (vx === 0 && vy === 0 && cfg.dir === undefined) {
      throw new Error(`${def.id}: camera ${i} at ${cam.cx},${cam.cy} is not against a wall`);
    }
    cam.base = cfg.dir !== undefined ? dirAngle(cfg.dir) : Math.atan2(vy, vx);
    cam.mountX = (cam.cx + 0.5 - vx * 0.38) * TILE;
    cam.mountY = (cam.cy + 0.5 - vy * 0.38) * TILE;
    cam.sweep = ((cfg.sweep ?? 50) * Math.PI) / 180;
    cam.period = cfg.period ?? 6;
    cam.phase = cfg.phase ?? 0;
    cam.range = (cfg.range ?? 6) * TILE;
    cam.halfAngle = ((cfg.fov ?? 22) * Math.PI) / 180;
  });

  // Guards walk routes of marker letters.
  for (const [i, g] of (def.guards || []).entries()) {
    const route = [...g.route].map((ch) => {
      const m = out.markers[ch];
      if (!m) throw new Error(`${def.id}: guard ${i} route uses missing marker "${ch}"`);
      return { cx: m.cx, cy: m.cy, wait: g.wait?.[ch] ?? (g.route.length === 1 ? Infinity : 0.6), look: g.look?.[ch] };
    });
    out.guards.push({
      route,
      loop: g.loop ?? true,
      speed: g.speed ?? 1,
      range: (g.range ?? 5.5) * TILE,
      fov: ((g.fov ?? 34) * Math.PI) / 180,
      dir: g.dir !== undefined ? dirAngle(g.dir) : null,
      sweep: g.sweep !== undefined ? (g.sweep * Math.PI) / 180 : null,
    });
  }

  out.target.kind = def.target?.kind ?? 'gem';
  out.target.name = def.target?.name ?? 'Target';
  return out;
}

/** Flood fill over cells for which `pass(cx, cy)` is true. Returns a Uint8Array of reached cells. */
export function floodFill(grid, sx, sy, pass) {
  const seen = new Uint8Array(grid.w * grid.h);
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) continue;
    const i = y * grid.w + x;
    if (seen[i] || !pass(x, y)) continue;
    seen[i] = 1;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return seen;
}
