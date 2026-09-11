import type { SQLiteDatabase } from 'expo-sqlite';

import type { Backup, BackupMarket } from '@/lib/backup-format';

import { notifyDataChanged } from './events';
import { getQuotes, listMarkets } from './markets';
import { getReminderSettings } from './settings';
import { transaction } from './transaction';
import type { Market, Quote, ReminderSettings } from './types';
import { ValidationError } from './validation';

// Must match the keys in ./settings.ts.
const SETTING_KEYS = {
  remindersEnabled: 'reminders_enabled',
  reminderTime: 'reminder_time',
} as const;

export type ExportedData = {
  markets: Market[];
  quotesByMarket: Map<number, Quote[]>;
  settings: ReminderSettings;
};

/** Everything a backup needs: all markets, their quote histories and the reminder settings. */
export async function exportData(db: SQLiteDatabase): Promise<ExportedData> {
  const markets = await listMarkets(db);
  const quotesByMarket = new Map<number, Quote[]>();
  for (const market of markets) {
    quotesByMarket.set(market.id, await getQuotes(db, market.id));
  }
  return { markets, quotesByMarket, settings: await getReminderSettings(db) };
}

export type ReplaceResult = {
  /** Number of markets now in the database. */
  imported: number;
  /** Reminders of the markets that were replaced; the caller must cancel them. */
  staleReminderIds: string[];
};

async function insertMarket(db: SQLiteDatabase, market: BackupMarket): Promise<void> {
  const first = market.quotes[0];
  const last = market.quotes[market.quotes.length - 1];
  if (!first || !last) throw new ValidationError('Every market needs at least one quote.');
  const result = await db.runAsync(
    `INSERT INTO markets (
       kind, is_decision, question, unit,
       initial_price, price, initial_bid, initial_ask, bid, ask,
       reasoning, success_criteria, options, chosen_option, created_at, resolve_by,
       status, outcome, settled_value, settled_at, postmortem, decision_quality, notification_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      market.kind,
      market.isDecision ? 1 : 0,
      market.question,
      market.unit,
      first.price,
      last.price,
      first.bid,
      first.ask,
      last.bid,
      last.ask,
      market.reasoning,
      market.successCriteria,
      JSON.stringify(market.options),
      market.chosenOption,
      market.createdAt,
      market.resolveBy,
      market.status,
      market.outcome,
      market.settledValue,
      market.settledAt,
      market.postmortem,
      market.decisionQuality,
    ],
  );
  const id = result.lastInsertRowId;
  for (const quote of market.quotes) {
    await db.runAsync(
      'INSERT INTO quotes (market_id, price, bid, ask, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, quote.price, quote.bid, quote.ask, quote.note, quote.createdAt],
    );
  }
  for (const tag of market.tags) {
    await db.runAsync('INSERT OR IGNORE INTO tags (name) VALUES (?)', tag);
    // tags.name is COLLATE NOCASE, so this finds "Career" for "career".
    await db.runAsync('INSERT OR IGNORE INTO market_tags (market_id, tag_id) SELECT ?, id FROM tags WHERE name = ?', [
      id,
      tag,
    ]);
  }
}

async function writeSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

/**
 * Replaces every market, quote and tag, and the reminder settings, with the
 * (already validated) backup's — all in one transaction, so a failure leaves
 * the current data untouched. Afterwards cancel `staleReminderIds` and call
 * `syncAllReminders` to schedule reminders for the imported markets.
 */
export async function replaceAllData(db: SQLiteDatabase, backup: Backup): Promise<ReplaceResult> {
  let staleReminderIds: string[] = [];
  await transaction(db, async () => {
    const rows = await db.getAllAsync<{ notification_id: string }>(
      'SELECT notification_id FROM markets WHERE notification_id IS NOT NULL',
    );
    staleReminderIds = rows.map((row) => row.notification_id);
    await db.execAsync('DELETE FROM market_tags; DELETE FROM quotes; DELETE FROM markets; DELETE FROM tags;');
    for (const market of backup.markets) {
      await insertMarket(db, market);
    }
    await writeSetting(db, SETTING_KEYS.remindersEnabled, backup.settings.remindersEnabled ? '1' : '0');
    await writeSetting(db, SETTING_KEYS.reminderTime, backup.settings.reminderTime);
  });
  notifyDataChanged();
  return { imported: backup.markets.length, staleReminderIds };
}
