import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dueLabel, formatDate, parseLocalDate, toDateString } from '@/lib/dates';

import { DatePresets } from './date-presets';
import { ThemedText } from './themed-text';

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  /** YYYY-MM-DD */
  value: string;
  onChange: (date: string) => void;
}) {
  const theme = useTheme();
  const [inlineOpen, setInlineOpen] = useState(false);

  function openPicker() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: parseLocalDate(value),
        mode: 'date',
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange(toDateString(date));
        },
      });
    } else {
      setInlineOpen((open) => !open);
    }
  }

  return (
    <View style={styles.container}>
      <ThemedText type="caption" themeColor="textSecondary">
        {label}
      </ThemedText>
      <DatePresets value={value} onChange={onChange} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatDate(value)}. Change date`}
        onPress={openPicker}
        style={({ pressed }) => [
          styles.field,
          { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
        ]}>
        <ThemedText>{formatDate(value)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {dueLabel(value)} · change
        </ThemedText>
      </Pressable>
      {inlineOpen && Platform.OS !== 'android' ? (
        <DateTimePicker
          value={parseLocalDate(value)}
          mode="date"
          display="inline"
          onChange={(_event, date) => {
            if (date) onChange(toDateString(date));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three - 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
