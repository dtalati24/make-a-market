import type { Market } from '@/db/types';

import { formatChange, formatRating, marketPoints, ratingColor, ratingFor, scoredMarkets, textColorOn } from '../rating-view';

function market(overrides: Partial<Market>): Market {
  return {
    id: 1,
    kind: 'binary',
    isDecision: false,
    question: 'Will it rain?',
    unit: '',
    initialPrice: 0.7,
    price: 0.7,
    initialBid: null,
    initialAsk: null,
    bid: null,
    ask: null,
    reasoning: '',
    successCriteria: '',
    options: [],
    chosenOption: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    resolveBy: '2026-09-20',
    status: 'open',
    outcome: null,
    settledValue: null,
    settledAt: null,
    postmortem: '',
    decisionQuality: null,
    notificationId: null,
    tags: [],
    quoteCount: 1,
    ...overrides,
  };
}

const day = (d: number) => `2026-09-${String(d).padStart(2, '0')}T12:00:00.000Z`;
const numberMarket = (overrides: Partial<Market>) =>
  market({ kind: 'number', initialPrice: null, price: null, initialBid: 18, initialAsk: 24, bid: 18, ask: 24, ...overrides });

describe('marketPoints', () => {
  it('scores settled markets from the starting quote', () => {
    // 70% → YES: Brier 0.09, so 100 − 18 = 82. The re-quote to 90 doesn't count.
    expect(marketPoints(market({ status: 'settled', outcome: 1, price: 0.9 }))).toBeCloseTo(82, 10);
    // 18 @ 24, answer 20: width is 30% of the answer, so 50.
    expect(marketPoints(numberMarket({ status: 'settled', settledValue: 20, bid: 19, ask: 21 }))).toBeCloseTo(50, 10);
    expect(marketPoints(numberMarket({ status: 'settled', settledValue: 30 }))).toBe(0);
  });

  it('skips open and void markets', () => {
    expect(marketPoints(market({}))).toBeNull();
    expect(marketPoints(market({ status: 'void', settledAt: day(2) }))).toBeNull();
  });
});

describe('scoredMarkets / ratingFor', () => {
  const markets = [
    numberMarket({ id: 3, status: 'settled', settledValue: 20, settledAt: day(3) }),
    market({ id: 1, status: 'settled', outcome: 1, settledAt: day(1) }),
    market({ id: 2, status: 'void', settledAt: day(2) }),
    market({ id: 4 }),
  ];

  it('lists settled markets in settlement order with their kind and score', () => {
    expect(scoredMarkets(markets)).toEqual([
      { id: 1, kind: 'binary', score: expect.closeTo(82, 10) },
      { id: 3, kind: 'number', score: expect.closeTo(50, 10) },
    ]);
  });

  it('computes the rating from them', () => {
    const rating = ratingFor(markets);
    expect(rating.binary.n).toBe(1);
    expect(rating.number.n).toBe(1);
    expect(rating.history.map((step) => step.id)).toEqual([1, 3]);
    expect(ratingFor([]).overall).toBeNull();
  });
});

describe('ratingColor', () => {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

  it('runs red → orange → green', () => {
    const [r0, g0, b0] = rgb(ratingColor(0));
    expect(r0).toBeGreaterThan(g0);
    expect(g0).toBe(b0); // pure red hue
    const [r50, g50, b50] = rgb(ratingColor(50));
    expect(r50).toBeGreaterThan(g50);
    expect(g50).toBeGreaterThan(b50); // orange
    const [r75, g75, b75] = rgb(ratingColor(75));
    expect(g75).toBeGreaterThan(r75);
    expect(r75).toBeGreaterThan(b75); // yellow-green
    const [r100, g100, b100] = rgb(ratingColor(100));
    expect(g100).toBeGreaterThan(r100);
    expect(g100).toBeGreaterThan(b100); // green
  });

  it('clamps outside 0–100 and returns #RRGGBB', () => {
    expect(ratingColor(-20)).toBe(ratingColor(0));
    expect(ratingColor(140)).toBe(ratingColor(100));
    expect(ratingColor(63)).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('picks readable text', () => {
    expect(textColorOn(ratingColor(0))).toBe('#FFFFFF');
    expect(textColorOn(ratingColor(75))).toBe('#000000');
    expect(textColorOn(ratingColor(100))).toBe('#000000');
    expect(textColorOn('#000000')).toBe('#FFFFFF');
    expect(textColorOn('#FFFFFF')).toBe('#000000');
  });
});

describe('formatting', () => {
  it('shows ratings as whole numbers and changes to one decimal', () => {
    expect(formatRating(52.68)).toBe('53');
    expect(formatChange(1.23)).toBe('+1.2');
    expect(formatChange(-0.76)).toBe('−0.8');
    expect(formatChange(0.04)).toBe('0.0');
    expect(formatChange(-0.04)).toBe('0.0');
  });
});
