import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.container, { backgroundColor: theme.backgroundElement }, style]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              selected && { backgroundColor: theme.card, borderColor: theme.border },
            ]}>
            <Text
              numberOfLines={1}
              style={[styles.label, { color: selected ? theme.text : theme.textSecondary }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: Radius.medium,
    padding: 3,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.medium - 3,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: Spacing.two,
  },
  label: {
    fontSize: 14,
    fontWeight: 700,
  },
});
