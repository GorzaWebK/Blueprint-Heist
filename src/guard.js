// Guard behaviour: patrol a route, notice, investigate noises, chase, search, return.

import { TILE, centre } from './level.js';
import { canSee, lineOfSight, angleDiff } from './vision.js';
import { findPath, nearestWalkable } from './path.js';

export const GUARD_RADIUS = 10;
const PATROL_SPEED = 60;
const INVESTIGATE_SPEED = 74;
const ALERT_SPEED = 104;
const CHASE_SPEED = 124;
const NEAR_AWARENESS = 1.25 * TILE;

let nextId = 1;

export class Guard {
  constructor(spec, level) {
    this.id = nextId++;
    this.spec = spec;
    this.grid = level.grid;
    const p = centre(spec.route[0].cx, spec.route[0].cy);
    this.x = p.x;
    this.y = p.y;
    this.routeIdx = 0;
    this.state = 'patrol';
    this.path = null;
    this.facing = spec.dir ?? this.initialFacing();
    this.baseFacing = this.facing;
    this.waitT = spec.route[0].wait;
    this.waitTotal = this.waitT;
    this.arrivedFacing = this.facing;
    this.suspicion = 0;
    this.seeing = 0; // closeness factor this frame (0 = can't see the player)
    this.stateT = 0;
    this.target = null; // {x, y} for investigate / chase
    this.alert = false;
    this.lostT = 0;
    this.repathT = 0;
    this.t = Math.random() * 10;
    this.mark = null; // '?' or '!' shown above the head
    this.speedMul = spec.speed;
  }

  initialFacing() {
    const r = this.spec.route;
    if (r.length > 1) {
      return Math.atan2(r[1].cy - r[0].cy, r[1].cx - r[0].cx);
    }
    return 0;
  }

  get range() {
    return this.spec.range;
  }

  /** The vision parameters used this frame (shrunk in a blackout). */
  viewer(game) {
    const dark = game.blackout > 0 ? 0.45 : 1;
    const chasing = this.state === 'chase';
    return {
      x: this.x,
      y: this.y,
      facing: this.facing,
      range: this.spec.range * dark * (chasing ? 1.25 : 1),
      halfAngle: this.spec.fov * (chasing ? 1.25 : 1),
      near: NEAR_AWARENESS * (game.blackout > 0 ? 0.8 : 1),
    };
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
    this.path = null;
  }

  // ---------------------------------------------------------------- senses

  hear(x, y, kind, game) {
    if (this.state === 'chase') {
      // A chasing guard follows the sound of footsteps.
      if (kind === 'step' || kind === 'creak') this.target = { x, y };
      return;
    }
    if (this.state === 'investigate' && this.alert && kind !== 'alarm') return;
    this.goInvestigate(x, y, kind === 'alarm');
    this.mark = '?';
    this.markT = 1.6;
    game.emit({ type: 'hear', x: this.x, y: this.y, guard: this });
  }

  goInvestigate(x, y, alert) {
    this.setState('notice');
    this.noticeT = alert ? 0.15 : 0.55;
    this.target = { x, y };
    this.alert = alert;
  }

  // ---------------------------------------------------------------- update

  update(dt, game) {
    this.t += dt;
    this.stateT += dt;
    if (this.markT > 0) {
      this.markT -= dt;
      if (this.markT <= 0) this.mark = null;
    }
    const p = game.player;

    // Vision.
    const v = this.viewer(game);
    let seen = canSee(this.grid, v, p.x, p.y);
    if (seen > 0 && this.state !== 'chase') {
      const dist = Math.hypot(p.x - this.x, p.y - this.y);
      let rate = 0.85 + 2.6 * seen;
      if (p.mode === 'sneak') rate *= 0.6;
      if (p.disguise > 0 && p.mode !== 'sprint' && dist > 1.6 * TILE) rate *= 0.12;
      if (game.blackout > 0) rate *= 0.7;
      this.suspicion = Math.min(1, this.suspicion + rate * dt);
      this.lastSeen = { x: p.x, y: p.y };
      if (this.suspicion >= 1) {
        this.startChase(game);
      } else if (this.suspicion > 0.3 && this.state !== 'notice') {
        this.goInvestigate(p.x, p.y, false);
        this.noticeT = 0.9;
        this.mark = '?';
        this.markT = 1.4;
      } else if (this.state === 'notice') {
        this.target = { x: p.x, y: p.y };
      }
    } else if (this.state !== 'chase') {
      this.suspicion = Math.max(0, this.suspicion - 0.35 * dt);
    }
    this.seeing = seen;

    switch (this.state) {
      case 'patrol': this.updatePatrol(dt, game); break;
      case 'notice': this.updateNotice(dt, game); break;
      case 'investigate': this.updateInvestigate(dt, game); break;
      case 'look': this.updateLook(dt, game); break;
      case 'chase': this.updateChase(dt, game, seen); break;
      case 'search': this.updateSearch(dt, game); break;
      case 'return': this.updateReturn(dt, game); break;
    }
  }

  startChase(game) {
    const wasChasing = this.state === 'chase';
    this.setState('chase');
    this.suspicion = 1;
    this.target = { x: game.player.x, y: game.player.y };
    this.lostT = 0;
    this.mark = '!';
    this.markT = 2.2;
    if (!wasChasing) game.onSpotted(this);
  }

  updatePatrol(dt, game) {
    const route = this.spec.route;
    const wp = route[this.routeIdx];
    if (this.waitT > 0) {
      this.waitT -= dt;
      // Look around while standing still.
      if (route.length === 1) {
        const sweep = this.spec.sweep ?? 0.9;
        this.turnTo(this.baseFacing + Math.sin(this.t * 0.55) * sweep, dt, 2);
      } else if (wp.look !== undefined) {
        this.turnTo(wp.look, dt, 3);
      } else if (this.waitTotal > 1) {
        const k = 1 - this.waitT / this.waitTotal;
        this.turnTo(this.arrivedFacing + Math.sin(k * Math.PI * 2) * 0.9, dt, 3);
      }
      return;
    }
    if (route.length === 1) {
      // A posted guard that was pulled away walks back to its spot.
      const c = centre(wp.cx, wp.cy);
      if (Math.hypot(c.x - this.x, c.y - this.y) > 3) {
        this.moveToward(wp.cx, wp.cy, PATROL_SPEED * this.speedMul, dt);
      } else {
        this.waitT = Infinity;
      }
      return;
    }
    const arrived = this.moveToward(wp.cx, wp.cy, PATROL_SPEED * this.speedMul, dt);
    if (arrived) {
      this.arrivedFacing = this.facing;
      let next = this.routeIdx + 1;
      if (next >= route.length) next = this.spec.loop ? 0 : this.routeIdx;
      this.routeIdx = next;
      this.waitT = this.waitTotal = wp.wait;
      this.path = null;
    }
  }

  updateNotice(dt, game) {
    const a = Math.atan2(this.target.y - this.y, this.target.x - this.x);
    this.turnTo(a, dt, 6);
    this.noticeT -= dt;
    if (this.noticeT <= 0) {
      if (this.seeing === 0 && this.suspicion < 0.05 && !this.alert && this.stateT > 2.5) {
        this.setState('return');
        return;
      }
      if (this.seeing === 0 || this.alert || this.stateT > 1.4) {
        this.setState('investigate');
      }
    }
  }

  updateInvestigate(dt, game) {
    const tc = this.cellOf(this.target.x, this.target.y);
    const speed = (this.alert ? ALERT_SPEED : INVESTIGATE_SPEED) * this.speedMul;
    const arrived = this.moveToward(tc.cx, tc.cy, speed, dt, 0.6 * TILE);
    if (arrived || this.stateT > 14 || this.unreachable) {
      this.unreachable = false;
      this.setState('look');
      this.lookBase = this.facing;
    }
  }

  updateLook(dt, game) {
    this.turnTo(this.lookBase + Math.sin(this.stateT * 2.2) * 1.3, dt, 4);
    if (this.stateT > 2.8) {
      this.alert = false;
      this.setState('return');
    }
  }

  updateChase(dt, game, seen) {
    const p = game.player;
    if (seen > 0) {
      this.target = { x: p.x, y: p.y };
      this.lostT = 0;
    } else {
      this.lostT += dt;
    }
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    if (d < GUARD_RADIUS + 8 + 5 && seen > 0) {
      game.onCaught(this);
      return;
    }
    // Run straight at a visible player, otherwise path to the last place they were.
    if (seen > 0 && lineOfSight(this.grid, this.x, this.y, p.x, p.y) && this.clearLine(p.x, p.y)) {
      this.path = null;
      this.stepToward(p.x, p.y, CHASE_SPEED * this.speedMul, dt, 9);
    } else {
      const tc = this.cellOf(this.target.x, this.target.y);
      this.repathT -= dt;
      if (this.repathT <= 0) {
        this.path = null;
        this.repathT = 0.3;
      }
      const arrived = this.moveToward(tc.cx, tc.cy, CHASE_SPEED * this.speedMul, dt, 0.4 * TILE, 9);
      if ((arrived && seen === 0) || this.lostT > 5 || this.unreachable) {
        this.unreachable = false;
        this.setState('search');
        this.lookBase = this.facing;
        this.mark = '?';
        this.markT = 2.5;
      }
    }
  }

  updateSearch(dt, game) {
    this.turnTo(this.lookBase + Math.sin(this.stateT * 2.6) * 1.6, dt, 5);
    this.suspicion = Math.max(0.2, this.suspicion);
    if (this.stateT > 3.2) {
      this.suspicion = 0;
      this.setState('return');
      game.emit({ type: 'lost', guard: this });
    }
  }

  updateReturn(dt, game) {
    const route = this.spec.route;
    if (this.stateT < 0.05) {
      // Head for the nearest waypoint on the route.
      let best = this.routeIdx, bd = Infinity;
      route.forEach((wp, i) => {
        const c = centre(wp.cx, wp.cy);
        const d = Math.hypot(c.x - this.x, c.y - this.y);
        if (d < bd) { bd = d; best = i; }
      });
      this.routeIdx = best;
    }
    const wp = route[this.routeIdx];
    const arrived = this.moveToward(wp.cx, wp.cy, PATROL_SPEED * this.speedMul, dt);
    if (arrived || this.unreachable) {
      this.unreachable = false;
      this.state = 'patrol';
      this.stateT = 0;
      this.path = null;
      this.waitT = this.waitTotal = route.length === 1 ? Infinity : 0.8;
      this.arrivedFacing = this.facing;
      if (route.length === 1) this.baseFacing = this.spec.dir ?? this.facing;
    }
  }

  // ---------------------------------------------------------------- movement

  cellOf(x, y) {
    return { cx: Math.floor(x / TILE), cy: Math.floor(y / TILE) };
  }

  /** Is a guard-wide corridor clear between here and (x, y)? */
  clearLine(x, y) {
    const dx = x - this.x, dy = y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = (-dy / d) * (GUARD_RADIUS - 1), ny = (dx / d) * (GUARD_RADIUS - 1);
    return (
      lineOfSight(this.grid, this.x + nx, this.y + ny, x + nx, y + ny) &&
      lineOfSight(this.grid, this.x - nx, this.y - ny, x - nx, y - ny)
    );
  }

  /** Walk along an A* path to a cell. Returns true on arrival. */
  moveToward(cx, cy, speed, dt, arriveDist = 2, turnRate = 5) {
    const goal = centre(cx, cy);
    if (Math.hypot(goal.x - this.x, goal.y - this.y) <= arriveDist) return true;
    if (!this.path || this.pathGoal !== cy * this.grid.w + cx) {
      const s = nearestWalkable(this.grid, Math.floor(this.x / TILE), Math.floor(this.y / TILE));
      const g = nearestWalkable(this.grid, cx, cy);
      this.path = s && g ? findPath(this.grid, s.cx, s.cy, g.cx, g.cy) : null;
      this.pathGoal = cy * this.grid.w + cx;
      if (!this.path) {
        this.unreachable = true;
        return false;
      }
    }
    // Skip waypoints we can already walk straight to.
    while (this.path.length > 1) {
      const n = centre(this.path[1].cx, this.path[1].cy);
      if (this.clearLine(n.x, n.y) && lineOfSight(this.grid, this.x, this.y, n.x, n.y)) this.path.shift();
      else break;
    }
    if (!this.path.length) {
      return this.stepToward(goal.x, goal.y, speed, dt, turnRate) <= arriveDist;
    }
    const n = centre(this.path[0].cx, this.path[0].cy);
    const left = this.stepToward(n.x, n.y, speed, dt, turnRate);
    if (left < 3) this.path.shift();
    return Math.hypot(goal.x - this.x, goal.y - this.y) <= arriveDist;
  }

  /** Move straight at a point. Returns the remaining distance. */
  stepToward(x, y, speed, dt, turnRate = 5) {
    const dx = x - this.x, dy = y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) return 0;
    const a = Math.atan2(dy, dx);
    this.turnTo(a, dt, turnRate);
    // Slow down while turning sharply, so guards don't moonwalk round corners.
    const align = Math.max(0.25, Math.cos(angleDiff(a, this.facing)));
    const step = Math.min(d, speed * dt * align);
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    return d - step;
  }

  turnTo(a, dt, rate) {
    const diff = angleDiff(a, this.facing);
    const max = rate * dt;
    this.facing += Math.abs(diff) <= max ? diff : Math.sign(diff) * max;
  }
}
