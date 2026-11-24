// Canvas 2D renderer. The sheet (paper, walls, hatching, notes, dimensions) is drawn
// once per level into an offscreen layer; each frame copies it and draws the moving
// parts on top: cones, guards, the pencil mark, lasers, noise rings and stamps.

import { TILE, CELL, floodFill } from './level.js';
import { visionPolygon } from './vision.js';
import { INK, FONT_HAND, FONT_NUM, paintPaper, makeCanvas, drawIcon, makeStamp, roundRect } from './art.js';

export const MARGIN = 3; // tiles of paper around the building
const M_PER_TILE = 0.8; // metres per tile, for the dimension lines
const MAX_LAYER_PX = 7_000_000;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.cssW = 1;
    this.cssH = 1;
    this.dpr = 1;
    this.cam = { x: 0, y: 0, zoom: 1, follow: false };
    this.effects = [];
    this.flash = 0;
    this.shake = 0;
    this.poly = new Float32Array(2 * 64);
    this.layer = null;
    this.level = null;
    this.bang = makeStamp('!', INK.stampRed, { px: 46, seed: 11 });
    this.hatch = this.makeHighlighter();
    this.safeBottom = 0; // CSS px covered by the HUD at the bottom
    this.minTilePx = 22; // never draw a tile smaller than this (CSS px); follow the player instead
  }

  makeHighlighter() {
    // Marker strokes: soft diagonal bands, so cones read as highlighter, not flat fills.
    const c = makeCanvas(20, 20);
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255, 214, 110, 0.2)';
    g.lineWidth = 4;
    for (let i = -20; i <= 40; i += 10) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i - 20, 20);
      g.stroke();
    }
    return this.ctx.createPattern(c, 'repeat');
  }

  resize(cssW, cssH, dpr) {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    if (this.level) {
      const need = this.layerScaleFor();
      if (!this.layer || Math.abs(need - this.layerScale) / this.layerScale > 0.25) this.buildLayer();
      this.fitCamera(true);
    }
  }

  // ---------------------------------------------------------------- the sheet

  /**
   * @param level   parsed level (from parseLevel)
   * @param info    { title, building, drawing, sheetNo, resolve(text) }
   */
  setLevel(level, info) {
    this.level = level;
    this.info = info;
    this.worldW = (level.w + MARGIN * 2) * TILE;
    this.worldH = (level.h + MARGIN * 2) * TILE;
    this.effects = [];
    this.flash = 0;
    this.buildLayer();
    this.fitCamera(true);
  }

  refreshNotes() {
    if (this.level) this.buildLayer();
  }

  fitZoom() {
    const fit = Math.min(this.cssW / this.worldW, (this.cssH - this.safeBottom * 0.5) / this.worldH);
    const min = this.minTilePx / TILE;
    if (fit >= min) return fit;
    // Following the player anyway: fill more of a tall (or wide) screen, within reason.
    const cover = Math.max(this.cssW / this.worldW, this.cssH / this.worldH);
    // (In portrait, keep the wider view across instead.)
    return this.cssW < this.cssH ? min : Math.max(min, Math.min(cover, min * 1.2));
  }

  layerScaleFor() {
    const z = this.fitZoom() * this.dpr;
    let s = Math.min(2.2, Math.max(1, z));
    while (this.worldW * s * this.worldH * s > MAX_LAYER_PX || this.worldW * s > 8000 || this.worldH * s > 8000) s *= 0.85;
    return s;
  }

  buildLayer() {
    const L = this.level;
    const s = this.layerScaleFor();
    this.layerScale = s;
    const W = Math.round(this.worldW * s), H = Math.round(this.worldH * s);
    const c = this.layer && this.layer.width === W && this.layer.height === H ? this.layer : makeCanvas(W, H);
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    paintPaper(g, W, H, hashString(L.id), s);
    const o = MARGIN * TILE;
    g.setTransform(s, 0, 0, s, o * s, o * s);
    drawSheet(g, L, this.info, s);
    this.layer = c;
  }

  // ---------------------------------------------------------------- camera

  fitCamera(snap) {
    if (!this.level) return;
    const z = this.fitZoom();
    this.cam.zoom = z;
    this.cam.follow = this.worldW * z > this.cssW + 1 || this.worldH * z > this.cssH - this.safeBottom * 0.5 + 1;
    if (snap) {
      this.cam.x = this.level.w * TILE * 0.5;
      this.cam.y = this.level.h * TILE * 0.5;
      this.snapNext = true;
    }
  }

  updateCamera(dt, focus) {
    const c = this.cam;
    const halfW = this.cssW / 2 / c.zoom, halfH = (this.cssH - this.safeBottom) / 2 / c.zoom;
    let tx = this.level.w * TILE * 0.5, ty = this.level.h * TILE * 0.5;
    if (focus) {
      tx = focus.x;
      ty = focus.y + (this.safeBottom / 2 / c.zoom);
    }
    // Keep the view on the paper.
    const minX = -MARGIN * TILE + halfW, maxX = (this.level.w + MARGIN) * TILE - halfW;
    const minY = -MARGIN * TILE + halfH, maxY = (this.level.h + MARGIN) * TILE - halfH + this.safeBottom / c.zoom;
    const clampTo = (v, a, b) => (a > b ? (a + b) / 2 : Math.max(a, Math.min(b, v)));
    if (!focus || !c.follow) {
      tx = this.level.w * TILE * 0.5;
      ty = this.level.h * TILE * 0.5 + this.safeBottom / 4 / c.zoom;
    }
    tx = clampTo(tx, minX, maxX);
    ty = clampTo(ty, minY, maxY);
    if (this.snapNext) {
      c.x = tx; c.y = ty; this.snapNext = false;
    } else {
      const k = 1 - Math.exp(-dt * 4);
      c.x += (tx - c.x) * k;
      c.y += (ty - c.y) * k;
    }
  }

  worldTransform(g) {
    const z = this.cam.zoom * this.dpr;
    let sx = 0, sy = 0;
    if (this.shake > 0) {
      if (this.reduceFlash) this.shake = 0;
      sx = (Math.random() - 0.5) * this.shake * 6;
      sy = (Math.random() - 0.5) * this.shake * 6;
    }
    g.setTransform(z, 0, 0, z, (this.cssW / 2 + sx) * this.dpr - this.cam.x * z, (this.cssH / 2 + sy) * this.dpr - this.cam.y * z);
  }

  // ---------------------------------------------------------------- effects

  /** React to a game event with something on the paper. */
  onEvent(e) {
    if (e.type === 'spotted') {
      this.flash = 1;
      this.shake = 1;
      this.effects.push({ kind: 'bang', follow: e.guard, x: e.x, y: e.y, t: 0, life: 1.9, rot: (Math.random() - 0.5) * 0.5 });
    } else if (e.type === 'alarm') {
      this.flash = 0.8;
      this.shake = 0.7;
      this.effects.push({ kind: 'bang', x: e.x, y: e.y, t: 0, life: 1.9, rot: (Math.random() - 0.5) * 0.5 });
    } else if (e.type === 'caught') {
      this.flash = 1;
      this.shake = 1.4;
    } else if (e.type === 'target' || e.type === 'loot') {
      this.effects.push({ kind: 'tick', x: e.x, y: e.y, t: 0, life: 1.1, big: e.type === 'target' });
    } else if (e.type === 'unlock') {
      this.effects.push({ kind: 'tick', x: e.x, y: e.y, t: 0, life: 0.9 });
    }
  }

  // ---------------------------------------------------------------- frame

  draw(game, dt, ui = {}) {
    const g = this.ctx;
    this.flash = Math.max(0, this.flash - dt * 3.5);
    this.shake = Math.max(0, this.shake - dt * 4);
    if (game) this.updateCamera(dt, game.player);
    else this.updateCamera(dt, null);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = INK.table;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.worldTransform(g);
    const o = MARGIN * TILE;
    // Sheet shadow on the drafting table, then the sheet.
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(-o + 6, -o + 8, this.worldW, this.worldH);
    g.drawImage(this.layer, -o, -o, this.worldW, this.worldH);

    if (game) this.drawWorld(g, game, dt, ui);

    // Paper flash when spotted.
    if (this.flash > 0 && !this.reduceFlash) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = `rgba(235, 245, 255, ${this.flash * 0.32})`;
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  drawWorld(g, game, dt, ui) {
    const t = game.t;
    const z = this.cam.zoom;
    const px = 1 / z; // one CSS pixel in world units

    if (game.blackout > 0) {
      const k = Math.min(1, game.blackout * 2, (10 - game.blackout) * 4);
      g.fillStyle = `rgba(1, 8, 22, ${0.55 * k})`;
      g.fillRect(-MARGIN * TILE, -MARGIN * TILE, this.worldW, this.worldH);
    }

    this.drawExit(g, game, t);
    this.drawDoors(g, game);
    for (const f of game.fuses) this.drawFixture(g, f, 'fuse', f.used, 'FUSE');
    for (const w of game.wardrobes) this.drawFixture(g, w, 'uniform', w.used, 'LOCKER');
    for (const l of game.loot) if (!l.taken) this.drawLoot(g, l, t);
    if (!game.target.taken) this.drawTarget(g, game.target, t);
    for (const c of game.coinsDown) this.drawCoin(g, c.x, c.y, 1 - Math.max(0, c.t - 8));
    if (!game.hidePlayer) this.drawTrail(g, game);

    // Cones under everything that moves.
    for (const c of game.cameras) this.drawCameraCone(g, game, c, px);
    for (const gd of game.guards) this.drawGuardCone(g, game, gd);
    for (const l of game.lasers) this.drawLaser(g, l, t);
    this.drawNoises(g, game, px);

    if (ui.coinPreview && game.player.coins > 0 && !game.lockpick) this.drawCoinPreview(g, game, px);
    for (const c of game.cameras) this.drawCameraBody(g, c);
    for (const gd of game.guards) this.drawGuard(g, gd, game);
    for (const c of game.coinsFlying) {
      const k = c.t / c.dur;
      const x = c.sx + (c.tx - c.sx) * k, y = c.sy + (c.ty - c.sy) * k;
      const hgt = Math.sin(k * Math.PI) * 18;
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
      this.drawCoin(g, x, y - hgt, 1);
    }
    if (!game.hidePlayer) this.drawPlayer(g, game, t);
    this.drawEffects(g, dt);
    if (game.prompt && !game.lockpick) this.drawPrompt(g, game.prompt, ui, px);
    if (game.lockpick) this.drawLockpick(g, game, px);
  }

  drawExit(g, game, t) {
    const e = game.exit;
    const live = game.player.hasTarget;
    g.save();
    g.translate(e.x, e.y);
    g.strokeStyle = live ? INK.line : INK.lineSoft;
    g.lineWidth = 1.2;
    g.setLineDash([4, 3]);
    g.lineDashOffset = live ? -t * 20 : 0;
    g.strokeRect(-13, -13, 26, 26);
    g.setLineDash([]);
    g.fillStyle = live ? INK.line : INK.lineSoft;
    g.font = `600 8px ${FONT_NUM}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('EXIT', 0, 0);
    if (live) {
      const p = 1 + Math.sin(t * 5) * 0.08;
      g.globalAlpha = 0.5 + Math.sin(t * 5) * 0.3;
      g.strokeRect(-17 * p, -17 * p, 34 * p, 34 * p);
    }
    g.restore();
  }

  drawDoors(g, game) {
    for (const d of game.doors) {
      const x0 = d.cx * TILE, y0 = d.cy * TILE;
      g.save();
      if (d.locked) {
        // Closed leaf, drawn heavy, with a padlock.
        g.strokeStyle = INK.line;
        g.lineWidth = 3;
        g.beginPath();
        if (d.horizontal) { g.moveTo(x0, y0 + TILE / 2); g.lineTo(x0 + TILE, y0 + TILE / 2); }
        else { g.moveTo(x0 + TILE / 2, y0); g.lineTo(x0 + TILE / 2, y0 + TILE); }
        g.stroke();
        g.fillStyle = INK.paper;
        g.beginPath();
        g.arc(x0 + TILE / 2, y0 + TILE / 2, 7, 0, Math.PI * 2);
        g.fill();
        g.translate(x0 + TILE / 2, y0 + TILE / 2);
        g.strokeStyle = INK.amber;
        drawIcon(g, 'padlock', 12);
      } else {
        // Door leaf swung open with a dashed swing arc.
        const a = (d.open ?? 1) * Math.PI / 2;
        g.strokeStyle = INK.lineSoft;
        g.lineWidth = 1;
        let hx, hy, a0;
        if (d.horizontal) { hx = x0; hy = y0 + TILE / 2; a0 = 0; }
        else { hx = x0 + TILE / 2; hy = y0; a0 = Math.PI / 2; }
        const dir = d.horizontal ? -1 : 1;
        g.beginPath();
        g.moveTo(hx, hy);
        g.lineTo(hx + Math.cos(a0 + a * dir) * TILE, hy + Math.sin(a0 + a * dir) * TILE);
        g.stroke();
        g.setLineDash([2, 3]);
        g.lineWidth = 0.7;
        g.beginPath();
        if (dir < 0) g.arc(hx, hy, TILE, a0 - a, a0);
        else g.arc(hx, hy, TILE, a0, a0 + a);
        g.stroke();
      }
      g.restore();
    }
  }

  drawFixture(g, f, icon, used, label) {
    const x = (f.cx + 0.5) * TILE, y = (f.cy + 0.5) * TILE;
    g.save();
    g.translate(x, y);
    g.strokeStyle = used ? INK.lineFaint : INK.line;
    g.lineWidth = 1;
    g.strokeRect(-11, -11, 22, 22);
    g.strokeStyle = used ? INK.lineFaint : INK.amber;
    drawIcon(g, icon, 15);
    if (used) {
      g.strokeStyle = INK.lineSoft;
      g.beginPath();
      g.moveTo(-11, -11); g.lineTo(11, 11);
      g.stroke();
    }
    g.fillStyle = INK.lineSoft;
    g.font = `7px ${FONT_HAND}`;
    g.textAlign = 'center';
    g.fillText(label, 0, 19);
    g.restore();
  }

  drawLoot(g, l, t) {
    g.save();
    g.translate(l.x, l.y + Math.sin(t * 2 + l.cx) * 1.2);
    g.strokeStyle = INK.line;
    drawIcon(g, 'gem', 13);
    g.restore();
  }

  drawTarget(g, tg, t) {
    g.save();
    g.translate(tg.x, tg.y);
    g.strokeStyle = INK.amber;
    g.lineWidth = 1.2;
    g.setLineDash([3, 3]);
    g.lineDashOffset = -t * 8;
    g.beginPath();
    g.arc(0, 0, 14 + Math.sin(t * 3) * 1, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = INK.line;
    drawIcon(g, tg.kind, 18);
    g.restore();
  }

  drawCoin(g, x, y, a) {
    g.save();
    g.globalAlpha = Math.max(0, a);
    g.translate(x, y);
    g.strokeStyle = INK.amber;
    g.fillStyle = 'rgba(255,178,30,0.35)';
    g.beginPath();
    g.arc(0, 0, 3.4, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  }

  drawTrail(g, game) {
    const tr = game.trail;
    if (tr.length < 2) return;
    g.save();
    g.fillStyle = INK.red;
    const now = game.t;
    for (let i = 0; i < tr.length; i += 1) {
      const p = tr[i];
      const age = now - p.t;
      const a = Math.max(0, 0.42 - age * 0.05) * (i / tr.length);
      if (a <= 0.01) continue;
      g.globalAlpha = a;
      g.fillRect(p.x - 0.9, p.y - 0.9, 1.8, 1.8);
    }
    g.restore();
  }

  drawGuardCone(g, game, gd) {
    const v = gd.viewer(game);
    const n = visionPolygon(game.grid, v.x, v.y, v.facing, v.halfAngle, v.range, 30, this.poly);
    const sus = gd.state === 'chase' ? 1 : gd.suspicion;
    g.save();
    g.beginPath();
    g.moveTo(this.poly[0], this.poly[1]);
    for (let i = 2; i < n; i += 2) g.lineTo(this.poly[i], this.poly[i + 1]);
    g.closePath();
    // Amber highlighter, warming to red as the guard grows suspicious. Strong near the
    // guard and fading towards the edge of their sight.
    const r = 255, gr = Math.round(184 - sus * 120), b = Math.round(28 + sus * 16);
    const grad = g.createRadialGradient(v.x, v.y, 0, v.x, v.y, v.range);
    grad.addColorStop(0, `rgba(${r}, ${gr}, ${b}, ${0.62 + sus * 0.1})`);
    grad.addColorStop(0.55, `rgba(${r}, ${gr}, ${b}, ${0.4 + sus * 0.12})`);
    grad.addColorStop(1, `rgba(${r}, ${gr}, ${b}, ${0.2 + sus * 0.12})`);
    g.fillStyle = grad;
    g.fill();
    g.fillStyle = this.hatch;
    g.fill();
    g.strokeStyle = `rgba(255, ${Math.min(255, gr + 40)}, ${b + 60}, 0.95)`;
    g.lineWidth = 1.2;
    g.stroke();
    // All-round awareness ring.
    g.setLineDash([1.5, 3]);
    g.strokeStyle = 'rgba(255, 200, 90, 0.35)';
    g.beginPath();
    g.arc(v.x, v.y, v.near, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  drawCameraCone(g, game, c, px) {
    if (game.blackout > 0) return;
    g.save();
    // The whole sweep, as a faint dashed arc.
    g.strokeStyle = 'rgba(234,243,255,0.28)';
    g.lineWidth = 0.8;
    g.setLineDash([3, 4]);
    g.beginPath();
    g.arc(c.mountX, c.mountY, c.range, c.base - c.sweep - c.halfAngle, c.base + c.sweep + c.halfAngle);
    g.stroke();
    // What it sees right now.
    const n = visionPolygon(game.grid, c.mountX, c.mountY, c.angle, c.halfAngle, c.range, 20, this.poly);
    g.beginPath();
    g.moveTo(this.poly[0], this.poly[1]);
    for (let i = 2; i < n; i += 2) g.lineTo(this.poly[i], this.poly[i + 1]);
    g.closePath();
    const hot = c.track > 0 ? 1 : c.meter;
    g.fillStyle = `rgba(255, ${Math.round(190 - hot * 120)}, 60, ${0.12 + hot * 0.2})`;
    g.fill();
    g.strokeStyle = hot > 0.05 ? `rgba(255, ${Math.round(190 - hot * 120)}, 80, 0.9)` : 'rgba(255, 210, 120, 0.75)';
    g.lineWidth = 1.1;
    g.setLineDash([5, 3]);
    g.lineDashOffset = -game.t * 14;
    g.stroke();
    g.restore();
  }

  drawCameraBody(g, c) {
    g.save();
    g.translate(c.mountX, c.mountY);
    g.rotate(c.angle);
    g.strokeStyle = INK.line;
    g.fillStyle = INK.paper;
    g.lineWidth = 1.2;
    g.fillRect(-6, -4, 11, 8);
    g.strokeRect(-6, -4, 11, 8);
    g.beginPath();
    g.moveTo(5, -2.5); g.lineTo(9, -4); g.lineTo(9, 4); g.lineTo(5, 2.5);
    g.stroke();
    g.fillStyle = c.track > 0 ? INK.red : c.meter > 0 ? INK.amber : 'rgba(234,243,255,0.6)';
    g.beginPath();
    g.arc(-2, 0, 1.6, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  drawLaser(g, l, t) {
    g.save();
    // Emitters at both ends.
    g.fillStyle = INK.line;
    const ex = l.horizontal ? 0 : 3, ey = l.horizontal ? 3 : 0;
    g.fillRect(l.ax - ex - 1.5, l.ay - ey - 1.5, (ex + 1.5) * 2, (ey + 1.5) * 2);
    g.fillRect(l.bx - ex - 1.5, l.by - ey - 1.5, (ex + 1.5) * 2, (ey + 1.5) * 2);
    if (l.active) {
      const flick = 0.85 + Math.sin(t * 40 + l.ax) * 0.15;
      const tripped = l.trip > 0 && Math.floor(t * 8) % 2 === 0;
      g.strokeStyle = `rgba(255, 75, 62, ${0.28 * flick})`;
      g.lineWidth = tripped ? 6 : 4;
      g.beginPath();
      g.moveTo(l.ax, l.ay);
      g.lineTo(l.bx, l.by);
      g.stroke();
      g.strokeStyle = tripped ? '#ffffff' : '#ff6a5c';
      g.lineWidth = 1;
      g.stroke();
    } else {
      g.strokeStyle = 'rgba(255, 110, 100, 0.35)';
      g.lineWidth = 0.8;
      g.setLineDash([1, 4]);
      g.beginPath();
      g.moveTo(l.ax, l.ay);
      g.lineTo(l.bx, l.by);
      g.stroke();
    }
    g.restore();
  }

  drawNoises(g, game, px) {
    g.save();
    for (const n of game.noises) {
      const k = n.t / n.life;
      const r = n.r * (0.25 + 0.75 * easeOut(k));
      g.globalAlpha = (1 - k) * 0.8;
      g.strokeStyle = n.kind === 'alarm' ? INK.red : n.kind === 'coin' ? INK.amber : INK.line;
      g.lineWidth = 1.2;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.arc(n.x, n.y, r, 0, Math.PI * 2);
      g.stroke();
      if (k < 0.5) {
        g.beginPath();
        g.arc(n.x, n.y, r * 0.6, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.restore();
  }

  drawCoinPreview(g, game, px) {
    const p = game.player;
    const to = game.coinLanding();
    g.save();
    g.globalAlpha = p.moving ? 0.25 : 0.5;
    g.strokeStyle = INK.amber;
    g.lineWidth = 0.8;
    g.setLineDash([1, 4]);
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(to.x, to.y);
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    g.moveTo(to.x - 4, to.y - 4); g.lineTo(to.x + 4, to.y + 4);
    g.moveTo(to.x + 4, to.y - 4); g.lineTo(to.x - 4, to.y + 4);
    g.stroke();
    g.restore();
  }

  drawGuard(g, gd, game) {
    g.save();
    g.translate(gd.x, gd.y);
    // Suspicion meter round the body.
    const sus = gd.state === 'chase' ? 1 : gd.suspicion;
    if (sus > 0.01) {
      g.strokeStyle = sus >= 1 ? INK.red : INK.amber;
      g.lineWidth = 2.4;
      g.beginPath();
      g.arc(0, 0, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sus);
      g.stroke();
    }
    g.rotate(gd.facing);
    g.fillStyle = INK.paperDeep;
    g.strokeStyle = INK.line;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, 9.5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // Shoulders and nose: which way they face.
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-2, -9); g.lineTo(-2, 9);
    g.moveTo(3, 0); g.lineTo(13, 0);
    g.stroke();
    g.beginPath();
    g.arc(2.5, 0, 3, 0, Math.PI * 2);
    g.fillStyle = INK.line;
    g.fill();
    g.restore();

    // Question mark while investigating.
    if (gd.mark === '?' && gd.state !== 'chase') {
      g.save();
      g.fillStyle = INK.line;
      g.font = `16px ${FONT_HAND}`;
      g.textAlign = 'center';
      g.fillText('?', gd.x + 13, gd.y - 13);
      g.restore();
    } else if (gd.state === 'chase') {
      g.save();
      g.fillStyle = INK.stampRed;
      g.font = `700 13px ${FONT_NUM}`;
      g.textAlign = 'center';
      g.fillText('!', gd.x, gd.y - 17);
      g.restore();
    }
  }

  drawPlayer(g, game, t) {
    const p = game.player;
    g.save();
    g.translate(p.x, p.y);
    if (p.disguise > 0) {
      g.strokeStyle = p.disguise < 3 && Math.floor(t * 6) % 2 ? INK.lineFaint : INK.line;
      g.lineWidth = 1;
      g.setLineDash([2, 2]);
      g.beginPath();
      g.arc(0, 0, 11, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    if (p.mode === 'sneak') {
      g.strokeStyle = 'rgba(255, 90, 80, 0.5)';
      g.lineWidth = 0.8;
      g.setLineDash([1.5, 2.5]);
      g.beginPath();
      g.arc(0, 0, 9, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    g.rotate(p.facing);
    // A short, heavy pencil stroke with a dot at its head.
    const scale = p.mode === 'sneak' ? 0.85 : 1;
    g.scale(scale, scale);
    g.strokeStyle = INK.red;
    g.lineCap = 'round';
    g.lineWidth = 3.6;
    g.beginPath();
    g.moveTo(-6, 1.2);
    g.lineTo(3, -0.6);
    g.stroke();
    g.lineWidth = 2;
    g.globalAlpha = 0.6;
    g.beginPath();
    g.moveTo(-5, -2.4);
    g.lineTo(2, -1.8);
    g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = INK.red;
    g.beginPath();
    g.arc(4, 0, 4.4, 0, Math.PI * 2);
    g.fill();
    if (p.mode === 'sprint' && p.moving) {
      g.strokeStyle = 'rgba(255,90,80,0.6)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(-10, -4); g.lineTo(-16, -4);
      g.moveTo(-10, 4); g.lineTo(-16, 4);
      g.stroke();
    }
    if (p.hasTarget) {
      g.rotate(-p.facing);
      g.strokeStyle = INK.amber;
      g.lineWidth = 1;
      drawIcon(g, 'gem', 7);
    }
    g.restore();
  }

  drawEffects(g, dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      if (e.t >= e.life) {
        this.effects.splice(i, 1);
        continue;
      }
      if (e.kind === 'bang') {
        const x = (e.follow ? e.follow.x : e.x) + 18, y = (e.follow ? e.follow.y : e.y) - 22;
        const k = Math.min(1, e.t / 0.12);
        const scale = 2.2 - easeOut(k) * 1.4;
        const a = e.t > e.life - 0.4 ? (e.life - e.t) / 0.4 : Math.min(1, k * 1.5);
        g.save();
        g.translate(x, y);
        g.rotate(e.rot);
        g.globalAlpha = a;
        const w = 30 * scale * (this.bang.width / this.bang.height);
        const h = 30 * scale;
        g.drawImage(this.bang, -w / 2, -h / 2, w, h);
        g.restore();
      } else if (e.kind === 'tick') {
        const k = e.t / e.life;
        g.save();
        g.translate(e.x, e.y - k * 16);
        g.globalAlpha = 1 - k;
        g.strokeStyle = e.big ? INK.amber : INK.line;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(-6, 0); g.lineTo(-2, 4); g.lineTo(7, -6);
        g.stroke();
        g.restore();
      }
    }
  }

  drawPrompt(g, pr, ui, px) {
    const label = pr.passive ? pr.text : `${ui.useKey ? ui.useKey + ' · ' : ''}${pr.text}`;
    g.save();
    g.font = `600 ${11 * px * 1.2}px ${FONT_NUM}`;
    const w = g.measureText(label).width + 12 * px;
    const h = 16 * px;
    const x = pr.x - w / 2, y = pr.y - 26 - h;
    g.fillStyle = 'rgba(8, 30, 58, 0.92)';
    g.strokeStyle = pr.passive ? INK.lineSoft : INK.amber;
    g.lineWidth = px;
    g.fillRect(x, y, w, h);
    g.strokeRect(x, y, w, h);
    g.beginPath();
    g.moveTo(pr.x, y + h);
    g.lineTo(pr.x, pr.y - 12);
    g.stroke();
    g.fillStyle = pr.passive ? INK.lineSoft : INK.line;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, pr.x, y + h / 2 + px * 0.5);
    g.restore();
  }

  /** The lockpick mini-game, drawn as a detail callout next to the door. */
  drawLockpick(g, game, px) {
    const { door, lp } = game.lockpick;
    const dx = (door.cx + 0.5) * TILE, dy = (door.cy + 0.5) * TILE;
    const R = 52 * Math.max(1, px * 0.9);
    // Put the callout above the door, or below it near the top of the sheet.
    const cy = door.cy > 3 ? dy - R - 30 : dy + R + 30;
    const cx = dx;
    g.save();
    g.strokeStyle = INK.line;
    g.lineWidth = 1.2;
    g.setLineDash([3, 3]);
    g.beginPath();
    g.arc(dx, dy, 15, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(dx, dy + (cy < dy ? -15 : 15));
    g.lineTo(cx, cy + (cy < dy ? R : -R));
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(8, 30, 58, 0.94)';
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 2;
    g.stroke();
    g.lineWidth = 0.8;
    g.beginPath();
    g.arc(cx, cy, R - 4, 0, Math.PI * 2);
    g.stroke();

    // The cylinder: a track with the shear-line window shaded.
    const tw = R * 1.3, th = R * 0.34;
    const tx = cx - tw / 2, ty = cy - th / 2 + R * 0.08;
    g.strokeStyle = INK.line;
    g.lineWidth = 1.2;
    g.strokeRect(tx, ty, tw, th);
    const wx = tx + tw * (lp.centre - lp.width / 2);
    g.fillStyle = 'rgba(255, 178, 30, 0.45)';
    g.fillRect(wx, ty, tw * lp.width, th);
    g.strokeStyle = INK.amber;
    g.strokeRect(wx, ty, tw * lp.width, th);
    // Hatching in the window.
    g.save();
    g.beginPath();
    g.rect(wx, ty, tw * lp.width, th);
    g.clip();
    g.strokeStyle = 'rgba(255, 210, 120, 0.6)';
    g.lineWidth = 0.7;
    for (let i = -th; i < tw * lp.width + th; i += 4) {
      g.beginPath();
      g.moveTo(wx + i, ty + th);
      g.lineTo(wx + i + th, ty);
      g.stroke();
    }
    g.restore();
    // Needle.
    const nx = tx + tw * lp.needle;
    g.strokeStyle = lp.inWindow() ? INK.amber : INK.red;
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(nx, ty - 6);
    g.lineTo(nx, ty + th + 6);
    g.stroke();
    // Pins.
    const pw = 8, gap = 5;
    const total = lp.pins * pw + (lp.pins - 1) * gap;
    for (let i = 0; i < lp.pins; i++) {
      const x = cx - total / 2 + i * (pw + gap);
      const y = cy - R * 0.52;
      g.strokeStyle = INK.line;
      g.lineWidth = 1;
      g.strokeRect(x, y, pw, 12);
      if (i < lp.set) {
        g.fillStyle = INK.line;
        g.fillRect(x + 1.5, y + 1.5, pw - 3, 9);
      }
    }
    if (lp.flash !== 0) {
      g.strokeStyle = lp.flash > 0 ? `rgba(255,255,255,${lp.flash})` : `rgba(255,75,62,${-lp.flash})`;
      g.lineWidth = 4;
      g.beginPath();
      g.arc(cx, cy, R + 3, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = INK.line;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${9 * Math.max(1, px)}px ${FONT_HAND}`;
    g.fillText('DETAIL A · LOCK CYLINDER', cx, cy + R * 0.56);
    g.font = `600 ${8 * Math.max(1, px)}px ${FONT_NUM}`;
    g.fillStyle = INK.lineSoft;
    g.fillText(`${lp.set}/${lp.pins} PINS`, cx, cy + R * 0.74);
    g.restore();
  }
}

// ---------------------------------------------------------------- the static sheet

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function easeOut(k) {
  return 1 - (1 - k) * (1 - k);
}

function drawSheet(g, L, info, s) {
  const T = TILE;
  const grid = L.grid;
  const W = L.w * T, H = L.h * T;
  const ox = -MARGIN * T, oy = -MARGIN * T;
  const SW = (L.w + MARGIN * 2) * T, SH = (L.h + MARGIN * 2) * T;
  const hair = 0.6 / Math.min(1, s);

  // Drafting grid: fine every tile, stronger every five.
  g.save();
  g.lineWidth = hair;
  for (let i = -MARGIN + 1; i < L.w + MARGIN; i++) {
    g.strokeStyle = i % 5 === 0 ? 'rgba(170, 205, 245, 0.11)' : 'rgba(170, 205, 245, 0.05)';
    g.beginPath();
    g.moveTo(i * T, oy + T * 0.6);
    g.lineTo(i * T, oy + SH - T * 0.6);
    g.stroke();
  }
  for (let j = -MARGIN + 1; j < L.h + MARGIN; j++) {
    g.strokeStyle = j % 5 === 0 ? 'rgba(170, 205, 245, 0.11)' : 'rgba(170, 205, 245, 0.05)';
    g.beginPath();
    g.moveTo(ox + T * 0.6, j * T);
    g.lineTo(ox + SW - T * 0.6, j * T);
    g.stroke();
  }
  g.restore();

  // Sheet frame.
  g.save();
  g.strokeStyle = INK.lineSoft;
  g.lineWidth = 1.6;
  g.strokeRect(ox + T * 0.6, oy + T * 0.6, SW - T * 1.2, SH - T * 1.2);
  g.lineWidth = 0.6;
  g.strokeRect(ox + T * 0.75, oy + T * 0.75, SW - T * 1.5, SH - T * 1.5);
  // Grid reference ticks along the frame.
  g.font = `7px ${FONT_NUM}`;
  g.fillStyle = INK.lineSoft;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const cols = Math.max(2, Math.round((L.w + MARGIN * 2) / 6));
  for (let i = 0; i < cols; i++) {
    const x = ox + T * 0.75 + ((SW - T * 1.5) * (i + 0.5)) / cols;
    g.fillText(String(i + 1), x, oy + T * 0.3);
    g.fillText(String(i + 1), x, oy + SH - T * 0.3);
  }
  const rws = Math.max(2, Math.round((L.h + MARGIN * 2) / 6));
  for (let j = 0; j < rws; j++) {
    const y = oy + T * 0.75 + ((SH - T * 1.5) * (j + 0.5)) / rws;
    g.fillText(String.fromCharCode(65 + j), ox + T * 0.3, y);
    g.fillText(String.fromCharCode(65 + j), ox + SW - T * 0.3, y);
  }
  g.restore();

  // Floor tint inside the building.
  g.save();
  g.fillStyle = 'rgba(200, 225, 255, 0.035)';
  for (let y = 0; y < L.h; y++) {
    for (let x = 0; x < L.w; x++) {
      const c = grid.get(x, y);
      if (c !== CELL.WALL && c !== CELL.VOID) g.fillRect(x * T, y * T, T, T);
    }
  }
  g.restore();

  // Walls: poché hatching clipped to the wall cells.
  const walls = new Path2D();
  for (let y = 0; y < L.h; y++) {
    let x = 0;
    while (x < L.w) {
      if (grid.get(x, y) === CELL.WALL) {
        const x0 = x;
        while (x < L.w && grid.get(x, y) === CELL.WALL) x++;
        walls.rect(x0 * T, y * T, (x - x0) * T, T);
      } else x++;
    }
  }
  g.save();
  g.clip(walls);
  g.fillStyle = 'rgba(4, 20, 44, 0.32)';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(220, 235, 255, 0.34)';
  g.lineWidth = 0.7;
  g.beginPath();
  for (let i = -H; i < W; i += 5) {
    g.moveTo(i, H);
    g.lineTo(i + H, 0);
  }
  g.stroke();
  g.restore();

  // Wall outlines, merged into long runs, overshooting a little at the ends like a draughtsman's line.
  const isWall = (x, y) => grid.get(x, y) === CELL.WALL;
  const isVoid = (x, y) => grid.get(x, y) === CELL.VOID;
  const segs = { inner: [], outer: [] };
  for (let y = 0; y <= L.h; y++) {
    let run = null;
    for (let x = 0; x <= L.w; x++) {
      const a = isWall(x, y - 1), b = isWall(x, y);
      const edge = x < L.w && a !== b;
      const outer = edge && (isVoid(x, y - 1) || isVoid(x, y));
      if (edge && run && run.outer === outer) continue;
      if (run) { (run.outer ? segs.outer : segs.inner).push([run.x * T, y * T, x * T, y * T]); run = null; }
      if (edge) run = { x, outer };
    }
  }
  for (let x = 0; x <= L.w; x++) {
    let run = null;
    for (let y = 0; y <= L.h; y++) {
      const a = isWall(x - 1, y), b = isWall(x, y);
      const edge = y < L.h && a !== b;
      const outer = edge && (isVoid(x - 1, y) || isVoid(x, y));
      if (edge && run && run.outer === outer) continue;
      if (run) { (run.outer ? segs.outer : segs.inner).push([x * T, run.y * T, x * T, y * T]); run = null; }
      if (edge) run = { y, outer };
    }
  }
  g.save();
  g.lineCap = 'butt';
  g.strokeStyle = INK.line;
  const stroke = (list, lw, over) => {
    g.lineWidth = lw;
    g.beginPath();
    for (const [x1, y1, x2, y2] of list) {
      const dx = Math.sign(x2 - x1) * over, dy = Math.sign(y2 - y1) * over;
      g.moveTo(x1 - dx, y1 - dy);
      g.lineTo(x2 + dx, y2 + dy);
    }
    g.stroke();
  };
  stroke(segs.inner, 1.5, 2.2);
  stroke(segs.outer, 2.6, 3.2);
  g.restore();

  // Creaky floorboards.
  g.save();
  g.strokeStyle = 'rgba(234, 243, 255, 0.42)';
  g.lineWidth = 0.7;
  for (const i of L.creaky) {
    const x = (i % L.w) * T, y = Math.floor(i / L.w) * T;
    g.beginPath();
    for (let k = 1; k < 4; k++) {
      g.moveTo(x + 2, y + (T * k) / 4);
      g.lineTo(x + T - 2, y + (T * k) / 4);
    }
    g.stroke();
    g.beginPath();
    g.moveTo(x + T * 0.5, y + 2);
    g.lineTo(x + T * 0.5, y + T * 0.25);
    g.moveTo(x + T * 0.3, y + T * 0.75);
    g.lineTo(x + T * 0.3, y + T - 2);
    g.stroke();
    // a little squiggle: "this one creaks"
    g.beginPath();
    g.moveTo(x + T * 0.62, y + T * 0.56);
    g.quadraticCurveTo(x + T * 0.7, y + T * 0.44, x + T * 0.78, y + T * 0.56);
    g.quadraticCurveTo(x + T * 0.86, y + T * 0.68, x + T * 0.94, y + T * 0.56);
    g.stroke();
  }
  g.restore();

  // Overhead features (a dome, a rooflight) are drawn dashed, as on a real plan.
  g.save();
  g.strokeStyle = 'rgba(234,243,255,0.4)';
  g.lineWidth = 0.8;
  g.setLineDash([7, 5]);
  for (const d of L.def.decor || []) {
    if (d.ellipse) {
      const [cx, cy, rx, ry] = d.ellipse;
      g.beginPath();
      g.ellipse(cx * T, cy * T, rx * T, ry * T, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  g.restore();

  drawDimensions(g, L);

  // Room labels with their floor area.
  g.save();
  g.fillStyle = INK.line;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const [x, y, text] of L.def.labels || []) {
    g.font = `12px ${FONT_HAND}`;
    g.fillStyle = 'rgba(234,243,255,0.9)';
    g.fillText(text, x * T, y * T);
    const w = g.measureText(text).width;
    g.strokeStyle = 'rgba(234,243,255,0.5)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(x * T - w / 2, y * T + 8);
    g.lineTo(x * T + w / 2, y * T + 8);
    g.stroke();
    const area = roomArea(grid, Math.floor(x), Math.floor(y + 0.4));
    if (area) {
      g.font = `600 7px ${FONT_NUM}`;
      g.fillStyle = INK.lineSoft;
      g.fillText(`${area.toFixed(1)} m²`, x * T, y * T + 15);
    }
  }
  g.restore();

  // Hand-lettered notes.
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const n of L.def.notes || []) {
    const text = info.resolve(info.touch && info.touch() && n.touch ? n.touch : n.text);
    const size = n.small ? 8.5 : 10;
    g.font = `${size}px ${FONT_HAND}`;
    g.fillStyle = n.small ? 'rgba(234,243,255,0.75)' : INK.line;
    const x = n.x * T, y = n.y * T;
    g.fillText(text, x, y);
    if (n.to) {
      const w = g.measureText(text).width;
      const tx = n.to[0] * T, ty = n.to[1] * T;
      // Leave from the side of the text nearest the target.
      let sx = Math.max(x - w / 2 - 2, Math.min(x + w / 2 + 2, tx));
      let sy = ty < y ? y - size * 0.7 : y + size * 0.7;
      if (Math.abs(ty - y) < size && (tx < x - w / 2 || tx > x + w / 2)) sy = y;
      g.strokeStyle = 'rgba(234,243,255,0.7)';
      g.lineWidth = 0.7;
      const mx = (sx + tx) / 2 + (ty - sy) * 0.15, my = (sy + ty) / 2 - (tx - sx) * 0.15;
      g.beginPath();
      g.moveTo(sx, sy);
      g.quadraticCurveTo(mx, my, tx, ty);
      g.stroke();
      const a = Math.atan2(ty - my, tx - mx);
      g.beginPath();
      g.moveTo(tx, ty);
      g.lineTo(tx - Math.cos(a - 0.4) * 5, ty - Math.sin(a - 0.4) * 5);
      g.moveTo(tx, ty);
      g.lineTo(tx - Math.cos(a + 0.4) * 5, ty - Math.sin(a + 0.4) * 5);
      g.stroke();
    }
  }
  g.restore();

  // Title strip and north arrow in the margins.
  g.save();
  g.fillStyle = INK.line;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.font = `13px ${FONT_HAND}`;
  g.fillText(`${info.drawing.toUpperCase()} — ${info.title.toUpperCase()}`, ox + T * 1.2, oy + SH - T * 1.35);
  g.font = `600 7.5px ${FONT_NUM}`;
  g.fillStyle = INK.lineSoft;
  g.fillText(`${info.building.toUpperCase()}   ·   SCALE 1:100   ·   DRAWN BY: ???   ·   CHECKED: NOBODY`, ox + T * 1.2, oy + SH - T * 0.95);
  // scale bar
  const bx = ox + T * 1.2, by = oy + SH - T * 1.85;
  for (let i = 0; i < 5; i++) {
    g.fillStyle = i % 2 ? 'rgba(234,243,255,0.15)' : INK.lineSoft;
    g.fillRect(bx + i * T * 1.25, by, T * 1.25, 3);
  }
  g.strokeStyle = INK.lineSoft;
  g.lineWidth = 0.6;
  g.strokeRect(bx, by, T * 6.25, 3);
  g.font = `6px ${FONT_NUM}`;
  g.fillText('0', bx - 1, by - 5);
  g.fillText('5m', bx + T * 6.25 - 4, by - 5);

  const nx = ox + SW - T * 1.6, ny = oy + T * 1.7;
  g.strokeStyle = INK.line;
  g.lineWidth = 0.9;
  g.beginPath();
  g.arc(nx, ny, T * 0.55, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(nx, ny - T * 0.75);
  g.lineTo(nx + T * 0.22, ny + T * 0.3);
  g.lineTo(nx, ny + T * 0.12);
  g.lineTo(nx - T * 0.22, ny + T * 0.3);
  g.closePath();
  g.stroke();
  g.fillStyle = INK.line;
  g.beginPath();
  g.moveTo(nx, ny - T * 0.75);
  g.lineTo(nx + T * 0.22, ny + T * 0.3);
  g.lineTo(nx, ny + T * 0.12);
  g.closePath();
  g.fill();
  g.font = `10px ${FONT_HAND}`;
  g.textAlign = 'center';
  g.fillText('N', nx, ny - T * 1.0);
  g.restore();
}

function roomArea(grid, cx, cy) {
  const c = grid.get(cx, cy);
  if (c === CELL.WALL || c === CELL.VOID) return 0;
  const seen = floodFill(grid, cx, cy, (x, y) => {
    const k = grid.get(x, y);
    return k === CELL.FLOOR;
  });
  let n = 0;
  for (let i = 0; i < seen.length; i++) n += seen[i];
  return n * M_PER_TILE * M_PER_TILE;
}

/** Overall dimensions along the top and left, chain dimensions along the bottom and right. */
function drawDimensions(g, L) {
  const T = TILE;
  const grid = L.grid;
  // Building extents (ignore the void around odd shapes).
  let minX = L.w, maxX = 0, minY = L.h, maxY = 0;
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    if (grid.get(x, y) !== CELL.VOID) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x + 1);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y + 1);
    }
  }
  g.save();
  g.strokeStyle = INK.lineSoft;
  g.fillStyle = INK.lineSoft;
  g.lineWidth = 0.6;
  g.font = `600 7px ${FONT_NUM}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  const tick = (x, y) => {
    g.moveTo(x - 3, y + 3);
    g.lineTo(x + 3, y - 3);
  };
  const hDim = (x1, x2, y, ext0, label = true) => {
    g.beginPath();
    g.moveTo(x1 - 4, y); g.lineTo(x2 + 4, y);
    tick(x1, y); tick(x2, y);
    g.moveTo(x1, ext0); g.lineTo(x1, y + (y < ext0 ? -3 : 3));
    g.moveTo(x2, ext0); g.lineTo(x2, y + (y < ext0 ? -3 : 3));
    g.stroke();
    if (label && x2 - x1 > T * 0.9) g.fillText(`${(((x2 - x1) / T) * M_PER_TILE).toFixed(1)}m`, (x1 + x2) / 2, y - 5);
  };
  const vDim = (y1, y2, x, ext0, label = true) => {
    g.beginPath();
    g.moveTo(x, y1 - 4); g.lineTo(x, y2 + 4);
    tick(x, y1); tick(x, y2);
    g.moveTo(ext0, y1); g.lineTo(x + (x < ext0 ? -3 : 3), y1);
    g.moveTo(ext0, y2); g.lineTo(x + (x < ext0 ? -3 : 3), y2);
    g.stroke();
    if (label && y2 - y1 > T * 0.9) {
      g.save();
      g.translate(x - 5, (y1 + y2) / 2);
      g.rotate(-Math.PI / 2);
      g.fillText(`${(((y2 - y1) / T) * M_PER_TILE).toFixed(1)}m`, 0, 0);
      g.restore();
    }
  };

  hDim(minX * T, maxX * T, minY * T - T * 1.3, minY * T - 4);
  vDim(minY * T, maxY * T, minX * T - T * 1.3, minX * T - 4);

  // Chain along the bottom: where internal walls meet the bottom wall.
  const by = maxY - 1;
  const xs = [minX * T];
  for (let x = minX + 1; x < maxX - 1; x++) {
    if (grid.get(x, by) === CELL.WALL && grid.get(x, by - 1) === CELL.WALL && grid.get(x - 1, by - 1) !== CELL.WALL) xs.push((x + 0.5) * T);
  }
  xs.push(maxX * T);
  if (xs.length > 2) for (let i = 0; i < xs.length - 1; i++) hDim(xs[i], xs[i + 1], maxY * T + T * 1.1, maxY * T + 4);

  const rx = maxX - 1;
  const ys = [minY * T];
  for (let y = minY + 1; y < maxY - 1; y++) {
    if (grid.get(rx, y) === CELL.WALL && grid.get(rx - 1, y) === CELL.WALL && grid.get(rx - 1, y - 1) !== CELL.WALL) ys.push((y + 0.5) * T);
  }
  ys.push(maxY * T);
  if (ys.length > 2) for (let i = 0; i < ys.length - 1; i++) vDim(ys[i], ys[i + 1], maxX * T + T * 1.1, maxX * T + 4);
  g.restore();
}
