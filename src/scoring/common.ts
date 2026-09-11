/**
 * Small statistical helpers shared by the binary and number scoring modules.
 */

/** Arithmetic mean. Throws a RangeError for an empty array (the mean is undefined). */
export function mean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new RangeError('mean() of an empty array is undefined');
  }
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export type Interval = { low: number; high: number };

/**
 * 95% (by default) Wilson score interval for a proportion `successes / n`.
 * Unlike the naive ± interval it stays sensible for small n and for rates near 0 or 1.
 * `successes` may be fractional (e.g. half-credit hits); n === 0 returns the vacuous [0, 1].
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): Interval {
  if (!Number.isFinite(n) || n < 0) {
    throw new RangeError(`wilsonInterval: n must be a finite number >= 0 (got ${n})`);
  }
  if (!Number.isFinite(successes) || successes < 0 || successes > n) {
    throw new RangeError(`wilsonInterval: successes must be in [0, n] (got ${successes}, n = ${n})`);
  }
  if (!Number.isFinite(z) || z < 0) {
    throw new RangeError(`wilsonInterval: z must be a finite number >= 0 (got ${z})`);
  }
  if (n === 0) return { low: 0, high: 1 };

  const phat = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (phat + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n));
  return { low: clamp01(center - half), high: clamp01(center + half) };
}

export type RollingPoint = { index: number; value: number };

/**
 * Trailing moving average over full windows only: one point for each i >= window - 1,
 * averaging values[i - window + 1 .. i]. Returns [] when there are fewer values than `window`.
 */
export function rollingMean(values: readonly number[], window: number): RollingPoint[] {
  if (!Number.isInteger(window) || window < 1) {
    throw new RangeError(`rollingMean: window must be an integer >= 1 (got ${window})`);
  }
  const points: RollingPoint[] = [];
  // Recompute each window from scratch rather than keeping a running sum, so results
  // don't accumulate floating-point drift over long histories. O(n * window) is fine here.
  for (let i = window - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) sum += values[j];
    points.push({ index: i, value: sum / window });
  }
  return points;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
