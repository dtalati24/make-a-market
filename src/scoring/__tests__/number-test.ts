import {
  insideScore,
  midpointScore,
  numberScore,
  quoteWidthShare,
  summarizeNumber,
  WIDTH_K,
  type NumberItem,
} from '../number';

/** The inside-score formula, written out independently. */
const expected = (width: number, value: number) => 100 / (1 + ((WIDTH_K * width) / Math.max(value, 1)) ** 2);

describe('insideScore', () => {
  it('scores a quote 30% as wide as the answer at 50', () => {
    expect(WIDTH_K).toBeCloseTo(10 / 3, 12);
    expect(insideScore(6, 20)).toBeCloseTo(50, 10);
    expect(insideScore(30, 100)).toBeCloseTo(50, 10);
  });

  it('is 100 for an exact quote and falls towards 0 as the quote widens', () => {
    expect(insideScore(0, 20)).toBe(100);
    // Width 2 on 20: ratio (10/3)(2/20) = 1/3, so 100 / (1 + 1/9) = 90.
    expect(insideScore(2, 20)).toBeCloseTo(90, 10);
    // Like 1 @ 100000 with an answer of 500.
    expect(insideScore(99999, 500)).toBeLessThan(0.001);
    let previous = Infinity;
    for (const width of [0, 1, 2, 5, 10, 20, 50, 100]) {
      const score = insideScore(width, 20);
      expect(score).toBeLessThan(previous);
      expect(score).toBeGreaterThan(0);
      previous = score;
    }
  });

  it('divides by at least 1, so an answer of 0 works', () => {
    expect(insideScore(0, 0)).toBe(100);
    // Width 1 on an answer of 0 is treated as width 1 on 1: ratio 10/3, so 100 / (1 + 100/9) ≈ 8.26.
    expect(insideScore(1, 0)).toBeCloseTo(100 / (1 + 100 / 9), 10);
    expect(insideScore(1, 0)).toBeCloseTo(8.257, 3);
    expect(insideScore(1, 0.5)).toBeCloseTo(insideScore(1, 1), 12);
  });

  it('throws on invalid input', () => {
    expect(() => insideScore(-1, 5)).toThrow(RangeError);
    expect(() => insideScore(NaN, 5)).toThrow(RangeError);
    expect(() => insideScore(1, -1)).toThrow(RangeError);
    expect(() => insideScore(1, Infinity)).toThrow(RangeError);
  });
});

describe('numberScore', () => {
  it('scores a value inside the quote by width ÷ answer', () => {
    const r = numberScore(18, 24, 20);
    expect(r.position).toBe('inside');
    expect(r.width).toBe(6);
    expect(r.relativeWidth).toBeCloseTo(0.3, 12);
    expect(r.score).toBeCloseTo(50, 10);
    // The same quote scores more when the answer is bigger: 6 ÷ 23.
    expect(numberScore(18, 24, 23).score).toBeCloseTo(expected(6, 23), 10);
    expect(numberScore(18, 24, 23).score).toBeCloseTo(56.943, 3);
  });

  it('scores 0 outside the quote, however close', () => {
    expect(numberScore(18, 24, 30)).toEqual({ width: 6, relativeWidth: 0.2, position: 'above', score: 0 });
    expect(numberScore(18, 24, 24.01)).toMatchObject({ position: 'above', score: 0 });
    expect(numberScore(18, 24, 10)).toMatchObject({ position: 'below', score: 0 });
  });

  it('treats both boundaries as inside', () => {
    expect(numberScore(18, 24, 18)).toMatchObject({ position: 'inside', score: expected(6, 18) });
    expect(numberScore(18, 24, 24)).toMatchObject({ position: 'inside', score: expected(6, 24) });
  });

  it('handles zero-width quotes and answers of 0', () => {
    expect(numberScore(5, 5, 5).score).toBe(100);
    expect(numberScore(5, 5, 6)).toMatchObject({ position: 'above', score: 0 });
    expect(numberScore(0, 0, 0).score).toBe(100);
    expect(numberScore(0, 5, 0)).toMatchObject({ position: 'inside', score: expected(5, 0) });
    expect(numberScore(1, 2, 0)).toMatchObject({ position: 'below', score: 0 });
  });

  it('throws on invalid input', () => {
    expect(() => numberScore(-1, 5, 3)).toThrow(RangeError);
    expect(() => numberScore(6, 5, 3)).toThrow(RangeError);
    expect(() => numberScore(NaN, 5, 3)).toThrow(RangeError);
    expect(() => numberScore(1, NaN, 3)).toThrow(RangeError);
    expect(() => numberScore(1, 5, NaN)).toThrow(RangeError);
    expect(() => numberScore(1, 5, -1)).toThrow(RangeError);
    expect(() => numberScore(1, 5, Infinity)).toThrow(RangeError);
  });
});

describe('quote previews', () => {
  it('shows the width as a share of the midpoint', () => {
    expect(quoteWidthShare(18, 24)).toBeCloseTo(6 / 21, 12);
    expect(quoteWidthShare(5, 5)).toBe(0);
    expect(quoteWidthShare(0, 1)).toBe(1); // midpoint 0.5 is divided as 1
  });

  it('scores the quote as if the answer landed on the midpoint', () => {
    expect(midpointScore(18, 24)).toBeCloseTo(expected(6, 21), 12);
    expect(midpointScore(18, 24)).toBeCloseTo(52.44, 2);
    expect(midpointScore(7, 7)).toBe(100);
  });
});

describe('the best quote depends on how sure you are', () => {
  // Belief: the answer is equally likely to be any whole number in a range. Find the best
  // whole-number quote by brute force.
  const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  function best(values: number[]) {
    const lo = values[0];
    const hi = values[values.length - 1];
    let top = { bid: lo, ask: lo, average: -1 };
    for (let bid = lo; bid <= hi; bid++) {
      for (let ask = bid; ask <= hi; ask++) {
        let sum = 0;
        for (const v of values) sum += numberScore(bid, ask, v).score;
        const average = sum / values.length;
        if (average > top.average) top = { bid, ask, average };
      }
    }
    const coverage = values.filter((v) => v >= top.bid && v <= top.ask).length / values.length;
    return { ...top, coverage };
  }

  it('covers nearly everything when sure, and much less when unsure', () => {
    expect(best(range(95, 105)).coverage).toBeGreaterThan(0.8);
    expect(best(range(50, 150)).coverage).toBeLessThan(0.5);
  });

  it('never rewards a huge quote', () => {
    const values = range(50, 150);
    const average = values.reduce((sum, v) => sum + numberScore(1, 100000, v).score, 0) / values.length;
    expect(average).toBeLessThan(0.01);
  });
});

describe('summarizeNumber', () => {
  // A (18,24,20) inside, width 6 on 20 → 50
  // B (18,24,30) above → 0
  // C (18,24,10) below → 0
  // D (0,9,4)    inside, width 9 on 4 → 100 / (1 + 7.5²)
  // E (9,9,9)    inside, exact → 100
  const items: NumberItem[] = [
    { bid: 18, ask: 24, value: 20 },
    { bid: 18, ask: 24, value: 30 },
    { bid: 18, ask: 24, value: 10 },
    { bid: 0, ask: 9, value: 4 },
    { bid: 9, ask: 9, value: 9 },
  ];
  const s = summarizeNumber(items)!;
  const scoreD = 100 / (1 + 7.5 ** 2);

  it('computes every field', () => {
    expect(s.n).toBe(5);
    expect(s.averageScore).toBeCloseTo((50 + 0 + 0 + scoreD + 100) / 5, 10);
    expect(s.hitRate).toBeCloseTo(0.6, 12);
    expect(s.inside).toBeCloseTo(0.6, 12);
    expect(s.below).toBeCloseTo(0.2, 12);
    expect(s.above).toBeCloseTo(0.2, 12);
    // Width ÷ answer: 6/20, 6/30, 6/10, 9/4, 0.
    expect(s.averageRelativeWidth).toBeCloseTo((0.3 + 0.2 + 0.6 + 2.25 + 0) / 5, 12);
    expect(s.averageScoreWhenInside).toBeCloseTo((50 + scoreD + 100) / 3, 10);
  });

  it('returns null averageScoreWhenInside when nothing landed inside', () => {
    const r = summarizeNumber([{ bid: 1, ask: 3, value: 5 }])!;
    expect(r.averageScoreWhenInside).toBeNull();
    expect(r.averageScore).toBe(0);
    expect(r.hitRate).toBe(0);
  });

  it('returns null for empty input and propagates invalid items', () => {
    expect(summarizeNumber([])).toBeNull();
    expect(() => summarizeNumber([{ bid: 5, ask: 1, value: 2 }])).toThrow(RangeError);
  });
});
