// The 12 handcrafted sheets, across three buildings. See level.js for the map legend.
//
// labels: [x, y, text]            room names, in cell coordinates (centre of the text)
// notes:  { x, y, text, to? }     hand-lettered annotations; `to` draws a leader arrow
//         Tokens such as {move} and {sneak} are replaced by the player's current controls.
// par:    seconds for the SWIFT tick

export const BUILDINGS = [
  { id: 'museum', name: 'City Museum of Art', short: 'MUSEUM', drawing: 'Ground floor plan' },
  { id: 'bank', name: 'Harbour & Co. Bank', short: 'BANK', drawing: 'Banking hall & vault' },
  { id: 'observatory', name: 'Meridian Observatory', short: 'OBSERVATORY', drawing: 'Upper levels & dome' },
];

export const TOOLS = {
  lockpick: { name: 'Lockpick', note: 'Pick locked doors: press {use} as the needle crosses the shaded band.' },
  coin: { name: 'Coins', note: 'Throw a coin where you are facing with {throw}. Guards walk over to look.' },
  fuse: { name: 'Fuse box', note: 'Use a fuse box to cut the lights for 10 seconds: cameras and lasers die, guards see less.' },
  disguise: { name: 'Disguise', note: 'Put on a staff uniform at a locker. Guards and cameras ignore you, unless you run or get close.' },
};

export const LEVELS = [
  // ------------------------------------------------------------------ MUSEUM
  {
    id: 'm1',
    building: 'museum',
    name: 'Entrance Hall',
    target: { kind: 'cat', name: 'Bronze Cat Figurine' },
    par: 50,
    tutorial: true,
    map: `
###############################
#.......#.....................#
#.......#...a...........b.....#
#...S...#.....................#
#.......#.....................#
#.......#.........$...........#
#.......D.....................#
####D####.....................#
#.......########D#######D######
#.$.....#...........#.........#
#.......#...........#....T....#
#X......D...........D.........#
#.......#...........#.........#
###############################`,
    guards: [{ route: 'ab', wait: { a: 1.6, b: 1.6 }, range: 4, speed: 0.85 }],
    labels: [[19, 1.0, 'ENTRANCE HALL'], [4, 1.0, 'CLOAKROOM'], [14, 12.4, 'GIFT SHOP'], [25, 8.9, 'EGYPTIAN ROOM'], [4.5, 8.9, 'FIRE EXIT']],
    notes: [
      { x: 4, y: 4.6, text: '{move} TO MOVE', touch: 'DRAG ON THE LEFT TO MOVE' },
      { x: 4, y: 5.4, text: 'HOLD {sneak} TO SNEAK', touch: 'HOLD SNEAK (OR PUSH GENTLY) TO SNEAK', small: true },
      { x: 13.5, y: 4.2, text: 'GUARD: KEEP OUT OF THE AMBER CONE', to: [12.6, 2.6] },
      { x: 13.5, y: 6.9, text: 'WALLS BLOCK THEIR VIEW', small: true },
      { x: 18.5, y: 5.9, text: 'LOOT: OPTIONAL, SCORES', small: true, to: [18.5, 5.4] },
      { x: 25.5, y: 11.6, text: 'THE TARGET: WALK OVER IT', to: [25.5, 10.7] },
      { x: 14, y: 10.2, text: 'HOLD {sprint} TO SPRINT: FAST BUT NOISY', touch: 'HOLD SPRINT TO RUN: FAST BUT NOISY', small: true },
      { x: 4.6, y: 10.6, text: 'EXIT: BRING THE TARGET HERE', small: true, to: [1.8, 11.3] },
      { x: 4.5, y: 12.4, text: 'CAUGHT? THE SHEET RESETS', small: true },
    ],
  },
  {
    id: 'm2',
    building: 'museum',
    name: 'Sculpture Court',
    target: { kind: 'bust', name: 'Marble Bust of a Poet' },
    par: 70,
    map: `
#################################
#.......#.......................#
#..S....#..a.......b.......c....#
#.......D.......................#
#.......#....##.....##.....##...#
#.......#....##.....##.....##...#
###D#####.......................#
#.......#..f.......e.......d....#
#.......#.......................#
#..$....#######D########D########
#.......#.....~~~...@...~~~.....#
#.......#.......................#
#.......D.......................#
#X......#.......$...............#
#.......#.....................T.#
#################################`,
    guards: [{ route: 'abcdef', wait: { a: 0.8, c: 1.2, d: 0.8, f: 1.2 }, range: 5 }],
    cameras: [{ sweep: 55, period: 7, range: 6 }],
    labels: [[20, 0.9, 'SCULPTURE COURT'], [4, 0.9, 'STAFF ROOM'], [4.5, 8.0, 'STAIRS'], [27, 12.5, 'PORTRAIT GALLERY']],
    notes: [
      { x: 20.5, y: 12.6, text: 'CAMERA: CROSS WHILE IT LOOKS AWAY', to: [20.4, 10.9] },
      { x: 15, y: 11.5, text: 'CREAKY BOARDS: SNEAK OVER THEM', small: true, to: [15, 10.7] },
      { x: 16.5, y: 4.7, text: 'PLINTH', small: true },
      { x: 23.5, y: 4.7, text: 'PLINTH', small: true },
    ],
  },
  {
    id: 'm3',
    building: 'museum',
    name: 'Restoration Wing',
    target: { kind: 'sketch', name: 'Old Master Sketch' },
    par: 80,
    newTool: 'lockpick',
    map: `
###################################
#S.....#..........................#
#......#..a................b......#
#......D...........$..............#
#......#..........................#
#......#..........................#
##D#######D###############D########
#........|....c....#..............#
#........|.........#..............#
#........|.........#......T.......#
#........|.........L..............#
#........|.........#..............#
#X.......|....d....#..........$...#
###################################`,
    guards: [
      { route: 'ab', wait: { a: 1.5, b: 1.5 }, range: 5 },
      { route: 'cd', wait: { c: 1.2, d: 1.2 }, range: 4.5, speed: 0.9 },
    ],
    lasers: [{ on: 2.2, off: 1.6 }],
    labels: [[20, 0.9, 'CONSERVATION WORKSHOP'], [3.5, 0.9, 'LOCKERS'], [10, 13.5, 'CRATE STORE'], [27, 13.5, 'STRONG ROOM']],
    notes: [
      { x: 5, y: 9.5, text: 'LASERS PULSE: CROSS WHEN DARK', small: true, to: [8.6, 9.5] },
      { x: 16, y: 11.5, text: 'LOCKED: {use} TO PICK', small: true, to: [18.6, 10.5] },
      { x: 23, y: 5, text: 'EASEL', small: true },
    ],
  },
  {
    id: 'm4',
    building: 'museum',
    name: 'Grand Gallery',
    target: { kind: 'sapphire', name: 'The Prussian Sapphire' },
    par: 100,
    map: `
######################################
#S......#...........................X#
#.......#...a.................b......#
#.......D............................#
#.......#....###....###....###.......#
#.......#....###.$..###....###.......#
####D####....###....###....###.......#
#.......#...d.................c......#
#.......#............................#
#.......#...................@........#
#.......######D#############L#########
#.......#..........|........#........#
#..$....#...e......|........#........#
#.......D..........|........L....T...#
#.......#......f...|........#........#
#.......#..........|........#...$....#
######################################`,
    guards: [
      { route: 'abcd', wait: { a: 0.6, b: 0.6, c: 0.6, d: 0.6 }, range: 5.5 },
      { route: 'cdab', wait: { a: 0.6, b: 0.6, c: 0.6, d: 0.6 }, range: 5.5, speed: 0.9 },
      { route: 'ef', wait: { e: 1.4, f: 1.4 }, range: 4.5 },
    ],
    cameras: [{ sweep: 60, period: 8, range: 6.5 }],
    lasers: [{ on: 2.6, off: 1.4 }],
    labels: [[22, 0.9, 'GRAND GALLERY'], [4, 0.9, 'COAT CHECK'], [4, 7.7, 'EDUCATION'], [16, 15.5, 'PRINT ROOM'], [32.5, 10.9, 'JEWEL ROOM']],
    notes: [
      { x: 14.5, y: 3.4, text: 'DISPLAY CASES', small: true },
      { x: 32.5, y: 8.4, text: 'EXIT', to: [36, 1.6] },
    ],
  },

  // ------------------------------------------------------------------ BANK
  {
    id: 'b1',
    building: 'bank',
    name: 'Banking Hall',
    target: { kind: 'ledger', name: 'The Night Ledger' },
    par: 80,
    newTool: 'coin',
    coins: 4,
    map: `
##################################
#S.......#..........#...........$#
#........#..........#............#
#........D....a.....D.....b......#
#........#..........#............#
#........#..........#............#
###D###########D######D###########
#...................#............#
#...##########......#.....T......#
#.$.................#............#
#...##########......L............#
#...c...........d...#............#
#X..................#............#
##################################`,
    guards: [
      { route: 'a', dir: 'E', sweep: 70, range: 5 },
      { route: 'b', dir: 'S', sweep: 80, range: 5 },
      { route: 'cd', wait: { c: 1.5, d: 1.5 }, range: 5, speed: 0.9 },
    ],
    labels: [[14.5, 0.9, 'WAITING ROOM'], [26, 0.9, 'MANAGER'], [10, 7.0, 'BANKING HALL'], [26, 12.4, 'RECORDS']],
    notes: [
      { x: 14.5, y: 5.2, text: 'POSTED GUARDS DON’T PATROL', small: true },
      { x: 4.8, y: 4.4, text: '{throw}: THROW A COIN', to: [8.4, 3.2] },
      { x: 4.8, y: 5.2, text: 'GUARDS GO TO LOOK', small: true },
      { x: 9, y: 9.0, text: 'TELLER COUNTER', small: true },
    ],
  },
  {
    id: 'b2',
    building: 'bank',
    name: 'Deposit Corridor',
    target: { kind: 'key', name: 'Safe-Deposit Key No. 7' },
    par: 75,
    coins: 3,
    map: `
######################################
#S...#..................#............#
#....#..a............b..#.....$......#
#....D..................D............#
#....#~~~~~~~~~~~~~~~~~~#............#
#....#..................#............#
#....#####D##########D###....e.......#
#....#...@.....#.........#...........#
#....#..$......#.........#...........#
#....D.........#....T....L...........#
#....#.........#.........#...........#
#....#.........D.........#...........#
#....#.........#.........#####D#######
#..c.#.........#.........#...@.......#
#X...D.........#....d....D.........$.#
######################################`,
    guards: [
      { route: 'ab', wait: { a: 1, b: 1 }, range: 5 },
      { route: 'e', dir: 'W', sweep: 60, range: 5.5 },
      { route: 'cd', wait: { c: 1, d: 1.5 }, range: 5 },
    ],
    cameras: [
      { sweep: 50, period: 6, range: 5 },
      { sweep: 45, period: 7, range: 5.5, phase: 1.5 },
    ],
    labels: [[14.5, 0.9, 'SAFE-DEPOSIT HALL'], [3, 0.9, 'LIFT'], [10, 7.0, 'VIEWING ROOM'], [20, 7.0, 'BOX ROOM'], [31, 0.9, 'ARCHIVE']],
    notes: [
      { x: 14.5, y: 5.4, text: 'OLD FLOORBOARDS', small: true },
    ],
  },
  {
    id: 'b3',
    building: 'bank',
    name: 'Security Office',
    target: { kind: 'drive', name: 'Camera Tapes' },
    par: 95,
    newTool: 'fuse',
    coins: 3,
    map: `
#####################################
#S......#....................#......#
#.......#..a..............b..#..T...#
#.......D....................L......#
#.......#....................#......#
#.......#....................#......#
#.......#..d..............c..#..$...#
###D#####........@...........#......#
#.......#############D########------#
#.......#.......#...........#.......#
#...e...D...$...D....f......D.......#
#.......#.......#...........#.......#
#X......#.......#.........F.#.......#
#####################################`,
    guards: [
      { route: 'abcd', wait: { a: 0.8, b: 0.8, c: 0.8, d: 0.8 }, range: 5.5 },
      { route: 'e', dir: 'E', sweep: 70, range: 5 },
      { route: 'f', dir: 'W', sweep: 90, range: 5 },
    ],
    cameras: [{ sweep: 55, period: 6, range: 6 }],
    lasers: [{}],
    labels: [[18.5, 0.9, 'CONTROL ROOM'], [4, 0.9, 'LOCKER ROOM'], [12, 12.5, 'CANTEEN'], [22, 12.5, 'BRIEFING'], [32.5, 0.9, 'TAPE STORE']],
    notes: [
      { x: 22, y: 11.6, text: 'FUSE BOX: {use} TO CUT THE LIGHTS', to: [25.6, 12.4] },
      { x: 32.5, y: 9.6, text: 'THIS LASER NEVER PULSES', small: true, to: [32.5, 8.6] },
      { x: 32.5, y: 10.4, text: 'NO POWER, NO LASER', small: true },
    ],
  },
  {
    id: 'b4',
    building: 'bank',
    name: 'The Vault',
    target: { kind: 'gold', name: 'Gold Bullion' },
    par: 130,
    coins: 4,
    map: `
########################################
#S.......#.........................#...#
#........#...a.................b...#.X.#
#........D.........................D...#
#........#...####...........####...#...#
#..F.....#...####...........####...#...#
#........#...####.....$.....####...#...#
####D#####.........................#####
#........#...d.....@.......@...c...#...#
#........######D######L######D######...#
#........#..........#.....#........#.$.#
#...$....#..g.......#.....#.....h..L...#
#........#..........|..T..|........#...#
#........D..........#.....#........#...#
#~~~.....#..........#.....#........#...#
#........#.......i..#.....#........#...#
########################################`,
    guards: [
      { route: 'abcd', wait: { a: 0.8, b: 0.8, c: 0.8, d: 0.8 }, range: 5.5 },
      { route: 'gi', wait: { g: 1.4, i: 1.4 }, range: 5 },
      { route: 'h', dir: 'W', sweep: 80, range: 5 },
    ],
    cameras: [
      { sweep: 50, period: 7, range: 6 },
      { sweep: 50, period: 7, range: 6, phase: Math.PI },
    ],
    lasers: [{}, {}],
    pins: 4,
    labels: [[22, 0.9, 'BULLION HALL'], [4.5, 0.9, 'LOADING BAY'], [14.5, 15.5, 'COUNTING ROOM'], [23, 10.2, 'VAULT'], [30.5, 15.5, 'CASHIERS'], [37, 0.9, 'YARD']],
    notes: [
      { x: 23, y: 15, text: '1.2m STEEL', small: true },
      { x: 14.5, y: 12.6, text: 'VAULT LASERS NEVER SLEEP', small: true, to: [19.7, 12.4] },
    ],
  },

  // ------------------------------------------------------------------ OBSERVATORY
  {
    id: 'o1',
    building: 'observatory',
    name: 'Visitor Gallery',
    target: { kind: 'astrolabe', name: 'Brass Astrolabe' },
    par: 95,
    coins: 3,
    map: `
#####################################
#S.....#.......................#....#
#......#..a.................b..#..T.#
#......D.......................L....#
#......#...###....$....###.....#....#
#......#...###.........###.....######
###D####......@.......@........#....#
#......#.......................D....#
#......#..d.................c..#.$..#
#......###########D#############....#
#.$.......~~~~~.....~~~~~...........#
#X..................................#
#####################################`,
    guards: [
      { route: 'abcd', wait: { a: 1, b: 1, c: 1, d: 1 }, range: 5.5 },
      { route: 'cdab', wait: { a: 1, b: 1, c: 1, d: 1 }, range: 5.5 },
    ],
    cameras: [
      { dir: 'N', sweep: 60, period: 8, range: 5 },
      { dir: 'N', sweep: 60, period: 8, range: 5, phase: Math.PI },
    ],
    labels: [[19, 0.9, 'ORRERY GALLERY'], [3.5, 0.9, 'TICKETS'], [17, 11.6, 'SERVICE PASSAGE'], [33.5, 0.9, 'CURATOR']],
    notes: [
      { x: 19, y: 4.4, text: 'ORRERY', small: true },
    ],
  },
  {
    id: 'o2',
    building: 'observatory',
    name: 'Archive Stacks',
    target: { kind: 'chart', name: 'Star Chart of 1781' },
    par: 105,
    newTool: 'disguise',
    coins: 2,
    map: `
######################################
#S.....#.............................#
#......#..a..##..##..##..##..##...b..#
#..W...D.....##..##..##..##..##......#
#......#.....##..##..##..##..##......#
#......#.....##..##..##..##..##......#
#......#..d......................c...#
###D########D###########D#####L#######
#......#........#..........#.........#
#......#...e....#....$.....#....T....#
#......D........D..........#.........#
#.$....#........#.....f....D.........#
#X.....#..@.....#..........#....g....#
######################################`,
    guards: [
      { route: 'abcd', wait: { a: 0.6, b: 0.6, c: 0.6, d: 0.6 }, range: 5.5 },
      { route: 'e', dir: 'E', sweep: 70, range: 5 },
      { route: 'f', dir: 'N', sweep: 90, range: 5 },
      { route: 'g', dir: 'N', sweep: 80, range: 5 },
    ],
    cameras: [{ dir: 'N', sweep: 40, period: 6, range: 5.5 }],
    labels: [[20, 0.9, 'MANUSCRIPT STACKS'], [3.5, 0.9, 'STAFF'], [11.5, 7.9, 'READING ROOM'], [21.5, 7.9, 'MAP ROOM'], [32, 7.9, 'RARE BOOKS']],
    notes: [
      { x: 3.6, y: 5.0, text: 'UNIFORM LOCKER: {use}', to: [3, 3.4] },
      { x: 3.6, y: 5.8, text: 'NO RUNNING IN UNIFORM', small: true },
    ],
  },
  {
    id: 'o3',
    building: 'observatory',
    name: 'Instrument Workshop',
    target: { kind: 'lens', name: 'Ground Telescope Lens' },
    par: 115,
    coins: 3,
    map: `
#######################################
#S.....#..............#....|...|.....X#
#......#..a........b..#..f.|...|..g...#
#...F..D..............D....|...|......#
#......#..............#....|...|......#
#......#..............#....|...|......#
##D#####..d........c..#..i.|...|..h...#
#......#######D########....|...|......#
#..W...#..........#...#######D#########
#......D....j.....L...#...............#
#......#..........#...#...m.......n...#
#.$....#~~~~~~~~~~#...D...............#
#......#....k.....#.T.#...$...........#
#######################################`,
    guards: [
      { route: 'abcd', wait: { a: 0.6, b: 0.6, c: 0.6, d: 0.6 }, range: 5.5 },
      { route: 'fghi', wait: { f: 0.6, g: 0.6, h: 0.6, i: 0.6 }, range: 5.5 },
      { route: 'jk', wait: { j: 1, k: 1 }, range: 4.5 },
      { route: 'mn', wait: { m: 1.2, n: 1.2 }, range: 5 },
    ],
    lasers: [{ on: 2, off: 1.5 }, { on: 2, off: 1.5, phase: 1.7 }],
    labels: [[14.5, 0.9, 'LENS GRINDING'], [3.5, 0.9, 'STORES'], [30, 0.9, 'TEST BENCH'], [12, 12.6, 'POLISHING'], [20, 8.9, 'SAFE'], [30, 12.6, 'CLOCK ROOM']],
    notes: [],
  },
  {
    id: 'o4',
    building: 'observatory',
    name: 'The Great Dome',
    target: { kind: 'telescope', name: 'The Meridian Eyepiece' },
    par: 150,
    coins: 4,
    pins: 4,
    map: `
              ###########
          ####...........####
        ###.......a.........###
      ###.....................###
     ##...........###...........##
    ##.....d.....#####.....b.....##
   ##...........##...##...........##
   #...........##.....##...........#
  ##...........#...T...#...........##
  #............L.......L............#
  ##...........#.......#...........##
   #...........##.....##...........#
   ##............##-##............##
    ##.....g.....##L##.....h.....##
     ##..........@...@..........##
      ###.........c.........###
        ###.................###
          ####....~~~....####
   ###########...........###########
   #X.......D......$......D...$....#
   #......F.#.............#..W..S..#
   #################################`,
    guards: [
      { route: 'abcd', wait: { a: 0.5, b: 0.5, c: 0.5, d: 0.5 }, range: 6 },
      { route: 'cdab', wait: { a: 0.5, b: 0.5, c: 0.5, d: 0.5 }, range: 6, speed: 0.95 },
      { route: 'g', dir: 'NE', sweep: 60, range: 5 },
      { route: 'h', dir: 'NW', sweep: 60, range: 5 },
    ],
    cameras: [{ sweep: 55, period: 6, range: 6 }, { sweep: 55, period: 6, range: 6, phase: Math.PI }],
    lasers: [{ on: 2, off: 1.4 }],
    decor: [{ ellipse: [19.5, 9.5, 15.6, 8.4] }, { ellipse: [19.5, 9.5, 13.2, 7.0] }, { ellipse: [19.5, 9.3, 3.4, 3.4] }],
    labels: [[19.5, 2.2, 'THE GREAT DOME'], [19.5, 21.5, 'ROTUNDA STAIR'], [8, 18.4, 'PLANT'], [31, 18.4, 'ROBING ROOM']],
    notes: [
      { x: 18.5, y: 6.0, text: 'TELESCOPE PIER', small: true },
      { x: 27, y: 2.4, text: 'Ø 34.0m', small: true },
    ],
  },
];

/** Tools available on each sheet: everything introduced on or before it. */
export function toolsFor(index) {
  const s = new Set();
  for (let i = 0; i <= index; i++) {
    const t = LEVELS[i].newTool;
    if (t) s.add(t);
  }
  return s;
}

export function buildingOf(level) {
  return BUILDINGS.find((b) => b.id === level.building);
}
