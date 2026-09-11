import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';

import { Button } from './button';
import { ThemedText } from './themed-text';

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.container}>
      <ThemedText type="subtitle" style={styles.center}>
        {title}
      </ThemedText>
      {message ? (
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {message}
        </ThemedText>
      ) : null}
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} style={styles.button} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  center: {
    textAlign: 'center',
  },
  button: {
    marginTop: Spacing.two,
    alignSelf: 'center',
  },
});
