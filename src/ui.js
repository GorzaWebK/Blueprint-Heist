// DOM screens: sheets of tracing paper pinned with drafting tape, ink stamps for
// results, and the title-block HUD. Menus can be driven by mouse, touch, keyboard
// or gamepad (directional focus moves to the nearest control in that direction).

import { LEVELS, BUILDINGS, TOOLS, toolsFor } from './levels.js';
import { ACTIONS, keyName } from './input.js';
import { makeStamp, makeCanvas, INK } from './art.js';
import { parseLevel, CELL } from './level.js';
import { formatTime, STAMP_RANK } from './scoring.js';
import { store } from './storage.js';

const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}

function tapes(corners = ['tl', 'tr']) {
  return corners.map((c) => el('span', { class: `tape ${c}` }));
}

const STAMP_COLORS = { gold: '#c4931c', silver: '#6c7c89', bronze: '#a65a28' };
const stampCache = new Map();
export function stampCanvas(kind, px = 60) {
  const key = `${kind}:${px}`;
  if (stampCache.has(key)) return stampCache.get(key);
  let c;
  if (kind === 'rejected') c = makeStamp('REJECTED', INK.stampRed, { px, seed: 21 });
  else c = makeStamp('APPROVED', STAMP_COLORS[kind], { px, seed: 5 + STAMP_RANK[kind], sub: kind.toUpperCase() });
  stampCache.set(key, c);
  return c;
}

function cloneCanvas(src, cls) {
  const c = makeCanvas(src.width, src.height);
  c.getContext('2d').drawImage(src, 0, 0);
  if (cls) c.className = cls;
  return c;
}

/** A tiny blueprint of a level for the sheet select. */
const thumbCache = new Map();
function thumbnail(def) {
  if (thumbCache.has(def.id)) return cloneCanvas(thumbCache.get(def.id), 'thumb');
  const L = parseLevel(def);
  const s = 5;
  const W = 16 * 14, H = 10 * 14;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = INK.paper;
  g.fillRect(0, 0, W, H);
  const k = Math.min((W - 12) / (L.w * s), (H - 12) / (L.h * s));
  g.translate((W - L.w * s * k) / 2, (H - L.h * s * k) / 2);
  g.scale(k, k);
  g.strokeStyle = 'rgba(234,243,255,0.12)';
  g.lineWidth = 0.4;
  for (let x = 0; x <= L.w; x++) { g.beginPath(); g.moveTo(x * s, 0); g.lineTo(x * s, L.h * s); g.stroke(); }
  for (let y = 0; y <= L.h; y++) { g.beginPath(); g.moveTo(0, y * s); g.lineTo(L.w * s, y * s); g.stroke(); }
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const v = L.grid.get(x, y);
    if (v === CELL.WALL) { g.fillStyle = 'rgba(234,243,255,0.85)'; g.fillRect(x * s, y * s, s, s); }
    else if (v === CELL.LOCKED) { g.fillStyle = INK.amber; g.fillRect(x * s, y * s, s, s); }
  }
  g.fillStyle = INK.red;
  g.beginPath(); g.arc((L.start.cx + 0.5) * s, (L.start.cy + 0.5) * s, s * 0.6, 0, Math.PI * 2); g.fill();
  g.strokeStyle = INK.amber;
  g.lineWidth = 1;
  g.beginPath(); g.arc((L.target.cx + 0.5) * s, (L.target.cy + 0.5) * s, s * 0.9, 0, Math.PI * 2); g.stroke();
  thumbCache.set(def.id, c);
  return cloneCanvas(c, 'thumb');
}

export class UI {
  constructor(root, hooks) {
    this.root = root;
    this.hooks = hooks; // callbacks into main.js
    this.screens = $('#screens', root);
    this.current = null;
    this.stack = [];
  }

  // ---------------------------------------------------------------- generic

  show(name, node, { back = null, clear = false, focus = 0 } = {}) {
    this.screens.innerHTML = '';
    const wrap = el('div', { class: `screen ${clear ? 'clear' : ''} screen-${name}` }, node);
    this.screens.append(wrap);
    this.current = { name, node: wrap, back };
    this.focusables = () => [...wrap.querySelectorAll('.btn:not([disabled]), .card:not(.locked), .key, .toggle, input[type=range]')];
    const f = this.focusables();
    if (f.length && focus !== null && this.hooks.device() !== 'touch') this.setFocus(f[Math.min(focus, f.length - 1)]);
  }

  hide() {
    this.screens.innerHTML = '';
    this.current = null;
  }

  setFocus(e) {
    for (const x of this.screens.querySelectorAll('.focus')) x.classList.remove('focus');
    if (!e) return;
    e.classList.add('focus');
    e.focus({ preventScroll: true });
    e.scrollIntoView({ block: 'nearest' });
  }

  /** Move focus to the nearest control in a direction. */
  nav(dir) {
    if (!this.current) return false;
    if (dir === 'back') {
      if (this.current.back) {
        this.hooks.sound('click');
        this.current.back();
      }
      return true;
    }
    const list = this.focusables();
    if (!list.length) return false;
    let cur = this.screens.querySelector('.focus');
    if (!cur || !list.includes(cur)) {
      this.setFocus(list[0]);
      return true;
    }
    if (dir === 'ok') {
      if (cur.tagName === 'INPUT') return true;
      cur.click();
      return true;
    }
    if (cur.tagName === 'INPUT' && (dir === 'left' || dir === 'right')) {
      const step = Number(cur.step) || 0.1;
      cur.value = String(Number(cur.value) + (dir === 'left' ? -step : step));
      cur.dispatchEvent(new Event('input'));
      return true;
    }
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bd = Infinity;
    for (const e of list) {
      if (e === cur) continue;
      const q = e.getBoundingClientRect();
      const x = q.left + q.width / 2, y = q.top + q.height / 2;
      const dx = x - cx, dy = y - cy;
      const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
      const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
      if (along <= 2) continue;
      const score = along + across * 2.2;
      if (score < bd) { bd = score; best = e; }
    }
    if (best) {
      this.setFocus(best);
      this.hooks.sound('click');
    }
    return true;
  }

  button(label, onclick, cls = '') {
    return el('button', { class: `btn ${cls}`, onclick: (e) => { this.hooks.sound('click'); onclick(e); } }, label);
  }

  // ---------------------------------------------------------------- title

  showTitle() {
    const unlocked = store.unlockedCount(LEVELS);
    const anyBest = LEVELS.some((l) => store.best(l.id));
    const next = Math.min(unlocked - 1, LEVELS.length - 1);
    const mini = el('div', { class: 'stamps-mini', 'aria-label': 'Stamps earned' },
      LEVELS.map((l) => el('i', { class: store.best(l.id)?.stamp || '' })));
    const sheet = el('div', { class: 'sheet title-sheet' },
      tapes(['tl', 'tr', 'bl', 'br']),
      el('div', { class: 'sheet-in' },
        el('div', { class: 'kicker' }, 'A stealth caper in twelve sheets'),
        el('h1', { html: 'Blueprint <span class="red">Heist</span>' }),
        el('div', { class: 'dim' }, el('span', {}, '3 BUILDINGS · 12 SHEETS · 1 PENCIL')),
        el('p', { class: 'sub' }, 'Slip through the plans, lift the prize, leave no mark.'),
        el('div', { class: 'col' },
          this.button(anyBest ? `Continue · Sheet ${String(next + 1).padStart(2, '0')}` : 'Start the job', () => this.hooks.play(next), 'primary'),
          this.button('Sheet select', () => this.showLevels()),
          this.button('Controls', () => this.showControls(() => this.showTitle())),
          this.button('Settings', () => this.showSettings(() => this.showTitle())),
        ),
        mini,
        el('div', { class: 'foot' }, 'EVERY LINE, STAMP AND NOTE IS DRAWN IN CODE'),
      ),
    );
    this.show('title', sheet, { back: null });
  }

  // ---------------------------------------------------------------- level select

  showLevels(focusIndex = null) {
    const unlocked = store.unlockedCount(LEVELS);
    const cols = BUILDINGS.map((b) => {
      const cards = LEVELS.map((l, i) => ({ l, i })).filter(({ l }) => l.building === b.id).map(({ l, i }) => {
        const best = store.best(l.id);
        const locked = i >= unlocked;
        const card = el('button', {
          class: `card ${locked ? 'locked' : ''}`,
          'aria-label': `Sheet ${i + 1}: ${l.name}${locked ? ' (locked)' : ''}`,
          'data-i': i,
          onclick: () => { if (!locked) { this.hooks.sound('click'); this.hooks.play(i); } },
        },
          thumbnail(l),
          locked ? el('span', { class: 'c-lock' }, 'LOCKED') : null,
          el('span', { class: 'c-txt' },
            el('span', { class: 'c-no' }, `SHEET ${String(i + 1).padStart(2, '0')}${l.newTool ? ' · NEW TOOL' : ''}`),
            el('span', { class: 'c-name' }, l.name),
            el('span', { class: 'c-best' }, best ? `${formatTime(best.time)} · ${best.points} PTS` : locked ? '' : 'NOT YET ATTEMPTED'),
          ),
          best ? cloneCanvas(stampCanvas(best.stamp, 40), 'c-stamp') : null,
        );
        return card;
      });
      return el('div', { class: 'building' },
        el('h3', {}, b.name, el('small', {}, b.short)),
        el('div', { class: 'cards' }, cards));
    });
    const sheet = el('div', { class: 'sheet levels-sheet' },
      tapes(['tl', 'tr']),
      el('div', { class: 'sheet-in' },
        el('div', { class: 'levels-head' },
          el('div', {}, el('div', { class: 'kicker' }, 'Drawing register'), el('h2', {}, 'Sheet select')),
          this.button('Back', () => this.showTitle(), 'small'),
        ),
        el('div', { class: 'buildings' }, cols),
      ),
    );
    const idx = focusIndex ?? Math.max(0, unlocked - 1);
    this.show('levels', sheet, { back: () => this.showTitle(), focus: idx + 1 });
  }

  // ---------------------------------------------------------------- controls

  showControls(back) {
    const input = this.hooks.input();
    const binds = input.bindings;
    const rows = ACTIONS.map((a) => {
      const cell = (slot) => {
        const b = el('button', { class: 'key' }, keyName(binds[a.id][slot]));
        b.addEventListener('click', () => {
          this.hooks.sound('click');
          b.classList.add('waiting');
          b.textContent = 'PRESS A KEY';
          input.captureNext = (code, cancelled) => {
            b.classList.remove('waiting');
            if (!cancelled) this.hooks.rebind(a.id, slot, code);
            this.showControls(back);
          };
        });
        return el('td', {}, b);
      };
      return el('tr', {}, el('td', {}, a.label), cell(0), cell(1));
    });
    const sheet = el('div', { class: 'sheet form-sheet' },
      tapes(['tl', 'tr']),
      el('div', { class: 'sheet-in' },
        el('div', { class: 'kicker' }, 'Key schedule'),
        el('h2', {}, 'Controls'),
        el('div', { class: 'dim' }, el('span', {}, 'CLICK A KEY TO CHANGE IT · ESC CANCELS')),
        el('table', { class: 'binds' },
          el('tr', {}, el('th', {}, 'ACTION'), el('th', {}, 'KEY'), el('th', {}, 'ALT. KEY')),
          rows),
        el('p', { class: 'note-small' }, 'Gamepad: left stick or d-pad to move (a light push sneaks), LB sneak, RB sprint, A use, X throw, Start pause.'),
        el('p', { class: 'note-small' }, 'Touch: drag anywhere on the left half to move (a short drag sneaks); buttons on the right.'),
        el('div', { class: 'row', style: 'margin-top:14px' },
          this.button('Done', back, 'primary'),
          this.button('Reset to defaults', () => { this.hooks.resetBindings(); this.showControls(back); }, 'small'),
        ),
      ),
    );
    this.show('controls', sheet, { back });
  }

  // ---------------------------------------------------------------- settings

  showSettings(back) {
    const s = store.settings();
    const slider = (key, label) => {
      const inp = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s[key], 'aria-label': label });
      inp.addEventListener('input', () => this.hooks.setting(key, Number(inp.value)));
      return el('label', { class: 'setting' }, label, inp);
    };
    const toggle = (key, label) => {
      const b = el('button', { class: `toggle ${s[key] ? 'on' : ''}` }, s[key] ? 'ON' : 'OFF');
      b.addEventListener('click', () => {
        this.hooks.sound('click');
        const v = !store.settings()[key];
        this.hooks.setting(key, v);
        b.classList.toggle('on', v);
        b.textContent = v ? 'ON' : 'OFF';
      });
      return el('div', { class: 'setting' }, label, b);
    };
    const sheet = el('div', { class: 'sheet form-sheet' },
      tapes(['tl', 'tr']),
      el('div', { class: 'sheet-in' },
        el('div', { class: 'kicker' }, 'General notes'),
        el('h2', {}, 'Settings'),
        el('div', { class: 'dim' }, el('span', {}, 'SAVED ON THIS DEVICE')),
        slider('music', 'Music volume'),
        slider('sfx', 'Sound effects'),
        toggle('muted', 'Mute everything'),
        toggle('coinAim', 'Show where a coin will land'),
        toggle('reduceFlash', 'Reduce flashes and shaking'),
        el('div', { class: 'row', style: 'margin-top:18px' },
          this.button('Done', back, 'primary'),
          this.button('Erase saved stamps', (e) => {
            const btn = e.currentTarget;
            if (btn.dataset.armed) {
              store.resetProgress();
              btn.textContent = 'Erased';
              btn.disabled = true;
            } else {
              btn.dataset.armed = '1';
              btn.textContent = 'Really erase? Click again';
            }
          }, 'small'),
        ),
      ),
    );
    this.show('settings', sheet, { back });
  }

  // ---------------------------------------------------------------- pause

  showPause(index) {
    const l = LEVELS[index];
    const sheet = el('div', { class: 'sheet pause-sheet' },
      tapes(['tl', 'tr']),
      el('div', { class: 'sheet-in' },
        el('div', { class: 'kicker' }, `Sheet ${String(index + 1).padStart(2, '0')} · ${l.name}`),
        el('h2', {}, 'On hold'),
        el('div', { class: 'col' },
          this.button('Resume', () => this.hooks.resume(), 'primary'),
          this.button('Restart sheet', () => this.hooks.restart()),
          this.button('Controls', () => this.showControls(() => this.showPause(index))),
          this.button('Settings', () => this.showSettings(() => this.showPause(index))),
          this.button('Sheet select', () => this.hooks.quit('levels')),
          this.button('Title', () => this.hooks.quit('title')),
        ),
      ),
    );
    this.show('pause', sheet, { back: () => this.hooks.resume() });
  }

  // ---------------------------------------------------------------- results

  showResults(index, run, score, prev, newBest) {
    const l = LEVELS[index];
    const tickCell = (ok, label) => el('td', { class: `tick ${ok ? 'yes' : 'no'}` }, (ok ? '✓ ' : '') + label);
    const last = index >= LEVELS.length - 1;
    const sheet = el('div', { class: 'sheet results-sheet' },
      tapes(['tl', 'tr', 'bl', 'br']),
      cloneCanvas(stampCanvas(score.stamp, 72), 'results-stamp'),
      el('div', { class: 'sheet-in' },
        el('div', { class: 'kicker' }, `Sheet ${String(index + 1).padStart(2, '0')} · checked & signed`),
        el('h2', {}, l.name),
        el('p', {}, `${l.target.name}: lifted.`),
        el('table', { class: 'stats' },
          el('tr', {}, el('td', {}, 'TIME'), el('td', { class: 'v' }, formatTime(run.time)), tickCell(score.swift, `SWIFT (par ${formatTime(run.par)})`)),
          el('tr', {}, el('td', {}, 'LOOT'), el('td', { class: 'v' }, `${run.loot}/${run.lootTotal}`), tickCell(score.collector, 'COLLECTOR')),
          el('tr', {}, el('td', {}, 'SPOTTED'), el('td', { class: 'v' }, String(run.spotted)), tickCell(score.ghost, 'GHOST')),
          el('tr', {}, el('td', {}, 'POINTS'), el('td', { class: 'v' }, String(score.points)),
            el('td', { class: 'tick' }, newBest ? el('span', { class: 'newbest' }, 'new best!') : prev ? `best ${prev.points}` : '')),
        ),
        el('p', { class: 'note-small' }, 'Gold needs all three ticks. Silver needs two.'),
        el('div', { class: 'row' },
          last ? this.button('Back to the title', () => this.hooks.quit('title'), 'primary') : this.button('Next sheet', () => this.hooks.play(index + 1), 'primary'),
          this.button('Retry', () => this.hooks.play(index)),
          this.button('Sheet select', () => this.hooks.quit('levels')),
        ),
        last ? el('p', {}, 'That is the whole set of drawings. The city sleeps none the wiser.') : null,
      ),
    );
    this.show('results', sheet, { back: () => this.hooks.quit('levels') });
  }

  showCaught() {
    const node = el('div', { class: 'stamp-wrap' },
      cloneCanvas(stampCanvas('rejected', 90)),
      el('p', {}, 'Caught. Back to the start of the sheet.'));
    this.show('caught', node, { clear: true, focus: null });
    this.current.node.classList.add('caught-screen');
  }

  // ---------------------------------------------------------------- intro card

  showIntro(index, resolve) {
    const l = LEVELS[index];
    const b = BUILDINGS.find((x) => x.id === l.building);
    const box = $('#intro', this.root);
    box.innerHTML = '';
    box.className = 'sheet';
    const kids = [
      ...tapes(['tl', 'tr']),
      el('div', { class: 'i-sheet' }, `SHEET ${String(index + 1).padStart(2, '0')} / ${LEVELS.length} · ${b.name.toUpperCase()}`),
      el('h2', {}, l.name),
      el('p', {}, `Steal: ${l.target.name}. Then reach the exit.`),
      l.newTool ? el('div', { class: 'i-tool' }, el('b', {}, `NEW TOOL: ${TOOLS[l.newTool].name.toUpperCase()}. `), resolve(TOOLS[l.newTool].note)) : null,
    ];
    box.append(...kids.filter(Boolean));
    box.hidden = false;
    clearTimeout(this.introT);
  }

  hideIntro(delay = 0) {
    const box = $('#intro', this.root);
    clearTimeout(this.introT);
    this.introT = setTimeout(() => {
      box.classList.add('gone');
      this.introT = setTimeout(() => { box.hidden = true; }, 700);
    }, delay);
  }
}

// ---------------------------------------------------------------- HUD

export class HUD {
  constructor(root) {
    this.root = root;
    this.el = {
      hud: $('#hud', root),
      sheet: $('#tb-sheet', root),
      building: $('#tb-building', root),
      title: $('#tb-title', root),
      time: $('#tb-time', root),
      loot: $('#tb-loot', root),
      spotted: $('#tb-spotted', root),
      obj: $('#tb-obj', root),
      tools: $('#tb-tools', root),
      status: $('#status', root),
    };
    this.last = {};
  }

  setLevel(index) {
    const l = LEVELS[index];
    const b = BUILDINGS.find((x) => x.id === l.building);
    this.el.sheet.textContent = `${String(index + 1).padStart(2, '0')}/${LEVELS.length}`;
    this.el.building.textContent = b.short;
    this.el.title.textContent = l.name.toUpperCase();
    this.tools = toolsFor(index);
    this.last = {};
  }

  set(key, value, fn) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    fn(value);
  }

  update(game) {
    const p = game.player;
    this.set('time', formatTime(game.time), (v) => (this.el.time.textContent = v));
    this.set('loot', `${game.lootTaken}/${game.lootTotal}`, (v) => (this.el.loot.textContent = v));
    this.set('spotted', game.spotted, (v) => {
      this.el.spotted.textContent = String(v);
      this.el.spotted.classList.toggle('bad', v > 0);
    });
    this.set('obj', p.hasTarget ? 'GET TO THE EXIT' : `STEAL: ${game.def.target.name.toUpperCase()}`, (v) => (this.el.obj.textContent = v));
    const tools = [];
    if (this.tools.has('coin')) tools.push(`¢×${p.coins}`);
    if (this.tools.has('lockpick')) tools.push('PICK');
    this.set('tools', tools.join('  '), (v) => (this.el.tools.textContent = v));
    this.root.classList.toggle('no-coins', !(this.tools.has('coin') && p.coins > 0));

    const st = [];
    if (game.blackout > 0) st.push(['amber', `LIGHTS OUT ${Math.ceil(game.blackout)}s`]);
    if (p.disguise > 0) st.push(['white', `IN UNIFORM ${Math.ceil(p.disguise)}s`]);
    if (game.chasing) st.push(['red', 'SPOTTED! LOSE THEM']);
    else if (p.hasTarget && game.t - (game.targetT ?? 0) < 4) st.push(['amber', 'GOT IT! NOW THE EXIT']);
    const key = st.map((s) => s.join(':')).join('|');
    this.set('status', key, () => {
      this.el.status.innerHTML = '';
      for (const [cls, txt] of st) this.el.status.append(el('span', { class: cls }, txt));
    });
  }
}
