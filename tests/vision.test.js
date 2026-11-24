import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castRay, lineOfSight, inCone, canSee, visionPolygon, angleDiff } from '../src/vision.js';
import { parseLevel, TILE } from '../src/level.js';

// A small room with a dividing wall, a doorway and a locked door.
//   0123456789
// 0 ##########
// 1 #....#...#
// 2 #....D...#
// 3 #....#...#
// 4 #....L...#
// 5 #........#
// 6 ##########
const room = parseLevel({
  id: 'test',
  map: `
##########
#S...#...#
#....D...#
#....#..T#
#....L...#
#.......X#
##########`,
});
const g = room.grid;
const c = (cx, cy) => [(cx + 0.5) * TILE, (cy + 0.5) * TILE];

test('angleDiff wraps around the circle', () => {
  assert.ok(Math.abs(angleDiff(0.1, -0.1) - 0.2) < 1e-9);
  assert.ok(Math.abs(angleDiff(Math.PI - 0.1, -Math.PI + 0.1) + 0.2) < 1e-9);
});

test('castRay stops at the first wall edge', () => {
  const [x, y] = c(1, 1);
  // Facing east from x = 48: the dividing wall starts at x = 5 * 32 = 160.
  assert.ok(Math.abs(castRay(g, x, y, 1, 0, 1000) - (160 - x)) < 1e-6);
  // Facing north: the outer wall's bottom edge is y = 32.
  assert.ok(Math.abs(castRay(g, x, y, 0, -1, 1000) - (y - 32)) < 1e-6);
  // Capped by maxDist.
  assert.equal(castRay(g, x, y, 0, 1, 20), 20);
});

test('lineOfSight: walls block, doorways do not, locked doors do', () => {
  assert.equal(lineOfSight(g, ...c(1, 1), ...c(4, 1)), true);
  assert.equal(lineOfSight(g, ...c(2, 1), ...c(7, 1)), false, 'through the dividing wall');
  assert.equal(lineOfSight(g, ...c(3, 2), ...c(7, 2)), true, 'straight through the open doorway');
  assert.equal(lineOfSight(g, ...c(3, 4), ...c(7, 4)), false, 'locked door blocks sight');
  assert.equal(lineOfSight(g, ...c(2, 5), ...c(7, 5)), true, 'open corridor along the bottom');
});

test('no peeking through a diagonal corner gap', () => {
  const diag = parseLevel({ id: 'diag', map: `
######
#S.#.#
#.#..#
#...X#
#T...#
######` });
  // From (1,1) to (3,1)... a ray through the point where walls (3,1) and (2,2) touch.
  assert.equal(lineOfSight(diag.grid, 2.5 * TILE, 1.5 * TILE, 3.5 * TILE, 2.5 * TILE), false);
});

test('inCone checks both angle and range', () => {
  // Viewer at origin facing east, 30 degree half angle, range 100.
  const ha = (30 * Math.PI) / 180;
  assert.equal(inCone(0, 0, 0, ha, 100, 50, 0), true);
  assert.equal(inCone(0, 0, 0, ha, 100, 50, 20), true, '~22 degrees off axis');
  assert.equal(inCone(0, 0, 0, ha, 100, 50, 40), false, '~39 degrees off axis');
  assert.equal(inCone(0, 0, 0, ha, 100, 120, 0), false, 'out of range');
  assert.equal(inCone(0, 0, 0, ha, 100, -50, 0), false, 'behind');
  // Facing west across the -PI/PI seam.
  assert.equal(inCone(0, 0, Math.PI, ha, 100, -50, -5), true);
  assert.equal(inCone(0, 0, -Math.PI, ha, 100, -50, 5), true);
});

test('canSee combines the cone, walls and close-range awareness', () => {
  const [gx, gy] = c(2, 2);
  const viewer = { x: gx, y: gy, facing: 0, range: 5 * TILE, halfAngle: 0.6, near: 1.2 * TILE };
  assert.ok(canSee(g, viewer, ...c(3, 2)) > 0, 'straight ahead');
  assert.equal(canSee(g, viewer, ...c(8, 2)), 0, 'beyond range (through the doorway)');
  assert.ok(canSee(g, { ...viewer, range: 8 * TILE }, ...c(8, 2)) > 0, 'through the doorway when in range');
  assert.equal(canSee(g, { ...viewer, range: 8 * TILE }, ...c(8, 1)), 0, 'wall in the way');
  assert.equal(canSee(g, viewer, ...c(2, 5)), 0, 'outside the cone');
  // Right behind the viewer: inside the near radius, so seen.
  assert.ok(canSee(g, viewer, gx - TILE * 0.8, gy) > 0);
  assert.equal(canSee(g, { ...viewer, near: 0 }, gx - TILE * 0.8, gy), 0);
  // Closer targets score higher.
  assert.ok(canSee(g, viewer, ...c(2, 2)) > canSee(g, viewer, ...c(4, 2)));
});

test('visionPolygon is clipped by walls', () => {
  const out = new Float32Array(2 * 20);
  const [x, y] = c(2, 3);
  const n = visionPolygon(g, x, y, 0, 0.15, 10 * TILE, 8, out);
  assert.equal(n, 2 * 10);
  assert.equal(out[0], x);
  for (let i = 2; i < n; i += 2) assert.ok(out[i] <= 5 * TILE + 1e-6, 'no point past the dividing wall');
});
