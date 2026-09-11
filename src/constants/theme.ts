import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0B1220',
    textSecondary: '#5B6475',
    background: '#F6F7F9',
    card: '#FFFFFF',
    backgroundElement: '#EEF0F4',
    backgroundSelected: '#DDE3EE',
    border: '#E2E5EB',
    tint: '#2F6BFF',
    onTint: '#FFFFFF',
    bid: '#16A34A',
    ask: '#DC2626',
    warning: '#B45309',
  },
  dark: {
    text: '#F2F4F8',
    textSecondary: '#9AA3B2',
    background: '#0B0F17',
    card: '#151A24',
    backgroundElement: '#1C2230',
    backgroundSelected: '#273044',
    border: '#262D3B',
    tint: '#5B8CFF',
    onTint: '#FFFFFF',
    bid: '#22C55E',
    ask: '#F05252',
    warning: '#F59E0B',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type Palette = { [K in ThemeColor]: string };

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 8,
  medium: 12,
  large: 16,
  pill: 999,
} as const;

export const MaxContentWidth = 720;
