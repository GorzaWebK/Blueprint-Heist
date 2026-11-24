// Per-level scoring and the gold / silver / bronze stamps. No DOM: tested in Node.
//
// Three checks, one tick each:
//   GHOST      never spotted (by a guard, a camera or a laser)
//   COLLECTOR  every piece of loot on the sheet
//   SWIFT      finished within the sheet's par time
// 3 ticks = gold, 2 = silver, 0-1 = bronze. Finishing always earns at least bronze.

export const STAMPS = ['none', 'bronze', 'silver', 'gold'];
export const STAMP_RANK = { none: 0, bronze: 1, silver: 2, gold: 3 };

export function scoreRun({ time, par, loot, lootTotal, spotted }) {
  const ghost = spotted === 0;
  const collector = loot >= lootTotal;
  const swift = time <= par;
  const ticks = (ghost ? 1 : 0) + (collector ? 1 : 0) + (swift ? 1 : 0);
  const stamp = ticks === 3 ? 'gold' : ticks === 2 ? 'silver' : 'bronze';
  const timeBonus = Math.max(0, Math.round((par - time) * 10));
  const points = Math.max(0, 1000 + 250 * loot - 200 * spotted + timeBonus);
  return { stamp, ghost, collector, swift, ticks, points, timeBonus };
}

/**
 * Merge a finished run into the saved best for that level. Each field keeps its own
 * best (fastest time, most loot, fewest spots, highest stamp and points), so a quick
 * messy run and a slow clean run both count.
 */
export function mergeBest(prev, run, result) {
  if (!prev) {
    return {
      stamp: result.stamp,
      points: result.points,
      time: run.time,
      loot: run.loot,
      spotted: run.spotted,
      clears: 1,
    };
  }
  return {
    stamp: STAMP_RANK[result.stamp] > STAMP_RANK[prev.stamp] ? result.stamp : prev.stamp,
    points: Math.max(prev.points, result.points),
    time: Math.min(prev.time, run.time),
    loot: Math.max(prev.loot, run.loot),
    spotted: Math.min(prev.spotted, run.spotted),
    clears: (prev.clears || 0) + 1,
  };
}

/** Whether this run beat the saved points (for the "NEW BEST" note). */
export function isNewBest(prev, result) {
  return !prev || result.points > prev.points;
}

/** 83.25 -> "01:23.2" */
export function formatTime(t) {
  if (!isFinite(t)) return '--:--.-';
  const tenths = Math.floor(t * 10);
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  const d = tenths % 10;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`;
}
