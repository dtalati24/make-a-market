/**
 * Scoring for Number markets: the user quotes a bid @ ask range for an unknown non-negative
 * quantity, and the true value is revealed later.
 *
 * Everything is measured on a log(1 + x) scale and multiplied by 100, so "10 points" is
 * roughly "10%" regardless of the quantity's magnitude, and zero is still allowed.
 *
 * cost = spread + MISS_MULTIPLIER * miss is the interval score for a central 50% interval
 * (2 / alpha = 4 with alpha = 0.5). Its expected value is minimised by quoting your own
 * 25th percentile as the bid and 75th percentile as the ask.
 */
import { mean, wilsonInterval } from './common';

/** Each point of miss costs this many points; 4 makes the 25th–75th percentile quote optimal. */
export const MISS_MULTIPLIER = 4;

export type Position = 'below' | 'inside' | 'above';
export type NumberItem = { bid: number; ask: number; value: number };

const t = Math.log1p;

/** Width of the quote in points: 100 * (ln(1 + ask) - ln(1 + bid)). Narrower is more precise. */
export function spreadPoints(bid: number, ask: number): number {
  validateQuote(bid, ask);
  return 100 * (t(ask) - t(bid));
}

export type NumberCost = {
  /** Width of the quote in points. */
  spread: number;
  /** How far outside the quote the value landed, in points (0 when inside). */
  miss: number;
  /** spread + MISS_MULTIPLIER * miss. Lower is better. */
  cost: number;
  position: Position;
};

/** Score one resolved quote. A value exactly on the bid or ask counts as inside. */
export function numberCost(bid: number, ask: number, value: number): NumberCost {
  validateQuote(bid, ask);
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`numberCost: value must be a finite number >= 0 (got ${value})`);
  }
  const spread = 100 * (t(ask) - t(bid));
  let position: Position;
  let miss: number;
  if (value < bid) {
    position = 'below';
    miss = 100 * (t(bid) - t(value));
  } else if (value > ask) {
    position = 'above';
    miss = 100 * (t(value) - t(ask));
  } else {
    position = 'inside';
    miss = 0;
  }
  return { spread, miss, cost: spread + MISS_MULTIPLIER * miss, position };
}

export type NumberSummary = {
  n: number;
  /** Mean cost per quote (lower is better). */
  averageCost: number;
  /** Mean quote width in points. */
  averageSpread: number;
  /** Share of values that landed inside the quote; ~50% is the target. */
  hitRate: number;
  /** 95% Wilson interval for hitRate. */
  hitLow: number;
  hitHigh: number;
  /** Share of values below the bid. */
  below: number;
  /** Share of values inside the quote (same as hitRate). */
  inside: number;
  /** Share of values above the ask. */
  above: number;
  /** Mean miss in points over the quotes that missed; null if none missed. */
  averageMissWhenMissed: number | null;
};

/** Aggregate statistics for a set of resolved Number quotes. Returns null for empty input. */
export function summarizeNumber(items: readonly NumberItem[]): NumberSummary | null {
  const n = items.length;
  if (n === 0) return null;

  const costs: number[] = [];
  const spreads: number[] = [];
  const misses: number[] = [];
  let below = 0;
  let inside = 0;
  let above = 0;

  for (const { bid, ask, value } of items) {
    const r = numberCost(bid, ask, value);
    costs.push(r.cost);
    spreads.push(r.spread);
    if (r.position === 'below') below++;
    else if (r.position === 'above') above++;
    else inside++;
    if (r.position !== 'inside') misses.push(r.miss);
  }

  const ci = wilsonInterval(inside, n);
  return {
    n,
    averageCost: mean(costs),
    averageSpread: mean(spreads),
    hitRate: inside / n,
    hitLow: ci.low,
    hitHigh: ci.high,
    below: below / n,
    inside: inside / n,
    above: above / n,
    averageMissWhenMissed: misses.length === 0 ? null : mean(misses),
  };
}

export type WidthVerdict = { kind: 'insufficient' | 'too-tight' | 'too-wide' | 'about-right' };

/**
 * Are the quotes the right width? Only says too tight / too wide when the 95% interval
 * for the hit rate excludes 50%. Needs at least 5 resolved quotes.
 */
export function widthVerdict(summary: NumberSummary | null): WidthVerdict {
  if (summary === null || summary.n < 5) return { kind: 'insufficient' };
  if (summary.hitHigh < 0.5) return { kind: 'too-tight' };
  if (summary.hitLow > 0.5) return { kind: 'too-wide' };
  return { kind: 'about-right' };
}

function validateQuote(bid: number, ask: number): void {
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) {
    throw new RangeError(`quote must be finite (got ${bid} @ ${ask})`);
  }
  if (bid < 0) {
    throw new RangeError(`bid must be >= 0 (got ${bid})`);
  }
  if (ask < bid) {
    throw new RangeError(`ask must be >= bid (got ${bid} @ ${ask})`);
  }
}
