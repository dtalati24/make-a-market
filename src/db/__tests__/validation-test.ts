import type { MarketInput } from '../types';
import {
  normalizeMarketInput,
  normalizeOptions,
  normalizeTags,
  validateNumberQuote,
  validatePrice,
  validateSettledValue,
  ValidationError,
} from '../validation';

const base: MarketInput = {
  isDecision: false,
  question: '  Will I   ship v1 by Friday? ',
  unit: 'hours',
  reasoning: '  most of it is done ',
  successCriteria: 'ignored',
  options: ['A', 'B'],
  chosenOption: 'A',
  resolveBy: '2026-09-18',
  tags: ['Work', ' work '],
};

describe('validatePrice', () => {
  it('accepts 1–99 as probabilities', () => {
    expect(() => validatePrice(0.01)).not.toThrow();
    expect(() => validatePrice(0.99)).not.toThrow();
    expect(() => validatePrice(29 / 100)).not.toThrow();
  });

  it('rejects 0, 100 and non-numbers', () => {
    expect(() => validatePrice(0)).toThrow(ValidationError);
    expect(() => validatePrice(1)).toThrow(ValidationError);
    expect(() => validatePrice(Number.NaN)).toThrow(ValidationError);
  });
});

describe('validateNumberQuote', () => {
  it('accepts non-negative quotes with ask >= bid, including zero width', () => {
    expect(() => validateNumberQuote(0, 0)).not.toThrow();
    expect(() => validateNumberQuote(18, 24)).not.toThrow();
    expect(() => validateNumberQuote(5, 5)).not.toThrow();
  });

  it('rejects negative bids, crossed quotes and non-numbers', () => {
    expect(() => validateNumberQuote(-1, 2)).toThrow('Bid can’t be negative.');
    expect(() => validateNumberQuote(5, 4)).toThrow('Ask must be at least the bid.');
    expect(() => validateNumberQuote(Number.NaN, 1)).toThrow(ValidationError);
    expect(() => validateNumberQuote(1, Number.POSITIVE_INFINITY)).toThrow(ValidationError);
  });
});

describe('validateSettledValue', () => {
  it('accepts zero and positive values only', () => {
    expect(() => validateSettledValue(0)).not.toThrow();
    expect(() => validateSettledValue(12.5)).not.toThrow();
    expect(() => validateSettledValue(-0.1)).toThrow(ValidationError);
    expect(() => validateSettledValue(Number.NaN)).toThrow(ValidationError);
  });
});

describe('normalizeTags / normalizeOptions', () => {
  it('trims, collapses spaces and de-duplicates case-insensitively, keeping the first spelling', () => {
    expect(normalizeTags([' Career ', 'career', '', 'side   project'])).toEqual(['Career', 'side project']);
    expect(normalizeOptions([' Job A', 'job a', '  ', 'Job B '])).toEqual(['Job A', 'Job B']);
  });

  it('rejects overly long tags', () => {
    expect(() => normalizeTags(['x'.repeat(31)])).toThrow(ValidationError);
  });
});

describe('normalizeMarketInput', () => {
  it('cleans a Yes/No market and drops fields that do not apply', () => {
    expect(normalizeMarketInput(base, 'binary')).toEqual({
      isDecision: false,
      question: 'Will I ship v1 by Friday?',
      unit: '',
      reasoning: 'most of it is done',
      successCriteria: '',
      options: [],
      chosenOption: null,
      resolveBy: '2026-09-18',
      tags: ['Work'],
    });
  });

  it('keeps the unit for Number markets', () => {
    expect(normalizeMarketInput(base, 'number').unit).toBe('hours');
  });

  it('requires a question and a valid date', () => {
    expect(() => normalizeMarketInput({ ...base, question: '   ' }, 'binary')).toThrow('Enter a question.');
    expect(() => normalizeMarketInput({ ...base, resolveBy: '2026-02-30' }, 'binary')).toThrow(ValidationError);
  });

  it('validates decisions', () => {
    const decision = { ...base, isDecision: true, options: ['Job A', ' job b '], chosenOption: 'JOB B' };
    const clean = normalizeMarketInput(decision, 'binary');
    expect(clean.options).toEqual(['Job A', 'job b']);
    expect(clean.chosenOption).toBe('job b');
    expect(clean.successCriteria).toBe('ignored');

    expect(() => normalizeMarketInput({ ...decision, options: ['Only one'] }, 'binary')).toThrow(
      'List at least two options.',
    );
    expect(() => normalizeMarketInput({ ...decision, chosenOption: 'Job C' }, 'binary')).toThrow(
      'Pick the option you chose.',
    );
    expect(() => normalizeMarketInput(decision, 'number')).toThrow('Only Yes/No markets can be decisions.');
  });
});
