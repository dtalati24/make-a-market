import type { Market, Quote } from '@/db/types';
import { ValidationError } from '@/db/validation';

import {
  BACKUP_APP,
  BACKUP_FORMAT_VERSION,
  buildBackup,
  buildCsv,
  CSV_COLUMNS,
  escapeCsvField,
  guardFormula,
  parseBackup,
  serializeBackup,
  type Backup,
} from '../backup-format';

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

function quote(id: number, marketId: number, overrides: Partial<Quote>): Quote {
  return { id, marketId, price: null, bid: null, ask: null, note: '', createdAt: '2026-09-01T10:00:00.000Z', ...overrides };
}

const NOW = new Date('2026-09-11T08:00:00.000Z');
const SETTINGS = { enabled: true, time: '09:00' };

const yesNo = market({
  id: 2,
  question: 'Will I get the internship?',
  initialPrice: 0.6,
  price: 0.75,
  status: 'settled',
  outcome: 1,
  settledAt: '2026-09-10T12:00:00.000Z',
  postmortem: 'Prep paid off.',
  tags: ['career'],
  quoteCount: 2,
  notificationId: 'reminder-1',
});
const decision = market({
  id: 1,
  isDecision: true,
  question: 'Take the startup offer',
  options: ['Startup', 'Bank'],
  chosenOption: 'Startup',
  successCriteria: 'Still glad in three months',
  status: 'settled',
  outcome: 0,
  settledAt: '2026-09-09T12:00:00.000Z',
  decisionQuality: 4,
});
const number = market({
  id: 3,
  kind: 'number',
  question: 'Hours of deep work',
  unit: 'hours',
  initialPrice: null,
  price: null,
  initialBid: 18,
  initialAsk: 24,
  bid: 18,
  ask: 24,
  tags: ['career', 'focus'],
});

const quotes = new Map<number, Quote[]>([
  [
    2,
    [
      quote(11, 2, { price: 0.75, note: 'Final round went well', createdAt: '2026-09-05T10:00:00.000Z' }),
      quote(10, 2, { price: 0.6 }),
    ],
  ],
  [1, [quote(9, 1, { price: 0.7 })]],
  [3, [quote(12, 3, { bid: 18, ask: 24 })]],
]);

function sampleBackup(): Backup {
  return buildBackup([yesNo, number, decision], quotes, SETTINGS, NOW);
}

/** A valid backup as plain JSON, with one market's fields changed. */
function withMarket(changes: Record<string, unknown>, index = 0): string {
  const data = JSON.parse(serializeBackup(sampleBackup()));
  data.markets[index] = { ...data.markets[index], ...changes };
  return JSON.stringify(data);
}

function parseError(text: string): string {
  try {
    parseBackup(text);
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return (error as Error).message;
  }
  throw new Error('Expected parseBackup to throw');
}

describe('buildBackup', () => {
  it('orders markets and quotes oldest first, without ids or reminder ids', () => {
    const backup = sampleBackup();
    expect(backup.app).toBe(BACKUP_APP);
    expect(backup.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(backup.exportedAt).toBe(NOW.toISOString());
    expect(backup.settings).toEqual({ remindersEnabled: true, reminderTime: '09:00' });
    expect(backup.markets.map((m) => m.question)).toEqual([
      'Take the startup offer',
      'Will I get the internship?',
      'Hours of deep work',
    ]);
    expect(backup.markets[1].quotes.map((q) => q.price)).toEqual([0.6, 0.75]);
    const json = serializeBackup(backup);
    expect(json).not.toContain('reminder-1');
    expect(json).not.toContain('"id"');
  });

  it('rebuilds the quote history from the market if its quotes are missing', () => {
    const backup = buildBackup([yesNo], new Map(), SETTINGS, NOW);
    expect(backup.markets[0].quotes.map((q) => q.price)).toEqual([0.6, 0.75]);
  });
});

describe('parseBackup', () => {
  it('round-trips an exported backup', () => {
    const backup = sampleBackup();
    expect(parseBackup(serializeBackup(backup))).toEqual(backup);
  });

  it('accepts a leading byte-order mark and missing optional text', () => {
    const text = withMarket({ reasoning: undefined, postmortem: null, unit: undefined }, 0);
    const parsed = parseBackup(`﻿${text}`);
    expect(parsed.markets[0].reasoning).toBe('');
    expect(parsed.markets[0].postmortem).toBe('');
  });

  it('rejects files that are not backups', () => {
    expect(parseError('not json')).toMatch(/isn’t valid JSON/);
    expect(parseError('{"app":"something-else"}')).toMatch(/isn’t a Make a Market backup/);
    expect(parseError(JSON.stringify({ app: BACKUP_APP, formatVersion: 2 }))).toMatch(/newer version/);
    expect(parseError(JSON.stringify({ app: BACKUP_APP, formatVersion: 'x' }))).toMatch(/format version/);
  });

  it('checks the settings', () => {
    const data = JSON.parse(serializeBackup(sampleBackup()));
    data.settings.reminderTime = '9am';
    expect(parseError(JSON.stringify(data))).toMatch(/HH:MM/);
    delete data.settings;
    expect(parseError(JSON.stringify(data))).toMatch(/reminder settings/);
  });

  it('says which market and quote is wrong', () => {
    const text = withMarket({ quotes: [{ price: 72, createdAt: '2026-09-01T10:00:00.000Z' }] }, 1);
    expect(parseError(text)).toBe(
      'Market 2, quote 1: price must be a probability between 0.01 and 0.99 (a quote of 72 is written 0.72).',
    );
  });

  it('rejects invalid quotes', () => {
    const numberQuote = (bid: unknown, ask: unknown) => ({ bid, ask, createdAt: '2026-09-01T10:00:00.000Z' });
    expect(parseError(withMarket({ quotes: [numberQuote(30, 20)] }, 2))).toMatch(/ask must be at least the bid/);
    expect(parseError(withMarket({ quotes: [numberQuote(-1, 20)] }, 2))).toMatch(/can’t be negative/);
    expect(parseError(withMarket({ quotes: [numberQuote('1', 20)] }, 2))).toMatch(/bid must be a number/);
    expect(parseError(withMarket({ quotes: [] }, 2))).toMatch(/at least one quote/);
    expect(parseError(withMarket({ quotes: [{ price: 0.5 }] }, 0))).toMatch(/quote date/);
    expect(parseError(withMarket({ quotes: [{ price: 0, createdAt: '2026-09-01T10:00:00Z' }] }, 0))).toMatch(
      /between 1 and 99/,
    );
  });

  it('rejects inconsistent market fields', () => {
    expect(parseError(withMarket({ kind: 'range' }))).toMatch(/kind must be/);
    expect(parseError(withMarket({ question: '  ' }))).toMatch(/question is empty/);
    expect(parseError(withMarket({ resolveBy: '2026-02-30' }))).toMatch(/YYYY-MM-DD/);
    expect(parseError(withMarket({ createdAt: 'yesterday' }))).toMatch(/created date/);
    expect(parseError(withMarket({ status: 'open' }))).toMatch(/open market can’t have an outcome/);
    expect(parseError(withMarket({ outcome: null }, 1))).toMatch(/needs an outcome/);
    expect(parseError(withMarket({ outcome: 2 }, 1))).toMatch(/outcome must be/);
    expect(parseError(withMarket({ settledAt: null }, 1))).toMatch(/settled date/);
    expect(parseError(withMarket({ status: 'settled', settledAt: '2026-09-10T12:00:00.000Z' }, 2))).toMatch(
      /needs its real value/,
    );
    expect(parseError(withMarket({ status: 'void', settledAt: null }, 2))).toMatch(/date it was voided/);
  });

  it('checks decisions', () => {
    expect(parseError(withMarket({ chosenOption: 'Travel' }))).toMatch(/chosen option must be one of the options/);
    expect(parseError(withMarket({ options: ['Startup'] }))).toMatch(/at least two options/);
    expect(parseError(withMarket({ decisionQuality: 6 }))).toMatch(/1 to 5/);
    expect(parseError(withMarket({ decisionQuality: 3 }, 1))).toMatch(/only decisions/);
    expect(parseError(withMarket({ isDecision: true, options: ['A', 'B'], chosenOption: 'A' }, 2))).toMatch(
      /only Yes\/No markets can be decisions/,
    );
  });

  it('cleans up fields the same way the app does', () => {
    const parsed = parseBackup(withMarket({ tags: [' career ', 'Career', ''], question: 'Take  the   offer' }));
    expect(parsed.markets[0].tags).toEqual(['career']);
    expect(parsed.markets[0].question).toBe('Take the offer');
  });
});

describe('parseBackup prices', () => {
  it('rounds Yes/No prices to whole percents', () => {
    const at = '2026-09-01T10:00:00.000Z';
    const parsed = parseBackup(withMarket({ quotes: [{ price: 0.726, createdAt: at }] }, 1));
    expect(parsed.markets[1].quotes[0].price).toBe(0.73);
    expect(parseError(withMarket({ quotes: [{ price: 0.004, createdAt: at }] }, 1))).toMatch(/between 1 and 99/);
  });
});

describe('CSV', () => {
  it('guards cells that spreadsheets would run as formulas', () => {
    expect(guardFormula('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(guardFormula('+1')).toBe("'+1");
    expect(guardFormula('-5 degrees')).toBe("'-5 degrees");
    expect(guardFormula('@home')).toBe("'@home");
    expect(guardFormula('Will it rain?')).toBe('Will it rain?');
  });

  it('escapes fields per RFC 4180', () => {
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField('a, b')).toBe('"a, b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('two\nlines')).toBe('"two\nlines"');
  });

  it('writes one row per market with quotes, results and scores', () => {
    const csv = buildCsv([
      number,
      yesNo,
      decision,
      market({ id: 4, status: 'void', settledAt: '2026-09-10T12:00:00.000Z', question: '=cmd, "x"' }),
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(lines).toHaveLength(6); // header + 4 rows + trailing empty string
    expect(lines[5]).toBe('');
    // Decision (id 1): settled NO from 70 → Brier 0.49.
    expect(lines[1]).toMatch(/^1,Yes\/No,yes,Take the startup offer,,,70,70,/);
    expect(lines[1]).toContain(',settled,NO,0.4900,');
    // Re-quoted Yes/No (id 2): starting 60, current 75, YES → Brier 0.16 on the starting quote.
    expect(lines[2]).toMatch(/^2,Yes\/No,no,Will I get the internship\?,,career,60,75,/);
    expect(lines[2]).toContain(',settled,YES,0.1600,,Prep paid off.');
    expect(lines[3]).toMatch(/^3,Number,no,Hours of deep work,hours,career; focus,18 @ 24,18 @ 24,2026-09-0\d,2026-09-20,open,,,,$/);
    expect(lines[4]).toMatch(/^4,Yes\/No,no,"'=cmd, ""x""",/);
    expect(lines[4]).toContain(',void,void,,');
  });
});
