import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  color,
  disabled = false,
  small = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** Overrides the background of a primary button (e.g. green YES / red NO). */
  color?: string;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const background = {
    primary: color ?? theme.tint,
    secondary: theme.backgroundElement,
    danger: theme.ask,
    ghost: 'transparent',
  }[variant];
  const foreground = {
    primary: theme.onTint,
    secondary: theme.text,
    danger: theme.onTint,
    ghost: color ?? theme.tint,
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        { backgroundColor: background, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        style,
      ]}>
      <Text style={[styles.label, small && styles.smallLabel, { color: foreground }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.small,
  },
  label: {
    fontSize: 16,
    fontWeight: 700,
  },
  smallLabel: {
    fontSize: 14,
  },
});
