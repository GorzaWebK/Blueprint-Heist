// One attempt at one level: the player, guards, cameras, lasers, tools and the
// rules for winning and getting caught. No DOM or drawing.

import { TILE, CELL, parseLevel, centre } from './level.js';
import { Guard } from './guard.js';
import { canSee, castRay, distToSegmentSq, lineOfSight } from './vision.js';
import { Lockpick } from './lockpick.js';
import { scoreRun } from './scoring.js';

export const PLAYER_RADIUS = 8;
const SPEED = { sneak: 46, walk: 92, sprint: 150 };
const STEP_INTERVAL = { sneak: 0.55, walk: 0.38, sprint: 0.24 };
const NOISE = { sneak: 0, walk: 1.2 * TILE, sprint: 5 * TILE };
const COIN_RANGE = 5.5 * TILE;
const COIN_NOISE = 6.5 * TILE;
const BLACKOUT_TIME = 10;
const DISGUISE_TIME = 18;
const USE_RANGE = 1.15 * TILE;

export class Game {
  /**
   * @param def    level definition from levels.js
   * @param tools  set of tool names available on this sheet
   */
  constructor(def, tools = new Set()) {
    this.def = def;
    this.level = parseLevel(def);
    this.grid = this.level.grid;
    this.tools = tools;
    const s = centre(this.level.start.cx, this.level.start.cy);
    this.player = {
      x: s.x,
      y: s.y,
      facing: def.startFacing !== undefined ? def.startFacing : 0,
      mode: 'walk',
      moving: false,
      speed: 0,
      stepT: 0,
      disguise: 0,
      hasTarget: false,
      coins: tools.has('coin') ? def.coins ?? 3 : 0,
      cell: -1,
    };
    this.guards = this.level.guards.map((g) => new Guard(g, this.level));
    this.cameras = this.level.cameras.map((c) => ({ ...c, angle: c.base, meter: 0, track: 0, seeing: 0 }));
    this.lasers = this.level.lasers.map((l) => ({ ...l, active: true, trip: 0 }));
    this.loot = this.level.loot.map((l) => ({ ...l, taken: false, ...centre(l.cx, l.cy) }));
    this.lootTotal = this.loot.length;
    this.lootTaken = 0;
    this.doors = this.level.doors.map((d) => ({ ...d, open: 0 }));
    this.fuses = this.level.fuses.map((f) => ({ ...f, used: false }));
    this.wardrobes = this.level.wardrobes.map((w) => ({ ...w, used: false }));
    this.target = { ...this.level.target, ...centre(this.level.target.cx, this.level.target.cy), taken: false };
    this.exit = { ...this.level.exit, ...centre(this.level.exit.cx, this.level.exit.cy) };

    this.t = 0; // world clock
    this.time = 0; // level timer, starts when the player first moves
    this.started = false;
    this.spotted = 0;
    this.blackout = 0;
    this.status = 'play'; // 'play' | 'caught' | 'won'
    this.events = [];
    this.noises = []; // drawn rings
    this.coinsFlying = [];
    this.coinsDown = [];
    this.trail = [];
    this.lockpick = null;
    this.prompt = null;
    this.alertT = 0; // seconds since anyone was chasing / alarmed (for the music)
    this.chasing = false;
  }

  emit(e) {
    this.events.push(e);
  }

  // ---------------------------------------------------------------- update

  update(dt, input) {
    if (this.status !== 'play') return;
    this.t += dt;
    if (this.started) this.time += dt;

    this.updatePlayer(dt, input);
    if (this.status !== 'play') return;

    if (this.blackout > 0) {
      this.blackout -= dt;
      if (this.blackout <= 0) {
        this.blackout = 0;
        this.emit({ type: 'power-on' });
        // Someone comes to check the fuse box.
        const f = this.lastFuse;
        if (f) {
          const c = centre(f.cx, f.cy);
          let best = null, bd = Infinity;
          for (const g of this.guards) {
            if (g.state === 'chase') continue;
            const d = Math.hypot(g.x - c.x, g.y - c.y);
            if (d < bd) { bd = d; best = g; }
          }
          if (best) best.hear(c.x, c.y, 'fuse', this);
        }
      }
    }
    if (this.player.disguise > 0) {
      this.player.disguise -= dt;
      if (this.player.disguise <= 0) {
        this.player.disguise = 0;
        this.emit({ type: 'disguise-off' });
      }
    }

    for (const g of this.guards) {
      g.update(dt, this);
      if (this.status !== 'play') return;
    }
    this.updateCameras(dt);
    this.updateLasers(dt);
    this.updateCoins(dt);

    for (let i = this.noises.length - 1; i >= 0; i--) {
      const n = this.noises[i];
      n.t += dt;
      if (n.t > n.life) this.noises.splice(i, 1);
    }
    for (const d of this.doors) {
      if (!d.locked && d.open < 1) d.open = Math.min(1, d.open + dt * 3);
    }

    this.chasing = this.guards.some((g) => g.state === 'chase');
    const tense = this.chasing || this.cameras.some((c) => c.track > 0);
    this.alertT = tense ? 0 : this.alertT + dt;
  }

  updatePlayer(dt, input) {
    const p = this.player;
    let mx = input.mx || 0;
    let my = input.my || 0;
    let mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; mag = 1; }

    // Lockpicking holds you in place until you finish or walk away.
    if (this.lockpick) {
      this.lockpick.lp.update(dt);
      if (mag > 0.5) {
        this.lockpick = null;
        this.emit({ type: 'pick-cancel' });
      } else if (input.use) {
        const r = this.lockpick.lp.press();
        const d = this.lockpick.door;
        if (r === 'open') {
          d.locked = false;
          this.grid.set(d.cx, d.cy, CELL.DOOR);
          this.lockpick = null;
          this.emit({ type: 'unlock', x: (d.cx + 0.5) * TILE, y: (d.cy + 0.5) * TILE });
        } else if (r === 'set') {
          this.emit({ type: 'pin' });
        } else {
          this.emit({ type: 'pick-miss' });
          this.makeNoise(p.x, p.y, 2.4 * TILE, 'pick');
        }
      }
      this.prompt = null;
      return;
    }

    if (mag > 0.05 && !this.started) {
      this.started = true;
      this.emit({ type: 'start' });
    }
    // Analog sticks: a light push sneaks.
    let mode = 'walk';
    if (input.sneak || (mag > 0.05 && mag < 0.55 && input.analog)) mode = 'sneak';
    if (input.sprint && !input.sneak) mode = 'sprint';
    p.mode = mode;
    const speed = SPEED[mode] * (input.analog && mode !== 'sneak' ? Math.min(1, mag * 1.15) : mag > 0.05 ? 1 : 0);
    p.moving = mag > 0.05;
    p.speed = p.moving ? speed : 0;
    if (p.moving) {
      p.facing = Math.atan2(my, mx);
      const dist = speed * dt;
      this.moveCircle(p, (mx / mag) * dist, (my / mag) * dist, PLAYER_RADIUS);

      // Footsteps.
      p.stepT -= dt;
      if (p.stepT <= 0) {
        p.stepT = STEP_INTERVAL[mode];
        this.emit({ type: 'step', mode });
        if (NOISE[mode] > 0) this.makeNoise(p.x, p.y, NOISE[mode], 'step', mode === 'sprint');
      }
      // Pencil trail.
      const last = this.trail[this.trail.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 7) {
        this.trail.push({ x: p.x, y: p.y, t: this.t });
        if (this.trail.length > 160) this.trail.shift();
      }
    } else {
      p.stepT = Math.min(p.stepT, 0.08);
    }

    // Creaky boards complain when you step onto them.
    const cx = Math.floor(p.x / TILE), cy = Math.floor(p.y / TILE);
    const cell = cy * this.grid.w + cx;
    if (cell !== p.cell) {
      p.cell = cell;
      if (this.level.creaky.has(cell)) {
        const r = mode === 'sneak' ? 1.3 * TILE : 4.2 * TILE;
        this.makeNoise((cx + 0.5) * TILE, (cy + 0.5) * TILE, r, 'creak', true);
        this.emit({ type: 'creak', loud: mode !== 'sneak' });
      }
    }

    // Pick-ups.
    for (const l of this.loot) {
      if (!l.taken && Math.hypot(l.x - p.x, l.y - p.y) < 16) {
        l.taken = true;
        this.lootTaken++;
        this.emit({ type: 'loot', x: l.x, y: l.y });
      }
    }
    if (!this.target.taken && Math.hypot(this.target.x - p.x, this.target.y - p.y) < 16) {
      this.target.taken = true;
      p.hasTarget = true;
      this.emit({ type: 'target', x: this.target.x, y: this.target.y });
    }
    let exitPrompt = null;
    if (Math.hypot(this.exit.x - p.x, this.exit.y - p.y) < 16) {
      if (p.hasTarget) {
        this.win();
        return;
      }
      exitPrompt = { text: 'STEAL THE TARGET FIRST', x: this.exit.x, y: this.exit.y, passive: true };
    }

    // Things you can use.
    const use = this.findUsable();
    this.prompt = use ? { text: use.label, x: use.x, y: use.y, passive: use.passive } : exitPrompt;
    if (input.use && use) use.act();
    if (input.throw) this.throwCoin();
  }

  findUsable() {
    const p = this.player;
    let best = null, bd = USE_RANGE;
    const consider = (cx, cy, label, act) => {
      const c = centre(cx, cy);
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bd) { bd = d; best = { x: c.x, y: c.y, label, act }; }
    };
    for (const d of this.doors) {
      if (!d.locked) continue;
      if (this.tools.has('lockpick')) {
        consider(d.cx, d.cy, 'PICK LOCK', () => {
          this.lockpick = { door: d, lp: new Lockpick(this.def.pins ?? 3) };
          this.emit({ type: 'pick-start' });
        });
      } else {
        consider(d.cx, d.cy, 'LOCKED', () => {});
        if (best && best.label === 'LOCKED') best.passive = true;
      }
    }
    for (const f of this.fuses) {
      if (f.used) continue;
      consider(f.cx, f.cy, 'CUT THE LIGHTS', () => {
        f.used = true;
        this.lastFuse = f;
        this.blackout = BLACKOUT_TIME;
        this.emit({ type: 'blackout', x: (f.cx + 0.5) * TILE, y: (f.cy + 0.5) * TILE });
      });
    }
    for (const w of this.wardrobes) {
      if (w.used) continue;
      consider(w.cx, w.cy, 'PUT ON UNIFORM', () => {
        w.used = true;
        this.player.disguise = DISGUISE_TIME;
        this.emit({ type: 'disguise' });
      });
    }
    return best;
  }

  /** Where a coin thrown now would land. */
  coinLanding() {
    const p = this.player;
    const dx = Math.cos(p.facing), dy = Math.sin(p.facing);
    const d = Math.max(0, castRay(this.grid, p.x, p.y, dx, dy, COIN_RANGE) - 10);
    return { x: p.x + dx * d, y: p.y + dy * d };
  }

  throwCoin() {
    const p = this.player;
    if (p.coins <= 0) return;
    p.coins--;
    const to = this.coinLanding();
    const dist = Math.hypot(to.x - p.x, to.y - p.y);
    this.coinsFlying.push({ sx: p.x, sy: p.y, tx: to.x, ty: to.y, t: 0, dur: 0.25 + dist / 420 });
    this.emit({ type: 'throw' });
  }

  updateCoins(dt) {
    for (let i = this.coinsFlying.length - 1; i >= 0; i--) {
      const c = this.coinsFlying[i];
      c.t += dt;
      if (c.t >= c.dur) {
        this.coinsFlying.splice(i, 1);
        this.coinsDown.push({ x: c.tx, y: c.ty, t: 0 });
        this.makeNoise(c.tx, c.ty, COIN_NOISE, 'coin', true);
        this.emit({ type: 'coin', x: c.tx, y: c.ty });
      }
    }
    for (let i = this.coinsDown.length - 1; i >= 0; i--) {
      this.coinsDown[i].t += dt;
      if (this.coinsDown[i].t > 9) this.coinsDown.splice(i, 1);
    }
  }

  updateCameras(dt) {
    const p = this.player;
    for (const c of this.cameras) {
      if (this.blackout > 0) {
        c.seeing = 0;
        c.meter = 0;
        c.track = 0;
        continue;
      }
      const sweepAngle = c.base + c.sweep * Math.sin((this.t / c.period) * Math.PI * 2 + c.phase);
      if (c.track > 0) {
        // Locked on: follow the player for a moment.
        c.track -= dt;
        const a = Math.atan2(p.y - c.mountY, p.x - c.mountX);
        c.angle += Math.max(-dt * 2, Math.min(dt * 2, ((a - c.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
      } else {
        c.angle += Math.max(-dt * 1.5, Math.min(dt * 1.5, ((sweepAngle - c.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
      }
      const seen = p.disguise > 0 ? 0 : canSee(this.grid, { x: c.mountX, y: c.mountY, facing: c.angle, range: c.range, halfAngle: c.halfAngle }, p.x, p.y);
      c.seeing = seen;
      if (seen > 0) {
        c.meter += dt * (p.mode === 'sneak' ? 0.9 : 1.3) * (0.7 + seen);
        if (c.meter >= 1 && c.track <= 0) {
          c.track = 3;
          this.raiseAlarm(p.x, p.y, c.mountX, c.mountY, 'camera');
        }
      } else {
        c.meter = Math.max(0, c.meter - dt * 0.6);
      }
    }
  }

  laserOn(l) {
    if (this.blackout > 0) return false;
    if (l.on === null) return true;
    const period = l.on + l.off;
    return ((this.t + l.phase) % period + period) % period < l.on;
  }

  updateLasers(dt) {
    const p = this.player;
    for (const l of this.lasers) {
      l.active = this.laserOn(l);
      if (l.trip > 0) l.trip -= dt;
      if (!l.active || l.trip > 0) continue;
      if (distToSegmentSq(p.x, p.y, l.ax, l.ay, l.bx, l.by) < (PLAYER_RADIUS - 1) ** 2) {
        l.trip = 3;
        this.raiseAlarm(p.x, p.y, p.x, p.y, 'laser');
      }
    }
  }

  // ---------------------------------------------------------------- events

  makeNoise(x, y, radius, kind, visible = false) {
    if (visible) this.noises.push({ x, y, r: radius, t: 0, life: 0.7, kind });
    for (const g of this.guards) {
      const d = Math.hypot(g.x - x, g.y - y);
      if (d > radius) continue;
      // Walls muffle sound.
      if (d > radius * 0.6 && !lineOfSight(this.grid, g.x, g.y, x, y)) continue;
      g.hear(x, y, kind, this);
    }
  }

  raiseAlarm(x, y, sx, sy, source) {
    this.spotted++;
    this.emit({ type: 'alarm', x: sx, y: sy, source });
    this.noises.push({ x: sx, y: sy, r: 3 * TILE, t: 0, life: 0.9, kind: 'alarm' });
    for (const g of this.guards) {
      if (g.state === 'chase') continue;
      if (Math.hypot(g.x - x, g.y - y) < 14 * TILE) g.hear(x, y, 'alarm', this);
    }
  }

  onSpotted(guard) {
    this.spotted++;
    if (this.player.disguise > 0) {
      this.player.disguise = 0;
      this.emit({ type: 'disguise-off', blown: true });
    }
    this.emit({ type: 'spotted', x: guard.x, y: guard.y, guard });
  }

  onCaught(guard) {
    if (this.status !== 'play') return;
    this.status = 'caught';
    this.lockpick = null;
    this.emit({ type: 'caught', x: guard.x, y: guard.y });
  }

  win() {
    this.status = 'won';
    const run = { time: this.time, par: this.def.par, loot: this.lootTaken, lootTotal: this.lootTotal, spotted: this.spotted };
    this.result = { run, score: scoreRun(run) };
    this.emit({ type: 'won' });
  }

  // ---------------------------------------------------------------- physics

  moveCircle(o, dx, dy, r) {
    // Sub-step so a sprint can never tunnel through a wall corner.
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6) || 1;
    for (let i = 0; i < steps; i++) {
      o.x += dx / steps;
      this.resolve(o, r);
      o.y += dy / steps;
      this.resolve(o, r);
    }
  }

  resolve(o, r) {
    const T = TILE;
    const x0 = Math.floor((o.x - r) / T), x1 = Math.floor((o.x + r) / T);
    const y0 = Math.floor((o.y - r) / T), y1 = Math.floor((o.y + r) / T);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!this.grid.solid(cx, cy)) continue;
        const nx = Math.max(cx * T, Math.min(o.x, (cx + 1) * T));
        const ny = Math.max(cy * T, Math.min(o.y, (cy + 1) * T));
        let ddx = o.x - nx, ddy = o.y - ny;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 >= r * r) continue;
        if (d2 < 1e-6) {
          // Centre inside the cell: push out along the shortest axis.
          const left = o.x - cx * T, right = (cx + 1) * T - o.x, up = o.y - cy * T, down = (cy + 1) * T - o.y;
          const m = Math.min(left, right, up, down);
          if (m === left) o.x = cx * T - r;
          else if (m === right) o.x = (cx + 1) * T + r;
          else if (m === up) o.y = cy * T - r;
          else o.y = (cy + 1) * T + r;
          continue;
        }
        const d = Math.sqrt(d2);
        o.x = nx + (ddx / d) * r;
        o.y = ny + (ddy / d) * r;
      }
    }
  }
}
