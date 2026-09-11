/**
 * Scoring for Yes/No markets: the user states a probability p that the answer is Yes,
 * and the outcome (1 = Yes, 0 = No) is revealed later.
 */
import { mean, wilsonInterval } from './common';

/** Probabilities are clamped into [MIN_P, MAX_P] so a single 0%/100% call can't dominate the log score. */
export const MIN_P = 0.01;
export const MAX_P = 0.99;

export type Outcome = 0 | 1;
export type BinaryItem = { p: number; outcome: Outcome };

/** Clamp a probability into [MIN_P, MAX_P]. Throws a RangeError for NaN / ±Infinity. */
export function clampProbability(p: number): number {
  if (!Number.isFinite(p)) {
    throw new RangeError(`clampProbability: p must be finite (got ${p})`);
  }
  return Math.min(MAX_P, Math.max(MIN_P, p));
}

/** Brier score: squared error between the probability and the 0/1 outcome. 0 is perfect; lower is better. */
export function brierScore(p: number, outcome: Outcome): number {
  const d = clampProbability(p) - outcome;
  return d * d;
}

/** Log score: natural log of the probability given to what actually happened. Always <= 0; closer to 0 is better. */
export function logScore(p: number, outcome: Outcome): number {
  const q = clampProbability(p);
  return outcome * Math.log(q) + (1 - outcome) * Math.log(1 - q);
}

/** One bucket of a calibration (reliability) chart: "of the times I said ~lo–hi, how often did it happen?" */
export type CalibrationBin = {
  index: number;
  lo: number;
  hi: number;
  n: number;
  /** Average stated probability in this bucket (after clamping). */
  meanP: number;
  /** Fraction of items in this bucket that resolved Yes. */
  freq: number;
  /** 95% Wilson interval for `freq`. */
  ciLow: number;
  ciHigh: number;
};

/**
 * Group items into `binCount` equal-width probability buckets. Returns only non-empty bins,
 * sorted by index.
 *
 * The bin index is floor(p * binCount + 1e-9), capped at binCount - 1. The 1e-9 nudge guards
 * against probabilities stored as integer/100 landing a hair below a boundary after
 * multiplication (e.g. 0.29999999999999999 * 10), so p = 0.3 reliably lands in bin 3.
 * It is far smaller than the 0.01 resolution of stored probabilities, so it never moves a
 * genuinely lower value (such as 0.29) into the next bin.
 */
export function calibrationBins(items: readonly BinaryItem[], binCount = 10): CalibrationBin[] {
  if (!Number.isInteger(binCount) || binCount < 1) {
    throw new RangeError(`calibrationBins: binCount must be an integer >= 1 (got ${binCount})`);
  }
  const sumP = new Array<number>(binCount).fill(0);
  const hits = new Array<number>(binCount).fill(0);
  const counts = new Array<number>(binCount).fill(0);

  for (const item of items) {
    const p = clampProbability(item.p);
    const k = Math.min(Math.floor(p * binCount + 1e-9), binCount - 1);
    sumP[k] += p;
    hits[k] += item.outcome;
    counts[k] += 1;
  }

  const bins: CalibrationBin[] = [];
  for (let k = 0; k < binCount; k++) {
    const n = counts[k];
    if (n === 0) continue;
    const ci = wilsonInterval(hits[k], n);
    bins.push({
      index: k,
      lo: k / binCount,
      hi: (k + 1) / binCount,
      n,
      meanP: sumP[k] / n,
      freq: hits[k] / n,
      ciLow: ci.low,
      ciHigh: ci.high,
    });
  }
  return bins;
}

export type BinarySummary = {
  n: number;
  /** Mean Brier score (lower is better). */
  brier: number;
  /** Mean log score (closer to 0 is better). */
  logScore: number;
  /** Fraction of items that resolved Yes. */
  baseRate: number;
  /** Brier score of always forecasting the base rate: baseRate * (1 - baseRate). */
  uncertainty: number;
  /** Brier skill vs. always forecasting the base rate: 1 is perfect, 0 is no better, negative is worse. Null when every outcome was the same. */
  skill: number | null;
  /** How sure the user sounded on average: mean of max(p, 1 - p). */
  averageConfidence: number;
  /** How often the side the user leaned toward happened (a 50% call counts as half right). */
  hitRate: number;
  /** averageConfidence - hitRate. Positive means more confident than the results justify. */
  overconfidence: number;
  /** Calibration error: weighted mean squared gap between stated probability and observed frequency per bin (lower is better). */
  reliability: number;
  /** How much the bins' observed frequencies differ from the base rate — i.e. how well forecasts separate Yes from No (higher is better). */
  resolution: number;
  bins: CalibrationBin[];
};

/**
 * Aggregate statistics for a set of resolved Yes/No forecasts. Returns null for empty input.
 * When every item in a bin shares the same p, brier === reliability - resolution + uncertainty
 * (the Murphy decomposition); otherwise it holds only approximately.
 */
export function summarizeBinary(items: readonly BinaryItem[]): BinarySummary | null {
  const n = items.length;
  if (n === 0) return null;

  const briers: number[] = [];
  const logs: number[] = [];
  const outcomes: number[] = [];
  const confidences: number[] = [];
  const correct: number[] = [];

  for (const { p: rawP, outcome } of items) {
    const p = clampProbability(rawP);
    briers.push(brierScore(p, outcome));
    logs.push(logScore(p, outcome));
    outcomes.push(outcome);
    confidences.push(Math.max(p, 1 - p));
    if (p === 0.5) correct.push(0.5);
    else correct.push((p > 0.5 && outcome === 1) || (p < 0.5 && outcome === 0) ? 1 : 0);
  }

  const baseRate = mean(outcomes);
  const uncertainty = baseRate * (1 - baseRate);
  const brier = mean(briers);
  const averageConfidence = mean(confidences);
  const hitRate = mean(correct);
  const bins = calibrationBins(items);

  let reliabilitySum = 0;
  let resolutionSum = 0;
  for (const bin of bins) {
    reliabilitySum += bin.n * (bin.meanP - bin.freq) ** 2;
    resolutionSum += bin.n * (bin.freq - baseRate) ** 2;
  }

  return {
    n,
    brier,
    logScore: mean(logs),
    baseRate,
    uncertainty,
    skill: uncertainty === 0 ? null : 1 - brier / uncertainty,
    averageConfidence,
    hitRate,
    overconfidence: averageConfidence - hitRate,
    reliability: reliabilitySum / n,
    resolution: resolutionSum / n,
    bins,
  };
}

export type ConfidenceVerdict =
  | { kind: 'insufficient' }
  | { kind: 'calibrated'; points: number }
  | { kind: 'overconfident'; points: number }
  | { kind: 'underconfident'; points: number };

/**
 * Plain-language read of `overconfidence`: within 3 percentage points counts as calibrated.
 * `points` is the gap in percentage points (unrounded). Needs at least 5 resolved items.
 */
export function confidenceVerdict(summary: BinarySummary | null): ConfidenceVerdict {
  if (summary === null || summary.n < 5) return { kind: 'insufficient' };
  const gap = summary.overconfidence;
  const points = Math.abs(gap) * 100;
  if (Math.abs(gap) < 0.03) return { kind: 'calibrated', points };
  return gap > 0 ? { kind: 'overconfident', points } : { kind: 'underconfident', points };
}
