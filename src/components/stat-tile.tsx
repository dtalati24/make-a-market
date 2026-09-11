import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

/** A headline number with a label above and an optional one-line explanation below. */
export function StatTile({ label, value, caption }: { label: string; value: string; caption?: string }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}${caption ? `, ${caption}` : ''}`}
      style={[styles.tile, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </ThemedText>
      {caption ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
          {caption}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** Lays StatTiles out two per row. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '40%',
    borderWidth: 1,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  value: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
});
