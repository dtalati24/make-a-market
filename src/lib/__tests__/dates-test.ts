import {
  daysUntil,
  dueLabel,
  formatTime,
  isValidDateString,
  isValidTimeString,
  parseLocalDate,
  presetDate,
  relativeDays,
  reminderMoment,
  toDateString,
} from '../dates';

describe('isValidDateString', () => {
  it('accepts real dates', () => {
    expect(isValidDateString('2026-02-28')).toBe(true);
    expect(isValidDateString('2024-02-29')).toBe(true);
  });

  it('rejects impossible or badly formatted dates', () => {
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('2025-02-29')).toBe(false);
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('2026-2-3')).toBe(false);
    expect(isValidDateString('')).toBe(false);
  });
});

describe('isValidTimeString', () => {
  it('accepts HH:MM in 24-hour time', () => {
    expect(isValidTimeString('09:05')).toBe(true);
    expect(isValidTimeString('23:59')).toBe(true);
    expect(isValidTimeString('00:00')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isValidTimeString('24:00')).toBe(false);
    expect(isValidTimeString('9:05')).toBe(false);
    expect(isValidTimeString('09:60')).toBe(false);
  });
});

describe('parseLocalDate / toDateString', () => {
  it('parses as local midnight and round-trips', () => {
    const date = parseLocalDate('2026-09-11');
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 8, 11, 0]);
    expect(toDateString(date)).toBe('2026-09-11');
  });

  it('throws on invalid input', () => {
    expect(() => parseLocalDate('2026-02-30')).toThrow(RangeError);
  });
});

describe('presetDate', () => {
  const afternoon = new Date(2026, 8, 11, 15, 30);

  it('adds calendar periods to today', () => {
    expect(presetDate('1w', afternoon)).toBe('2026-09-18');
    expect(presetDate('1m', afternoon)).toBe('2026-10-11');
    expect(presetDate('3m', afternoon)).toBe('2026-12-11');
    expect(presetDate('6m', afternoon)).toBe('2027-03-11');
    expect(presetDate('1y', afternoon)).toBe('2027-09-11');
  });

  it('clamps to the end of shorter months', () => {
    expect(presetDate('1m', new Date(2026, 0, 31))).toBe('2026-02-28');
    expect(presetDate('1y', new Date(2024, 1, 29))).toBe('2025-02-28');
  });
});

describe('daysUntil / dueLabel', () => {
  const now = new Date(2026, 8, 11, 23, 59);

  it('counts calendar days regardless of time of day', () => {
    expect(daysUntil('2026-09-16', now)).toBe(5);
    expect(daysUntil('2026-09-11', now)).toBe(0);
    expect(daysUntil('2026-09-08', now)).toBe(-3);
  });

  it('labels due dates', () => {
    expect(dueLabel('2026-09-11', now)).toBe('due today');
    expect(dueLabel('2026-09-16', now)).toBe('in 5d');
    expect(dueLabel('2026-09-24', now)).toBe('in 13d');
    expect(dueLabel('2026-09-25', now)).toBe('Sep 25');
    expect(dueLabel('2027-01-05', now)).toBe('Jan 5, 2027');
    expect(dueLabel('2026-09-08', now)).toBe('3d overdue');
  });
});

describe('relativeDays', () => {
  const now = new Date(2026, 8, 11, 8, 0);

  it('describes the gap in whole days', () => {
    expect(relativeDays('2026-09-11', now)).toBe('today');
    expect(relativeDays('2026-09-12', now)).toBe('tomorrow');
    expect(relativeDays('2026-10-11', now)).toBe('in 30 days');
    expect(relativeDays('2026-09-10', now)).toBe('1 day overdue');
    expect(relativeDays('2026-09-08', now)).toBe('3 days overdue');
  });
});

describe('reminderMoment', () => {
  it('combines the date with the reminder time in local time', () => {
    expect(reminderMoment('2026-09-20', '09:30').getTime()).toBe(new Date(2026, 8, 20, 9, 30).getTime());
  });

  it('rejects bad times', () => {
    expect(() => reminderMoment('2026-09-20', '9:30')).toThrow(RangeError);
  });
});

describe('formatTime', () => {
  it('formats 24-hour time for display', () => {
    expect(formatTime('09:05')).toBe('9:05 AM');
    expect(formatTime('21:00')).toBe('9:00 PM');
    expect(formatTime('00:00')).toBe('12:00 AM');
  });
});
