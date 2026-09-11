import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isValidTimeString } from '@/lib/dates';

import { ThemedText } from './themed-text';

// The native time picker has no web implementation; use the browser's.
export function TimeField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  /** "HH:MM", 24-hour. */
  value: string;
  onChange: (time: string) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <ThemedText type="smallBold" style={styles.flex}>
        {label}
      </ThemedText>
      <input
        type="time"
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          // Some browsers add seconds ("09:00:00"); the app stores HH:MM.
          const time = event.target.value.slice(0, 5);
          if (isValidTimeString(time)) onChange(time);
        }}
        style={{
          minHeight: 40,
          padding: '0 12px',
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          background: theme.backgroundElement,
          color: theme.text,
          fontSize: 16,
          colorScheme: 'light dark',
          opacity: disabled ? 0.4 : 1,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  flex: {
    flex: 1,
  },
});
