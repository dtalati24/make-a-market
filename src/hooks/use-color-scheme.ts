import { createContext, useContext } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

/** The Light / Dark choice from Settings; null means follow the phone. */
export const ColorSchemeOverride = createContext<'light' | 'dark' | null>(null);

/** 'light' or 'dark': the choice made in Settings, otherwise the phone's setting. */
export function useColorScheme(): 'light' | 'dark' {
  const override = useContext(ColorSchemeOverride);
  const system = useSystemColorScheme();
  return override ?? (system === 'dark' ? 'dark' : 'light');
}
