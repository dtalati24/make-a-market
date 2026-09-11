import type { Market, MarketKind, MarketStatus, Quote, ReminderSettings } from '@/db/types';
import {
  normalizeMarketInput,
  normalizeOptions,
  validateNumberQuote,
  validatePrice,
  validateSettledValue,
  ValidationError,
} from '@/db/validation';
import { brierScore, numberCost } from '@/scoring';

import { isValidDateString, isValidTimeString, toDateString } from './dates';
import { formatPrice } from './format';

/*
 * The JSON backup format and the CSV export. Pure functions only, so they can
 * be unit-tested; reading and writing the database lives in src/db/backup.ts.
 */

export const BACKUP_APP = 'make-a-market';
export const BACKUP_FORMAT_VERSION = 1;
/** Far bigger than any real backup; guards against picking a huge unrelated file. */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
/** Prepended to the CSV so Excel reads it as UTF-8 (Sheets and Numbers ignore it). */
export const CSV_BOM = '﻿';

export type BackupQuote = {
  price: number | null;
  bid: number | null;
  ask: number | null;
  note: string;
  createdAt: string;
};

/** A market without ids or reminder ids. The first quote is the starting quote, the last is the current one. */
export type BackupMarket = {
  kind: MarketKind;
  isDecision: boolean;
  question: string;
  unit: string;
  reasoning: string;
  successCriteria: string;
  options: string[];
  chosenOption: string | null;
  createdAt: string;
  resolveBy: string;
  status: MarketStatus;
  outcome: 0 | 1 | null;
  settledValue: number | null;
  settledAt: string | null;
  postmortem: string;
  decisionQuality: number | null;
  tags: string[];
  quotes: BackupQuote[];
};

export type BackupSettings = {
  remindersEnabled: boolean;
  /** "HH:MM", 24-hour. */
  reminderTime: string;
};

export type Backup = {
  app: typeof BACKUP_APP;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  exportedAt: string;
  settings: BackupSettings;
  markets: BackupMarket[];
};

// ---------------------------------------------------------------------------
// Export

export function buildBackup(
  markets: readonly Market[],
  quotesByMarket: ReadonlyMap<number, readonly Quote[]>,
  settings: ReminderSettings,
  now: Date,
): Backup {
  return {
    app: BACKUP_APP,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    settings: { remindersEnabled: settings.enabled, reminderTime: settings.time },
    // Oldest first, so an import recreates the markets in their original order.
    markets: [...markets]
      .sort((a, b) => a.id - b.id)
      .map((market) => toBackupMarket(market, quotesByMarket.get(market.id) ?? [])),
  };
}

function toBackupMarket(market: Market, quotes: readonly Quote[]): BackupMarket {
  const exported = [...quotes]
    .sort((a, b) => a.id - b.id)
    .map((quote) => ({
      price: quote.price,
      bid: quote.bid,
      ask: quote.ask,
      note: quote.note,
      createdAt: quote.createdAt,
    }));
  return {
    kind: market.kind,
    isDecision: market.isDecision,
    question: market.question,
    unit: market.unit,
    reasoning: market.reasoning,
    successCriteria: market.successCriteria,
    options: [...market.options],
    chosenOption: market.chosenOption,
    createdAt: market.createdAt,
    resolveBy: market.resolveBy,
    status: market.status,
    outcome: market.outcome,
    settledValue: market.settledValue,
    settledAt: market.settledAt,
    postmortem: market.postmortem,
    decisionQuality: market.decisionQuality,
    tags: [...market.tags],
    quotes: exported.length > 0 ? exported : fallbackQuotes(market),
  };
}

/** Every market has a quote row; if one is ever missing, rebuild the history from the market itself. */
function fallbackQuotes(market: Market): BackupQuote[] {
  const initial: BackupQuote = {
    price: market.initialPrice,
    bid: market.initialBid,
    ask: market.initialAsk,
    note: '',
    createdAt: market.createdAt,
  };
  const requoted =
    market.price !== market.initialPrice || market.bid !== market.initialBid || market.ask !== market.initialAsk;
  if (!requoted) return [initial];
  return [initial, { price: market.price, bid: market.bid, ask: market.ask, note: '', createdAt: market.createdAt }];
}

export function serializeBackup(backup: Backup): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

export function backupReminderSettings(backup: Backup): ReminderSettings {
  return { enabled: backup.settings.remindersEnabled, time: backup.settings.reminderTime };
}

// ---------------------------------------------------------------------------
// Import

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function problem(where: string, message: string): ValidationError {
  return new ValidationError(`${where}: ${message}`);
}

/** Runs one of the app's validators, prefixing its message with where the problem is. */
function within<T>(where: string, check: () => T): T {
  try {
    return check();
  } catch (error) {
    if (error instanceof ValidationError) {
      throw problem(where, error.message.charAt(0).toLowerCase() + error.message.slice(1));
    }
    throw error;
  }
}

/** Optional text: missing or null reads as ''. */
function readText(obj: JsonObject, key: string, where: string): string {
  const value = obj[key];
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw problem(where, `${key} must be text.`);
  return value;
}

/** Optional list of text: missing or null reads as []. */
function readTextList(obj: JsonObject, key: string, where: string): string[] {
  const value = obj[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) {
    throw problem(where, `${key} must be a list of text.`);
  }
  return value;
}

function readNumberOrNull(obj: JsonObject, key: string, where: string): number | null {
  const value = obj[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw problem(where, `${key} must be a number.`);
  return value;
}

const ISO_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** An ISO date-time normalised to toISOString() form, or null if it isn't one. */
function normalizeIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE_TIME.exec(value);
  if (!match || !isValidDateString(match[1])) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function readTimestamp(obj: JsonObject, key: string, where: string, label: string): string | null {
  const value = obj[key];
  if (value === undefined || value === null) return null;
  const iso = normalizeIso(value);
  if (iso === null) throw problem(where, `${label} (${key}) must be a date and time like 2026-09-11T09:30:00.000Z.`);
  return iso;
}

function parseKind(value: unknown, where: string): MarketKind {
  if (value === 'binary' || value === 'number') return value;
  throw problem(where, 'kind must be "binary" (Yes/No) or "number".');
}

function parseStatus(value: unknown, where: string): MarketStatus {
  if (value === 'open' || value === 'settled' || value === 'void') return value;
  throw problem(where, 'status must be "open", "settled" or "void".');
}

/**
 * The app only makes whole-percent prices. Others (e.g. 0.726) are rounded, so
 * that editing the market later can't silently change the scored quote.
 */
function roundPrice(price: number): number {
  return Math.round(price * 100) / 100;
}

function parseQuote(raw: unknown, kind: MarketKind, where: string): BackupQuote {
  if (!isObject(raw)) throw new ValidationError(`${where} isn’t a valid quote.`);
  const price = readNumberOrNull(raw, 'price', where);
  const bid = readNumberOrNull(raw, 'bid', where);
  const ask = readNumberOrNull(raw, 'ask', where);
  if (kind === 'binary') {
    if (price === null) throw problem(where, 'a Yes/No quote needs a price.');
    if (bid !== null || ask !== null) throw problem(where, 'a Yes/No quote can’t have a bid or ask.');
    if (price > 1) {
      throw problem(where, 'price must be a probability between 0.01 and 0.99 (a quote of 72 is written 0.72).');
    }
    within(where, () => validatePrice(roundPrice(price)));
  } else {
    if (bid === null || ask === null) throw problem(where, 'a Number quote needs a bid and an ask.');
    if (price !== null) throw problem(where, 'a Number quote can’t have a price.');
    within(where, () => validateNumberQuote(bid, ask));
  }
  const createdAt = readTimestamp(raw, 'createdAt', where, 'the quote date');
  if (createdAt === null) throw problem(where, 'the quote date (createdAt) is missing.');
  return { price: price === null ? null : roundPrice(price), bid, ask, note: readText(raw, 'note', where), createdAt };
}

function parseMarket(raw: unknown, index: number): BackupMarket {
  const where = `Market ${index + 1}`;
  if (!isObject(raw)) throw new ValidationError(`${where} isn’t a valid market.`);

  const kind = parseKind(raw.kind, where);
  const isDecisionRaw = raw.isDecision;
  if (isDecisionRaw !== undefined && typeof isDecisionRaw !== 'boolean') {
    throw problem(where, 'isDecision must be true or false.');
  }
  const isDecision = isDecisionRaw === true;
  if (isDecision && kind !== 'binary') throw problem(where, 'only Yes/No markets can be decisions.');

  const question = readText(raw, 'question', where);
  if (!question.trim()) throw problem(where, 'the question is empty.');
  const resolveBy = raw.resolveBy;
  if (typeof resolveBy !== 'string' || !isValidDateString(resolveBy)) {
    throw problem(where, 'the settle-by date (resolveBy) must be a real date written as YYYY-MM-DD.');
  }
  const createdAt = readTimestamp(raw, 'createdAt', where, 'the created date');
  if (createdAt === null) throw problem(where, 'the created date (createdAt) is missing.');

  const unit = readText(raw, 'unit', where);
  const reasoning = readText(raw, 'reasoning', where);
  const successCriteria = readText(raw, 'successCriteria', where);
  const postmortem = readText(raw, 'postmortem', where);
  const options = readTextList(raw, 'options', where);
  const tags = readTextList(raw, 'tags', where);
  const chosenRaw = raw.chosenOption;
  let chosenOption: string | null = null;
  if (typeof chosenRaw === 'string') chosenOption = chosenRaw;
  else if (chosenRaw !== undefined && chosenRaw !== null) throw problem(where, 'chosenOption must be text or null.');

  if (isDecision) {
    const cleanOptions = normalizeOptions(options);
    if (cleanOptions.length < 2) throw problem(where, 'a decision needs at least two options.');
    const chosen = chosenOption?.trim().toLowerCase();
    if (!cleanOptions.some((option) => option.toLowerCase() === chosen)) {
      throw problem(where, 'the chosen option must be one of the options.');
    }
  }

  // The same clean-up the app applies when a market is saved (question length,
  // tags, dropping decision fields from non-decisions, …).
  const input = within(where, () =>
    normalizeMarketInput(
      { isDecision, question, unit, reasoning, successCriteria, options, chosenOption, resolveBy, tags },
      kind,
    ),
  );

  const rawQuotes = raw.quotes;
  if (!Array.isArray(rawQuotes) || rawQuotes.length === 0) {
    throw problem(where, 'it needs at least one quote (the starting quote).');
  }
  const quotes = rawQuotes.map((quote: unknown, i: number) => parseQuote(quote, kind, `${where}, quote ${i + 1}`));

  const status = parseStatus(raw.status, where);
  const outcomeRaw = raw.outcome;
  let outcome: 0 | 1 | null = null;
  if (outcomeRaw === 0 || outcomeRaw === 1) outcome = outcomeRaw;
  else if (outcomeRaw !== undefined && outcomeRaw !== null) throw problem(where, 'outcome must be 1 (YES), 0 (NO) or null.');
  const settledValue = readNumberOrNull(raw, 'settledValue', where);
  const settledAt = readTimestamp(raw, 'settledAt', where, 'the settled date');

  if (status === 'open') {
    if (outcome !== null || settledValue !== null || settledAt !== null) {
      throw problem(where, 'an open market can’t have an outcome, settled value or settled date.');
    }
  } else if (status === 'void') {
    if (outcome !== null || settledValue !== null) throw problem(where, 'a void market can’t have an outcome or settled value.');
    if (settledAt === null) throw problem(where, 'a void market needs the date it was voided (settledAt).');
  } else {
    if (settledAt === null) throw problem(where, 'a settled market needs its settled date (settledAt).');
    if (kind === 'binary') {
      if (outcome === null) throw problem(where, 'a settled Yes/No market needs an outcome of 1 (YES) or 0 (NO).');
      if (settledValue !== null) throw problem(where, 'a Yes/No market can’t have a settled value.');
    } else {
      if (settledValue === null) throw problem(where, 'a settled Number market needs its real value (settledValue).');
      if (outcome !== null) throw problem(where, 'a Number market can’t have a YES/NO outcome.');
      within(where, () => validateSettledValue(settledValue));
    }
  }

  const qualityRaw = raw.decisionQuality;
  let decisionQuality: number | null = null;
  if (qualityRaw !== undefined && qualityRaw !== null) {
    if (typeof qualityRaw !== 'number' || !Number.isInteger(qualityRaw) || qualityRaw < 1 || qualityRaw > 5) {
      throw problem(where, 'decision quality must be a whole number from 1 to 5.');
    }
    if (!isDecision) throw problem(where, 'only decisions can have a decision-quality rating.');
    decisionQuality = qualityRaw;
  }

  return {
    kind,
    isDecision: input.isDecision,
    question: input.question,
    unit: input.unit,
    reasoning: input.reasoning,
    successCriteria: input.successCriteria,
    options: input.options,
    chosenOption: input.chosenOption,
    createdAt,
    resolveBy: input.resolveBy,
    status,
    outcome,
    settledValue,
    settledAt,
    postmortem: postmortem.trim(),
    decisionQuality,
    tags: input.tags,
    quotes,
  };
}

function parseSettings(raw: unknown): BackupSettings {
  if (!isObject(raw)) throw new ValidationError('The backup has no reminder settings.');
  if (typeof raw.remindersEnabled !== 'boolean') {
    throw new ValidationError('Settings: remindersEnabled must be true or false.');
  }
  if (typeof raw.reminderTime !== 'string' || !isValidTimeString(raw.reminderTime)) {
    throw new ValidationError('Settings: the reminder time must be written as HH:MM (24-hour), e.g. 09:00.');
  }
  return { remindersEnabled: raw.remindersEnabled, reminderTime: raw.reminderTime };
}

/**
 * Parses and fully validates a backup file. Throws a ValidationError with a
 * message that's safe to show (e.g. "Market 3, quote 1: price must be between 1 and 99.").
 */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new ValidationError('This file isn’t a Make a Market backup (it isn’t valid JSON).');
  }
  if (!isObject(data) || data.app !== BACKUP_APP) {
    throw new ValidationError('This file isn’t a Make a Market backup.');
  }
  const version = data.formatVersion;
  if (typeof version === 'number' && version > BACKUP_FORMAT_VERSION) {
    throw new ValidationError(
      `This backup was made by a newer version of the app (format ${version}). Update Make a Market, then try again.`,
    );
  }
  if (version !== BACKUP_FORMAT_VERSION) {
    throw new ValidationError('This backup’s format version isn’t recognised.');
  }
  const settings = parseSettings(data.settings);
  if (!Array.isArray(data.markets)) throw new ValidationError('The backup has no list of markets.');
  const markets = data.markets.map((market: unknown, index: number) => parseMarket(market, index));
  return {
    app: BACKUP_APP,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: normalizeIso(data.exportedAt) ?? '',
    settings,
    markets,
  };
}

// ---------------------------------------------------------------------------
// CSV

export const CSV_COLUMNS = [
  'id',
  'type',
  'decision',
  'question',
  'unit',
  'tags',
  'starting_quote',
  'current_quote',
  'created',
  'settle_by',
  'status',
  'result',
  'score',
  'reasoning',
  'postmortem',
] as const;

/** Numbers without thousands separators (spreadsheet-friendly), up to 2 decimals. */
function plainNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function quoteText(market: Market, which: 'starting' | 'current'): string {
  if (market.kind === 'binary') {
    const price = which === 'starting' ? market.initialPrice : market.price;
    return price === null ? '' : formatPrice(price);
  }
  const bid = which === 'starting' ? market.initialBid : market.bid;
  const ask = which === 'starting' ? market.initialAsk : market.ask;
  return bid === null || ask === null ? '' : `${plainNumber(bid)} @ ${plainNumber(ask)}`;
}

function resultText(market: Market): string {
  if (market.status === 'void') return 'void';
  if (market.status !== 'settled') return '';
  if (market.kind === 'binary') return market.outcome === 1 ? 'YES' : market.outcome === 0 ? 'NO' : '';
  return market.settledValue === null ? '' : plainNumber(market.settledValue);
}

/** Brier (4 dp) for settled Yes/No, cost (2 dp) for settled Number — both from the starting quote. */
function scoreText(market: Market): string {
  if (market.status !== 'settled') return '';
  if (market.kind === 'binary') {
    return market.initialPrice === null || market.outcome === null
      ? ''
      : brierScore(market.initialPrice, market.outcome).toFixed(4);
  }
  if (market.initialBid === null || market.initialAsk === null || market.settledValue === null) return '';
  return numberCost(market.initialBid, market.initialAsk, market.settledValue).cost.toFixed(2);
}

/** Spreadsheets treat cells starting with these as formulas; a leading ' keeps them as text. */
export function guardFormula(value: string): string {
  return /^[=+@\t\r-]/.test(value) ? `'${value}` : value;
}

/** RFC 4180: quote fields containing a comma, quote, CR or LF, doubling inner quotes. */
export function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildCsv(markets: readonly Market[]): string {
  const rows = [...markets]
    .sort((a, b) => a.id - b.id)
    .map((market) => [
      String(market.id),
      market.kind === 'binary' ? 'Yes/No' : 'Number',
      market.isDecision ? 'yes' : 'no',
      guardFormula(market.question),
      guardFormula(market.unit),
      guardFormula(market.tags.join('; ')),
      quoteText(market, 'starting'),
      quoteText(market, 'current'),
      toDateString(new Date(market.createdAt)),
      market.resolveBy,
      market.status,
      resultText(market),
      scoreText(market),
      guardFormula(market.reasoning),
      guardFormula(market.postmortem),
    ]);
  return `${[[...CSV_COLUMNS], ...rows].map((row) => row.map(escapeCsvField).join(',')).join('\r\n')}\r\n`;
}
