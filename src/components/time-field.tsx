import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatTime } from '@/lib/dates';

import { ThemedText } from './themed-text';

/** "HH:MM" → today at that time (the picker needs a Date). */
function timeToDate(time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function dateToTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** A labelled time-of-day row. Android opens the system clock dialog; iOS shows an inline picker. */
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
  const [inlineOpen, setInlineOpen] = useState(false);

  function openPicker() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: timeToDate(value),
        mode: 'time',
        is24Hour: false,
        onValueChange: (_event, date) => onChange(dateToTime(date)),
      });
    } else {
      setInlineOpen((open) => !open);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <ThemedText type="smallBold" style={styles.flex}>
          {label}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${formatTime(value)}. Change time`}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={openPicker}
          style={({ pressed }) => [
            styles.field,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
              opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
            },
          ]}>
          <ThemedText>{formatTime(value)}</ThemedText>
        </Pressable>
      </View>
      {inlineOpen && Platform.OS !== 'android' ? (
        <DateTimePicker
          value={timeToDate(value)}
          mode="time"
          display="spinner"
          onValueChange={(_event, date) => onChange(dateToTime(date))}
        />
      ) : null}
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
  flex: {
    flex: 1,
  },
  field: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
