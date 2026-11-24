// All sound is synthesised with the Web Audio API: a late-night jazz trio (walking
// upright bass, brushed snare, Rhodes) that turns tense when you're spotted, and
// pencil-and-paper sound effects. There are no audio files.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Chords: bass root (MIDI) and a Rhodes voicing (MIDI).
const CALM = [
  { root: 38, tones: [41, 45, 48, 52], scale: [38, 40, 41, 43, 45, 47, 48] }, // Dm9
  { root: 43, tones: [41, 45, 47, 52], scale: [43, 45, 47, 48, 50, 52, 53] }, // G13
  { root: 36, tones: [40, 43, 47, 50], scale: [36, 38, 40, 41, 43, 45, 47] }, // Cmaj9
  { root: 45, tones: [43, 46, 49, 52], scale: [45, 46, 49, 50, 52, 53, 55] }, // A7b9
];
const TENSE = [
  { root: 38, tones: [41, 45, 50, 52], scale: [38, 40, 41, 43, 45, 46, 48] }, // Dm(add9)
  { root: 34, tones: [40, 44, 46, 50], scale: [34, 36, 38, 40, 41, 44, 46] }, // Bb7#11
  { root: 38, tones: [41, 44, 48, 50], scale: [38, 39, 41, 43, 44, 46, 48] }, // Dm7b5 colour
  { root: 40, tones: [44, 48, 50, 55], scale: [40, 41, 44, 46, 48, 50, 52] }, // E7alt
];

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicVol = 0.7;
    this.sfxVol = 0.8;
    this.tense = false;
    this.tenseTarget = false;
    this.playing = false;
  }

  /** Must be called from a user gesture the first time. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.music = ctx.createGain();
    this.sfx = ctx.createGain();
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    // A small generated room for the band.
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.makeImpulse(1.9, 2.6);
    const verbGain = ctx.createGain();
    verbGain.gain.value = 0.32;
    this.verbSend = ctx.createGain();
    this.verbSend.connect(this.verb).connect(verbGain).connect(this.music);
    this.noise = this.makeNoise();
    this.applyVolumes();
    this.startScheduler();
  }

  makeImpulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  makeNoise() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setVolumes(music, sfx, muted) {
    this.musicVol = music;
    this.sfxVol = sfx;
    this.muted = muted;
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.05);
    this.music.gain.setTargetAtTime(this.musicVol * 0.55, t, 0.1);
    this.sfx.gain.setTargetAtTime(this.sfxVol, t, 0.05);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ---------------------------------------------------------------- music

  setTense(on) {
    this.tenseTarget = on;
  }

  setBand(on) {
    this.playing = on;
  }

  startScheduler() {
    this.bar = 0;
    this.beat = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.bpm = 84;
    this.lastWalk = 38;
    const tick = () => {
      if (!this.ctx) return;
      const ahead = this.ctx.currentTime + 0.15;
      while (this.nextTime < ahead) {
        this.scheduleBeat(this.nextTime);
        this.nextTime += 60 / this.bpm;
      }
    };
    this.timer = setInterval(tick, 30);
  }

  scheduleBeat(t) {
    const b = this.beat;
    if (b === 0) {
      // Changes happen on the bar line.
      this.tense = this.tenseTarget;
      this.bpm = this.tense ? 132 : 84;
    }
    const prog = this.tense ? TENSE : CALM;
    const chord = prog[this.bar % 4];
    const next = prog[(this.bar + 1) % 4];
    const beatLen = 60 / this.bpm;
    const swing = beatLen * 0.64; // where the swung "and" lands

    if (this.playing) {
      // Walking bass: root, chord tones, then a chromatic step into the next bar.
      let n;
      if (b === 0) n = chord.root;
      else if (b === 3) n = next.root + (Math.random() < 0.5 ? 1 : -1);
      else {
        const opts = chord.scale.filter((x) => Math.abs(x - this.lastWalk) <= 5 && x !== this.lastWalk);
        n = opts.length ? opts[Math.floor(Math.random() * opts.length)] : chord.scale[2];
      }
      this.lastWalk = n;
      this.bass(t, n, beatLen * 0.92, b === 0 ? 1 : 0.8);
      if (this.tense && Math.random() < 0.35) this.bass(t + swing, n + 7, beatLen * 0.3, 0.5);

      // Brushes: a sweep on every beat, a tap on 2 and 4.
      this.brushSweep(t, beatLen, this.tense ? 0.6 : 0.45);
      if (b === 1 || b === 3) this.brushTap(t, this.tense ? 0.9 : 0.6);
      this.ride(t, this.tense ? 0.5 : 0.3);
      if (b === 1 || b === 3 || this.tense) this.ride(t + swing, this.tense ? 0.35 : 0.2);
      if (this.tense && b === 3 && this.bar % 2 === 1) this.brushTap(t + swing, 1);

      // Rhodes comping.
      if (!this.tense) {
        if (b === 0) this.rhodes(t, chord.tones, beatLen * 3.2, 0.55);
        if (b === 2 && Math.random() < 0.55) this.rhodes(t + swing, chord.tones.slice(1), beatLen * 1.2, 0.32);
        if (b === 3 && this.bar % 4 === 3) this.rhodes(t + swing, [chord.tones[3] + 12], beatLen * 0.8, 0.25);
      } else {
        if (b === 0 || b === 2) this.rhodes(t + swing, chord.tones, beatLen * 0.45, 0.45);
        if (b === 1 && Math.random() < 0.5) this.rhodes(t + swing, chord.tones.slice(2), beatLen * 0.3, 0.3);
        if (b === 0) this.pulse(t, chord.root - 12, beatLen * 3.8);
      }
    }

    this.beat = (b + 1) % 4;
    if (this.beat === 0) this.bar++;
  }

  bass(t, note, dur, vel) {
    const ctx = this.ctx;
    const f = midi(note);
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'triangle';
    o2.type = 'sawtooth';
    o1.frequency.value = f;
    o2.frequency.value = f;
    o2.detune.value = 4;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(f * 7, t);
    lp.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.18);
    const g = ctx.createGain();
    const mix2 = ctx.createGain();
    mix2.gain.value = 0.35;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * vel, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.18 * vel, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(lp);
    o2.connect(mix2).connect(lp);
    lp.connect(g).connect(this.music);
    o1.start(t);
    o2.start(t);
    o1.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  rhodes(t, notes, dur, vel) {
    const ctx = this.ctx;
    for (const [i, note] of notes.entries()) {
      const f = midi(note + 12);
      const start = t + i * 0.012; // a slightly rolled chord
      const car = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const tine = ctx.createOscillator();
      car.frequency.value = f;
      mod.frequency.value = f;
      tine.frequency.value = f * 14;
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(f * 1.1, start);
      modGain.gain.exponentialRampToValueAtTime(f * 0.12, start + 0.6);
      const tineGain = ctx.createGain();
      tineGain.gain.setValueAtTime(f * 1.5, start);
      tineGain.gain.exponentialRampToValueAtTime(1, start + 0.05);
      mod.connect(modGain).connect(car.frequency);
      tine.connect(tineGain).connect(car.frequency);
      const amp = ctx.createGain();
      const v = (vel * 0.13) / Math.sqrt(notes.length / 2);
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(v, start + 0.006);
      amp.gain.exponentialRampToValueAtTime(v * 0.35, start + 0.7);
      amp.gain.setTargetAtTime(0.0001, start + dur, 0.12);
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      car.connect(amp);
      let out = amp;
      if (pan) {
        pan.pan.value = (i / Math.max(1, notes.length - 1) - 0.5) * 0.5;
        amp.connect(pan);
        out = pan;
      }
      out.connect(this.music);
      out.connect(this.verbSend);
      const end = start + dur + 0.8;
      for (const o of [car, mod, tine]) {
        o.start(start);
        o.stop(end);
      }
    }
  }

  pulse(t, note, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = midi(note);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    // A slow throb.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = this.bpm / 30;
    const lg = ctx.createGain();
    lg.gain.value = 0.05;
    lfo.connect(lg).connect(g.gain);
    o.connect(g).connect(this.music);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.1);
    lfo.stop(t + dur + 0.1);
  }

  noiseSrc(t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const off = Math.random() * 1.5;
    s.start(t, off, dur + 0.05);
    return s;
  }

  brushSweep(t, len, vel) {
    const ctx = this.ctx;
    const s = this.noiseSrc(t, len);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2600, t);
    bp.frequency.linearRampToValueAtTime(4200, t + len * 0.8);
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035 * vel, t + len * 0.45);
    g.gain.linearRampToValueAtTime(0.0001, t + len * 0.95);
    s.connect(bp).connect(g).connect(this.music);
  }

  brushTap(t, vel) {
    const ctx = this.ctx;
    const s = this.noiseSrc(t, 0.2);
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 1800;
    hp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    s.connect(hp).connect(g);
    g.connect(this.music);
    g.connect(this.verbSend);
  }

  ride(t, vel) {
    const ctx = this.ctx;
    const s = this.noiseSrc(t, 0.4);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const pk = ctx.createBiquadFilter();
    pk.type = 'peaking';
    pk.frequency.value = 9500;
    pk.gain.value = 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    s.connect(hp).connect(pk).connect(g).connect(this.music);
  }

  // ---------------------------------------------------------------- effects

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  tone(t, type, f0, f1, dur, peak, dest = this.sfx) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, peak, 0.004, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseHit(t, filterType, f, q, dur, peak, sweepTo = null) {
    const s = this.noiseSrc(t, dur);
    const fl = this.ctx.createBiquadFilter();
    fl.type = filterType;
    fl.frequency.setValueAtTime(f, t);
    if (sweepTo) fl.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    fl.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, peak, 0.003, dur);
    s.connect(fl).connect(g).connect(this.sfx);
  }

  play(name, opt = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.now() + 0.005;
    switch (name) {
      case 'step': {
        // Pencil scratch.
        const v = opt.mode === 'sneak' ? 0.05 : opt.mode === 'sprint' ? 0.22 : 0.11;
        const f = 2600 + Math.random() * 1600;
        this.noiseHit(t, 'bandpass', f, 3, opt.mode === 'sprint' ? 0.06 : 0.045, v, f * 0.6);
        break;
      }
      case 'creak': {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(170, t);
        o.frequency.linearRampToValueAtTime(120 + Math.random() * 60, t + 0.35);
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 900;
        bp.Q.value = 4;
        const am = this.ctx.createOscillator();
        am.frequency.value = 38;
        const amg = this.ctx.createGain();
        amg.gain.value = 0.5;
        const g = this.ctx.createGain();
        const peak = opt.loud ? 0.35 : 0.12;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        am.connect(amg).connect(g.gain);
        o.connect(bp).connect(g).connect(this.sfx);
        o.start(t); am.start(t);
        o.stop(t + 0.45); am.stop(t + 0.45);
        break;
      }
      case 'pick-start':
        this.noiseHit(t, 'highpass', 5000, 1, 0.05, 0.15);
        this.tone(t + 0.04, 'square', 2400, 2200, 0.02, 0.05);
        break;
      case 'pin':
        this.tone(t, 'square', 3200, 2800, 0.015, 0.09);
        this.tone(t + 0.02, 'triangle', 1800, 1700, 0.08, 0.12);
        break;
      case 'pick-miss':
        this.noiseHit(t, 'bandpass', 1200, 2, 0.18, 0.25, 500);
        this.tone(t, 'square', 300, 200, 0.06, 0.08);
        break;
      case 'unlock':
        this.tone(t, 'square', 2600, 2400, 0.012, 0.12);
        this.tone(t + 0.07, 'square', 1900, 1800, 0.015, 0.14);
        this.tone(t + 0.08, 'triangle', 900, 880, 0.3, 0.12);
        this.noiseHit(t + 0.07, 'highpass', 4000, 1, 0.08, 0.1);
        break;
      case 'coin': {
        // Ping, then two small bounces.
        for (const [dt, v] of [[0, 0.22], [0.14, 0.1], [0.24, 0.05]]) {
          this.tone(t + dt, 'sine', 2637, 2630, 0.5 - dt, v);
          this.tone(t + dt, 'sine', 3951, 3940, 0.25, v * 0.5);
          this.tone(t + dt, 'sine', 6200, 6100, 0.08, v * 0.3);
        }
        break;
      }
      case 'throw':
        this.noiseHit(t, 'bandpass', 900, 1.5, 0.18, 0.08, 3000);
        break;
      case 'stamp':
      case 'spotted': {
        // Rubber stamp: a dull thump and a papery slap.
        this.tone(t, 'sine', 150, 48, 0.22, 0.6);
        this.noiseHit(t, 'lowpass', 900, 0.7, 0.12, 0.5);
        this.noiseHit(t, 'highpass', 3000, 0.7, 0.04, 0.2);
        if (name === 'spotted') {
          this.tone(t + 0.03, 'triangle', 1318, 1310, 0.25, 0.08);
          this.tone(t + 0.03, 'triangle', 1396, 1390, 0.25, 0.06);
        }
        break;
      }
      case 'alarm': {
        for (let i = 0; i < 6; i++) {
          const f = i % 2 ? 660 : 880;
          const o = this.ctx.createOscillator();
          o.type = 'square';
          o.frequency.value = f;
          const bp = this.ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 1400;
          bp.Q.value = 1.2;
          const g = this.ctx.createGain();
          const s = t + i * 0.17;
          g.gain.setValueAtTime(0.0001, s);
          g.gain.exponentialRampToValueAtTime(0.07, s + 0.01);
          g.gain.setValueAtTime(0.07, s + 0.14);
          g.gain.exponentialRampToValueAtTime(0.0001, s + 0.165);
          o.connect(bp).connect(g).connect(this.sfx);
          o.start(s);
          o.stop(s + 0.18);
        }
        this.play('stamp');
        break;
      }
      case 'hear':
        this.tone(t, 'triangle', 660, 640, 0.12, 0.04);
        break;
      case 'loot':
        this.noiseHit(t, 'bandpass', 3500, 3, 0.03, 0.12);
        this.tone(t + 0.02, 'sine', 1568, 1568, 0.35, 0.09);
        this.tone(t + 0.09, 'sine', 2093, 2093, 0.4, 0.07);
        break;
      case 'target':
        [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(t + i * 0.07, 'sine', f, f, 0.6, 0.08));
        this.noiseHit(t, 'bandpass', 3500, 3, 0.03, 0.12);
        break;
      case 'blackout':
        this.noiseHit(t, 'bandpass', 120, 3, 0.25, 0.4);
        this.tone(t, 'sawtooth', 120, 30, 0.8, 0.15);
        this.tone(t, 'square', 60, 30, 0.5, 0.06);
        break;
      case 'power-on':
        this.tone(t, 'sawtooth', 50, 120, 0.4, 0.08);
        this.noiseHit(t + 0.3, 'bandpass', 2000, 4, 0.05, 0.1);
        break;
      case 'disguise':
        this.noiseHit(t, 'bandpass', 1500, 1, 0.3, 0.15, 4000);
        this.noiseHit(t + 0.2, 'bandpass', 2500, 1, 0.2, 0.1, 1200);
        break;
      case 'disguise-off':
        this.noiseHit(t, 'bandpass', 2500, 1, 0.2, 0.1, 900);
        break;
      case 'caught':
        this.play('stamp');
        this.tone(t + 0.05, 'triangle', 196, 185, 0.6, 0.15);
        this.tone(t + 0.05, 'triangle', 233, 220, 0.6, 0.1);
        break;
      case 'won':
        this.play('stamp');
        [523, 659, 784, 988, 1175].forEach((f, i) => this.tone(t + 0.15 + i * 0.06, 'sine', f, f, 0.9, 0.06));
        break;
      case 'click':
        this.noiseHit(t, 'bandpass', 3000, 2, 0.025, 0.12);
        break;
      case 'tape':
        this.noiseHit(t, 'bandpass', 1800, 1, 0.12, 0.12, 5000);
        break;
    }
  }
}
