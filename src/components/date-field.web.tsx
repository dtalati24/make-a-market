import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dueLabel, isValidDateString } from '@/lib/dates';

import { DatePresets } from './date-presets';
import { ThemedText } from './themed-text';

// The native date picker has no web implementation; use the browser's.
export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (date: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <ThemedText type="caption" themeColor="textSecondary">
        {label}
      </ThemedText>
      <DatePresets value={value} onChange={onChange} />
      <View style={styles.row}>
        <input
          type="date"
          aria-label={label}
          value={value}
          onChange={(event) => {
            if (isValidDateString(event.target.value)) onChange(event.target.value);
          }}
          style={{
            minHeight: 46,
            padding: '0 12px',
            borderRadius: 12,
            border: `1px solid ${theme.border}`,
            background: theme.card,
            color: theme.text,
            fontSize: 16,
            colorScheme: 'light dark',
          }}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {dueLabel(value)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
