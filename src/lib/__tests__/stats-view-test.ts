import type { Market } from '@/db/types';
import { calibrationBins } from '@/scoring';

import {
  binaryItems,
  binaryTrend,
  byTag,
  calibrationLabel,
  confidenceText,
  decisionCount,
  decisionGrid,
  dotRadius,
  filterByTag,
  formatSkill,
  noiseWarning,
  numberItems,
  numberTrend,
  requoteEffect,
  requoteLine,
  settledInOrder,
  settledTags,
  trendDomain,
} from '../stats-view';

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

const numberMarket = (overrides: Partial<Market> = {}) =>
  market({
    kind: 'number',
    initialPrice: null,
    price: null,
    initialBid: 18,
    initialAsk: 24,
    bid: 18,
    ask: 24,
    unit: 'hours',
    ...overrides,
  });

/** Settlement timestamp on day `d` of September 2026. */
const day = (d: number) => `2026-09-${String(d).padStart(2, '0')}T12:00:00.000Z`;

/** A settled Yes/No market that was never re-quoted (unless `extra` says otherwise). */
const settledYesNo = (id: number, initialPrice: number, outcome: 0 | 1, d: number, extra: Partial<Market> = {}) =>
  market({ id, status: 'settled', initialPrice, price: initialPrice, outcome, settledAt: day(d), ...extra });

const settledNumber = (id: number, value: number, d: number, extra: Partial<Market> = {}) =>
  numberMarket({ id, status: 'settled', settledValue: value, settledAt: day(d), ...extra });

// 18 @ 24 with the value 20 (inside): width 6 is 30% of the answer, which scores 50.
const INSIDE_SCORE = 100 / (1 + ((10 / 3) * (6 / 20)) ** 2);
// Any value outside the quote scores 0.
const OUTSIDE_SCORE = 0;

describe('settledInOrder', () => {
  it('keeps settled markets only, oldest settlement first, ties by id', () => {
    const markets = [
      market({ id: 5, status: 'settled', outcome: 1, settledAt: day(3) }),
      market({ id: 3, status: 'settled', outcome: 0, settledAt: day(3) }),
      market({ id: 1, status: 'settled', outcome: 1, settledAt: day(1) }),
      market({ id: 2 }), // open
      market({ id: 4, status: 'void', settledAt: day(2) }),
    ];
    expect(settledInOrder(markets).map((m) => m.id)).toEqual([1, 3, 5]);
  });
});

describe('binaryItems', () => {
  const markets = [
    settledYesNo(1, 0.7, 1, 3, { price: 0.9, quoteCount: 2 }),
    settledYesNo(2, 0.2, 0, 1),
    market({ id: 3 }), // open
    market({ id: 4, status: 'void', settledAt: day(2) }),
    settledNumber(5, 20, 2), // wrong kind
  ];

  it('uses starting prices, in settlement order, skipping open/void/number markets', () => {
    expect(binaryItems(markets, 'initial')).toEqual([
      { p: 0.2, outcome: 0 },
      { p: 0.7, outcome: 1 },
    ]);
  });

  it('can use the final (re-quoted) price instead', () => {
    expect(binaryItems(markets, 'final')).toEqual([
      { p: 0.2, outcome: 0 },
      { p: 0.9, outcome: 1 },
    ]);
  });
});

describe('numberItems', () => {
  const markets = [
    settledNumber(1, 30, 2, { bid: 20, ask: 32, quoteCount: 2 }),
    settledNumber(2, 20, 1),
    numberMarket({ id: 3 }), // open
    numberMarket({ id: 4, status: 'void', settledAt: day(3) }),
    settledYesNo(5, 0.7, 1, 1), // wrong kind
  ];

  it('uses starting quotes and the settled value, in settlement order', () => {
    expect(numberItems(markets, 'initial')).toEqual([
      { bid: 18, ask: 24, value: 20 },
      { bid: 18, ask: 24, value: 30 },
    ]);
  });

  it('can use the final quote instead', () => {
    expect(numberItems(markets, 'final')).toEqual([
      { bid: 18, ask: 24, value: 20 },
      { bid: 20, ask: 32, value: 30 },
    ]);
  });
});

describe('binaryTrend', () => {
  // Settlement order: 70% → YES (0.3² = 0.09), 20% → NO (0.2² = 0.04), 60% → NO (0.6² = 0.36).
  const markets = [
    settledYesNo(3, 0.6, 0, 3),
    settledYesNo(1, 0.7, 1, 1, { price: 0.99, quoteCount: 2 }), // re-quote ignored
    settledYesNo(2, 0.2, 0, 2),
    market({ id: 4, status: 'void', settledAt: day(2) }),
  ];

  it('is the rolling Brier of starting quotes in settlement order', () => {
    const trend = binaryTrend(markets, 2);
    expect(trend.map((point) => point.index)).toEqual([1, 2]);
    expect(trend[0].value).toBeCloseTo(0.065, 12); // (0.09 + 0.04) / 2
    expect(trend[1].value).toBeCloseTo(0.2, 12); // (0.04 + 0.36) / 2
  });

  it('defaults to a window of 10', () => {
    expect(binaryTrend(markets)).toEqual([]);
    // Ten 50% calls score 0.25 each → one point, at the 10th market.
    const ten = Array.from({ length: 10 }, (_, i) => settledYesNo(i + 1, 0.5, (i % 2) as 0 | 1, i + 1));
    const trend = binaryTrend(ten);
    expect(trend).toHaveLength(1);
    expect(trend[0].index).toBe(9);
    expect(trend[0].value).toBeCloseTo(0.25, 12);
  });
});

describe('numberTrend', () => {
  it('is the rolling average score in settlement order', () => {
    const markets = [settledNumber(2, 30, 2), settledNumber(1, 20, 1), numberMarket({ id: 3 })];
    const trend = numberTrend(markets, 2);
    expect(trend).toHaveLength(1);
    // (50 + 0) / 2 = 25
    expect(trend[0].value).toBeCloseTo((INSIDE_SCORE + OUTSIDE_SCORE) / 2, 10);
    expect(trend[0].value).toBeCloseTo(25, 10);
    expect(numberTrend(markets)).toEqual([]);
  });
});

describe('byTag', () => {
  const markets = [
    settledYesNo(1, 0.7, 1, 1, { tags: ['Work'] }), // 0.09
    settledYesNo(2, 0.2, 0, 2, { tags: ['work', 'home'] }), // 0.04
    settledYesNo(3, 0.6, 0, 3, { tags: ['home', 'Home'] }), // 0.36, duplicate tag counted once
    settledYesNo(4, 0.5, 1, 4, { tags: ['gym'] }), // 0.25
    settledYesNo(8, 0.9, 1, 5), // untagged: no row
    market({ id: 5, tags: ['work'] }), // open
    market({ id: 6, status: 'void', settledAt: day(5), tags: ['gym'] }),
    settledNumber(7, 20, 6, { tags: ['work'] }),
  ];

  it('averages Brier per tag, case-insensitively, most-used first', () => {
    expect(byTag(markets, 'binary')).toEqual([
      { tag: 'home', n: 2, score: expect.closeTo(0.2, 12) }, // (0.04 + 0.36) / 2
      { tag: 'Work', n: 2, score: expect.closeTo(0.065, 12) }, // (0.09 + 0.04) / 2; first-seen spelling
      { tag: 'gym', n: 1, score: expect.closeTo(0.25, 12) }, // the void gym market is skipped
    ]);
  });

  it('averages scores per tag for Number markets', () => {
    expect(byTag(markets, 'number')).toEqual([{ tag: 'work', n: 1, score: expect.closeTo(INSIDE_SCORE, 10) }]);
  });

  it('is empty when nothing settled is tagged', () => {
    expect(byTag([settledYesNo(1, 0.7, 1, 1)], 'binary')).toEqual([]);
  });
});

describe('requoteEffect', () => {
  const markets = [
    settledYesNo(1, 0.7, 1, 1, { price: 0.9, quoteCount: 2 }), // start 0.09, final (0.9 − 1)² = 0.01
    settledYesNo(2, 0.2, 0, 2, { price: 0.4, quoteCount: 3 }), // start 0.04, final 0.4² = 0.16
    settledYesNo(3, 0.5, 1, 3), // never re-quoted: ignored
    market({ id: 4, price: 0.9, quoteCount: 2 }), // open: ignored
    market({ id: 5, status: 'void', settledAt: day(4), quoteCount: 2 }), // void: ignored
  ];

  it('compares starting and final quotes over re-quoted settled markets only', () => {
    expect(requoteEffect(markets, 'binary')).toEqual({
      n: 2,
      initial: expect.closeTo(0.065, 12), // (0.09 + 0.04) / 2
      final: expect.closeTo(0.085, 12), // (0.01 + 0.16) / 2
    });
  });

  it('is null when nothing of that kind was re-quoted', () => {
    expect(requoteEffect(markets, 'number')).toBeNull();
    expect(requoteEffect([settledYesNo(3, 0.5, 1, 3)], 'binary')).toBeNull();
  });

  it('scores Number markets by their 0–100 score', () => {
    // Start 18 @ 24, value 20 → 50. Final 19 @ 22, value 20: width 3 is 15% of 20 → 100 / (1 + 0.5²) = 80.
    const effect = requoteEffect([settledNumber(6, 20, 5, { bid: 19, ask: 22, quoteCount: 2 })], 'number');
    expect(effect).toEqual({
      n: 1,
      initial: expect.closeTo(INSIDE_SCORE, 10),
      final: expect.closeTo(80, 10),
    });
  });
});

describe('decisionGrid', () => {
  const decision = (id: number, quality: number | null, outcome: 0 | 1, extra: Partial<Market> = {}) =>
    settledYesNo(id, 0.7, outcome, id, { isDecision: true, decisionQuality: quality, ...extra });

  it('places settled decisions by call quality and outcome', () => {
    const markets = [
      decision(1, 5, 1), // good call, worked out → earned
      decision(2, 4, 0), // good call, didn't → bad luck
      decision(3, 2, 1), // bad call, worked out → dumb luck
      decision(4, 1, 0), // bad call, didn't → deserved
      decision(5, 3, 1), // rated 3 → unrated
      decision(6, null, 0), // not rated → unrated
      market({ id: 7, isDecision: true, decisionQuality: 5 }), // open: skipped
      market({ id: 8, isDecision: true, status: 'void', settledAt: day(8) }), // void: skipped
      settledYesNo(9, 0.7, 1, 9), // not a decision: skipped
    ];
    const grid = decisionGrid(markets);
    expect(grid).toEqual({ earned: 1, badLuck: 1, dumbLuck: 1, deserved: 1, unrated: 2 });
    expect(decisionCount(grid)).toBe(6);
  });

  it('is all zeros with no decisions', () => {
    const grid = decisionGrid([settledYesNo(1, 0.7, 1, 1)]);
    expect(decisionCount(grid)).toBe(0);
  });
});

describe('tag filtering', () => {
  it('filters by tag case-insensitively, or not at all', () => {
    const markets = [market({ id: 1, tags: ['Work'] }), market({ id: 2, tags: ['work', 'home'] }), market({ id: 3 })];
    expect(filterByTag(markets, null).map((m) => m.id)).toEqual([1, 2, 3]);
    expect(filterByTag(markets, 'WORK').map((m) => m.id)).toEqual([1, 2]);
    expect(filterByTag(markets, 'gym')).toEqual([]);
  });

  it('lists tags of settled markets of one kind', () => {
    const markets = [
      settledYesNo(1, 0.7, 1, 1, { tags: ['work', 'Career'] }),
      settledYesNo(2, 0.7, 1, 2, { tags: ['Work'] }),
      market({ id: 3, tags: ['open-only'] }),
      market({ id: 4, status: 'void', settledAt: day(3), tags: ['voided'] }),
      settledNumber(5, 20, 4, { tags: ['hours'] }),
    ];
    expect(settledTags(markets, 'binary')).toEqual(['Career', 'work']);
    expect(settledTags(markets, 'number')).toEqual(['hours']);
  });
});

describe('display text', () => {
  it('formats skill as a signed percentage', () => {
    expect(formatSkill(0.123)).toBe('+12%');
    expect(formatSkill(-0.054)).toBe('−5%');
    expect(formatSkill(0.004)).toBe('0%');
    expect(formatSkill(-0.004)).toBe('0%');
    expect(formatSkill(1)).toBe('+100%');
    expect(formatSkill(null)).toBe('—');
  });

  it('describes confidence verdicts', () => {
    expect(confidenceText({ kind: 'overconfident', points: 7.6 })).toBe('Overconfident by 8 points');
    expect(confidenceText({ kind: 'underconfident', points: 5.2 })).toBe('Underconfident by 5 points');
    expect(confidenceText({ kind: 'calibrated', points: 1.4 })).toBe('Well calibrated (within 3 points)');
    expect(confidenceText({ kind: 'insufficient' })).toBe('Settle at least 5 markets for a verdict');
  });

  it('warns about small samples below 20', () => {
    expect(noiseWarning(0)).toBeNull();
    expect(noiseWarning(1)).toBe('Based on 1 settled market — numbers are noisy until about 20.');
    expect(noiseWarning(19)).toBe('Based on 19 settled markets — numbers are noisy until about 20.');
    expect(noiseWarning(20)).toBeNull();
  });

  it('says whether re-quoting helped', () => {
    expect(requoteLine({ n: 2, initial: 0.18, final: 0.15 }, 3)).toBe(
      'Starting quotes: 0.180 · Final quotes: 0.150 — re-quoting helped',
    );
    expect(requoteLine({ n: 2, initial: 0.15, final: 0.18 }, 3)).toBe(
      'Starting quotes: 0.150 · Final quotes: 0.180 — re-quoting hurt',
    );
    // 27.44 and 27.4449 both show as 27.4.
    expect(requoteLine({ n: 1, initial: 27.44, final: 27.4449 }, 1)).toBe(
      'Starting quotes: 27.4 · Final quotes: 27.4 — re-quoting made no difference',
    );
    // Number scores: higher is better.
    expect(requoteLine({ n: 1, initial: 50, final: 80 }, 0, true)).toBe(
      'Starting quotes: 50 · Final quotes: 80 — re-quoting helped',
    );
    expect(requoteLine({ n: 1, initial: 80, final: 50 }, 0, true)).toBe(
      'Starting quotes: 80 · Final quotes: 50 — re-quoting hurt',
    );
  });
});

describe('chart helpers', () => {
  it('scales calibration dots by √n within 4–12 px', () => {
    expect(dotRadius(1)).toBe(4); // 3·√1 = 3, raised to the 4 px minimum
    expect(dotRadius(4)).toBe(6); // 3·√4
    expect(dotRadius(9)).toBe(9); // 3·√9
    expect(dotRadius(100)).toBe(12); // 3·√100 = 30, capped
  });

  it('pads the trend range and includes the reference line', () => {
    // 0.1–0.3, pad 10% of 0.2 = 0.02.
    expect(trendDomain([0.1, 0.3], 0.25)).toEqual({ min: expect.closeTo(0.08, 12), max: expect.closeTo(0.32, 12) });
    // Reference 0.25 stretches 0.1–0.2 to 0.1–0.25; pad 0.015.
    expect(trendDomain([0.1, 0.2], 0.25)).toEqual({ min: expect.closeTo(0.085, 12), max: expect.closeTo(0.265, 12) });
    // 0.01 − 0.049 would go negative; floored at 0.
    expect(trendDomain([0.01, 0.5])).toEqual({ min: 0, max: expect.closeTo(0.549, 12) });
    // Flat series: pad 10% of the value, or 1 around zero.
    expect(trendDomain([5])).toEqual({ min: 4.5, max: 5.5 });
    expect(trendDomain([0])).toEqual({ min: 0, max: 1 });
    expect(trendDomain([])).toEqual({ min: 0, max: 1 });
  });

  it('summarizes the calibration chart for screen readers', () => {
    const bins = calibrationBins([
      { p: 0.72, outcome: 1 },
      { p: 0.75, outcome: 0 },
      { p: 0.78, outcome: 1 },
      { p: 0.1, outcome: 0 },
    ]);
    expect(calibrationLabel(bins)).toBe(
      'Calibration chart. priced 10 to 20%: 0 of 1 happened; priced 70 to 80%: 2 of 3 happened.',
    );
    expect(calibrationLabel([])).toBe('Calibration chart: no settled markets yet.');
  });
});
