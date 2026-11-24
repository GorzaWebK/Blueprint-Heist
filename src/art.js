// Procedural art: cyanotype paper, rubber stamps and line-art icons. Everything is
// drawn in code at start-up; there are no image files.

export const INK = {
  paper: '#0d3866',
  paperDeep: '#082a50',
  paperLight: '#1a4d82',
  line: '#eaf3ff',
  lineSoft: 'rgba(234, 243, 255, 0.55)',
  lineFaint: 'rgba(234, 243, 255, 0.16)',
  amber: '#ffb21e',
  red: '#ff4b3e',
  stampRed: '#e0363c',
  gold: '#e7b43a',
  silver: '#cfd8df',
  bronze: '#c9814c',
  table: '#27251f',
};

export const FONT_HAND = '"Architects Daughter", "Comic Sans MS", cursive';
export const FONT_NUM = '"IBM Plex Sans Condensed", "Arial Narrow", sans-serif';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

let grainTile = null;
function getGrain() {
  if (grainTile) return grainTile;
  const s = 192;
  const c = makeCanvas(s, s);
  const g = c.getContext('2d');
  const img = g.createImageData(s, s);
  const rng = mulberry32(99);
  for (let i = 0; i < s * s; i++) {
    const v = rng();
    const light = v > 0.5;
    img.data[i * 4] = light ? 220 : 0;
    img.data[i * 4 + 1] = light ? 235 : 10;
    img.data[i * 4 + 2] = light ? 255 : 30;
    img.data[i * 4 + 3] = Math.floor(Math.abs(v - 0.5) * 2 * 60 * rng());
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

/**
 * Paint cyanotype paper over a W x H area: uneven Prussian blue, grain, fibres,
 * two fold creases and a soft darker edge.
 */
export function paintPaper(ctx, W, H, seed = 1, scale = 1) {
  const rng = mulberry32(seed);
  ctx.save();
  ctx.fillStyle = INK.paper;
  ctx.fillRect(0, 0, W, H);

  // Uneven exposure: big soft blotches, lighter and darker.
  const big = Math.max(W, H);
  for (let i = 0; i < 46; i++) {
    const x = rng() * W, y = rng() * H;
    const r = big * (0.08 + rng() * 0.28);
    const light = rng() > 0.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.05 + rng() * 0.1;
    g.addColorStop(0, light ? `rgba(40, 100, 160, ${a})` : `rgba(4, 22, 48, ${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Grain.
  const pat = ctx.createPattern(getGrain(), 'repeat');
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  // Fibres.
  ctx.lineCap = 'round';
  for (let i = 0; i < (W * H) / (9000 * scale * scale); i++) {
    const x = rng() * W, y = rng() * H;
    const len = (6 + rng() * 18) * scale;
    const a = rng() * Math.PI;
    ctx.strokeStyle = rng() > 0.4 ? `rgba(200, 225, 255, ${0.03 + rng() * 0.05})` : `rgba(0, 10, 30, ${0.05 + rng() * 0.06})`;
    ctx.lineWidth = (0.5 + rng() * 0.8) * scale;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.6) * len * 0.5, y + Math.sin(a + 0.6) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }

  // Fold creases: one vertical, one horizontal, each a light ridge with a shadow beside it.
  const crease = (vertical, pos) => {
    const len = vertical ? H : W;
    const band = 14 * scale;
    ctx.save();
    if (vertical) {
      const g = ctx.createLinearGradient(pos - band, 0, pos + band, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.45, 'rgba(0, 12, 32, 0.22)');
      g.addColorStop(0.5, 'rgba(150, 190, 235, 0.16)');
      g.addColorStop(0.6, 'rgba(120, 170, 225, 0.06)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(pos - band, 0, band * 2, len);
    } else {
      const g = ctx.createLinearGradient(0, pos - band, 0, pos + band);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.45, 'rgba(0, 12, 32, 0.2)');
      g.addColorStop(0.5, 'rgba(150, 190, 235, 0.14)');
      g.addColorStop(0.6, 'rgba(120, 170, 225, 0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, pos - band, len, band * 2);
    }
    ctx.restore();
  };
  crease(true, W * (0.48 + rng() * 0.06));
  crease(false, H * (0.46 + rng() * 0.08));

  // Darker, more exposed edges.
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(2, 14, 34, 0.5)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Speckle a canvas with tiny holes, so it reads as stamped ink rather than print. */
function inkWear(c, rng, density = 0.5) {
  const g = c.getContext('2d');
  g.save();
  g.globalCompositeOperation = 'destination-out';
  const n = Math.floor(c.width * c.height * 0.004 * density);
  for (let i = 0; i < n; i++) {
    const r = rng() * 2.2 + 0.3;
    g.globalAlpha = 0.3 + rng() * 0.7;
    g.beginPath();
    g.arc(rng() * c.width, rng() * c.height, r, 0, Math.PI * 2);
    g.fill();
  }
  // A few dry streaks.
  g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    g.globalAlpha = 0.25 + rng() * 0.3;
    g.lineWidth = 1 + rng() * 3;
    const y = rng() * c.height;
    g.beginPath();
    g.moveTo(rng() * c.width * 0.3, y);
    g.lineTo(c.width * (0.6 + rng() * 0.4), y + (rng() - 0.5) * 10);
    g.stroke();
  }
  g.restore();
}

/**
 * A rubber stamp: a word (or "!") in a double-ruled box, in one ink colour, worn.
 * Returns a canvas. `px` is the cap height in pixels.
 */
export function makeStamp(text, color, { px = 64, seed = 7, sub = '', box = true } = {}) {
  const rng = mulberry32(seed);
  const pad = px * 0.32;
  const meas = makeCanvas(4, 4).getContext('2d');
  meas.font = `700 ${px}px ${FONT_NUM}`;
  const tw = Math.max(meas.measureText(text).width, px * 0.5);
  meas.font = `600 ${px * 0.24}px ${FONT_NUM}`;
  const sw = sub ? meas.measureText(sub).width : 0;
  const w = Math.max(tw, sw) + pad * 2 + px * 0.2;
  const h = px * (sub ? 1.5 : 1.12) + pad * 2;
  const c = makeCanvas(w + 8, h + 8);
  const g = c.getContext('2d');
  g.translate(4, 4);
  g.strokeStyle = color;
  g.fillStyle = color;
  if (box) {
    g.lineWidth = px * 0.07;
    roundRect(g, px * 0.04, px * 0.04, w - px * 0.08, h - px * 0.08, px * 0.14);
    g.stroke();
    g.lineWidth = px * 0.025;
    roundRect(g, px * 0.15, px * 0.15, w - px * 0.3, h - px * 0.3, px * 0.08);
    g.stroke();
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${px}px ${FONT_NUM}`;
  g.fillText(text, w / 2, sub ? h * 0.42 : h / 2 + px * 0.04);
  if (sub) {
    g.font = `600 ${px * 0.24}px ${FONT_NUM}`;
    g.fillText(sub, w / 2, h * 0.78);
  }
  inkWear(c, rng, 0.8);
  return c;
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ---------------------------------------------------------------- icons
// Line-art icons drawn centred on (0, 0) in a box of about `s` units. The caller
// sets strokeStyle; these only stroke (and sometimes fill small details).

function poly(g, pts, close = true) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  if (close) g.closePath();
  g.stroke();
}

export function drawIcon(g, kind, s) {
  const k = s / 20;
  g.save();
  g.scale(k, k);
  g.lineWidth = 1.4;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  switch (kind) {
    case 'gem': // loot
      poly(g, [-7, -3, -4, -7, 4, -7, 7, -3, 0, 7]);
      poly(g, [-7, -3, 7, -3], false);
      poly(g, [-4, -7, -2, -3, 0, 7, 2, -3, 4, -7], false);
      break;
    case 'cat':
      g.beginPath();
      g.ellipse(0, 3, 5, 6, 0, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(0, -5, 3.6, 0, Math.PI * 2);
      g.stroke();
      poly(g, [-3, -7.5, -2.5, -10.5, -0.8, -8.4], false);
      poly(g, [3, -7.5, 2.5, -10.5, 0.8, -8.4], false);
      g.beginPath();
      g.moveTo(5, 6);
      g.quadraticCurveTo(10, 6, 9, 0);
      g.stroke();
      break;
    case 'bust':
      g.beginPath();
      g.arc(0, -4, 4.5, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(-7, 6);
      g.quadraticCurveTo(-7, 0, 0, 1);
      g.quadraticCurveTo(7, 0, 7, 6);
      g.stroke();
      poly(g, [-4, 6, 4, 6, 5, 9, -5, 9]);
      break;
    case 'sketch':
      g.strokeRect(-8, -7, 16, 14);
      g.strokeRect(-6, -5, 12, 10);
      g.beginPath();
      g.moveTo(-4, 3);
      g.quadraticCurveTo(-1, -4, 1, 0);
      g.quadraticCurveTo(3, 3, 4, -2);
      g.stroke();
      break;
    case 'sapphire':
      poly(g, [0, -9, 7, -2, 4, 8, -4, 8, -7, -2]);
      poly(g, [-7, -2, 0, 1, 7, -2], false);
      poly(g, [0, -9, 0, 1, -4, 8], false);
      poly(g, [0, 1, 4, 8], false);
      break;
    case 'ledger':
      g.strokeRect(-6, -8, 12, 16);
      poly(g, [-4, -8, -4, 8], false);
      for (let y = -4; y <= 4; y += 3) poly(g, [-2, y, 4, y], false);
      break;
    case 'key':
      g.beginPath();
      g.arc(-4, 0, 4, 0, Math.PI * 2);
      g.stroke();
      poly(g, [0, 0, 9, 0, 9, 3, 6, 3, 6, 1.5], false);
      break;
    case 'drive':
      g.strokeRect(-8, -5, 16, 10);
      g.beginPath();
      g.arc(-3.5, 0, 2.5, 0, Math.PI * 2);
      g.arc(3.5, 0, 2.5, 0, Math.PI * 2);
      g.stroke();
      poly(g, [-3.5, 2.5, 3.5, 2.5], false);
      break;
    case 'gold':
      poly(g, [-8, 4, -5, -3, 5, -3, 8, 4]);
      poly(g, [-3, -3, -1, -8, 7, -8, 5, -3], false);
      poly(g, [7, -8, 9, -2, 8, 4], false);
      break;
    case 'astrolabe':
      g.beginPath();
      g.arc(0, 1, 7, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(0, 1, 4, 0, Math.PI * 2);
      g.stroke();
      poly(g, [-7, 1, 7, 1], false);
      poly(g, [0, -6, 0, 8], false);
      g.beginPath();
      g.arc(0, -8, 1.6, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'chart':
      poly(g, [-8, -6, 8, -8, 8, 6, -8, 8]);
      for (const [x, y] of [[-4, -2], [1, -4], [4, 1], [-1, 3], [-5, 4]]) {
        g.beginPath();
        g.arc(x, y, 0.9, 0, Math.PI * 2);
        g.fill();
      }
      poly(g, [-4, -2, 1, -4, 4, 1, -1, 3], false);
      break;
    case 'lens':
      g.beginPath();
      g.ellipse(0, 0, 4, 8, 0, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.ellipse(0, 0, 1.6, 8, 0, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'telescope':
      poly(g, [-8, 2, 6, -6, 8, -3, -6, 5]);
      poly(g, [-1, 1, -4, 9], false);
      poly(g, [-1, 1, 2, 9], false);
      break;
    case 'coin':
      g.beginPath();
      g.arc(0, 0, 6, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, 3.5, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'pick':
      poly(g, [-8, 6, 4, -6], false);
      poly(g, [4, -6, 7, -6, 8, -8], false);
      g.strokeRect(-10, 4, 4, 4);
      break;
    case 'fuse':
      g.strokeRect(-6, -8, 12, 16);
      poly(g, [1, -5, -2, 1, 2, 1, -1, 6], false);
      break;
    case 'uniform':
      poly(g, [-3, -8, 3, -8, 8, -4, 6, -1, 4, -3, 4, 8, -4, 8, -4, -3, -6, -1, -8, -4]);
      poly(g, [-3, -8, 0, -4, 3, -8], false);
      break;
    case 'padlock':
      g.strokeRect(-5, -1, 10, 8);
      g.beginPath();
      g.arc(0, -1, 3.5, Math.PI, 0);
      g.stroke();
      poly(g, [0, 2, 0, 4], false);
      break;
    case 'eye':
      g.beginPath();
      g.moveTo(-8, 0);
      g.quadraticCurveTo(0, -8, 8, 0);
      g.quadraticCurveTo(0, 8, -8, 0);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, 2.5, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'clock':
      g.beginPath();
      g.arc(0, 0, 7, 0, Math.PI * 2);
      g.stroke();
      poly(g, [0, -4, 0, 0, 3, 2], false);
      break;
    default:
      g.beginPath();
      g.arc(0, 0, 6, 0, Math.PI * 2);
      g.stroke();
  }
  g.restore();
}

/** A canvas-drawn favicon: a white pencil-red heist mark on a blueprint square. */
export function makeFavicon() {
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  g.fillStyle = INK.paper;
  roundRect(g, 0, 0, 64, 64, 10);
  g.fill();
  g.strokeStyle = 'rgba(234,243,255,0.22)';
  g.lineWidth = 1;
  for (let i = 8; i < 64; i += 8) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke();
  }
  g.strokeStyle = INK.line;
  g.lineWidth = 4;
  g.strokeRect(9, 9, 46, 46);
  g.fillStyle = 'rgba(255,178,30,0.55)';
  g.beginPath();
  g.moveTo(44, 20);
  g.arc(44, 20, 26, Math.PI * 0.62, Math.PI * 0.95);
  g.closePath();
  g.fill();
  g.fillStyle = INK.line;
  g.beginPath(); g.arc(44, 20, 6, 0, Math.PI * 2); g.fill();
  g.fillStyle = INK.red;
  g.beginPath(); g.arc(22, 44, 5, 0, Math.PI * 2); g.fill();
  return c.toDataURL('image/png');
}
