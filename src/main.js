// Start-up, the main loop, and the flow between menus and sheets.

import '@fontsource/architects-daughter/latin-400.css';
import '@fontsource/ibm-plex-sans-condensed/latin-400.css';
import '@fontsource/ibm-plex-sans-condensed/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-700.css';
import './style.css';

import { LEVELS, BUILDINGS, toolsFor } from './levels.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { Audio } from './audio.js';
import { Input, setupTouch, cloneBindings, DEFAULT_BINDINGS } from './input.js';
import { UI, HUD } from './ui.js';
import { store } from './storage.js';
import { mergeBest, isNewBest } from './scoring.js';
import { makeFavicon, FONT_HAND, FONT_NUM } from './art.js';

const root = document.getElementById('game');
const canvas = document.getElementById('view');
const renderer = new Renderer(canvas);
const audio = new Audio();
const input = new Input(store.bindings());
const hud = new HUD(root);

let mode = 'boot'; // 'menu' | 'play' | 'paused' | 'caught' | 'won'
let index = 0;
let game = null;
let backdrop = null; // a guards-only demo of a sheet, behind the menus
let caughtT = 0;
let introHidden = false;

const settings = store.settings();

function applySettings() {
  const s = store.settings();
  audio.setVolumes(s.music, s.sfx, s.muted);
  root.classList.toggle('muted', !!s.muted);
  renderer.reduceFlash = !!s.reduceFlash;
  root.classList.toggle('reduce-motion', !!s.reduceFlash);
}

const ui = new UI(root, {
  play: (i) => startLevel(i),
  resume: () => resume(),
  restart: () => startLevel(index),
  quit: (to) => {
    showBackdrop(index);
    if (to === 'levels') ui.showLevels(index);
    else ui.showTitle();
  },
  sound: (n) => audio.play(n),
  input: () => input,
  device: () => input.device,
  rebind: (action, slot, code) => {
    const b = cloneBindings(input.bindings);
    if (code) for (const k of Object.keys(b)) b[k] = b[k].map((c) => (c === code ? null : c));
    b[action][slot] = code;
    input.setBindings(b);
    store.setBindings(b);
    renderer.refreshNotes();
  },
  resetBindings: () => {
    input.setBindings(DEFAULT_BINDINGS);
    store.setBindings(null);
    renderer.refreshNotes();
  },
  setting: (k, v) => {
    store.setSetting(k, v);
    applySettings();
  },
});

// ---------------------------------------------------------------- flow

function levelInfo(i) {
  const l = LEVELS[i];
  const b = BUILDINGS.find((x) => x.id === l.building);
  return { title: l.name, building: b.name, drawing: b.drawing, sheetNo: i + 1, resolve: (t) => input.resolve(t), touch: () => input.device === 'touch' };
}

function setMode(m) {
  mode = m;
  input.pressedCodes.clear();
  const playing = m === 'play' || m === 'caught';
  document.getElementById('hud').hidden = !(playing || m === 'paused');
  document.getElementById('touch').hidden = !(m === 'play' && root.classList.contains('touch'));
  if (m !== 'play') document.getElementById('intro').hidden = true;
}

function showBackdrop(i) {
  backdrop = new Game(LEVELS[i], toolsFor(i));
  backdrop.player.x = backdrop.player.y = -99999; // nobody to catch: guards just patrol
  backdrop.hidePlayer = true;
  renderer.setLevel(backdrop.level, levelInfo(i));
  game = null;
  setMode('menu');
  audio.setTense(false);
}

function startLevel(i) {
  index = i;
  game = new Game(LEVELS[i], toolsFor(i));
  backdrop = null;
  renderer.setLevel(game.level, levelInfo(i));
  hud.setLevel(i);
  ui.hide();
  ui.showIntro(i, (t) => input.resolve(t));
  introHidden = false;
  document.getElementById('intro').classList.remove('gone');
  setMode('play');
  document.getElementById('intro').hidden = false;
  audio.setTense(false);
  audio.setBand(true);
}

function pause() {
  if (mode !== 'play') return;
  setMode('paused');
  ui.showPause(index);
}

function resume() {
  if (mode !== 'paused') return;
  ui.hide();
  setMode('play');
}

function caught() {
  setMode('caught');
  caughtT = 0;
  audio.play('caught');
  ui.showCaught();
}

function won() {
  const { run, score } = game.result;
  const id = LEVELS[index].id;
  const prev = store.best(id);
  const newBest = isNewBest(prev, score);
  store.setBest(id, mergeBest(prev, run, score));
  audio.play('won');
  audio.setTense(false);
  setMode('won');
  ui.showResults(index, run, score, prev, newBest && !!prev);
}

function toggleMute() {
  store.setSetting('muted', !store.settings().muted);
  applySettings();
}

// ---------------------------------------------------------------- events from the game

const SOUND_EVENTS = new Set(['loot', 'target', 'unlock', 'pin', 'pick-miss', 'pick-start', 'coin', 'throw', 'blackout', 'power-on', 'disguise', 'disguise-off', 'hear']);

function handleEvents(g) {
  for (const e of g.events) {
    if (e.type === 'step') audio.play('step', { mode: e.mode });
    else if (e.type === 'creak') audio.play('creak', { loud: e.loud });
    else if (e.type === 'spotted') audio.play('spotted');
    else if (e.type === 'alarm') audio.play('alarm');
    else if (SOUND_EVENTS.has(e.type)) audio.play(e.type);
    if (e.type === 'target') g.targetT = g.t;
    if (g === game) renderer.onEvent(e);
  }
  g.events.length = 0;
}

// ---------------------------------------------------------------- loop

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 0;
  dt = Math.min(dt, 0.05);
  const s = input.poll(dt);

  if (mode === 'play' && game) {
    if (s.pause) pause();
    else {
      if (s.mute) toggleMute();
      // Two half steps on slow frames keep collisions and AI steady.
      const steps = dt > 1 / 45 ? 2 : 1;
      for (let i = 0; i < steps; i++) {
        game.update(dt / steps, i === 0 ? s : { ...s, use: false, throw: false });
        if (game.status !== 'play') break;
      }
      handleEvents(game);
      audio.setTense(game.chasing || game.alertT < 3);
      if (game.started && !introHidden) {
        introHidden = true;
        ui.hideIntro(LEVELS[index].tutorial ? 600 : 1800);
      }
      if (game.status === 'caught') caught();
      else if (game.status === 'won') won();
    }
  } else if (mode === 'caught') {
    caughtT += dt;
    if (caughtT > 1.0 || (caughtT > 0.3 && (s.use || s.throw || s.pause))) startLevel(index);
  } else if (mode === 'menu' && backdrop) {
    backdrop.update(dt, {});
    backdrop.events.length = 0;
  }

  const shown = game || backdrop;
  const paused = mode === 'paused' || mode === 'won';
  renderer.draw(shown, paused ? 0 : dt, {
    coinPreview: store.settings().coinAim,
    useKey: input.label('use'),
  });
  if (game && (mode === 'play' || mode === 'caught' || mode === 'paused')) hud.update(game);
}

// ---------------------------------------------------------------- boot

function resize() {
  const r = root.getBoundingClientRect();
  const touch = root.classList.contains('touch');
  renderer.safeBottom = touch ? 0 : Math.min(110, r.height * 0.16);
  renderer.minTilePx = touch ? 27 : 22;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.resize(r.width, r.height, dpr);
}

async function boot() {
  applySettings();
  input.attach(window);
  input.onDevice = (d) => {
    root.classList.toggle('touch', d === 'touch');
    document.getElementById('touch').hidden = !(mode === 'play' && d === 'touch');
    resize();
    renderer.refreshNotes();
  };
  input.onNav = (dir) => {
    if (mode === 'menu' || mode === 'paused' || mode === 'won') {
      if (dir === 'start') {
        if (mode === 'paused') resume();
        return;
      }
      ui.nav(dir);
    }
  };
  setupTouch(root, input, () => audio.unlock());

  const unlockAudio = () => {
    audio.unlock();
    audio.setBand(true);
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('touchstart', unlockAudio, { passive: true });

  document.getElementById('btn-pause').addEventListener('click', () => { audio.play('click'); pause(); });
  document.getElementById('btn-mute').addEventListener('click', () => { toggleMute(); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pause();
      audio.suspend();
    } else {
      audio.resume();
    }
  });
  if ('ontouchstart' in window && !matchMedia('(pointer: fine)').matches) {
    input.device = 'touch';
    root.classList.add('touch');
  }

  // Wait (briefly) for the fonts so the sheet's lettering is drawn in the right hand.
  try {
    await Promise.race([
      Promise.all([document.fonts.load(`12px ${FONT_HAND}`), document.fonts.load(`600 12px ${FONT_NUM}`), document.fonts.load(`700 12px ${FONT_NUM}`)]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* draw with fallbacks */
  }

  try {
    document.getElementById('favicon').href = makeFavicon();
  } catch {
    /* keep the SVG one */
  }

  new ResizeObserver(resize).observe(root);
  resize();
  const start = Math.min(store.unlockedCount(LEVELS) - 1, LEVELS.length - 1);
  index = start;
  showBackdrop(start);
  ui.showTitle();
  root.classList.remove('booting');
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });
}

// Handy in the console while testing.
window.blueprintHeist = {
  get game() { return game; },
  get mode() { return mode; },
  startLevel,
  renderer,
  audio,
};

boot();
