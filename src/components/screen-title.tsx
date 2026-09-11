import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';

import { RatingBadge } from './rating-badge';
import { ThemedText } from './themed-text';

/** A tab screen's large title, with optional actions and the rating badge on the right. */
export function ScreenTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View style={styles.row}>
      <ThemedText type="title" numberOfLines={1} style={styles.title}>
        {title}
      </ThemedText>
      {children}
      <RatingBadge />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    flex: 1,
  },
});
