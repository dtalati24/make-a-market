import { useEffect, type ReactNode } from 'react';
import { Appearance, Platform } from 'react-native';

import { getThemePreference } from '@/db/settings';
import { ColorSchemeOverride } from '@/hooks/use-color-scheme';
import { useQuery } from '@/hooks/use-query';

/**
 * Applies the System / Light / Dark choice from Settings. Screens read it through
 * useColorScheme(); on Android it's also handed to the OS so native pieces (the tab bar,
 * date and time pickers) match.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { data, error } = useQuery(getThemePreference, []);
  // If the setting can't be read, just follow the phone.
  const preference = data ?? (error ? 'system' : undefined);

  useEffect(() => {
    if (preference === undefined || Platform.OS === 'web') return;
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);

  // Wait for the saved choice so the app doesn't flash the wrong theme.
  if (preference === undefined) return null;
  return <ColorSchemeOverride value={preference === 'system' ? null : preference}>{children}</ColorSchemeOverride>;
}
