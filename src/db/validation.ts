import { isValidDateString } from '@/lib/dates';

import type { MarketInput, QuoteInput } from './types';

export const MIN_PRICE = 0.01;
export const MAX_PRICE = 0.99;
export const MAX_QUESTION_LENGTH = 300;
export const MAX_TAG_LENGTH = 30;

/** Thrown for bad user input; the message is safe to show on screen. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validatePrice(price: number): void {
  // Prices come from whole numbers 1–99 divided by 100, so allow float noise.
  if (!Number.isFinite(price) || price < MIN_PRICE - 1e-9 || price > MAX_PRICE + 1e-9) {
    throw new ValidationError('Price must be between 1 and 99.');
  }
}

export function validateNumberQuote(bid: number, ask: number): void {
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) {
    throw new ValidationError('Enter a number for both bid and ask.');
  }
  if (bid < 0) throw new ValidationError('Bid can’t be negative.');
  if (ask < bid) throw new ValidationError('Ask must be at least the bid.');
}

export function validateQuote(quote: QuoteInput): void {
  if (quote.kind === 'binary') validatePrice(quote.price);
  else validateNumberQuote(quote.bid, quote.ask);
}

export function validateSettledValue(value: number): void {
  if (!Number.isFinite(value)) throw new ValidationError('Enter the real value.');
  if (value < 0) throw new ValidationError('The value can’t be negative.');
}

/** Trims, collapses whitespace, drops empties and case-insensitive duplicates. */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, ' ');
    if (!tag) continue;
    if (tag.length > MAX_TAG_LENGTH) {
      throw new ValidationError(`Tags can be at most ${MAX_TAG_LENGTH} characters.`);
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

export function normalizeOptions(options: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of options) {
    const option = raw.trim().replace(/\s+/g, ' ');
    if (!option || seen.has(option.toLowerCase())) continue;
    seen.add(option.toLowerCase());
    result.push(option);
  }
  return result;
}

/**
 * Validates and cleans the descriptive fields of a market. Decision fields are
 * only kept for decisions.
 */
export function normalizeMarketInput(input: MarketInput, kind: QuoteInput['kind']): MarketInput {
  const question = input.question.trim().replace(/\s+/g, ' ');
  if (!question) throw new ValidationError('Enter a question.');
  if (question.length > MAX_QUESTION_LENGTH) {
    throw new ValidationError(`Keep the question under ${MAX_QUESTION_LENGTH} characters.`);
  }
  if (!isValidDateString(input.resolveBy)) throw new ValidationError('Pick a settle-by date.');
  if (input.isDecision && kind !== 'binary') {
    throw new ValidationError('Only Yes/No markets can be decisions.');
  }

  let options: string[] = [];
  let chosenOption: string | null = null;
  let successCriteria = '';
  if (input.isDecision) {
    options = normalizeOptions(input.options);
    if (options.length < 2) throw new ValidationError('List at least two options.');
    const chosen = input.chosenOption?.trim().toLowerCase();
    chosenOption = options.find((option) => option.toLowerCase() === chosen) ?? null;
    if (!chosenOption) throw new ValidationError('Pick the option you chose.');
    successCriteria = input.successCriteria.trim();
  }

  return {
    isDecision: input.isDecision,
    question,
    unit: kind === 'number' ? input.unit.trim() : '',
    reasoning: input.reasoning.trim(),
    successCriteria,
    options,
    chosenOption,
    resolveBy: input.resolveBy,
    tags: normalizeTags(input.tags),
  };
}
