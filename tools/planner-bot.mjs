// A look-ahead planner bot for checking that every sheet can be beaten without being seen.
// Every 0.2 s it clones the whole game, tries each move (8 directions or wait) for 0.2 s
// followed by 1.5 s of standing still, discards any that lead to being noticed, and takes
// the safe one that gets closest to the goal. It sneaks, picks locks and uses fuse boxes,
// but never throws coins or wears disguises.
//   node tools/planner-bot.mjs [levelIndex|all] [tries]
import { LEVELS, toolsFor } from '../src/levels.js';
import { Game } from '../src/game.js';
import { TILE, CELL } from '../src/level.js';
import { distToSegmentSq } from '../src/vision.js';

function deepClone(v, memo) {
  if (v === null || typeof v !== 'object') return v;
  if (memo.has(v)) return memo.get(v);
  let o;
  if (ArrayBuffer.isView(v)) o = v.slice();
  else if (Array.isArray(v)) { o = []; memo.set(v, o); for (const x of v) o.push(deepClone(x, memo)); return o; }
  else if (v instanceof Set) o = new Set(v);
  else if (v instanceof Map) o = new Map(v);
  else {
    o = Object.create(Object.getPrototypeOf(v));
    memo.set(v, o);
    for (const k of Object.keys(v)) o[k] = deepClone(v[k], memo);
    return o;
  }
  memo.set(v, o);
  return o;
}
export function cloneGame(g) {
  const memo = new Map([[g.def, g.def], [g.level.def, g.level.def]]);
  return deepClone(g, memo);
}

function distanceField(g, goal, blockLasers) {
  const { w, h } = g.grid;
  const dist = new Float32Array(w * h).fill(Infinity);
  const laserCell = new Uint8Array(w * h);
  if (blockLasers) for (const l of g.lasers) if (l.on === null) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (distToSegmentSq((x + 0.5) * TILE, (y + 0.5) * TILE, l.ax, l.ay, l.bx, l.by) < 16 * 16) laserCell[y * w + x] = 1;
    }
  }
  const pass = (x, y) => {
    const c = g.grid.get(x, y);
    if (laserCell[y * w + x]) return false;
    return c === CELL.FLOOR || c === CELL.DOOR || (c === CELL.LOCKED && g.tools.has('lockpick'));
  };
  const q = [goal.cy * w + goal.cx];
  dist[q[0]] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !pass(nx, ny)) continue;
      const ni = ny * w + nx;
      const cost = dist[i] + (g.grid.get(nx, ny) === CELL.LOCKED ? 3 : 1);
      if (cost < dist[ni]) { dist[ni] = cost; q.push(ni); }
    }
  }
  return dist;
}

function fieldAt(field, w, h, x, y) {
  const gx = x / TILE - 0.5, gy = y / TILE - 0.5;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0, fy = gy - y0;
  let sum = 0, ws = 0;
  for (const [cx, cy, wt] of [[x0, y0, (1 - fx) * (1 - fy)], [x0 + 1, y0, fx * (1 - fy)], [x0, y0 + 1, (1 - fx) * fy], [x0 + 1, y0 + 1, fx * fy]]) {
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
    const v = field[cy * w + cx];
    if (!isFinite(v) || wt <= 0) continue;
    sum += v * wt; ws += wt;
  }
  if (ws > 0.05) return sum / ws;
  const v = field[Math.floor(y / TILE) * w + Math.floor(x / TILE)];
  return isFinite(v) ? v : 999;
}

const DIRS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]];

function risk(g) {
  let r = 0;
  for (const gd of g.guards) r = Math.max(r, gd.state === 'chase' ? 2 : gd.suspicion);
  for (const c of g.cameras) r = Math.max(r, c.meter);
  return r;
}

function simulate(g, input, frames, waitFrames, carryFrames = 0) {
  const s = cloneGame(g);
  const spotted0 = s.spotted;
  let worst = 0;
  for (let f = 0; f < frames + waitFrames && s.status === 'play'; f++) {
    s.update(1 / 60, f < frames + carryFrames ? input : { mx: 0, my: 0, sneak: true });
    s.events.length = 0;
    worst = Math.max(worst, risk(s));
    if (s.spotted > spotted0) worst = 9;
  }
  if (s.status === 'caught') worst = 10;
  return { s, worst };
}

export function runPlanner(i, { seed = 0, maxT = 400, verbose = false } = {}) {
  let g = new Game(LEVELS[i], toolsFor(i));
  for (let k = 0; k < seed * 53; k++) g.update(1 / 60, {});
  g.events.length = 0;
  let field = null, fieldKey = '';
  const DEC = 12;
  while (g.status === 'play' && g.t < maxT) {
    const p = g.player;
    const lasersBlock = g.blackout <= 0;
    let goal = g.target.taken ? g.level.exit : g.level.target;
    let key = `${goal.cx},${goal.cy},${lasersBlock},${g.doors.filter((d) => d.locked).length}`;
    if (key !== fieldKey) { field = distanceField(g, goal, lasersBlock); fieldKey = key; }
    const here = Math.floor(p.y / TILE) * g.grid.w + Math.floor(p.x / TILE);
    // Goal walled off by a permanent laser? Head for a fuse box first.
    if (!isFinite(field[here])) {
      const f = g.fuses.find((f) => !f.used);
      if (!f) return { status: 'stuck-laser', t: g.t };
      goal = f;
      key = `fuse${f.cx},${f.cy}`;
      if (key !== fieldKey) { field = distanceField(g, goal, true); fieldKey = key; }
      if (Math.hypot((f.cx + 0.5) * TILE - p.x, (f.cy + 0.5) * TILE - p.y) < TILE) {
        const r = simulate(g, { use: true, sneak: true }, 1, 60);
        if (r.worst < 0.6) { g = r.s; continue; }
      }
    }
    // Picking a lock in progress: press in the window, bail out if trouble comes.
    if (g.lockpick) {
      const r = simulate(g, { mx: 0, my: 0, use: g.lockpick.lp.inWindow() }, 1, 50);
      if (r.worst >= 0.6) {
        const away = simulate(g, { mx: 1, my: 0, sneak: true }, 2, 0);
        g = away.s;
      } else g = simulate(g, { use: g.lockpick.lp.inWindow() }, 1, 0).s;
      continue;
    }
    // Next to a locked door that's on the way: start picking if it looks quiet.
    const near = g.findUsable();
    if (near && near.label === 'PICK LOCK') {
      const dcx = Math.floor(near.x / TILE), dcy = Math.floor(near.y / TILE);
      if (field[dcy * g.grid.w + dcx] < field[here]) {
        const r = simulate(g, { use: true, sneak: true }, 1, 150);
        if (r.worst < 0.5) { g = simulate(g, { use: true, sneak: true }, 1, 0).s; continue; }
      }
    }
    let best = null;
    for (const sneak of [true, false]) {
      for (const [dx, dy] of DIRS) {
        if (!sneak && dx === 0 && dy === 0) continue;
        const inp = { mx: dx, my: dy, sneak };
        const r1 = simulate(g, inp, DEC, 90);
        const r2 = dx || dy ? simulate(g, inp, DEC, 90, 40) : r1;
        const worst = Math.min(r1.worst, r2.worst);
        const after = simulate(g, inp, DEC, 0).s.player;
        const d = fieldAt(field, g.grid.w, g.grid.h, after.x, after.y);
        const score = (worst >= 0.5 ? 1000 + worst * 100 : 0) + d + (dx === 0 && dy === 0 ? 0.15 : 0) + (sneak ? 0 : 0.05);
        if (!best || score < best.score) best = { score, dx, dy, sneak };
      }
    }
    const sp0 = g.spotted;
    g = simulate(g, { mx: best.dx, my: best.dy, sneak: best.sneak }, DEC, 0).s;
    if (verbose && (g.spotted > sp0 || best.score > 500)) console.log('risk', best.score.toFixed(1), JSON.stringify(traceRisk(g)));
  }
  return { status: g.status, t: +g.t.toFixed(1), spotted: g.spotted, at: traceRisk(g) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  const tries = Number(process.argv[3] || 2);
  const which = arg !== undefined && arg !== 'all' ? [Number(arg)] : LEVELS.map((_, i) => i);
  for (const i of which) {
    const res = [];
    for (let s = 0; s < tries; s++) res.push(runPlanner(i, { seed: s }));
    const wins = res.filter((r) => r.status === 'won');
    console.log(LEVELS[i].id.padEnd(3), `${wins.length}/${tries} won`, res.map((r) => `${r.status}@${r.t}s sp${r.spotted}`).join('  '), `par ${LEVELS[i].par}`);
  }
}

export function traceRisk(g) {
  return {
    t: +g.t.toFixed(2),
    p: [Math.round(g.player.x / TILE * 10) / 10, Math.round(g.player.y / TILE * 10) / 10],
    guards: g.guards.map((x) => `${x.state}:${x.suspicion.toFixed(2)}@${(x.x / TILE).toFixed(1)},${(x.y / TILE).toFixed(1)}`),
    cams: g.cameras.map((c) => c.meter.toFixed(2)),
  };
}
