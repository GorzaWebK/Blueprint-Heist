// Saved progress, settings and key bindings in localStorage. Every access is wrapped
// in try/catch with an in-memory fallback, because embedded iframes and private
// windows can refuse storage.

const KEY = 'blueprint-heist:v1';
let memory = null;

const DEFAULTS = () => ({
  best: {}, // level id -> { stamp, points, time, loot, spotted, clears }
  settings: { music: 0.7, sfx: 0.8, muted: false, reduceFlash: false, coinAim: true },
  bindings: null, // null = defaults
  seenTools: {},
});

function read() {
  if (memory) return memory;
  let data = DEFAULTS();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      data = { ...data, ...parsed, settings: { ...data.settings, ...(parsed.settings || {}) } };
    }
  } catch {
    /* storage unavailable: play on from memory */
  }
  memory = data;
  return data;
}

function write() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* ignore */
  }
}

export const store = {
  get data() {
    return read();
  },
  best(id) {
    return read().best[id] || null;
  },
  setBest(id, rec) {
    read().best[id] = rec;
    write();
  },
  settings() {
    return read().settings;
  },
  setSetting(k, v) {
    read().settings[k] = v;
    write();
  },
  bindings() {
    return read().bindings;
  },
  setBindings(b) {
    read().bindings = b;
    write();
  },
  unlockedCount(levels) {
    // Sheet n opens once sheet n-1 has been approved.
    let n = 1;
    for (let i = 0; i < levels.length - 1; i++) {
      if (read().best[levels[i].id]) n = i + 2;
      else break;
    }
    return Math.min(n, levels.length);
  },
  resetProgress() {
    read().best = {};
    write();
  },
};
