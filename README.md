# Blueprint Heist

A top-down, real-time stealth heist for the browser, drawn as a living architect's blueprint. You are a small red pencil mark on deep Prussian-blue paper: slip past the guards, cameras and lasers, lift the target and get out without being caught. Twelve short sheets (1 to 4 minutes each) across three buildings.

**Play:** https://gorzawebk.github.io/Blueprint-Heist/

Plays on PC (keyboard or gamepad) and on phones and tablets (touch, portrait or landscape). Everything is made in code: the paper, the line work, the stamps, the icons, the favicon, the music and the sound effects. There are no image or audio files.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrow keys | Move |
| Shift (hold) | Sneak: slow and silent, and guards take longer to notice you |
| Space (hold) | Sprint: fast, but every footstep makes a noise ring that guards hear |
| E (or Enter) | Use: pick a lock, cut the lights at a fuse box, put on a uniform |
| Q | Throw a coin where you are facing |
| Esc (or P) | Pause |
| M | Mute |

Every key can be rebound in **Controls** (two keys per action, saved on the device).

**Gamepad:** left stick or d-pad to move (a light push on the stick sneaks), LB/LT sneak, RB/RT sprint, A use, X throw, Start pause, Back mute. The menus work with the d-pad and A/B too.

**Touch:** drag anywhere on the left half of the screen to move (a short drag sneaks). On the right are USE, THROW, SPRINT (hold) and SNEAK (hold). The title block moves to the top right so it stays clear of your thumbs.

## How to play

Each sheet is a floor plan. Find the **target** (marked with a dashed amber circle), walk over it to steal it, then reach the **EXIT**. Loot (small gems) is optional but it scores. The timer starts when you first move.

- **Guards** walk patrol routes, or stand at a post and look around. Their vision is the amber highlighter cone, and walls block it. They also notice you if you're right next to them (the dotted ring). While they can see you, a meter fills around them. A `?` means they're suspicious and coming to look; when the meter fills, the paper flashes, a red rubber-stamp **!** thumps down beside them and they chase you. Break line of sight and they'll search the last place they saw you, then go back to their route.
- **Noise:** sprinting, creaky floorboards (unless you sneak over them) and a fumbled lock make noise rings. Guards inside a ring come to investigate; walls muffle sound.
- **Cameras** sweep a dashed arc. If one sees you for long enough it locks on and raises the alarm, and guards nearby come running.
- **Laser tripwires** are thin red lines. Some pulse on and off, some never switch off. Crossing a live beam raises the alarm.
- **Caught** means the sheet starts again straight away. There are no lives.

### Tools (one new tool every few sheets)

| Sheet | Tool | What it does |
| --- | --- | --- |
| 3 | Lockpick | Locked doors open with a timing mini-game, drawn as a detail callout: press Use as the swinging needle crosses the shaded band to set each pin. A miss drops a pin and makes a small noise. Some doors need 4 pins. |
| 5 | Coins | Throw one where you're facing (a dotted line shows where it'll land). Guards in earshot walk over to look. A few per sheet. |
| 7 | Fuse box | Cuts the lights for 10 seconds: cameras and lasers die and guards see less than half as far. When the power comes back, someone comes to check the box. |
| 10 | Disguise | A staff uniform locker. For 18 seconds guards and cameras ignore you, unless you sprint or get close. If a guard does rumble you, the disguise is blown. |

### Scoring

Each finished sheet is checked against three ticks: **GHOST** (never spotted by a guard, camera or laser), **COLLECTOR** (all the loot) and **SWIFT** (within the sheet's par time). All three earn a gold **APPROVED** stamp, two earn silver and fewer earn bronze. Points are `1000 + 250 per loot - 200 per spot + 10 per second under par`. Your best stamp, points, time, loot and fewest spots per sheet are saved in `localStorage`, and the next sheet unlocks when you finish one.

### The sheets

| # | Building | Sheet | New |
| --- | --- | --- | --- |
| 1 | City Museum of Art | Entrance Hall | Tutorial, written as annotations on the plan |
| 2 | | Sculpture Court | Cameras, creaky boards |
| 3 | | Restoration Wing | Lockpick, pulsing lasers |
| 4 | | Grand Gallery | Two guards on one loop |
| 5 | Harbour & Co. Bank | Banking Hall | Coins, posted guards |
| 6 | | Deposit Corridor | A long creaky corridor |
| 7 | | Security Office | Fuse box, a laser that never sleeps |
| 8 | | The Vault | 4-pin locks, permanent vault lasers |
| 9 | Meridian Observatory | Visitor Gallery | |
| 10 | | Archive Stacks | Disguise |
| 11 | | Instrument Workshop | Laser curtains |
| 12 | | The Great Dome | Everything at once |

## Look and feel

- **The sheet:** cyanotype paper (`#0d3866`) with uneven exposure, grain, fibres, two fold creases and darker edges, all generated at start-up, with a faint drafting grid, a double-ruled border with grid references, a north arrow, a scale bar and a drawing title.
- **Line work:** walls are crisp white outlines that overshoot their corners slightly, like a draughtsman's line, filled with diagonal poché hatching. Doors are drawn with dashed swing arcs. Room labels are hand-lettered and show their floor area. Each building gets overall dimension lines and chain dimensions along its walls, and overhead features (the observatory dome) are dashed.
- **Moving parts:** the player is a red pencil mark that leaves a fading dotted trail. Guards are white circles with amber highlighter cones that warm towards red as they get suspicious. Cameras sweep dashed arcs, lasers flicker red, and noises spread as dashed rings.
- **UI (the drafting table):** menus are sheets of tracing paper pinned with drafting tape, and buttons are lettering boxes whose lines run past the corners and get a highlighter swipe on hover. The HUD is an architect's title block (sheet number, time, loot, spotted, objective, tools). Results are inked with an APPROVED stamp in gold, silver or bronze; getting caught slams down a red REJECTED.
- **Type:** Architects Daughter for the hand lettering, IBM Plex Sans Condensed for numbers and labels. Both are bundled with the game through Fontsource, so it works offline and inside iframes.
- **Palette:** Prussian blue `#0d3866`, line white `#eaf3ff`, highlighter amber `#ffb21e`, pencil red `#ff4b3e`, stamp red `#e0363c`, tracing paper `#e9eee8`, drafting table `#27251f`.

## Sound

All synthesised live with the Web Audio API:

- **Music:** a late-night jazz trio on a ii-V-I-VI loop at 84 bpm: a walking upright bass (chord tones with chromatic approach notes), brushed snare sweeps and taps with a soft ride, and FM Rhodes chords through a generated room reverb. When you're spotted the band moves, on the next bar line, to a tense variation at 132 bpm (minor changes, pushed Rhodes stabs, busier brushes and a low throb), and settles back a few seconds after the chase is over.
- **Effects:** pencil-scratch footsteps (louder when sprinting), floorboard creaks, lockpick clicks, a coin ping with two bounces, a rubber-stamp thump, a two-tone alarm, the fuse box powering down, chimes for loot and the target.

## Embedding

The game fills whatever box it's placed in: `#game` is `width: 100%; height: 100%`, and a `ResizeObserver` resizes the canvas and redraws the sheet at the right resolution. Menus and the HUD scale with container-query units, so it works in a page, in an iframe, or squeezed between ad slots on a games site. There are no ads inside the game. If the whole sheet doesn't fit at a readable size (about 22 px per tile on PC, 27 on touch), the camera follows the player instead. The game pauses itself when the tab is hidden.

## How it's built

- Plain JavaScript modules and [Vite](https://vite.dev). No framework, no Three.js: 2D only, drawn with Canvas 2D.
- The rules (`game.js`, `guard.js`, `vision.js`, `level.js`, `path.js`, `scoring.js`, `lockpick.js`) have no DOM or drawing code, so they run and are tested in Node.
- **Line of sight** walks each ray cell by cell through the tile grid (Amanatides & Woo), so walls block sight exactly at their edges and there's no peeking through corner gaps. The amber cones on screen come from the same rays the guards use.
- **Guards** use A* path finding (8 directions, no corner cutting) with path smoothing, and a small state machine: patrol, notice, investigate, look around, chase, search, return.
- **Performance:** the sheet (paper, walls, hatching, notes and dimensions) is drawn once per level into an offscreen layer, capped at about 7 megapixels, and each frame only copies it and draws the moving parts. The device pixel ratio is capped at 2. A frame costs about 1.5 ms of script time even with the CPU throttled 4×.

| File | What it does |
| --- | --- |
| `src/main.js` | Start-up, the main loop, the flow between menus and sheets, saving results |
| `src/levels.js` | The 12 sheets as ASCII floor plans, with guards, cameras, lasers, labels and notes |
| `src/level.js` | Parses a floor plan into a tile grid and its objects |
| `src/game.js` | One attempt at a sheet: player movement and collision, tools, cameras, lasers, noise, winning and getting caught |
| `src/guard.js` | Guard behaviour |
| `src/vision.js` | Ray casting, line of sight, vision cones |
| `src/path.js` | A* path finding |
| `src/lockpick.js` | The lockpick timing mini-game |
| `src/scoring.js` | Ticks, stamps, points, best results |
| `src/render.js` | Canvas renderer: the cached sheet layer, camera, cones, guards, effects |
| `src/art.js` | Procedural paper, rubber stamps, line-art icons, favicon |
| `src/audio.js` | The jazz trio and all sound effects |
| `src/input.js` | Rebindable keyboard, gamepad, touch joystick and buttons |
| `src/ui.js` | Tracing-paper menus, sheet select with thumbnails, results, title-block HUD |
| `src/storage.js` | Settings, bindings and best results in `localStorage` (with an in-memory fallback) |
| `src/style.css` | The drafting table: tracing paper, tape, buttons, title block, touch controls |
| `tests/` | Node tests for line of sight and vision cones, scoring, the levels and the game rules |
| `tools/check-levels.mjs` | Checks every sheet: shape, reachability, guard routes, lasers |
| `tools/planner-bot.mjs` | A look-ahead bot that plays each sheet without being seen, to prove it can be done |

### Decisions made along the way

The brief left some details open; these are the choices made:

- **Spotted, not caught:** being seen by a guard starts a chase. You're only caught if a chasing guard reaches you while it can see you, so you can still run and hide. Cameras and lasers raise the alarm (and count as a spot) but never catch you on their own.
- **REJECTED:** when you're caught, the stamp slams down for about a second and the sheet restarts (press Use to skip it). No lives.
- **Unlocking:** sheets unlock in order as you finish them. Any finish counts; you don't need gold.
- **Fuse boxes** are single use, and the guard nearest the box comes to look when the power returns.
- **Coins** fly up to about 5½ tiles in the direction you face and stop at walls, so you aim by turning.
- **Doors** are open doorways unless they're locked. Guards never pick locks, so a locked door is also a way to shake off a patrol.
- **Solvability:** `npm run bot` runs a look-ahead bot over every sheet. It sneaks, picks locks and uses fuse boxes but never throws coins or wears uniforms. In testing it beat 11 of the 12 sheets without being seen, though not on every run, because guards have a little randomness. The exception is Sheet 5, which is built around a coin or the long way round: the bot gets stuck behind the posted guard.

## Running locally

```bash
npm install
npm run dev            # dev server at http://localhost:5173 (also on your LAN for phone testing)
npm test               # line of sight, vision cones, scoring, levels, game rules
npm run check:levels   # sanity-check every sheet
npm run bot            # let the planner bot try every sheet (about a minute)
npm run build          # static site in dist/
npm run preview
```

Testing helpers: `window.blueprintHeist` in the console gives you the current `game`, `startLevel(index)`, the `renderer` and the `audio` engine.

## Deployment

Every push to `main` runs the tests, builds the game and publishes it to GitHub Pages via `.github/workflows/deploy.yml`. One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
