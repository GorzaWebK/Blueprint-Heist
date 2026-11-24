import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRun, mergeBest, isNewBest, formatTime } from '../src/scoring.js';

const run = (o) => ({ time: 50, par: 60, loot: 3, lootTotal: 3, spotted: 0, ...o });

test('three ticks earn gold', () => {
  const r = scoreRun(run());
  assert.equal(r.stamp, 'gold');
  assert.deepEqual([r.ghost, r.collector, r.swift], [true, true, true]);
});

test('two ticks earn silver, fewer earn bronze', () => {
  assert.equal(scoreRun(run({ spotted: 1 })).stamp, 'silver');
  assert.equal(scoreRun(run({ loot: 2 })).stamp, 'silver');
  assert.equal(scoreRun(run({ time: 61 })).stamp, 'silver');
  assert.equal(scoreRun(run({ time: 61, spotted: 2 })).stamp, 'bronze');
  assert.equal(scoreRun(run({ time: 200, spotted: 9, loot: 0 })).stamp, 'bronze');
});

test('par is inclusive and a sheet with no loot counts as collected', () => {
  assert.equal(scoreRun(run({ time: 60 })).swift, true);
  assert.equal(scoreRun(run({ loot: 0, lootTotal: 0 })).collector, true);
});

test('points: base, loot, spots and time bonus', () => {
  // 1000 + 3*250 - 0 + (60-50)*10
  assert.equal(scoreRun(run()).points, 1850);
  assert.equal(scoreRun(run({ spotted: 2 })).points, 1450);
  assert.equal(scoreRun(run({ time: 90 })).points, 1750);
  assert.equal(scoreRun(run({ loot: 0, spotted: 20, time: 999 })).points, 0, 'never negative');
});

test('mergeBest keeps the best of each field', () => {
  const a = run({ time: 80, spotted: 0, loot: 1 });
  const ra = scoreRun(a);
  let best = mergeBest(null, a, ra);
  assert.equal(best.clears, 1);
  const b = run({ time: 40, spotted: 3, loot: 3 });
  const rb = scoreRun(b);
  best = mergeBest(best, b, rb);
  assert.equal(best.time, 40);
  assert.equal(best.spotted, 0);
  assert.equal(best.loot, 3);
  assert.equal(best.points, Math.max(ra.points, rb.points));
  assert.equal(best.stamp, 'silver');
  assert.equal(best.clears, 2);
  // A worse stamp never replaces a better one.
  const c = run({ time: 300, spotted: 5, loot: 0 });
  assert.equal(mergeBest({ ...best, stamp: 'gold' }, c, scoreRun(c)).stamp, 'gold');
});

test('isNewBest compares points', () => {
  assert.equal(isNewBest(null, { points: 1 }), true);
  assert.equal(isNewBest({ points: 1500 }, { points: 1400 }), false);
  assert.equal(isNewBest({ points: 1500 }, { points: 1600 }), true);
});

test('formatTime', () => {
  assert.equal(formatTime(0), '00:00.0');
  assert.equal(formatTime(83.25), '01:23.2');
  assert.equal(formatTime(600), '10:00.0');
});
