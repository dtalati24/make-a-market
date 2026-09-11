import { mean, rollingMean, wilsonInterval } from '../common';

describe('mean', () => {
  it('averages values', () => {
    expect(mean([1, 2, 3, 4])).toBeCloseTo(2.5, 12); // 10 / 4
    expect(mean([-1, 1])).toBe(0);
    expect(mean([7])).toBe(7);
  });

  it('throws on an empty array', () => {
    expect(() => mean([])).toThrow(RangeError);
  });
});

describe('wilsonInterval', () => {
  it('matches the hand-computed interval for 5 of 10', () => {
    // phat = 0.5, z^2 = 3.8416, denom = 1 + 3.8416/10 = 1.38416
    // center = (0.5 + 3.8416/20) / 1.38416 = 0.69208 / 1.38416 = 0.5
    // half = 1.96 * sqrt(0.25/10 + 3.8416/400) / 1.38416 = 1.96 * sqrt(0.034604) / 1.38416 ≈ 0.263411
    const { low, high } = wilsonInterval(5, 10);
    const half = (1.96 * Math.sqrt(0.034604)) / 1.38416;
    expect(low).toBeCloseTo(0.5 - half, 10);
    expect(high).toBeCloseTo(0.5 + half, 10);
    expect(low).toBeCloseTo(0.2366, 4);
    expect(high).toBeCloseTo(0.7634, 4);
  });

  it('matches the hand-computed interval for 3 of 5', () => {
    // phat = 0.6, denom = 1 + 3.8416/5 = 1.76832
    // center = (0.6 + 0.38416) / 1.76832 ≈ 0.556545
    // half = 1.96 * sqrt(0.24/5 + 3.8416/100) / 1.76832 = 1.96 * sqrt(0.086416) / 1.76832 ≈ 0.325831
    const { low, high } = wilsonInterval(3, 5);
    const center = 0.98416 / 1.76832;
    const half = (1.96 * Math.sqrt(0.086416)) / 1.76832;
    expect(low).toBeCloseTo(center - half, 10); // ≈ 0.230714
    expect(high).toBeCloseTo(center + half, 10); // ≈ 0.882376
  });

  it('returns the vacuous interval for n = 0', () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 });
  });

  it('handles 0 successes', () => {
    // phat = 0: center = half = (3.8416/20) / 1.38416, so low = 0 and high = z^2 / (n + z^2)
    const { low, high } = wilsonInterval(0, 10);
    expect(low).toBeGreaterThanOrEqual(0);
    expect(low).toBeCloseTo(0, 12);
    expect(high).toBeCloseTo(3.8416 / 13.8416, 10); // ≈ 0.277541
  });

  it('handles all successes', () => {
    // mirror image of the 0-success case: low = n / (n + z^2), high = 1
    const { low, high } = wilsonInterval(10, 10);
    expect(low).toBeCloseTo(10 / 13.8416, 10); // ≈ 0.722459
    expect(high).toBeLessThanOrEqual(1);
    expect(high).toBeCloseTo(1, 12);
  });

  it('accepts fractional successes', () => {
    // 2.5 / 5 = 0.5, same shape as 5/10 but with n = 5: denom 1.76832, center 0.5
    // half = 1.96 * sqrt(0.25/5 + 3.8416/100) / 1.76832 = 1.96 * sqrt(0.088416) / 1.76832
    const { low, high } = wilsonInterval(2.5, 5);
    const half = (1.96 * Math.sqrt(0.088416)) / 1.76832;
    expect(low).toBeCloseTo(0.5 - half, 10);
    expect(high).toBeCloseTo(0.5 + half, 10);
  });

  it('respects a custom z', () => {
    // z = 0 collapses to the point estimate
    expect(wilsonInterval(3, 10, 0)).toEqual({ low: 0.3, high: 0.3 });
  });

  it('throws on invalid arguments', () => {
    expect(() => wilsonInterval(1, -1)).toThrow(RangeError);
    expect(() => wilsonInterval(-1, 10)).toThrow(RangeError);
    expect(() => wilsonInterval(11, 10)).toThrow(RangeError);
    expect(() => wilsonInterval(NaN, 10)).toThrow(RangeError);
    expect(() => wilsonInterval(1, NaN)).toThrow(RangeError);
  });
});

describe('rollingMean', () => {
  it('computes trailing means over full windows only', () => {
    // windows: [1,2,3] → 2 at i=2; [2,3,4] → 3 at i=3; [3,4,5] → 4 at i=4
    const points = rollingMean([1, 2, 3, 4, 5], 3);
    expect(points.map((pt) => pt.index)).toEqual([2, 3, 4]);
    expect(points[0].value).toBeCloseTo(2, 12);
    expect(points[1].value).toBeCloseTo(3, 12);
    expect(points[2].value).toBeCloseTo(4, 12);
  });

  it('uses the exact window contents (no drift)', () => {
    // [0.1, 0.2] → 0.15; [0.2, 0.7] → 0.45; [0.7, 0.4] → 0.55
    const points = rollingMean([0.1, 0.2, 0.7, 0.4], 2);
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ index: 1, value: expect.closeTo(0.15, 12) });
    expect(points[1]).toEqual({ index: 2, value: expect.closeTo(0.45, 12) });
    expect(points[2]).toEqual({ index: 3, value: expect.closeTo(0.55, 12) });
  });

  it('returns [] when there are fewer values than the window', () => {
    expect(rollingMean([1, 2], 3)).toEqual([]);
    expect(rollingMean([], 1)).toEqual([]);
  });

  it('returns a single point when length === window', () => {
    expect(rollingMean([2, 4, 6], 3)).toEqual([{ index: 2, value: 4 }]);
  });

  it('window = 1 is the identity', () => {
    expect(rollingMean([5, 1, 3], 1)).toEqual([
      { index: 0, value: 5 },
      { index: 1, value: 1 },
      { index: 2, value: 3 },
    ]);
  });

  it('throws on a non-integer or < 1 window', () => {
    expect(() => rollingMean([1, 2, 3], 0)).toThrow(RangeError);
    expect(() => rollingMean([1, 2, 3], -2)).toThrow(RangeError);
    expect(() => rollingMean([1, 2, 3], 1.5)).toThrow(RangeError);
    expect(() => rollingMean([1, 2, 3], NaN)).toThrow(RangeError);
  });
});
