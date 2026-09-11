import { parseThemePreference, THEME_PREFERENCES } from '../settings';

describe('parseThemePreference', () => {
  it('keeps light and dark, and falls back to system', () => {
    expect(THEME_PREFERENCES).toEqual(['system', 'light', 'dark']);
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('dark')).toBe('dark');
    expect(parseThemePreference('system')).toBe('system');
    expect(parseThemePreference(undefined)).toBe('system');
    expect(parseThemePreference('blue')).toBe('system');
  });
});
