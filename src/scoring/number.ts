/**
 * Scoring for Number markets: the user quotes a bid @ ask range for an unknown non-negative
 * quantity, and the true value is revealed later.
 *
 * Score, 0–100 (higher is better):
 *   - 0 if the value lands outside the quote;
 *   - 100 / (1 + (WIDTH_K × width ÷ max(value, 1))²) if it lands inside. A value exactly on
 *     the bid or ask counts as inside.
 *
 * An exact quote scores 100, and the score falls smoothly towards 0 as the quote gets wider
 * compared with the answer: a quote 30% as wide as the answer scores 50, and one like
 * 1 @ 100000 scores about 0. Answers below 1 are divided by 1, so an answer of 0 works.
 */
import { mean } from './common';

/** Scales width ÷ answer so that a quote 30% as wide as the answer scores 50. */
export const WIDTH_K = 10 / 3;

export type Position = 'below' | 'inside' | 'above';
export type NumberItem = { bid: number; ask: number; value: number };

export type NumberScore = {
  /** ask − bid, in the market's own units. */
  width: number;
  /** width ÷ max(value, 1). */
  relativeWidth: number;
  position: Position;
  /** 0–100; always 0 when the value is outside the quote. */
  score: number;
};

/** The score for a quote `width` wide when the value lands inside it. */
export function insideScore(width: number, value: number): number {
  if (!Number.isFinite(width) || width < 0) {
    throw new RangeError(`insideScore: width must be a finite number >= 0 (got ${width})`);
  }
  validateValue(value);
  const ratio = (WIDTH_K * width) / Math.max(value, 1);
  return 100 / (1 + ratio * ratio);
}

/** Score one resolved quote. */
export function numberScore(bid: number, ask: number, value: number): NumberScore {
  validateQuote(bid, ask);
  validateValue(value);
  const width = ask - bid;
  let position: Position = 'inside';
  if (value < bid) position = 'below';
  else if (value > ask) position = 'above';
  return {
    width,
    relativeWidth: width / Math.max(value, 1),
    position,
    score: position === 'inside' ? insideScore(width, value) : 0,
  };
}

/** How wide a quote is compared with its midpoint (18 @ 24 → 0.286), for showing before it settles. */
export function quoteWidthShare(bid: number, ask: number): number {
  validateQuote(bid, ask);
  return (ask - bid) / Math.max((bid + ask) / 2, 1);
}

/** What a quote would score if the answer landed exactly on its midpoint. */
export function midpointScore(bid: number, ask: number): number {
  validateQuote(bid, ask);
  return insideScore(ask - bid, (bid + ask) / 2);
}

export type NumberSummary = {
  n: number;
  /** Mean score, 0–100 (higher is better). */
  averageScore: number;
  /** Share of values that landed inside the quote. */
  hitRate: number;
  /** Share of values below the bid. */
  below: number;
  /** Share of values inside the quote (same as hitRate). */
  inside: number;
  /** Share of values above the ask. */
  above: number;
  /** Mean of width ÷ max(answer, 1). */
  averageRelativeWidth: number;
  /** Mean score over the quotes the value landed inside; null if none did. */
  averageScoreWhenInside: number | null;
};

/** Aggregate statistics for a set of resolved Number quotes. Returns null for empty input. */
export function summarizeNumber(items: readonly NumberItem[]): NumberSummary | null {
  const n = items.length;
  if (n === 0) return null;

  const scores: number[] = [];
  const relativeWidths: number[] = [];
  const insideScores: number[] = [];
  let below = 0;
  let inside = 0;
  let above = 0;

  for (const { bid, ask, value } of items) {
    const r = numberScore(bid, ask, value);
    scores.push(r.score);
    relativeWidths.push(r.relativeWidth);
    if (r.position === 'below') below++;
    else if (r.position === 'above') above++;
    else {
      inside++;
      insideScores.push(r.score);
    }
  }

  return {
    n,
    averageScore: mean(scores),
    hitRate: inside / n,
    below: below / n,
    inside: inside / n,
    above: above / n,
    averageRelativeWidth: mean(relativeWidths),
    averageScoreWhenInside: insideScores.length === 0 ? null : mean(insideScores),
  };
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

function validateValue(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`value must be a finite number >= 0 (got ${value})`);
  }
}
