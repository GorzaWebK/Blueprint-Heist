// Sanity checks for every sheet: shape, reachability, guard routes, lasers.
// Run: node tools/check-levels.mjs   (the same checks run in tests/levels.test.js)
import { LEVELS, toolsFor } from '../src/levels.js';
import { parseLevel, CELL, floodFill } from '../src/level.js';
import { findPath } from '../src/path.js';

export function checkLevel(def, index) {
  const problems = [];
  const rows = def.map.replace(/^\n+|\n+\s*$/g, '').split('\n');
  const L = parseLevel(def);
  const g = L.grid;
  const tools = toolsFor(index);
  const canPick = tools.has('lockpick');
  const playerPass = (x, y) => {
    const c = g.get(x, y);
    return c === CELL.FLOOR || c === CELL.DOOR || (c === CELL.LOCKED && canPick);
  };
  const reach = floodFill(g, L.start.cx, L.start.cy, playerPass);
  const need = (p, what) => { if (!reach[p.cy * g.w + p.cx]) problems.push(`${what} at ${p.cx},${p.cy} unreachable`); };
  need(L.target, 'target');
  need(L.exit, 'exit');
  L.loot.forEach((l) => need(l, 'loot'));
  L.fuses.forEach((l) => need(l, 'fuse'));
  L.wardrobes.forEach((l) => need(l, 'locker'));
  if (L.fuses.length && !tools.has('fuse')) problems.push('fuse box before the fuse tool');
  if (L.wardrobes.length && !tools.has('disguise')) problems.push('locker before the disguise tool');
  if (L.doors.some((d) => d.locked) && !canPick) problems.push('locked door before the lockpick');
  // Every floor cell inside the building should be reachable (no sealed rooms by accident).
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const c = g.get(x, y);
    if ((c === CELL.FLOOR || c === CELL.DOOR) && !reach[y * g.w + x]) problems.push(`sealed floor ${x},${y}`);
  }
  // Guards: consecutive waypoints connected without picking locks.
  L.guards.forEach((gd, i) => {
    const r = gd.route;
    for (let k = 0; k < r.length; k++) {
      const a = r[k], b = r[(k + 1) % r.length];
      if (r.length > 1 && !findPath(g, a.cx, a.cy, b.cx, b.cy) && !(a.cx === b.cx && a.cy === b.cy)) problems.push(`guard ${i} cannot walk ${k}->${(k + 1) % r.length}`);
    }
  });
  // Lasers should run wall to wall.
  L.lasers.forEach((l, i) => {
    const T = g.tile;
    const pts = l.horizontal
      ? [[Math.floor(l.ax / T) - 1, Math.floor(l.ay / T)], [Math.floor(l.bx / T), Math.floor(l.ay / T)]]
      : [[Math.floor(l.ax / T), Math.floor(l.ay / T) - 1], [Math.floor(l.ax / T), Math.floor(l.by / T)]];
    for (const [x, y] of pts) if (!g.isWallLike(x, y)) problems.push(`laser ${i} end ${x},${y} is not a wall`);
  });
  const widths = new Set(rows.map((r) => r.length));
  return { problems, size: `${g.w}x${g.h}`, widths: [...widths] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0;
  LEVELS.forEach((def, i) => {
    let r;
    try { r = checkLevel(def, i); } catch (e) { r = { problems: [e.message], size: "?", widths: [] }; }
    console.log(`${def.id.padEnd(3)} ${r.size.padEnd(6)} widths=${r.widths.join(',')} ${r.problems.length ? 'PROBLEMS:' : 'ok'}`);
    for (const p of r.problems) console.log('    - ' + p);
    bad += r.problems.length;
  });
  process.exit(bad ? 1 : 0);
}
