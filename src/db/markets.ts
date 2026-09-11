import type { SQLiteDatabase } from 'expo-sqlite';

import { notifyDataChanged } from './events';
import type { Market, MarketInput, MarketKind, MarketStatus, NewMarketInput, Quote, QuoteInput } from './types';
import { normalizeMarketInput, validateQuote, validateSettledValue, ValidationError } from './validation';

type MarketRow = {
  id: number;
  kind: MarketKind;
  is_decision: number;
  question: string;
  unit: string;
  initial_price: number | null;
  price: number | null;
  initial_bid: number | null;
  initial_ask: number | null;
  bid: number | null;
  ask: number | null;
  reasoning: string;
  success_criteria: string;
  options: string;
  chosen_option: string | null;
  created_at: string;
  resolve_by: string;
  status: MarketStatus;
  outcome: number | null;
  settled_value: number | null;
  settled_at: string | null;
  postmortem: string;
  decision_quality: number | null;
  notification_id: string | null;
  /** JSON array of tag names. */
  tag_names: string;
  quote_count: number;
};

type QuoteRow = {
  id: number;
  market_id: number;
  price: number | null;
  bid: number | null;
  ask: number | null;
  note: string;
  created_at: string;
};

const MARKET_SELECT = `
  SELECT m.*,
    (SELECT json_group_array(t.name)
       FROM market_tags mt JOIN tags t ON t.id = mt.tag_id
      WHERE mt.market_id = m.id) AS tag_names,
    (SELECT count(*) FROM quotes q WHERE q.market_id = m.id) AS quote_count
  FROM markets m`;

function parseStringArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function rowToMarket(row: MarketRow): Market {
  const tags = parseStringArray(row.tag_names);
  tags.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return {
    id: row.id,
    kind: row.kind,
    isDecision: row.is_decision === 1,
    question: row.question,
    unit: row.unit,
    initialPrice: row.initial_price,
    price: row.price,
    initialBid: row.initial_bid,
    initialAsk: row.initial_ask,
    bid: row.bid,
    ask: row.ask,
    reasoning: row.reasoning,
    successCriteria: row.success_criteria,
    options: parseStringArray(row.options),
    chosenOption: row.chosen_option,
    createdAt: row.created_at,
    resolveBy: row.resolve_by,
    status: row.status,
    outcome: row.outcome === 0 || row.outcome === 1 ? row.outcome : null,
    settledValue: row.settled_value,
    settledAt: row.settled_at,
    postmortem: row.postmortem,
    decisionQuality: row.decision_quality,
    notificationId: row.notification_id,
    tags,
    quoteCount: row.quote_count,
  };
}

function quoteColumns(quote: QuoteInput): { price: number | null; bid: number | null; ask: number | null } {
  return quote.kind === 'binary'
    ? { price: quote.price, bid: null, ask: null }
    : { price: null, bid: quote.bid, ask: quote.ask };
}

async function replaceTags(db: SQLiteDatabase, marketId: number, tags: readonly string[]): Promise<void> {
  await db.runAsync('DELETE FROM market_tags WHERE market_id = ?', marketId);
  for (const name of tags) {
    await db.runAsync('INSERT OR IGNORE INTO tags (name) VALUES (?)', name);
    // The name column is COLLATE NOCASE, so this matches "Career" for "career".
    const tag = await db.getFirstAsync<{ id: number }>('SELECT id FROM tags WHERE name = ?', name);
    if (tag) {
      await db.runAsync('INSERT OR IGNORE INTO market_tags (market_id, tag_id) VALUES (?, ?)', marketId, tag.id);
    }
  }
  await deleteUnusedTags(db);
}

async function deleteUnusedTags(db: SQLiteDatabase): Promise<void> {
  await db.runAsync('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM market_tags)');
}

async function requireMarket(db: SQLiteDatabase, id: number): Promise<Market> {
  const market = await getMarket(db, id);
  if (!market) throw new ValidationError('This market no longer exists.');
  return market;
}

export async function listMarkets(db: SQLiteDatabase): Promise<Market[]> {
  const rows = await db.getAllAsync<MarketRow>(`${MARKET_SELECT} ORDER BY m.id DESC`);
  return rows.map(rowToMarket);
}

export async function getMarket(db: SQLiteDatabase, id: number): Promise<Market | null> {
  const row = await db.getFirstAsync<MarketRow>(`${MARKET_SELECT} WHERE m.id = ?`, id);
  return row ? rowToMarket(row) : null;
}

export async function getQuotes(db: SQLiteDatabase, marketId: number): Promise<Quote[]> {
  const rows = await db.getAllAsync<QuoteRow>(
    'SELECT * FROM quotes WHERE market_id = ? ORDER BY id ASC',
    marketId,
  );
  return rows.map((row) => ({
    id: row.id,
    marketId: row.market_id,
    price: row.price,
    bid: row.bid,
    ask: row.ask,
    note: row.note,
    createdAt: row.created_at,
  }));
}

export async function listTagNames(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>('SELECT name FROM tags ORDER BY name COLLATE NOCASE');
  return rows.map((row) => row.name);
}

export async function createMarket(db: SQLiteDatabase, input: NewMarketInput, now: Date = new Date()): Promise<number> {
  validateQuote(input.quote);
  const clean = normalizeMarketInput(input, input.quote.kind);
  const createdAt = now.toISOString();
  const q = quoteColumns(input.quote);
  let id = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO markets (
         kind, is_decision, question, unit,
         initial_price, price, initial_bid, initial_ask, bid, ask,
         reasoning, success_criteria, options, chosen_option, created_at, resolve_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.quote.kind,
        clean.isDecision ? 1 : 0,
        clean.question,
        clean.unit,
        q.price,
        q.price,
        q.bid,
        q.ask,
        q.bid,
        q.ask,
        clean.reasoning,
        clean.successCriteria,
        JSON.stringify(clean.options),
        clean.chosenOption,
        createdAt,
        clean.resolveBy,
      ],
    );
    id = result.lastInsertRowId;
    await db.runAsync(
      'INSERT INTO quotes (market_id, price, bid, ask, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, q.price, q.bid, q.ask, '', createdAt],
    );
    await replaceTags(db, id, clean.tags);
  });
  notifyDataChanged();
  return id;
}

/**
 * Edits the descriptive fields. The starting quote can only be replaced while
 * the market is open and has never been re-quoted (so a typo can be fixed
 * without rewriting history).
 */
export async function updateMarket(
  db: SQLiteDatabase,
  id: number,
  input: MarketInput,
  initialQuote?: QuoteInput,
): Promise<void> {
  const market = await requireMarket(db, id);
  const clean = normalizeMarketInput(input, market.kind);
  if (initialQuote) {
    if (initialQuote.kind !== market.kind) throw new ValidationError('Quote type doesn’t match the market.');
    if (market.status !== 'open' || market.quoteCount > 1) {
      throw new ValidationError('The starting quote can only be changed before any re-quotes.');
    }
    validateQuote(initialQuote);
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE markets SET
         is_decision = ?, question = ?, unit = ?, reasoning = ?, success_criteria = ?,
         options = ?, chosen_option = ?, resolve_by = ?,
         decision_quality = CASE WHEN ? = 1 THEN decision_quality ELSE NULL END
       WHERE id = ?`,
      [
        clean.isDecision ? 1 : 0,
        clean.question,
        clean.unit,
        clean.reasoning,
        clean.successCriteria,
        JSON.stringify(clean.options),
        clean.chosenOption,
        clean.resolveBy,
        clean.isDecision ? 1 : 0,
        id,
      ],
    );
    if (initialQuote) {
      const q = quoteColumns(initialQuote);
      await db.runAsync(
        `UPDATE markets SET initial_price = ?, price = ?, initial_bid = ?, initial_ask = ?, bid = ?, ask = ?
         WHERE id = ?`,
        [q.price, q.price, q.bid, q.ask, q.bid, q.ask, id],
      );
      await db.runAsync('UPDATE quotes SET price = ?, bid = ?, ask = ? WHERE market_id = ?', [q.price, q.bid, q.ask, id]);
    }
    await replaceTags(db, id, clean.tags);
  });
  notifyDataChanged();
}

/** Records a new current quote. The starting quote (the one that's scored) is unchanged. */
export async function requoteMarket(
  db: SQLiteDatabase,
  id: number,
  quote: QuoteInput,
  note: string,
  now: Date = new Date(),
): Promise<void> {
  const market = await requireMarket(db, id);
  if (market.status !== 'open') throw new ValidationError('Only open markets can be re-quoted.');
  if (quote.kind !== market.kind) throw new ValidationError('Quote type doesn’t match the market.');
  validateQuote(quote);
  const q = quoteColumns(quote);
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE markets SET price = ?, bid = ?, ask = ? WHERE id = ?', [q.price, q.bid, q.ask, id]);
    await db.runAsync(
      'INSERT INTO quotes (market_id, price, bid, ask, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, q.price, q.bid, q.ask, note.trim(), now.toISOString()],
    );
  });
  notifyDataChanged();
}

async function settle(db: SQLiteDatabase, id: number, sql: string, params: (string | number | null)[]): Promise<void> {
  const result = await db.runAsync(sql, params);
  if (result.changes !== 1) {
    await requireMarket(db, id);
    throw new ValidationError('This market is already settled. Reopen it first.');
  }
  notifyDataChanged();
}

export async function settleBinary(db: SQLiteDatabase, id: number, outcome: 0 | 1, now: Date = new Date()): Promise<void> {
  await settle(
    db,
    id,
    `UPDATE markets SET status = 'settled', outcome = ?, settled_value = NULL, settled_at = ?
     WHERE id = ? AND kind = 'binary' AND status = 'open'`,
    [outcome, now.toISOString(), id],
  );
}

export async function settleNumber(db: SQLiteDatabase, id: number, value: number, now: Date = new Date()): Promise<void> {
  validateSettledValue(value);
  await settle(
    db,
    id,
    `UPDATE markets SET status = 'settled', outcome = NULL, settled_value = ?, settled_at = ?
     WHERE id = ? AND kind = 'number' AND status = 'open'`,
    [value, now.toISOString(), id],
  );
}

export async function voidMarket(db: SQLiteDatabase, id: number, now: Date = new Date()): Promise<void> {
  await settle(
    db,
    id,
    `UPDATE markets SET status = 'void', outcome = NULL, settled_value = NULL, settled_at = ?
     WHERE id = ? AND status = 'open'`,
    [now.toISOString(), id],
  );
}

export async function reopenMarket(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(
    `UPDATE markets SET status = 'open', outcome = NULL, settled_value = NULL, settled_at = NULL WHERE id = ?`,
    id,
  );
  notifyDataChanged();
}

export async function saveReview(
  db: SQLiteDatabase,
  id: number,
  review: { postmortem: string; decisionQuality: number | null },
): Promise<void> {
  const quality = review.decisionQuality;
  if (quality !== null && !(Number.isInteger(quality) && quality >= 1 && quality <= 5)) {
    throw new ValidationError('Rate the decision from 1 to 5.');
  }
  await db.runAsync(
    `UPDATE markets SET postmortem = ?, decision_quality = CASE WHEN is_decision = 1 THEN ? ELSE NULL END
     WHERE id = ?`,
    [review.postmortem.trim(), quality, id],
  );
  notifyDataChanged();
}

/** Internal bookkeeping for reminders; doesn't trigger a UI refresh. */
export async function setNotificationId(db: SQLiteDatabase, id: number, notificationId: string | null): Promise<void> {
  await db.runAsync('UPDATE markets SET notification_id = ? WHERE id = ?', notificationId, id);
}

export async function deleteMarket(db: SQLiteDatabase, id: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM markets WHERE id = ?', id);
    await deleteUnusedTags(db);
  });
  notifyDataChanged();
}

/** Deletes every market carrying the tag. Returns the reminder ids that need cancelling. */
export async function deleteMarketsWithTag(db: SQLiteDatabase, tag: string): Promise<string[]> {
  const where = `id IN (SELECT mt.market_id FROM market_tags mt JOIN tags t ON t.id = mt.tag_id WHERE t.name = ?)`;
  let reminderIds: string[] = [];
  await db.withTransactionAsync(async () => {
    const rows = await db.getAllAsync<{ notification_id: string | null }>(
      `SELECT notification_id FROM markets WHERE ${where}`,
      tag,
    );
    reminderIds = rows.flatMap((row) => (row.notification_id ? [row.notification_id] : []));
    await db.runAsync(`DELETE FROM markets WHERE ${where}`, tag);
    await deleteUnusedTags(db);
  });
  notifyDataChanged();
  return reminderIds;
}

/** Deletes all markets, quotes and tags (settings are kept). Returns reminder ids to cancel. */
export async function deleteAllMarkets(db: SQLiteDatabase): Promise<string[]> {
  let reminderIds: string[] = [];
  await db.withTransactionAsync(async () => {
    const rows = await db.getAllAsync<{ notification_id: string }>(
      'SELECT notification_id FROM markets WHERE notification_id IS NOT NULL',
    );
    reminderIds = rows.map((row) => row.notification_id);
    await db.execAsync('DELETE FROM market_tags; DELETE FROM quotes; DELETE FROM markets; DELETE FROM tags;');
  });
  notifyDataChanged();
  return reminderIds;
}
