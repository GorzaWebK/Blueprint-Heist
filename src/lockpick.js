// The lockpick timing mini-game: a needle swings across the lock cylinder and you
// press Use while it is over the shaded "shear line" to set each pin in turn.
// A miss drops the last pin and makes a small noise.

export class Lockpick {
  constructor(pins = 3, rng = Math.random) {
    this.pins = pins;
    this.set = 0;
    this.t = 0;
    this.rng = rng;
    this.flash = 0; // >0 after a hit (+) or miss (-), for the drawing
    this.done = false;
    this.newPin();
  }

  newPin() {
    // Later pins have a narrower window and a quicker needle.
    this.width = 0.2 - this.set * 0.03;
    this.centre = 0.2 + this.rng() * 0.6;
    this.speed = 2.4 + this.set * 0.55;
  }

  /** Needle position, 0..1 across the cylinder. */
  get needle() {
    return 0.5 - 0.5 * Math.cos(this.t * this.speed);
  }

  inWindow() {
    return Math.abs(this.needle - this.centre) <= this.width / 2;
  }

  update(dt) {
    this.t += dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3);
    else if (this.flash < 0) this.flash = Math.min(0, this.flash + dt * 3);
  }

  /** Returns 'set', 'open' or 'miss'. */
  press() {
    if (this.done) return 'open';
    if (this.inWindow()) {
      this.set++;
      this.flash = 1;
      if (this.set >= this.pins) {
        this.done = true;
        return 'open';
      }
      this.newPin();
      return 'set';
    }
    this.set = Math.max(0, this.set - 1);
    this.flash = -1;
    this.newPin();
    return 'miss';
  }
}
