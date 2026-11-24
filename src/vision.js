// Line-of-sight and vision cones on a tile grid. No DOM, no drawing: tested in Node.
//
// A "grid" is any object with `tile` (world units per cell) and `opaque(cx, cy)`.
// Rays are walked cell by cell (Amanatides & Woo DDA), so a wall blocks sight
// exactly at its edge and nothing can be seen through a corner gap.

const TAU = Math.PI * 2;

/** Smallest signed difference between two angles, in (-PI, PI]. */
export function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d <= -Math.PI) d += TAU;
  return d;
}

/**
 * Distance a ray travels from (x, y) along the unit vector (dx, dy) before it
 * enters an opaque cell, capped at maxDist. Returns 0 if it starts inside one.
 */
export function castRay(grid, x, y, dx, dy, maxDist) {
  const T = grid.tile;
  let cx = Math.floor(x / T);
  let cy = Math.floor(y / T);
  if (grid.opaque(cx, cy)) return 0;
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(T / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(T / dy) : Infinity;
  let tMaxX = dx > 0 ? ((cx + 1) * T - x) / dx : dx < 0 ? (cx * T - x) / dx : Infinity;
  let tMaxY = dy > 0 ? ((cy + 1) * T - y) / dy : dy < 0 ? (cy * T - y) / dy : Infinity;
  let t = 0;
  // Bounded loop: a ray can cross at most (maxDist / T) * 2 + 2 cell edges.
  for (let i = 0; i < 4096; i++) {
    if (tMaxX < tMaxY) {
      t = tMaxX;
      tMaxX += tDeltaX;
      cx += stepX;
    } else {
      t = tMaxY;
      tMaxY += tDeltaY;
      cy += stepY;
    }
    if (t >= maxDist) return maxDist;
    if (grid.opaque(cx, cy)) return t;
  }
  return maxDist;
}

/** True if nothing opaque lies on the straight line between two points. */
export function lineOfSight(grid, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return !grid.opaque(Math.floor(ax / grid.tile), Math.floor(ay / grid.tile));
  return castRay(grid, ax, ay, dx / dist, dy / dist, dist) >= dist - 1e-6;
}

/** True if the point (tx, ty) is inside the cone, ignoring walls. */
export function inCone(x, y, facing, halfAngle, range, tx, ty) {
  const dx = tx - x;
  const dy = ty - y;
  const d2 = dx * dx + dy * dy;
  if (d2 > range * range) return false;
  if (d2 < 1e-6) return true;
  return Math.abs(angleDiff(Math.atan2(dy, dx), facing)) <= halfAngle;
}

/**
 * Can a viewer see a target? viewer: { x, y, facing, range, halfAngle, near? }.
 * `near` is an optional all-round awareness radius (someone right behind you).
 * Returns 0 if not seen, otherwise a closeness factor in (0, 1]: 1 at point blank, ~0 at the cone's edge.
 */
export function canSee(grid, viewer, tx, ty) {
  const dist = Math.hypot(tx - viewer.x, ty - viewer.y);
  const near = viewer.near || 0;
  const cone = inCone(viewer.x, viewer.y, viewer.facing, viewer.halfAngle, viewer.range, tx, ty);
  if (!cone && dist > near) return 0;
  if (!lineOfSight(grid, viewer.x, viewer.y, tx, ty)) return 0;
  const reach = cone ? viewer.range : near;
  return Math.max(0.05, 1 - dist / Math.max(1, reach));
}

/**
 * Fills `out` with the outline of a vision cone clipped by walls: the apex followed
 * by `rays + 1` points along the arc. Returns the number of floats written.
 */
export function visionPolygon(grid, x, y, facing, halfAngle, range, rays, out) {
  let n = 0;
  out[n++] = x;
  out[n++] = y;
  const start = facing - halfAngle;
  const step = (halfAngle * 2) / rays;
  for (let i = 0; i <= rays; i++) {
    const a = start + step * i;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const d = castRay(grid, x, y, dx, dy, range);
    out[n++] = x + dx * d;
    out[n++] = y + dy * d;
  }
  return n;
}

/** Distance from point P to segment AB, squared. */
export function distToSegmentSq(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + vx * t - px;
  const cy = ay + vy * t - py;
  return cx * cx + cy * cy;
}
