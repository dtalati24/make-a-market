import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { DATE_PRESETS, presetDate } from '@/lib/dates';

import { Chip } from './chip';

/** Quick picks (1 week … 1 year from today). */
export function DatePresets({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  return (
    <View style={styles.row}>
      {DATE_PRESETS.map((preset) => {
        const date = presetDate(preset.key);
        return (
          <Chip key={preset.key} label={preset.label} selected={value === date} onPress={() => onChange(date)} />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
