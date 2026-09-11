import type { Market } from '@/db/types';

import {
  allTags,
  currentQuote,
  groupOpenMarkets,
  initialQuote,
  marketScore,
  matchesFilter,
  outcomeLabel,
  scoreLabel,
  settledMarkets,
} from '../market-view';

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

describe('quotes', () => {
  it('formats Yes/No and Number quotes', () => {
    expect(currentQuote(market({ price: 0.29 }))).toBe('29%');
    expect(currentQuote(numberMarket({ bid: 1200, ask: 1500.5 }))).toBe('1,200 @ 1,500.5');
    expect(initialQuote(market({ initialPrice: 0.7, price: 0.9 }))).toBe('70%');
  });
});

describe('outcomeLabel', () => {
  it('describes results', () => {
    expect(outcomeLabel(market({}))).toBeNull();
    expect(outcomeLabel(market({ status: 'void' }))).toBe('Void');
    expect(outcomeLabel(market({ status: 'settled', outcome: 1 }))).toBe('YES');
    expect(outcomeLabel(market({ status: 'settled', outcome: 0 }))).toBe('NO');
    expect(outcomeLabel(market({ status: 'settled', outcome: 1, isDecision: true }))).toBe('Worked out');
    expect(outcomeLabel(numberMarket({ status: 'settled', settledValue: 30 }))).toBe('30 hours');
  });
});

describe('marketScore', () => {
  it('scores Yes/No markets from the starting price', () => {
    // Re-quoted to 90 later, but the starting 70 is what counts: (0.7 - 1)^2 = 0.09.
    const score = marketScore(market({ status: 'settled', outcome: 1, initialPrice: 0.7, price: 0.9 }));
    expect(score).toEqual({ kind: 'binary', brier: expect.closeTo(0.09, 12), good: true });
    expect(scoreLabel(score!)).toBe('Brier 0.090');
    // (0.7 - 0)^2 = 0.49 is worse than a 50/50 guess.
    expect(marketScore(market({ status: 'settled', outcome: 0 }))?.good).toBe(false);
  });

  it('scores Number markets from the starting quote', () => {
    const inside = marketScore(numberMarket({ status: 'settled', settledValue: 20 }));
    expect(inside?.kind).toBe('number');
    expect(inside?.good).toBe(true);
    // spread = 100 ln(25/19) ≈ 27.44
    expect(scoreLabel(inside!)).toBe('Cost 27');

    // Above the ask: cost = 27.44 + 4 × 100 ln(31/25) ≈ 113.49
    const above = marketScore(numberMarket({ status: 'settled', settledValue: 30 }));
    expect(above?.good).toBe(false);
    expect(scoreLabel(above!)).toBe('Cost 113');
  });

  it('does not score open or void markets', () => {
    expect(marketScore(market({}))).toBeNull();
    expect(marketScore(market({ status: 'void' }))).toBeNull();
  });
});

describe('matchesFilter', () => {
  const m = market({ question: 'Ship the app by Friday?', tags: ['Work'], reasoning: 'backlog is small' });
  const all = { type: 'all' as const, tag: null, search: '' };

  it('filters by type', () => {
    expect(matchesFilter(m, { ...all, type: 'binary' })).toBe(true);
    expect(matchesFilter(m, { ...all, type: 'number' })).toBe(false);
    expect(matchesFilter(m, { ...all, type: 'decision' })).toBe(false);
    expect(matchesFilter(market({ isDecision: true }), { ...all, type: 'decision' })).toBe(true);
  });

  it('filters by tag case-insensitively', () => {
    expect(matchesFilter(m, { ...all, tag: 'work' })).toBe(true);
    expect(matchesFilter(m, { ...all, tag: 'home' })).toBe(false);
  });

  it('searches question, reasoning and tags', () => {
    expect(matchesFilter(m, { ...all, search: ' FRIDAY ' })).toBe(true);
    expect(matchesFilter(m, { ...all, search: 'backlog' })).toBe(true);
    expect(matchesFilter(m, { ...all, search: 'wor' })).toBe(true);
    expect(matchesFilter(m, { ...all, search: 'gym' })).toBe(false);
  });
});

describe('grouping', () => {
  it('splits open markets into due and upcoming, soonest first', () => {
    const markets = [
      market({ id: 1, resolveBy: '2026-09-15' }),
      market({ id: 2, resolveBy: '2026-09-10' }),
      market({ id: 3, resolveBy: '2026-09-11' }),
      market({ id: 4, resolveBy: '2026-09-01', status: 'settled', outcome: 1 }),
    ];
    const { due, upcoming } = groupOpenMarkets(markets, '2026-09-11');
    expect(due.map((x) => x.id)).toEqual([2, 3]);
    expect(upcoming.map((x) => x.id)).toEqual([1]);
  });

  it('orders settled markets by settle time, newest first', () => {
    const markets = [
      market({ id: 1, status: 'settled', outcome: 1, settledAt: '2026-09-02T00:00:00.000Z' }),
      market({ id: 2, status: 'void', settledAt: '2026-09-05T00:00:00.000Z' }),
      market({ id: 3 }),
    ];
    expect(settledMarkets(markets).map((x) => x.id)).toEqual([2, 1]);
  });

  it('lists tags once, sorted', () => {
    expect(allTags([market({ tags: ['work', 'Career'] }), market({ tags: ['Work'] })])).toEqual(['Career', 'work']);
  });
});
