// Keyboard (rebindable), gamepad and touch input, merged into one state per frame.

export const ACTIONS = [
  { id: 'up', label: 'Move up' },
  { id: 'down', label: 'Move down' },
  { id: 'left', label: 'Move left' },
  { id: 'right', label: 'Move right' },
  { id: 'sneak', label: 'Sneak (hold)' },
  { id: 'sprint', label: 'Sprint (hold)' },
  { id: 'use', label: 'Use / pick lock' },
  { id: 'throw', label: 'Throw coin' },
  { id: 'pause', label: 'Pause' },
  { id: 'mute', label: 'Mute' },
];

export const DEFAULT_BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sneak: ['ShiftLeft', 'ShiftRight'],
  sprint: ['Space', null],
  use: ['KeyE', 'Enter'],
  throw: ['KeyQ', null],
  pause: ['Escape', 'KeyP'],
  mute: ['KeyM', null],
};

export function cloneBindings(b) {
  const out = {};
  for (const a of ACTIONS) out[a.id] = [...(b?.[a.id] || DEFAULT_BINDINGS[a.id])];
  return out;
}

const NAMES = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  ShiftLeft: 'SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'CTRL', ControlRight: 'R-CTRL',
  AltLeft: 'ALT', AltRight: 'ALT GR', Space: 'SPACE', Enter: 'ENTER', Escape: 'ESC',
  Tab: 'TAB', Backspace: 'BKSP', CapsLock: 'CAPS', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backslash: '\\',
  Comma: ',', Period: '.', Slash: '/', MetaLeft: 'META', MetaRight: 'META',
};

export function keyName(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
  return code.toUpperCase();
}

// Gamepad buttons (standard mapping).
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

export class Input {
  constructor(bindings) {
    this.setBindings(bindings);
    this.down = new Set();
    this.pressedCodes = new Set();
    this.device = 'keyboard';
    this.onDevice = null; // callback(device)
    this.onNav = null; // callback(dir) for menus: 'up'|'down'|'left'|'right'|'ok'|'back'
    this.captureNext = null; // callback(code) while rebinding
    this.padPrev = [];
    this.padNavT = 0;
    this.touch = { mx: 0, my: 0, active: false, buttons: { sneak: false, sprint: false }, pressed: new Set() };
    this.enabled = true;
  }

  setBindings(b) {
    this.bindings = cloneBindings(b);
    this.codeToAction = new Map();
    for (const [act, codes] of Object.entries(this.bindings)) for (const c of codes) if (c) this.codeToAction.set(c, act);
  }

  setDevice(d) {
    if (d !== this.device) {
      this.device = d;
      if (this.onDevice) this.onDevice(d);
    }
  }

  attach(win) {
    win.addEventListener('keydown', (e) => {
      if (this.captureNext) {
        e.preventDefault();
        const cb = this.captureNext;
        this.captureNext = null;
        cb(e.code === 'Escape' ? null : e.code, e.code === 'Escape');
        return;
      }
      const act = this.codeToAction.get(e.code);
      const inField = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT');
      if (act && !inField) e.preventDefault();
      if (!e.repeat) {
        this.pressedCodes.add(e.code);
        this.setDevice('keyboard');
        if (this.onNav && !inField) {
          const nav = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', Enter: 'ok', Space: 'ok', Escape: 'back' }[e.code];
          if (nav) this.onNav(nav, e);
        }
      }
      this.down.add(e.code);
    });
    win.addEventListener('keyup', (e) => this.down.delete(e.code));
    win.addEventListener('blur', () => this.down.clear());
  }

  held(act) {
    for (const c of this.bindings[act]) if (c && this.down.has(c)) return true;
    return false;
  }

  pressed(act) {
    for (const c of this.bindings[act]) if (c && this.pressedCodes.has(c)) return true;
    return false;
  }

  /** Read everything into one state for this frame. Clears one-shot presses. */
  poll(dt = 0.016) {
    const s = { mx: 0, my: 0, sneak: false, sprint: false, use: false, throw: false, pause: false, mute: false, analog: false };
    if (this.enabled) {
      s.mx = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
      s.my = (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0);
      s.sneak = this.held('sneak');
      s.sprint = this.held('sprint');
      s.use = this.pressed('use');
      s.throw = this.pressed('throw');
      s.pause = this.pressed('pause');
      s.mute = this.pressed('mute');
    }
    this.pressedCodes.clear();

    this.pollPad(s, dt);

    // Touch.
    const t = this.touch;
    if (t.active && (t.mx || t.my)) {
      s.mx = t.mx;
      s.my = t.my;
      s.analog = true;
    }
    if (t.buttons.sneak) s.sneak = true;
    if (t.buttons.sprint) s.sprint = true;
    if (t.pressed.has('use')) s.use = true;
    if (t.pressed.has('throw')) s.throw = true;
    t.pressed.clear();
    return s;
  }

  pollPad(s, dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (!pad) return;
    const b = (i) => !!(pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5));
    const edge = (i) => b(i) && !this.padPrev[i];
    let ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const mag = Math.hypot(ax, ay);
    if (mag < 0.2) { ax = 0; ay = 0; }
    const dx = (b(PAD.RIGHT) ? 1 : 0) - (b(PAD.LEFT) ? 1 : 0);
    const dy = (b(PAD.DOWN) ? 1 : 0) - (b(PAD.UP) ? 1 : 0);
    const any = ax || ay || dx || dy || pad.buttons.some((x) => x.pressed);
    if (any) this.setDevice('gamepad');
    if (ax || ay) { s.mx = ax; s.my = ay; s.analog = true; }
    else if (dx || dy) { s.mx = dx; s.my = dy; }
    if (b(PAD.LB) || b(PAD.LT)) s.sneak = true;
    if (b(PAD.RB) || b(PAD.RT)) s.sprint = true;
    if (edge(PAD.A)) s.use = true;
    if (edge(PAD.X)) s.throw = true;
    if (edge(PAD.START)) s.pause = true;
    if (edge(PAD.BACK)) s.mute = true;

    // Menu navigation from the pad.
    if (this.onNav) {
      if (edge(PAD.A)) this.onNav('ok');
      if (edge(PAD.B)) this.onNav('back');
      if (edge(PAD.START)) this.onNav('start');
      this.padNavT -= dt;
      const nx = dx || (Math.abs(ax) > 0.6 ? Math.sign(ax) : 0);
      const ny = dy || (Math.abs(ay) > 0.6 ? Math.sign(ay) : 0);
      if ((nx || ny) && this.padNavT <= 0) {
        this.onNav(ny < 0 ? 'up' : ny > 0 ? 'down' : nx < 0 ? 'left' : 'right');
        this.padNavT = 0.22;
      } else if (!nx && !ny) this.padNavT = 0;
    }
    this.padPrev = pad.buttons.map((x) => x.pressed || x.value > 0.5);
  }

  /** Words for {tokens} in the level notes and prompts, for the current device. */
  label(action) {
    if (this.device === 'gamepad') {
      return { move: 'L-STICK', sneak: 'LB', sprint: 'RB', use: 'A', throw: 'X', pause: 'START' }[action] || action.toUpperCase();
    }
    if (this.device === 'touch') {
      return { move: 'STICK', sneak: 'SNEAK', sprint: 'SPRINT', use: 'USE', throw: 'THROW', pause: 'II' }[action] || action.toUpperCase();
    }
    if (action === 'move') {
      const b = this.bindings;
      const main = [b.up[0], b.left[0], b.down[0], b.right[0]].map(keyName).join('');
      return main === 'WASD' && b.up[1] === 'ArrowUp' ? 'WASD / ARROWS' : main;
    }
    return keyName(this.bindings[action]?.[0] || this.bindings[action]?.[1]);
  }

  resolve(text) {
    return text.replace(/\{(\w+)\}/g, (_, a) => this.label(a));
  }
}

/** On-screen joystick and buttons for touch screens. */
export function setupTouch(root, input, onFirstTouch) {
  const stick = root.querySelector('#stick');
  const knob = root.querySelector('#stick-knob');
  const zone = root.querySelector('#stick-zone');
  let id = null, ox = 0, oy = 0;
  const R = () => stick.offsetWidth / 2 || 50;

  const start = (e) => {
    onFirstTouch();
    input.setDevice('touch');
    if (id !== null) return;
    const t = e.changedTouches[0];
    id = t.identifier;
    const rect = root.getBoundingClientRect();
    ox = t.clientX;
    oy = t.clientY;
    stick.style.left = `${ox - rect.left}px`;
    stick.style.top = `${oy - rect.top}px`;
    stick.classList.add('live');
    input.touch.active = true;
    e.preventDefault();
  };
  const move = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== id) continue;
      let dx = t.clientX - ox, dy = t.clientY - oy;
      const r = R();
      const d = Math.hypot(dx, dy);
      if (d > r) { dx = (dx / d) * r; dy = (dy / d) * r; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const m = Math.min(1, d / r);
      input.touch.mx = d > 4 ? (dx / Math.max(d, 1)) * m : 0;
      input.touch.my = d > 4 ? (dy / Math.max(d, 1)) * m : 0;
      e.preventDefault();
    }
  };
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== id) continue;
      id = null;
      input.touch.mx = input.touch.my = 0;
      input.touch.active = false;
      knob.style.transform = '';
      stick.classList.remove('live');
      stick.style.left = '';
      stick.style.top = '';
    }
  };
  zone.addEventListener('touchstart', start, { passive: false });
  zone.addEventListener('touchmove', move, { passive: false });
  zone.addEventListener('touchend', end);
  zone.addEventListener('touchcancel', end);

  for (const btn of root.querySelectorAll('[data-touch]')) {
    const act = btn.dataset.touch;
    const on = (e) => {
      onFirstTouch();
      input.setDevice('touch');
      e.preventDefault();
      btn.classList.add('down');
      if (act === 'sneak' || act === 'sprint') input.touch.buttons[act] = true;
      else input.touch.pressed.add(act);
    };
    const off = (e) => {
      btn.classList.remove('down');
      if (act === 'sneak' || act === 'sprint') input.touch.buttons[act] = false;
    };
    btn.addEventListener('touchstart', on, { passive: false });
    btn.addEventListener('touchend', off);
    btn.addEventListener('touchcancel', off);
  }
}
