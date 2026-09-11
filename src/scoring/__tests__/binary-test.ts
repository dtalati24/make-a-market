import {
  type BinaryItem,
  type BinarySummary,
  brierScore,
  calibrationBins,
  clampProbability,
  confidenceVerdict,
  logScore,
  MAX_P,
  MIN_P,
  summarizeBinary,
} from '../binary';

describe('clampProbability', () => {
  it('clamps into [MIN_P, MAX_P]', () => {
    expect(MIN_P).toBe(0.01);
    expect(MAX_P).toBe(0.99);
    expect(clampProbability(0)).toBe(0.01);
    expect(clampProbability(1)).toBe(0.99);
    expect(clampProbability(-0.5)).toBe(0.01);
    expect(clampProbability(1.5)).toBe(0.99);
    expect(clampProbability(0.01)).toBe(0.01);
    expect(clampProbability(0.99)).toBe(0.99);
    expect(clampProbability(0.37)).toBe(0.37);
  });

  it('throws on non-finite input', () => {
    expect(() => clampProbability(NaN)).toThrow(RangeError);
    expect(() => clampProbability(Infinity)).toThrow(RangeError);
    expect(() => clampProbability(-Infinity)).toThrow(RangeError);
  });
});

describe('brierScore', () => {
  it('is the squared error', () => {
    expect(brierScore(0.7, 1)).toBeCloseTo(0.09, 12); // (0.7 - 1)^2
    expect(brierScore(0.7, 0)).toBeCloseTo(0.49, 12); // (0.7 - 0)^2
    expect(brierScore(0.5, 1)).toBeCloseTo(0.25, 12);
  });

  it('clamps first', () => {
    expect(brierScore(1, 1)).toBeCloseTo(0.0001, 12); // (0.99 - 1)^2
    expect(brierScore(0, 1)).toBeCloseTo(0.9801, 12); // (0.01 - 1)^2
  });
});

describe('logScore', () => {
  it('is ln of the probability given to what happened', () => {
    expect(logScore(0.7, 1)).toBeCloseTo(Math.log(0.7), 12); // ≈ -0.356675
    expect(logScore(0.7, 0)).toBeCloseTo(Math.log(0.3), 12); // ≈ -1.203973
  });

  it('clamps so the score stays finite', () => {
    expect(logScore(1, 1)).toBeCloseTo(Math.log(0.99), 12); // ≈ -0.010050
    expect(logScore(1, 0)).toBeCloseTo(Math.log(0.01), 12); // ≈ -4.605170
    expect(logScore(0, 0)).toBeCloseTo(Math.log(0.99), 12);
  });

  it('is never positive', () => {
    for (let k = 0; k <= 100; k++) {
      expect(logScore(k / 100, 1)).toBeLessThan(0);
      expect(logScore(k / 100, 0)).toBeLessThan(0);
    }
  });
});

describe('calibrationBins', () => {
  const items: BinaryItem[] = [
    { p: 0.3, outcome: 1 }, // bin 3
    { p: 0.29, outcome: 0 }, // bin 2
    { p: 0.99, outcome: 1 }, // bin 9
    { p: 0.01, outcome: 0 }, // bin 0
    { p: 0, outcome: 0 }, // clamps to 0.01 → bin 0
    { p: 1, outcome: 1 }, // clamps to 0.99 → bin 9
    { p: 0.1 + 0.2, outcome: 0 }, // 0.30000000000000004 → bin 3
  ];
  const bins = calibrationBins(items);

  it('returns only non-empty bins, sorted by index', () => {
    expect(bins.map((b) => b.index)).toEqual([0, 2, 3, 9]);
  });

  it('computes n, meanP, freq, lo, hi per bin', () => {
    const [b0, b2, b3, b9] = bins;
    expect(b0).toMatchObject({ index: 0, lo: 0, hi: 0.1, n: 2 });
    expect(b0.meanP).toBeCloseTo(0.01, 12); // (0.01 + 0.01) / 2
    expect(b0.freq).toBe(0); // 0 / 2

    expect(b2).toMatchObject({ index: 2, lo: 0.2, hi: 0.3, n: 1, freq: 0 });
    expect(b2.meanP).toBeCloseTo(0.29, 12);

    expect(b3).toMatchObject({ index: 3, lo: 0.3, hi: 0.4, n: 2, freq: 0.5 }); // 1 / 2
    expect(b3.meanP).toBeCloseTo(0.3, 12); // (0.3 + 0.30000000000000004) / 2

    expect(b9).toMatchObject({ index: 9, lo: 0.9, hi: 1, n: 2, freq: 1 });
    expect(b9.meanP).toBeCloseTo(0.99, 12);
  });

  it('attaches 95% Wilson intervals', () => {
    const [b0, b2, b3, b9] = bins;
    // 0 of 2: low 0, high = z^2 / (n + z^2) = 3.8416 / 5.8416 ≈ 0.657628
    expect(b0.ciLow).toBeCloseTo(0, 12);
    expect(b0.ciHigh).toBeCloseTo(3.8416 / 5.8416, 10);
    // 0 of 1: high = 3.8416 / 4.8416 ≈ 0.793456
    expect(b2.ciLow).toBeCloseTo(0, 12);
    expect(b2.ciHigh).toBeCloseTo(3.8416 / 4.8416, 10);
    // 1 of 2: denom = 1 + 3.8416/2 = 2.9208, center 0.5,
    // half = 1.96 * sqrt(0.25/2 + 3.8416/16) / 2.9208 = 1.96 * sqrt(0.3651) / 2.9208 ≈ 0.405471
    const half = (1.96 * Math.sqrt(0.3651)) / 2.9208;
    expect(b3.ciLow).toBeCloseTo(0.5 - half, 10); // ≈ 0.094529
    expect(b3.ciHigh).toBeCloseTo(0.5 + half, 10); // ≈ 0.905471
    // 2 of 2: low = n / (n + z^2) = 2 / 5.8416 ≈ 0.342372, high 1
    expect(b9.ciLow).toBeCloseTo(2 / 5.8416, 10);
    expect(b9.ciHigh).toBeCloseTo(1, 12);
  });

  it('puts every integer percentage in the right bin for several bin counts', () => {
    // Expected index uses exact integer arithmetic: floor(k * binCount / 100).
    for (const binCount of [5, 10, 20]) {
      for (let k = 1; k <= 99; k++) {
        const [bin] = calibrationBins([{ p: k / 100, outcome: 0 }], binCount);
        expect({ k, binCount, index: bin.index }).toEqual({
          k,
          binCount,
          index: Math.min(Math.floor((k * binCount) / 100), binCount - 1),
        });
      }
    }
  });

  it('returns [] for no items and validates binCount', () => {
    expect(calibrationBins([])).toEqual([]);
    expect(() => calibrationBins(items, 0)).toThrow(RangeError);
    expect(() => calibrationBins(items, 2.5)).toThrow(RangeError);
  });
});

describe('summarizeBinary', () => {
  // Hand-worked dataset (all p already within [0.01, 0.99]):
  //  p    o  brier  log      conf  correct  bin
  //  0.9  1  0.01   ln 0.9   0.9   1        9
  //  0.9  0  0.81   ln 0.1   0.9   0        9
  //  0.7  1  0.09   ln 0.7   0.7   1        7
  //  0.3  0  0.09   ln 0.7   0.7   1        3
  //  0.2  1  0.64   ln 0.2   0.8   0        2
  //  0.5  0  0.25   ln 0.5   0.5   0.5      5
  const items: BinaryItem[] = [
    { p: 0.9, outcome: 1 },
    { p: 0.9, outcome: 0 },
    { p: 0.7, outcome: 1 },
    { p: 0.3, outcome: 0 },
    { p: 0.2, outcome: 1 },
    { p: 0.5, outcome: 0 },
  ];
  const s = summarizeBinary(items)!;

  it('computes every field', () => {
    expect(s.n).toBe(6);
    // (0.01 + 0.81 + 0.09 + 0.09 + 0.64 + 0.25) / 6 = 1.89 / 6
    expect(s.brier).toBeCloseTo(0.315, 12);
    // ln(0.9 * 0.1 * 0.7 * 0.7 * 0.2 * 0.5) / 6 = ln(0.00441) / 6 ≈ -0.903980
    expect(s.logScore).toBeCloseTo(Math.log(0.00441) / 6, 12);
    expect(s.baseRate).toBeCloseTo(0.5, 12); // 3 / 6
    expect(s.uncertainty).toBeCloseTo(0.25, 12); // 0.5 * 0.5
    expect(s.skill).toBeCloseTo(-0.26, 12); // 1 - 0.315 / 0.25
    // (0.9 + 0.9 + 0.7 + 0.7 + 0.8 + 0.5) / 6 = 4.5 / 6
    expect(s.averageConfidence).toBeCloseTo(0.75, 12);
    // (1 + 0 + 1 + 1 + 0 + 0.5) / 6 = 3.5 / 6
    expect(s.hitRate).toBeCloseTo(3.5 / 6, 12); // ≈ 0.583333
    expect(s.overconfidence).toBeCloseTo(0.75 - 3.5 / 6, 12); // ≈ 0.166667
    // bins: 2 {0.2, freq 1}, 3 {0.3, freq 0}, 5 {0.5, freq 0}, 7 {0.7, freq 1}, 9 {n 2, 0.9, freq 0.5}
    // reliability = (0.8^2 + 0.3^2 + 0.5^2 + 0.3^2 + 2 * 0.4^2) / 6 = (0.64 + 0.09 + 0.25 + 0.09 + 0.32) / 6 = 1.39 / 6
    expect(s.reliability).toBeCloseTo(1.39 / 6, 12); // ≈ 0.231667
    // resolution = (4 * 0.5^2 + 2 * 0^2) / 6 = 1 / 6
    expect(s.resolution).toBeCloseTo(1 / 6, 12);
    expect(s.bins.map((b) => [b.index, b.n])).toEqual([
      [2, 1],
      [3, 1],
      [5, 1],
      [7, 1],
      [9, 2],
    ]);
    expect(s.bins).toEqual(calibrationBins(items));
  });

  it('satisfies the Murphy decomposition when each bin has a single p', () => {
    // 1.39/6 - 1/6 + 0.25 = 0.065 + 0.25 = 0.315
    expect(Math.abs(s.brier - (s.reliability - s.resolution + s.uncertainty))).toBeLessThan(1e-12);

    // A larger deterministic dataset: one p per bin (0.05, 0.15, ..., 0.95), varied outcomes.
    const big: BinaryItem[] = [];
    for (let k = 0; k < 10; k++) {
      const p = (10 * k + 5) / 100;
      for (let j = 0; j < k + 3; j++) {
        big.push({ p, outcome: (j * 37 + k * 11) % 10 < k ? 1 : 0 });
      }
    }
    const b = summarizeBinary(big)!;
    expect(b.bins).toHaveLength(10);
    expect(Math.abs(b.brier - (b.reliability - b.resolution + b.uncertainty))).toBeLessThan(1e-12);
  });

  it('returns null skill when every outcome is the same', () => {
    const allYes = summarizeBinary([
      { p: 0.8, outcome: 1 },
      { p: 0.6, outcome: 1 },
    ])!;
    expect(allYes.uncertainty).toBe(0);
    expect(allYes.skill).toBeNull();
    const allNo = summarizeBinary([{ p: 0.2, outcome: 0 }])!;
    expect(allNo.skill).toBeNull();
  });

  it('counts p = 0.5 as half right either way', () => {
    const r = summarizeBinary([
      { p: 0.5, outcome: 1 },
      { p: 0.5, outcome: 0 },
    ])!;
    expect(r.hitRate).toBe(0.5);
    expect(r.averageConfidence).toBe(0.5);
    expect(r.overconfidence).toBe(0);
  });

  it('uses clamped probabilities', () => {
    // p = 1 clamps to 0.99: brier (0.99-1)^2 = 0.0001, confidence 0.99, meanP 0.99
    const r = summarizeBinary([{ p: 1, outcome: 1 }])!;
    expect(r.brier).toBeCloseTo(0.0001, 12);
    expect(r.logScore).toBeCloseTo(Math.log(0.99), 12);
    expect(r.averageConfidence).toBeCloseTo(0.99, 12);
    expect(r.hitRate).toBe(1);
    expect(r.bins[0].meanP).toBeCloseTo(0.99, 12);
    expect(r.reliability).toBeCloseTo(0.0001, 12); // 1 * (0.99 - 1)^2 / 1
  });

  it('returns null for empty input', () => {
    expect(summarizeBinary([])).toBeNull();
  });
});

describe('confidenceVerdict', () => {
  const fake = (n: number, overconfidence: number): BinarySummary => ({
    n,
    brier: 0,
    logScore: 0,
    baseRate: 0.5,
    uncertainty: 0.25,
    skill: 1,
    averageConfidence: 0.7,
    hitRate: 0.7 - overconfidence,
    overconfidence,
    reliability: 0,
    resolution: 0,
    bins: [],
  });

  it('is insufficient for null or n < 5', () => {
    expect(confidenceVerdict(null)).toEqual({ kind: 'insufficient' });
    expect(confidenceVerdict(fake(4, 0.3))).toEqual({ kind: 'insufficient' });
  });

  it('is calibrated within 3 points', () => {
    const v = confidenceVerdict(fake(5, 0.02));
    expect(v.kind).toBe('calibrated');
    expect(v.kind !== 'insufficient' && v.points).toBeCloseTo(2, 10); // |0.02| * 100
    const neg = confidenceVerdict(fake(10, -0.029));
    expect(neg.kind).toBe('calibrated');
    expect(neg.kind !== 'insufficient' && neg.points).toBeCloseTo(2.9, 10);
  });

  it('is overconfident at or beyond +3 points', () => {
    expect(confidenceVerdict(fake(5, 0.03))).toEqual({ kind: 'overconfident', points: 3 });
    const v = confidenceVerdict(fake(20, 0.125));
    expect(v.kind).toBe('overconfident');
    expect(v.kind !== 'insufficient' && v.points).toBeCloseTo(12.5, 10);
  });

  it('is underconfident at or beyond -3 points', () => {
    expect(confidenceVerdict(fake(5, -0.03))).toEqual({ kind: 'underconfident', points: 3 });
    const v = confidenceVerdict(fake(5, -0.1));
    expect(v.kind).toBe('underconfident');
    expect(v.kind !== 'insufficient' && v.points).toBeCloseTo(10, 10);
  });

  it('works on a real summary', () => {
    // 6-item dataset above: overconfidence = 0.75 - 3.5/6 = 1/6 → 16.6667 points
    const v = confidenceVerdict(
      summarizeBinary([
        { p: 0.9, outcome: 1 },
        { p: 0.9, outcome: 0 },
        { p: 0.7, outcome: 1 },
        { p: 0.3, outcome: 0 },
        { p: 0.2, outcome: 1 },
        { p: 0.5, outcome: 0 },
      ]),
    );
    expect(v.kind).toBe('overconfident');
    expect(v.kind !== 'insufficient' && v.points).toBeCloseTo(100 / 6, 10);
  });
});
