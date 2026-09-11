import { addMonths, addWeeks, addYears, differenceInCalendarDays, format } from 'date-fns';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isValidDateString(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isValidTimeString(value: string): boolean {
  return TIME_RE.test(value);
}

/** Parses YYYY-MM-DD as local midnight (new Date('YYYY-MM-DD') would use UTC). */
export function parseLocalDate(value: string): Date {
  if (!isValidDateString(value)) throw new RangeError(`Invalid date: ${value}`);
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function toDateString(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function todayString(now: Date = new Date()): string {
  return toDateString(now);
}

export type DatePreset = '1w' | '1m' | '3m' | '6m' | '1y';

export const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: '1w', label: '1 week' },
  { key: '1m', label: '1 month' },
  { key: '3m', label: '3 months' },
  { key: '6m', label: '6 months' },
  { key: '1y', label: '1 year' },
];

export function presetDate(preset: DatePreset, now: Date = new Date()): string {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case '1w':
      return toDateString(addWeeks(base, 1));
    case '1m':
      return toDateString(addMonths(base, 1));
    case '3m':
      return toDateString(addMonths(base, 3));
    case '6m':
      return toDateString(addMonths(base, 6));
    case '1y':
      return toDateString(addYears(base, 1));
  }
}

/** Whole days from today until the date (negative when overdue). */
export function daysUntil(dateString: string, now: Date = new Date()): number {
  return differenceInCalendarDays(parseLocalDate(dateString), now);
}

/** "due today", "in 5d", "Oct 31", "3d overdue". */
export function dueLabel(dateString: string, now: Date = new Date()): string {
  const days = daysUntil(dateString, now);
  if (days === 0) return 'due today';
  if (days < 0) return `${-days}d overdue`;
  if (days < 14) return `in ${days}d`;
  const date = parseLocalDate(dateString);
  return date.getFullYear() === now.getFullYear() ? format(date, 'MMM d') : format(date, 'MMM d, yyyy');
}

/** "today", "tomorrow", "in 30 days", "1 day overdue", "3 days overdue". */
export function relativeDays(dateString: string, now: Date = new Date()): string {
  const days = daysUntil(dateString, now);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1) return `in ${days} days`;
  return days === -1 ? '1 day overdue' : `${-days} days overdue`;
}

export function formatDate(dateString: string): string {
  return format(parseLocalDate(dateString), 'MMM d, yyyy');
}

export function formatDateTime(iso: string): string {
  return format(new Date(iso), 'MMM d, yyyy');
}

/** The local moment a reminder for this settle-by date should fire. */
export function reminderMoment(dateString: string, time: string): Date {
  if (!isValidTimeString(time)) throw new RangeError(`Invalid time: ${time}`);
  const date = parseLocalDate(dateString);
  const [hours, minutes] = time.split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  return format(new Date(2000, 0, 1, hours, minutes), 'h:mm a');
}
