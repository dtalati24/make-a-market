// Notifications aren't available on web; the web build is only used for
// previewing the UI, so reminders are silently skipped there.
import type { Market, ReminderSettings } from '@/db/types';

export const REMINDER_CHANNEL_ID = 'reminders';

export function configureReminderHandling(): void {}

export async function ensureReminderPermission(): Promise<boolean> {
  return false;
}

export async function scheduleReminder(
  _market: Pick<Market, 'id' | 'question' | 'resolveBy'>,
  _settings: ReminderSettings,
  _now: Date = new Date(),
  _options: { askPermission?: boolean } = {},
): Promise<string | null> {
  return null;
}

export async function cancelReminder(_notificationId: string | null): Promise<void> {}

export function useReminderTaps(): void {}
