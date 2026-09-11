import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import type { Market, ReminderSettings } from '@/db/types';

import { reminderMoment } from './dates';

export const REMINDER_CHANNEL_ID = 'reminders';

/** Show reminders as banners even while the app is open. Call once at startup. */
export function configureReminderHandling(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'Settle reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Asks for notification permission unless the user has refused for good. */
export async function ensureReminderPermission(): Promise<boolean> {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/** Whether reminders can be shown, without asking. */
async function hasReminderPermission(): Promise<boolean> {
  await ensureChannel();
  return (await Notifications.getPermissionsAsync()).granted;
}

/**
 * Schedules the settle-by reminder for a market. Returns the notification id,
 * or null when reminders are off, the moment has passed, or permission is denied.
 * With `askPermission: false` (bulk re-syncs) it only checks permission, so the
 * system prompt never appears several times in a row.
 */
export async function scheduleReminder(
  market: Pick<Market, 'id' | 'question' | 'resolveBy'>,
  settings: ReminderSettings,
  now: Date = new Date(),
  options: { askPermission?: boolean } = {},
): Promise<string | null> {
  if (!settings.enabled) return null;
  const when = reminderMoment(market.resolveBy, settings.time);
  if (when.getTime() <= now.getTime()) return null;
  const allowed = options.askPermission === false ? await hasReminderPermission() : await ensureReminderPermission();
  if (!allowed) return null;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Time to settle a market',
      body: market.question,
      data: { url: `/market/${market.id}` },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId: REMINDER_CHANNEL_ID,
    },
  });
}

/** Cancels a scheduled reminder, and clears it from the notification tray if it has already fired. */
export async function cancelReminder(notificationId: string | null): Promise<void> {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    // Already fired or cleared by the OS — nothing to cancel.
    console.warn('Could not cancel reminder', error);
  }
  try {
    await Notifications.dismissNotificationAsync(notificationId);
  } catch {
    // Not in the tray — nothing to clear.
  }
}

function openFromNotification(notification: Notifications.Notification): void {
  const url = notification.request.content.data?.url;
  if (typeof url === 'string' && /^\/market\/\d+$/.test(url)) {
    router.push(url as Href);
  }
}

/** Opens the market when the user taps its reminder (including a cold start). */
export function useReminderTaps(): void {
  useEffect(() => {
    let active = true;
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!active || !response) return;
      openFromNotification(response.notification);
      // Otherwise the same tap would re-open the market on every launch.
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    });
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      openFromNotification(response.notification);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
}
