import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, BUILDINGS, toolsFor } from '../src/levels.js';
import { checkLevel } from '../tools/check-levels.mjs';

test('twelve sheets across three buildings, four each', () => {
  assert.equal(LEVELS.length, 12);
  assert.equal(BUILDINGS.length, 3);
  for (const b of BUILDINGS) assert.equal(LEVELS.filter((l) => l.building === b.id).length, 4);
  assert.equal(new Set(LEVELS.map((l) => l.id)).size, 12);
  assert.ok(LEVELS[0].tutorial, 'sheet 1 is the tutorial');
});

test('tools arrive one at a time, every few sheets', () => {
  const order = LEVELS.map((l, i) => [i, l.newTool]).filter(([, t]) => t);
  assert.deepEqual(order.map(([, t]) => t), ['lockpick', 'coin', 'fuse', 'disguise']);
  for (let k = 1; k < order.length; k++) assert.ok(order[k][0] - order[k - 1][0] >= 2);
  assert.equal(toolsFor(11).size, 4);
  assert.equal(toolsFor(0).size, 0);
});

for (const [i, def] of LEVELS.entries()) {
  test(`sheet ${i + 1} (${def.id}) is well formed and completable`, () => {
    const r = checkLevel(def, i);
    assert.deepEqual(r.problems, []);
    assert.ok(def.par > 0);
  });
}
