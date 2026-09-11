import Slider from '@react-native-community/slider';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Chip } from './chip';
import { Icon, type IconName } from './icon';
import { ThemedText } from './themed-text';

const QUICK_PRICES = [10, 25, 50, 75, 90];

/** Picks a Yes/No price as a whole number from 1 to 99. */
export function PricePicker({
  value,
  onChange,
  caption,
}: {
  value: number;
  onChange: (value: number) => void;
  /** e.g. "chance of YES" */
  caption: string;
}) {
  const theme = useTheme();
  const set = (next: number) => onChange(Math.min(99, Math.max(1, Math.round(next))));

  return (
    <View style={styles.container}>
      <View style={styles.readout}>
        <StepButton icon="minus" label="Lower by 1" disabled={value <= 1} onPress={() => set(value - 1)} />
        <View style={styles.center}>
          <ThemedText type="number">{value}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {value}% {caption}
          </ThemedText>
        </View>
        <StepButton icon="plus" label="Raise by 1" disabled={value >= 99} onPress={() => set(value + 1)} />
      </View>
      <Slider
        accessibilityLabel="Price"
        minimumValue={1}
        maximumValue={99}
        step={1}
        value={value}
        onValueChange={set}
        minimumTrackTintColor={theme.tint}
        maximumTrackTintColor={theme.border}
        thumbTintColor={theme.tint}
        style={styles.slider}
      />
      <View style={styles.quick}>
        {QUICK_PRICES.map((price) => (
          <Chip key={price} label={String(price)} selected={value === price} onPress={() => set(price)} />
        ))}
      </View>
    </View>
  );
}

function StepButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.step,
        { backgroundColor: theme.backgroundElement, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}>
      <Icon name={icon} color={theme.text} size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  center: {
    alignItems: 'center',
  },
  step: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slider: {
    height: 40,
  },
  quick: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
