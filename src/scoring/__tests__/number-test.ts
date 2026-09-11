import {
  MISS_MULTIPLIER,
  type NumberItem,
  type NumberSummary,
  numberCost,
  spreadPoints,
  summarizeNumber,
  widthVerdict,
} from '../number';

describe('spreadPoints', () => {
  it('is 100 * ln((1 + ask) / (1 + bid))', () => {
    expect(spreadPoints(18, 24)).toBeCloseTo(100 * Math.log(25 / 19), 10); // ≈ 27.4437
    expect(spreadPoints(18, 24)).toBeCloseTo(27.4437, 4);
    expect(spreadPoints(0, 9)).toBeCloseTo(100 * Math.log(10), 10); // ≈ 230.2585
    expect(spreadPoints(5, 5)).toBe(0);
  });

  it('throws on invalid quotes', () => {
    expect(() => spreadPoints(-1, 5)).toThrow(RangeError);
    expect(() => spreadPoints(6, 5)).toThrow(RangeError);
    expect(() => spreadPoints(NaN, 5)).toThrow(RangeError);
    expect(() => spreadPoints(1, Infinity)).toThrow(RangeError);
  });
});

describe('numberCost', () => {
  it('scores a value above the ask', () => {
    // spread = 100 ln(25/19) ≈ 27.4437; miss = 100 ln(31/25) ≈ 21.5111
    // cost = 27.4437 + 4 * 21.5111 ≈ 113.488
    const r = numberCost(18, 24, 30);
    expect(MISS_MULTIPLIER).toBe(4);
    expect(r.position).toBe('above');
    expect(r.spread).toBeCloseTo(100 * Math.log(25 / 19), 10);
    expect(r.miss).toBeCloseTo(100 * Math.log(31 / 25), 10);
    expect(r.cost).toBeCloseTo(100 * Math.log(25 / 19) + 400 * Math.log(31 / 25), 10);
    expect(r.cost).toBeCloseTo(113.488, 3);
  });

  it('scores a value inside the quote as just the spread', () => {
    const r = numberCost(18, 24, 20);
    expect(r.position).toBe('inside');
    expect(r.miss).toBe(0);
    expect(r.cost).toBe(r.spread);
    expect(r.cost).toBeCloseTo(100 * Math.log(25 / 19), 10);
  });

  it('scores a value below the bid', () => {
    // miss = 100 (ln 19 - ln 11) = 100 ln(19/11) ≈ 54.6544
    const r = numberCost(18, 24, 10);
    expect(r.position).toBe('below');
    expect(r.miss).toBeCloseTo(100 * Math.log(19 / 11), 10);
    expect(r.cost).toBeCloseTo(100 * Math.log(25 / 19) + 400 * Math.log(19 / 11), 10);
  });

  it('treats both boundaries as inside', () => {
    expect(numberCost(18, 24, 18)).toMatchObject({ position: 'inside', miss: 0 });
    expect(numberCost(18, 24, 24)).toMatchObject({ position: 'inside', miss: 0 });
  });

  it('handles a zero-width quote', () => {
    expect(numberCost(5, 5, 5)).toEqual({ spread: 0, miss: 0, cost: 0, position: 'inside' });
    const r = numberCost(5, 5, 6);
    expect(r.position).toBe('above');
    expect(r.miss).toBeCloseTo(100 * Math.log(7 / 6), 10); // ≈ 15.4151
    expect(r.cost).toBeCloseTo(400 * Math.log(7 / 6), 10);
  });

  it('handles a value of 0', () => {
    // inside [0, 1]: spread = 100 ln 2
    expect(numberCost(0, 1, 0)).toMatchObject({ position: 'inside', miss: 0 });
    expect(numberCost(0, 1, 0).spread).toBeCloseTo(100 * Math.log(2), 10);
    // below [1, 2]: miss = 100 (ln 2 - ln 1) = 100 ln 2 ≈ 69.3147
    const r = numberCost(1, 2, 0);
    expect(r.position).toBe('below');
    expect(r.miss).toBeCloseTo(100 * Math.log(2), 10);
    expect(numberCost(0, 0, 0)).toEqual({ spread: 0, miss: 0, cost: 0, position: 'inside' });
  });

  it('throws on invalid input', () => {
    expect(() => numberCost(-1, 5, 3)).toThrow(RangeError);
    expect(() => numberCost(6, 5, 3)).toThrow(RangeError);
    expect(() => numberCost(NaN, 5, 3)).toThrow(RangeError);
    expect(() => numberCost(1, NaN, 3)).toThrow(RangeError);
    expect(() => numberCost(1, 5, NaN)).toThrow(RangeError);
    expect(() => numberCost(1, 5, -1)).toThrow(RangeError);
    expect(() => numberCost(1, 5, Infinity)).toThrow(RangeError);
  });

  describe('propriety: the optimal quote is the 25th–75th percentile', () => {
    // V is uniform on {1, 2, ..., 100}. Try every integer quote 1 <= bid <= ask <= 100.
    //
    // Hand derivation. Average cost = spread + 4 * mean(miss). The bid and ask terms are
    // separable, and log1p is monotone, so write d = t(b + 1) - t(b) > 0:
    //  - Raising the bid b → b + 1 cuts the spread by 100d and raises the miss of each of the
    //    b values v <= b by 100d, so Δ = 100d * (-1 + 4 * b / 100): negative for b < 25,
    //    exactly 0 at b = 25, positive for b > 25. Optimal bid ∈ {25, 26} (exact tie).
    //  - Raising the ask a → a + 1 widens the spread by 100d' and cuts the miss of each of the
    //    100 - a values v >= a + 1 by 100d', so Δ = 100d' * (1 - 4 * (100 - a) / 100):
    //    negative for a < 75, 0 at a = 75, positive for a > 75. Optimal ask ∈ {75, 76}.
    // So the minimisers are exactly the quartile pairs (P(V < bid) ≈ 25%, P(V > ask) ≈ 25%),
    // which is tighter than the ±2 tolerance. The hit rate at the optimum is between
    // 50/100 (26 @ 75) and 52/100 (25 @ 76).
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const avgCost = (bid: number, ask: number) => {
      let sum = 0;
      for (const v of values) sum += numberCost(bid, ask, v).cost;
      return sum / values.length;
    };

    let best = { bid: 0, ask: 0, cost: Infinity };
    for (let bid = 1; bid <= 100; bid++) {
      for (let ask = bid; ask <= 100; ask++) {
        const c = avgCost(bid, ask);
        if (c < best.cost) best = { bid, ask, cost: c };
      }
    }

    it('lands on the quartiles', () => {
      expect([25, 26]).toContain(best.bid);
      expect([75, 76]).toContain(best.ask);
    });

    it('is a tie across the quartile pairs and strictly worse just outside', () => {
      for (const bid of [25, 26]) {
        for (const ask of [75, 76]) {
          expect(Math.abs(avgCost(bid, ask) - best.cost)).toBeLessThan(1e-9);
        }
      }
      expect(avgCost(24, 75)).toBeGreaterThan(best.cost + 1e-6);
      expect(avgCost(27, 75)).toBeGreaterThan(best.cost + 1e-6);
      expect(avgCost(25, 74)).toBeGreaterThan(best.cost + 1e-6);
      expect(avgCost(25, 77)).toBeGreaterThan(best.cost + 1e-6);
    });

    it('hits about half the time', () => {
      const s = summarizeNumber(values.map((value) => ({ bid: best.bid, ask: best.ask, value })))!;
      expect(s.hitRate).toBeGreaterThanOrEqual(0.45);
      expect(s.hitRate).toBeLessThanOrEqual(0.55);
      expect(s.hitRate).toBeGreaterThanOrEqual(0.5); // hand bound: 50..52 of 100
      expect(s.hitRate).toBeLessThanOrEqual(0.52);
    });
  });
});

describe('summarizeNumber', () => {
  // A (18,24,20) inside  spread 100 ln(25/19)
  // B (18,24,30) above   spread 100 ln(25/19), miss 100 ln(31/25)
  // C (18,24,10) below   spread 100 ln(25/19), miss 100 ln(19/11)
  // D (0,9,4)    inside  spread 100 ln 10
  // E (9,9,9)    inside  spread 0
  const items: NumberItem[] = [
    { bid: 18, ask: 24, value: 20 },
    { bid: 18, ask: 24, value: 30 },
    { bid: 18, ask: 24, value: 10 },
    { bid: 0, ask: 9, value: 4 },
    { bid: 9, ask: 9, value: 9 },
  ];
  const s = summarizeNumber(items)!;
  const spreadSum = 300 * Math.log(25 / 19) + 100 * Math.log(10); // ≈ 82.3311 + 230.2585 = 312.5896
  const missB = 100 * Math.log(31 / 25); // ≈ 21.5111
  const missC = 100 * Math.log(19 / 11); // ≈ 54.6544

  it('computes every field', () => {
    expect(s.n).toBe(5);
    expect(s.averageSpread).toBeCloseTo(spreadSum / 5, 10); // ≈ 62.5179
    // (312.5896 + 4 * (21.5111 + 54.6544)) / 5 = 617.2516 / 5 ≈ 123.4503
    expect(s.averageCost).toBeCloseTo((spreadSum + 4 * (missB + missC)) / 5, 10);
    expect(s.averageCost).toBeCloseTo(123.4503, 3);
    expect(s.hitRate).toBeCloseTo(0.6, 12); // 3 / 5
    expect(s.inside).toBeCloseTo(0.6, 12);
    expect(s.below).toBeCloseTo(0.2, 12); // 1 / 5
    expect(s.above).toBeCloseTo(0.2, 12); // 1 / 5
    // Wilson(3, 5): center 0.98416 / 1.76832, half 1.96 * sqrt(0.086416) / 1.76832
    const center = 0.98416 / 1.76832;
    const half = (1.96 * Math.sqrt(0.086416)) / 1.76832;
    expect(s.hitLow).toBeCloseTo(center - half, 10); // ≈ 0.230714
    expect(s.hitHigh).toBeCloseTo(center + half, 10); // ≈ 0.882376
    expect(s.averageMissWhenMissed).toBeCloseTo((missB + missC) / 2, 10); // ≈ 38.0828
  });

  it('returns null averageMissWhenMissed when everything is inside', () => {
    const r = summarizeNumber([
      { bid: 1, ask: 3, value: 2 },
      { bid: 1, ask: 3, value: 3 },
    ])!;
    expect(r.averageMissWhenMissed).toBeNull();
    expect(r.hitRate).toBe(1);
    expect(r.averageCost).toBeCloseTo(100 * Math.log(4 / 2), 10); // spread only
  });

  it('returns null for empty input and propagates invalid items', () => {
    expect(summarizeNumber([])).toBeNull();
    expect(() => summarizeNumber([{ bid: 5, ask: 1, value: 2 }])).toThrow(RangeError);
  });
});

describe('widthVerdict', () => {
  const quotes = (inside: number, outside: number): NumberItem[] => [
    ...Array.from({ length: inside }, () => ({ bid: 10, ask: 20, value: 15 })),
    ...Array.from({ length: outside }, () => ({ bid: 10, ask: 20, value: 30 })),
  ];

  it('is insufficient for null or n < 5', () => {
    expect(widthVerdict(null)).toEqual({ kind: 'insufficient' });
    expect(widthVerdict(summarizeNumber(quotes(0, 4)))).toEqual({ kind: 'insufficient' });
  });

  it('is too-tight when the whole hit-rate interval is below 50%', () => {
    // 0 of 10: hitHigh = 3.8416 / 13.8416 ≈ 0.2775 < 0.5
    expect(widthVerdict(summarizeNumber(quotes(0, 10)))).toEqual({ kind: 'too-tight' });
  });

  it('is too-wide when the whole hit-rate interval is above 50%', () => {
    // 10 of 10: hitLow = 10 / 13.8416 ≈ 0.7225 > 0.5
    expect(widthVerdict(summarizeNumber(quotes(10, 0)))).toEqual({ kind: 'too-wide' });
  });

  it('is about-right when the interval contains 50%', () => {
    // 5 of 10: [0.2366, 0.7634]
    expect(widthVerdict(summarizeNumber(quotes(5, 5)))).toEqual({ kind: 'about-right' });
    // 1 of 5: [0.0362, 0.6244] still contains 0.5 — too few quotes to call it
    expect(widthVerdict(summarizeNumber(quotes(1, 4)))).toEqual({ kind: 'about-right' });
  });

  it('checks the thresholds directly', () => {
    const base: NumberSummary = {
      n: 5,
      averageCost: 0,
      averageSpread: 0,
      hitRate: 0.5,
      hitLow: 0.2,
      hitHigh: 0.8,
      below: 0.25,
      inside: 0.5,
      above: 0.25,
      averageMissWhenMissed: null,
    };
    expect(widthVerdict({ ...base, hitHigh: 0.4999 })).toEqual({ kind: 'too-tight' });
    expect(widthVerdict({ ...base, hitHigh: 0.5 })).toEqual({ kind: 'about-right' });
    expect(widthVerdict({ ...base, hitLow: 0.5001 })).toEqual({ kind: 'too-wide' });
    expect(widthVerdict({ ...base, hitLow: 0.5 })).toEqual({ kind: 'about-right' });
  });
});
