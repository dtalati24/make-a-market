import type { SQLiteDatabase } from 'expo-sqlite';

import { isValidTimeString } from '@/lib/dates';

import { notifyDataChanged } from './events';
import { transaction } from './transaction';
import type { ReminderSettings, ThemePreference } from './types';
import { ValidationError } from './validation';

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { enabled: true, time: '09:00' };
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

const KEYS = {
  remindersEnabled: 'reminders_enabled',
  reminderTime: 'reminder_time',
  theme: 'theme',
} as const;

/** A stored theme value, or 'system' when it's missing or unrecognised. */
export function parseThemePreference(value: string | undefined): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export async function getThemePreference(db: SQLiteDatabase): Promise<ThemePreference> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', KEYS.theme);
  return parseThemePreference(row?.value);
}

export async function saveThemePreference(db: SQLiteDatabase, preference: ThemePreference): Promise<void> {
  if (!THEME_PREFERENCES.includes(preference)) throw new ValidationError('Pick System, Light or Dark.');
  await writeSetting(db, KEYS.theme, preference);
  notifyDataChanged();
}

async function readSettings(db: SQLiteDatabase): Promise<Map<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  return new Map(rows.map((row) => [row.key, row.value]));
}

async function writeSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export async function getReminderSettings(db: SQLiteDatabase): Promise<ReminderSettings> {
  const settings = await readSettings(db);
  const enabled = settings.get(KEYS.remindersEnabled);
  const time = settings.get(KEYS.reminderTime);
  return {
    enabled: enabled === undefined ? DEFAULT_REMINDER_SETTINGS.enabled : enabled === '1',
    time: time && isValidTimeString(time) ? time : DEFAULT_REMINDER_SETTINGS.time,
  };
}

export async function saveReminderSettings(db: SQLiteDatabase, settings: ReminderSettings): Promise<void> {
  if (!isValidTimeString(settings.time)) throw new ValidationError('Pick a valid reminder time.');
  await transaction(db, async () => {
    await writeSetting(db, KEYS.remindersEnabled, settings.enabled ? '1' : '0');
    await writeSetting(db, KEYS.reminderTime, settings.time);
  });
  notifyDataChanged();
}
