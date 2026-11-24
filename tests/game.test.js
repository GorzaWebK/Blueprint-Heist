import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { TILE } from '../src/level.js';
import { Lockpick } from '../src/lockpick.js';

// A corridor with one guard posted at the west end, looking east.
const corridor = {
  id: 'corridor',
  par: 30,
  map: `
##############
#a..........S#
#............#
#T..........X#
##############`,
  guards: [{ route: 'a', dir: 'E', sweep: 0, range: 6 }],
};

function step(g, seconds, input = {}) {
  for (let t = 0; t < seconds; t += 1 / 60) {
    g.update(1 / 60, input);
    if (g.status !== 'play') break;
  }
}

test('a guard spots a player standing in the cone, then gives chase and catches them', () => {
  const g = new Game(corridor);
  g.player.x = 5.5 * TILE;
  g.player.y = 1.5 * TILE;
  step(g, 1.5);
  assert.ok(g.spotted >= 1);
  assert.ok(g.events.some((e) => e.type === 'spotted'));
  step(g, 4);
  assert.equal(g.status, 'caught');
});

test('out of range, nothing happens', () => {
  const g = new Game(corridor);
  step(g, 3);
  assert.equal(g.spotted, 0);
  assert.equal(g.guards[0].state, 'patrol');
});

test('sneaking takes longer to be noticed than walking', () => {
  const timeToSpot = (sneak) => {
    const g = new Game(corridor);
    g.player.x = 6.5 * TILE;
    g.player.y = 1.5 * TILE;
    let t = 0;
    while (g.spotted === 0 && t < 10) {
      g.update(1 / 60, { sneak, mx: 0, my: 0 });
      // Keep the player in place: we're only testing how fast suspicion fills.
      g.player.x = 6.5 * TILE;
      g.player.y = 1.5 * TILE;
      t += 1 / 60;
    }
    return t;
  };
  assert.ok(timeToSpot(true) > timeToSpot(false));
});

test('sprinting makes noise that sends a guard to investigate', () => {
  const g = new Game({ ...corridor, guards: [{ route: 'a', dir: 'W', sweep: 0, range: 3 }] });
  g.player.x = 6.5 * TILE;
  g.player.y = 3.5 * TILE;
  step(g, 0.5, { mx: -1, sprint: true });
  assert.notEqual(g.guards[0].state, 'patrol');
  assert.ok(g.noises.length > 0);
});

test('stealing the target and reaching the exit wins and scores the run', () => {
  const g = new Game(corridor);
  g.started = true;
  g.player.x = g.exit.x;
  g.player.y = g.exit.y;
  step(g, 0.1);
  assert.equal(g.status, 'play', 'the exit does nothing without the target');
  g.player.x = g.target.x;
  g.player.y = g.target.y;
  g.guards.length = 0;
  step(g, 0.1);
  assert.equal(g.player.hasTarget, true);
  g.player.x = g.exit.x;
  g.player.y = g.exit.y;
  step(g, 0.1);
  assert.equal(g.status, 'won');
  assert.equal(g.result.score.stamp, 'gold');
});

test('walls stop the player', () => {
  const g = new Game(corridor);
  step(g, 2, { mx: 1 });
  assert.ok(g.player.x <= 13 * TILE - 7.9);
});

test('lockpick: hits set pins, a miss drops one', () => {
  const lp = new Lockpick(3, () => 0.5);
  // Find a moment when the needle is in the window.
  while (!lp.inWindow()) lp.update(0.01);
  assert.equal(lp.press(), 'set');
  while (lp.inWindow()) lp.update(0.01);
  assert.equal(lp.press(), 'miss');
  assert.equal(lp.set, 0);
  for (let k = 0; k < 3; k++) {
    while (!lp.inWindow()) lp.update(0.01);
    const r = lp.press();
    assert.equal(r, k === 2 ? 'open' : 'set');
  }
  assert.equal(lp.done, true);
});
