import type { SQLiteDatabase } from 'expo-sqlite';

import {
  createMarket,
  deleteAllMarkets,
  deleteMarket,
  deleteMarketsWithTag,
  getMarket,
  listMarkets,
  reopenMarket,
  setNotificationId,
  settleBinary,
  settleNumber,
  updateMarket,
  voidMarket,
} from '@/db/markets';
import { getReminderSettings } from '@/db/settings';
import type { MarketInput, NewMarketInput, QuoteInput } from '@/db/types';

import { cancelReminder, scheduleReminder } from './reminders';

/*
 * Database writes that also keep reminders in sync. Screens call these rather
 * than the raw queries. A reminder failure never blocks the write itself.
 */

async function syncReminder(db: SQLiteDatabase, id: number): Promise<void> {
  try {
    const market = await getMarket(db, id);
    if (!market) return;
    await cancelReminder(market.notificationId);
    let notificationId: string | null = null;
    if (market.status === 'open') {
      notificationId = await scheduleReminder(market, await getReminderSettings(db));
    }
    await setNotificationId(db, id, notificationId);
  } catch (error) {
    console.warn('Could not update reminder', error);
  }
}

export async function createMarketAction(db: SQLiteDatabase, input: NewMarketInput): Promise<number> {
  const id = await createMarket(db, input);
  await syncReminder(db, id);
  return id;
}

export async function updateMarketAction(
  db: SQLiteDatabase,
  id: number,
  input: MarketInput,
  initialQuote?: QuoteInput,
): Promise<void> {
  await updateMarket(db, id, input, initialQuote);
  await syncReminder(db, id);
}

export async function settleBinaryAction(db: SQLiteDatabase, id: number, outcome: 0 | 1): Promise<void> {
  await settleBinary(db, id, outcome);
  await syncReminder(db, id);
}

export async function settleNumberAction(db: SQLiteDatabase, id: number, value: number): Promise<void> {
  await settleNumber(db, id, value);
  await syncReminder(db, id);
}

export async function voidMarketAction(db: SQLiteDatabase, id: number): Promise<void> {
  await voidMarket(db, id);
  await syncReminder(db, id);
}

export async function reopenMarketAction(db: SQLiteDatabase, id: number): Promise<void> {
  await reopenMarket(db, id);
  await syncReminder(db, id);
}

export async function deleteMarketAction(db: SQLiteDatabase, id: number): Promise<void> {
  const market = await getMarket(db, id);
  await deleteMarket(db, id);
  if (market) await cancelReminder(market.notificationId);
}

export async function deleteMarketsWithTagAction(db: SQLiteDatabase, tag: string): Promise<void> {
  const reminderIds = await deleteMarketsWithTag(db, tag);
  await Promise.all(reminderIds.map(cancelReminder));
}

export async function deleteAllMarketsAction(db: SQLiteDatabase): Promise<void> {
  const reminderIds = await deleteAllMarkets(db);
  await Promise.all(reminderIds.map(cancelReminder));
}

/** Re-creates every reminder, e.g. after the reminder time changes or data is imported. */
export async function syncAllReminders(db: SQLiteDatabase): Promise<void> {
  const markets = await listMarkets(db);
  for (const market of markets) {
    if (market.status === 'open' || market.notificationId) await syncReminder(db, market.id);
  }
}
