import { brierScore } from './binary';

/*
 * The 0–100 rating.
 *
 * Every settled market gets a score: Yes/No = 100 − 200 × Brier (a 50% quote scores 50, a
 * perfect call 100, a confident wrong call down to −100); Number = the 0–100 Number score.
 *
 * Each kind has its own rating. It starts at PRIOR_MEAN and moves towards every new score:
 *   rating += (score − rating) × gain,   gain = max(1 ÷ (markets so far + PRIOR_WEIGHT), MIN_GAIN)
 * Until the gain reaches MIN_GAIN this is exactly the Bayesian posterior mean with a prior worth
 * PRIOR_WEIGHT markets; after that older markets fade, so the rating follows recent form
 * (roughly the last 30 markets).
 *
 * The overall rating averages the two kinds, each weighted by n ÷ (n + PRIOR_WEIGHT), and is
 * held between 0 and 100.
 */

export const PRIOR_MEAN = 50;
export const PRIOR_WEIGHT = 5;
export const MIN_GAIN = 1 / 30;
/** Spread of individual scores assumed until there are enough scores to estimate it. */
export const DEFAULT_SCORE_SD = 30;
const Z95 = 1.96;

export type RatingKind = 'binary' | 'number';
export type ScoredMarket = { id: number; kind: RatingKind; score: number };

/** A Yes/No market's score: 100 − 200 × Brier. */
export function binaryPoints(p: number, outcome: 0 | 1): number {
  return 100 - 200 * brierScore(p, outcome);
}

export type KindRating = {
  /** Settled markets of this kind. */
  n: number;
  /** Not clamped: a Yes/No rating can go below 0. */
  rating: number;
  /** Half-width of the ~95% range around the rating. */
  margin: number;
  /** Plain mean of the scores; null with none. */
  averageScore: number | null;
};

export type RatingStep = {
  id: number;
  kind: RatingKind;
  score: number;
  /** Overall rating before this market (null for the first) and after it. */
  before: number | null;
  after: number;
};

export type Rating = {
  /** 0–100, or null with no settled markets. */
  overall: number | null;
  /** Half-width of the ~95% range around `overall`; null with no settled markets. */
  margin: number | null;
  binary: KindRating;
  number: KindRating;
  /** One step per scored market, in the order given. */
  history: RatingStep[];
};

type KindState = {
  n: number;
  rating: number;
  /** Weight PRIOR_MEAN still carries in `rating`. */
  priorWeight: number;
  /** Sum of the squared weights the scores carry in `rating`. */
  scoreWeightSquares: number;
  sum: number;
  sumSquares: number;
};

const START: KindState = { n: 0, rating: PRIOR_MEAN, priorWeight: 1, scoreWeightSquares: 0, sum: 0, sumSquares: 0 };

/** The weight a new score gets when it is the n-th settled market of its kind. */
export function ratingGain(n: number): number {
  return Math.max(1 / (n + PRIOR_WEIGHT), MIN_GAIN);
}

function update(state: KindState, score: number): KindState {
  const n = state.n + 1;
  const gain = ratingGain(n);
  const keep = 1 - gain;
  return {
    n,
    rating: state.rating + (score - state.rating) * gain,
    priorWeight: state.priorWeight * keep,
    scoreWeightSquares: state.scoreWeightSquares * keep * keep + gain * gain,
    sum: state.sum + score,
    sumSquares: state.sumSquares + score * score,
  };
}

/** Spread of individual scores: the sample SD, pulled towards DEFAULT_SCORE_SD while there are few. */
function scoreSd(state: KindState): number {
  const deviations = state.n === 0 ? 0 : Math.max(0, state.sumSquares - (state.sum * state.sum) / state.n);
  return Math.sqrt((DEFAULT_SCORE_SD ** 2 * PRIOR_WEIGHT + deviations) / (PRIOR_WEIGHT + Math.max(0, state.n - 1)));
}

function summarize(state: KindState): KindRating {
  // Variance of a weighted average of noisy scores, with the prior counted as PRIOR_WEIGHT scores.
  const weightSquares = state.scoreWeightSquares + (state.priorWeight * state.priorWeight) / PRIOR_WEIGHT;
  return {
    n: state.n,
    rating: state.rating,
    margin: Z95 * scoreSd(state) * Math.sqrt(weightSquares),
    averageScore: state.n === 0 ? null : state.sum / state.n,
  };
}

function kindWeight(n: number): number {
  return n / (n + PRIOR_WEIGHT);
}

function combine(binary: KindRating, number: KindRating): { overall: number | null; margin: number | null } {
  const wb = kindWeight(binary.n);
  const wn = kindWeight(number.n);
  const total = wb + wn;
  if (total === 0) return { overall: null, margin: null };
  const overall = (wb * binary.rating + wn * number.rating) / total;
  const margin = Math.sqrt((wb * binary.margin) ** 2 + (wn * number.margin) ** 2) / total;
  return { overall: Math.min(100, Math.max(0, overall)), margin };
}

/** The rating after the given scored markets, which must be in the order they settled. */
export function computeRating(markets: readonly ScoredMarket[]): Rating {
  const states: Record<RatingKind, KindState> = { binary: START, number: START };
  const history: RatingStep[] = [];
  let before: number | null = null;
  for (const market of markets) {
    if (!Number.isFinite(market.score)) {
      throw new RangeError(`computeRating: score must be finite (got ${market.score} for market ${market.id})`);
    }
    states[market.kind] = update(states[market.kind], market.score);
    const after = combine(summarize(states.binary), summarize(states.number)).overall ?? PRIOR_MEAN;
    history.push({ id: market.id, kind: market.kind, score: market.score, before, after });
    before = after;
  }
  const binary = summarize(states.binary);
  const number = summarize(states.number);
  return { ...combine(binary, number), binary, number, history };
}
