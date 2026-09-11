import { BACKUP_APP, BACKUP_FORMAT_VERSION, parseBackup, serializeBackup } from '../backup-format';
import { toDateString } from '../dates';
import { DEMO_MARKET_COUNT, DEMO_TAG, generateDemoMarkets, mulberry32, toQuoteInput } from '../demo-data';

const NOW = new Date(2026, 8, 11, 12, 0);

describe('mulberry32', () => {
  it('is deterministic and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('generateDemoMarkets', () => {
  const markets = generateDemoMarkets(NOW);

  it('is the same for the same moment', () => {
    expect(generateDemoMarkets(new Date(NOW))).toEqual(markets);
  });

  it('keeps the same outcomes and values on a different day', () => {
    const later = generateDemoMarkets(new Date(2027, 0, 3, 18, 30));
    const results = (list: typeof markets) =>
      list.map((m) => `${m.question}|${m.status}|${m.outcome}|${m.settledValue}`).sort();
    expect(results(later)).toEqual(results(markets));
  });

  it('has the advertised mix of markets, all tagged demo', () => {
    expect(markets).toHaveLength(DEMO_MARKET_COUNT);
    expect(DEMO_MARKET_COUNT).toBeGreaterThanOrEqual(50);
    expect(markets.every((m) => m.tags[0] === DEMO_TAG && m.tags.length === 2)).toBe(true);
    expect(markets.filter((m) => m.status === 'open')).toHaveLength(3);
    expect(markets.filter((m) => m.status === 'void')).toHaveLength(1);
    expect(markets.filter((m) => m.isDecision)).toHaveLength(5);
    expect(markets.some((m) => m.kind === 'number' && m.status === 'settled')).toBe(true);
    expect(markets.some((m) => m.quotes.length > 1 && m.status === 'settled')).toBe(true);
  });

  it('lists markets oldest first, with every timestamp in the past and in order', () => {
    const now = NOW.getTime();
    for (let i = 1; i < markets.length; i++) {
      expect(markets[i - 1].createdAt <= markets[i].createdAt).toBe(true);
    }
    for (const m of markets) {
      const created = Date.parse(m.createdAt);
      expect(created).toBeLessThan(now);
      let previous = created;
      for (const q of m.quotes) {
        expect(Date.parse(q.createdAt)).toBeGreaterThanOrEqual(previous);
        previous = Date.parse(q.createdAt);
      }
      if (m.settledAt !== null) {
        expect(Date.parse(m.settledAt)).toBeGreaterThanOrEqual(previous);
        expect(Date.parse(m.settledAt)).toBeLessThan(now);
      }
    }
  });

  it('puts settled markets past their settle-by date, and one open market under Due', () => {
    const today = toDateString(NOW);
    for (const m of markets.filter((m) => m.status !== 'open')) {
      expect(m.resolveBy < today).toBe(true);
    }
    const open = markets.filter((m) => m.status === 'open');
    expect(open.filter((m) => m.resolveBy < today)).toHaveLength(1);
    expect(open.filter((m) => m.resolveBy > today)).toHaveLength(2);
  });

  it('lands exactly 8 of the 20 settled Number answers inside the starting quote', () => {
    const settled = markets.filter((m) => m.kind === 'number' && m.status === 'settled');
    expect(settled).toHaveLength(20);
    const inside = settled.filter((m) => {
      const { bid, ask } = m.quotes[0];
      const value = m.settledValue as number;
      return value >= (bid as number) && value <= (ask as number);
    });
    expect(inside).toHaveLength(8);
  });

  it('passes the same validation as an imported backup', () => {
    const backup = {
      app: BACKUP_APP,
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: NOW.toISOString(),
      settings: { remindersEnabled: true, reminderTime: '09:00' },
      markets,
    } as const;
    expect(parseBackup(serializeBackup(backup)).markets).toEqual(markets);
  });
});

describe('toQuoteInput', () => {
  it('turns stored quotes into quote inputs', () => {
    const at = '2026-09-01T10:00:00.000Z';
    expect(toQuoteInput('binary', { price: 0.4, bid: null, ask: null, note: '', createdAt: at })).toEqual({
      kind: 'binary',
      price: 0.4,
    });
    expect(toQuoteInput('number', { price: null, bid: 3, ask: 5, note: '', createdAt: at })).toEqual({
      kind: 'number',
      bid: 3,
      ask: 5,
    });
    expect(() => toQuoteInput('number', { price: 0.4, bid: null, ask: null, note: '', createdAt: at })).toThrow();
  });
});
