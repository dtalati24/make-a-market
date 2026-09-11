import {
  binaryPoints,
  computeRating,
  DEFAULT_SCORE_SD,
  MIN_GAIN,
  PRIOR_MEAN,
  PRIOR_WEIGHT,
  ratingGain,
  type ScoredMarket,
} from '../rating';

const yes = (id: number, score: number): ScoredMarket => ({ id, kind: 'binary', score });
const num = (id: number, score: number): ScoredMarket => ({ id, kind: 'number', score });

describe('binaryPoints', () => {
  it('is 100 − 200 × Brier, so a coin flip scores 50', () => {
    expect(binaryPoints(0.5, 1)).toBeCloseTo(50, 10);
    expect(binaryPoints(0.5, 0)).toBeCloseTo(50, 10);
    expect(binaryPoints(0.7, 1)).toBeCloseTo(82, 10); // Brier 0.09
    expect(binaryPoints(0.7, 0)).toBeCloseTo(2, 10); // Brier 0.49
    expect(binaryPoints(0.99, 1)).toBeCloseTo(99.98, 10);
    expect(binaryPoints(0.99, 0)).toBeCloseTo(-96.02, 10); // confidently wrong goes below 0
  });
});

describe('ratingGain', () => {
  it('is 1 ÷ (n + prior weight), never below the minimum', () => {
    expect(PRIOR_WEIGHT).toBe(5);
    expect(MIN_GAIN).toBeCloseTo(1 / 30, 12);
    expect(ratingGain(1)).toBeCloseTo(1 / 6, 12);
    expect(ratingGain(10)).toBeCloseTo(1 / 15, 12);
    expect(ratingGain(25)).toBeCloseTo(1 / 30, 12);
    expect(ratingGain(100)).toBeCloseTo(1 / 30, 12);
  });
});

describe('computeRating', () => {
  it('has no overall rating before anything settles', () => {
    const r = computeRating([]);
    expect(r.overall).toBeNull();
    expect(r.margin).toBeNull();
    expect(r.history).toEqual([]);
    expect(r.binary).toEqual({
      n: 0,
      rating: PRIOR_MEAN,
      margin: expect.closeTo(1.96 * DEFAULT_SCORE_SD * Math.sqrt(1 / PRIOR_WEIGHT), 10),
      averageScore: null,
    });
  });

  it('moves one sixth of the way on the first market', () => {
    const r = computeRating([yes(1, 100)]);
    expect(r.binary.rating).toBeCloseTo(50 + 50 / 6, 10); // 58.33
    expect(r.overall).toBeCloseTo(50 + 50 / 6, 10); // only one kind: overall = that kind
    expect(r.margin).toBeCloseTo((1.96 * 30) / Math.sqrt(6), 10);
    expect(r.history).toEqual([{ id: 1, kind: 'binary', score: 100, before: null, after: expect.closeTo(58.333, 3) }]);
  });

  it('is the Bayesian average (prior 50 worth 5 markets) until recency kicks in', () => {
    const scores = [80, 20, 65, -40, 100];
    const r = computeRating(scores.map((score, i) => yes(i + 1, score)));
    // (5 × 50 + 225) ÷ (5 + 5) = 47.5
    expect(r.binary.rating).toBeCloseTo(47.5, 10);
    expect(r.binary.averageScore).toBeCloseTo(45, 10);
    // With equal weights the ±95% range is 1.96 × SD ÷ √(n + 5).
    const deviations = scores.reduce((sum, s) => sum + (s - 45) ** 2, 0);
    const sd = Math.sqrt((30 ** 2 * 5 + deviations) / (5 + 4));
    expect(r.binary.margin).toBeCloseTo((1.96 * sd) / Math.sqrt(10), 10);
  });

  it('then follows recent form, remembering about 30 markets', () => {
    const r = computeRating(Array.from({ length: 40 }, (_, i) => num(i + 1, 80)));
    // After 25 markets: (250 + 25 × 80) ÷ 30 = 75. Then each market closes 1/30 of the gap.
    expect(r.number.rating).toBeCloseTo(80 - 5 * (29 / 30) ** 15, 10);
    // A late market still moves the rating by 1/30 of its surprise.
    const later = computeRating([...Array.from({ length: 100 }, (_, i) => num(i + 1, 60)), num(101, 90)]);
    const step = later.history[100];
    expect(step.after - step.before!).toBeCloseTo((90 - step.before!) / 30, 10);
  });

  it('weights each kind by n ÷ (n + 5) in the overall rating', () => {
    const markets = [
      ...Array.from({ length: 10 }, (_, i) => yes(i + 1, 64)),
      ...Array.from({ length: 6 }, (_, i) => num(i + 11, 40)),
    ];
    const r = computeRating(markets);
    const yesRating = (250 + 640) / 15; // 59.33
    const numberRating = (250 + 240) / 11; // 44.55
    expect(r.binary.rating).toBeCloseTo(yesRating, 10);
    expect(r.number.rating).toBeCloseTo(numberRating, 10);
    const wy = 10 / 15;
    const wn = 6 / 11;
    expect(r.overall).toBeCloseTo((wy * yesRating + wn * numberRating) / (wy + wn), 10);
    expect(r.overall).toBeCloseTo(52.68, 2);
    // Margin of the overall is the weighted combination of the two.
    expect(r.margin).toBeCloseTo(Math.sqrt((wy * r.binary.margin) ** 2 + (wn * r.number.margin) ** 2) / (wy + wn), 10);
  });

  it('records the overall rating before and after each market', () => {
    const r = computeRating([yes(1, 100), num(2, 0), yes(3, 50)]);
    expect(r.history.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(r.history[0].before).toBeNull();
    expect(r.history[1].before).toBeCloseTo(r.history[0].after, 12);
    expect(r.history[2].before).toBeCloseTo(r.history[1].after, 12);
    expect(r.history[2].after).toBeCloseTo(r.overall!, 12);
    // A Number score of 0 pulls the overall down.
    expect(r.history[1].after).toBeLessThan(r.history[0].after);
  });

  it('holds the overall between 0 and 100, but not the kind ratings', () => {
    const r = computeRating(Array.from({ length: 10 }, (_, i) => yes(i + 1, -100)));
    expect(r.binary.rating).toBeCloseTo((250 - 1000) / 15, 10); // −50
    expect(r.overall).toBe(0);
  });

  it('gets more certain as markets accumulate', () => {
    const scores = (n: number) => Array.from({ length: n }, (_, i) => yes(i + 1, i % 2 === 0 ? 30 : 70));
    expect(computeRating(scores(20)).margin!).toBeLessThan(computeRating(scores(5)).margin!);
  });

  it('rejects non-finite scores', () => {
    expect(() => computeRating([yes(1, NaN)])).toThrow(RangeError);
  });
});
