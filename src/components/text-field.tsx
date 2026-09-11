import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  hint?: string;
  error?: string | null;
  style?: StyleProp<ViewStyle>;
};

export function TextField({ label, hint, error, style, multiline, ...inputProps }: TextFieldProps) {
  const theme = useTheme();
  return (
    <View style={[styles.container, style]}>
      {label ? (
        <ThemedText type="caption" themeColor="textSecondary">
          {label}
        </ThemedText>
      ) : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.textSecondary}
        multiline={multiline}
        style={[
          styles.input,
          multiline && styles.multiline,
          { backgroundColor: theme.card, borderColor: error ? theme.ask : theme.border, color: theme.text },
        ]}
        {...inputProps}
      />
      {error ? (
        <ThemedText type="small" style={{ color: theme.ask }}>
          {error}
        </ThemedText>
      ) : hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one + 2,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: 'top',
    paddingTop: Spacing.two + 2,
  },
});
