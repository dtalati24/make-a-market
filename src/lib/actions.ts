import type { SQLiteDatabase } from 'expo-sqlite';

import { replaceAllData } from '@/db/backup';
import { batchDataChanges } from '@/db/events';
import {
  createMarket,
  deleteAllMarkets,
  deleteMarket,
  deleteMarketsWithTag,
  getMarket,
  listMarkets,
  reopenMarket,
  requoteMarket,
  saveReview,
  setNotificationId,
  settleBinary,
  settleNumber,
  updateMarket,
  voidMarket,
} from '@/db/markets';
import { getReminderSettings, saveReminderSettings } from '@/db/settings';
import type { MarketInput, NewMarketInput, QuoteInput, ReminderSettings } from '@/db/types';

import type { Backup } from './backup-format';
import { DEMO_TAG, generateDemoMarkets, toQuoteInput } from './demo-data';
import { cancelReminder, scheduleReminder } from './reminders';

/*
 * Database writes that also keep reminders in sync. Screens call these rather
 * than the raw queries. A reminder failure never blocks the write itself.
 */

/** `askPermission` is false for bulk re-syncs, which must not show the permission prompt. */
async function syncReminder(db: SQLiteDatabase, id: number, askPermission = true): Promise<void> {
  try {
    const market = await getMarket(db, id);
    if (!market) return;
    await cancelReminder(market.notificationId);
    let notificationId: string | null = null;
    if (market.status === 'open') {
      notificationId = await scheduleReminder(market, await getReminderSettings(db), new Date(), { askPermission });
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

/**
 * Re-creates every reminder, e.g. after the reminder time changes or data is
 * imported. Never shows the permission prompt; Settings asks when reminders
 * are turned on, and saving a market asks the first time.
 */
export async function syncAllReminders(db: SQLiteDatabase): Promise<void> {
  const markets = await listMarkets(db);
  for (const market of markets) {
    if (market.status === 'open' || market.notificationId) await syncReminder(db, market.id, false);
  }
}

export async function saveReminderSettingsAction(db: SQLiteDatabase, settings: ReminderSettings): Promise<void> {
  await saveReminderSettings(db, settings);
  await syncAllReminders(db);
}

/** Replaces all data with a validated backup, then rebuilds reminders. Returns the number of markets imported. */
export async function importBackupAction(db: SQLiteDatabase, backup: Backup): Promise<number> {
  const { imported, staleReminderIds } = await replaceAllData(db, backup);
  await Promise.all(staleReminderIds.map(cancelReminder));
  await syncAllReminders(db);
  return imported;
}

/**
 * Adds the demo markets through the normal database functions (each runs its
 * own transaction, so they're called one after another rather than wrapped in
 * another), then schedules reminders for the open ones. Screens refresh once,
 * at the end. Returns the number added.
 */
export async function loadDemoDataAction(db: SQLiteDatabase, now: Date = new Date()): Promise<number> {
  const markets = generateDemoMarkets(now);
  await batchDataChanges(async () => {
    for (const market of markets) {
      const [first, ...requotes] = market.quotes;
      const id = await createMarket(
        db,
        {
          isDecision: market.isDecision,
          question: market.question,
          unit: market.unit,
          reasoning: market.reasoning,
          successCriteria: market.successCriteria,
          options: market.options,
          chosenOption: market.chosenOption,
          resolveBy: market.resolveBy,
          tags: market.tags,
          quote: toQuoteInput(market.kind, first),
        },
        new Date(market.createdAt),
      );
      for (const quote of requotes) {
        await requoteMarket(db, id, toQuoteInput(market.kind, quote), quote.note, new Date(quote.createdAt));
      }
      const settledAt = market.settledAt ? new Date(market.settledAt) : now;
      if (market.status === 'settled' && market.kind === 'binary' && market.outcome !== null) {
        await settleBinary(db, id, market.outcome, settledAt);
      } else if (market.status === 'settled' && market.kind === 'number' && market.settledValue !== null) {
        await settleNumber(db, id, market.settledValue, settledAt);
      } else if (market.status === 'void') {
        await voidMarket(db, id, settledAt);
      }
      if (market.postmortem || market.decisionQuality !== null) {
        await saveReview(db, id, { postmortem: market.postmortem, decisionQuality: market.decisionQuality });
      }
    }
    await syncAllReminders(db);
  });
  return markets.length;
}

export async function removeDemoDataAction(db: SQLiteDatabase): Promise<void> {
  await deleteMarketsWithTagAction(db, DEMO_TAG);
}
