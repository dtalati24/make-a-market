import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPercent } from '@/lib/format';

type Segment = { key: 'below' | 'inside' | 'above'; label: string; share: number; color: string };

/** Where Number answers landed relative to the quote: a stacked bar of below / inside / above shares. */
export function LandingBar({ below, inside, above }: { below: number; inside: number; above: number }) {
  const theme = useTheme();
  const segments: Segment[] = [
    { key: 'below', label: 'Below bid', share: below, color: theme.ask },
    { key: 'inside', label: 'Inside', share: inside, color: theme.bid },
    { key: 'above', label: 'Above ask', share: above, color: theme.warning },
  ];
  const summary = `Where the answer landed: ${segments
    .map((s) => `${s.label.toLowerCase()} ${formatPercent(s.share)}`)
    .join(', ')}.`;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary} style={styles.container}>
      <View style={[styles.bar, { backgroundColor: theme.backgroundElement }]}>
        {segments.map((s) =>
          s.share > 0 ? <View key={s.key} style={{ flex: s.share, backgroundColor: s.color }} /> : null,
        )}
      </View>
      <View style={styles.legend}>
        {segments.map((s, i) => (
          <View key={s.key} style={[styles.legendItem, i === 1 && styles.center, i === 2 && styles.end]}>
            <View style={styles.legendTitle}>
              <View style={[styles.swatch, { backgroundColor: s.color }]} />
              <ThemedText type="small" themeColor="textSecondary">
                {s.label}
              </ThemedText>
            </View>
            <ThemedText type="smallBold">{formatPercent(s.share)}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  bar: {
    flexDirection: 'row',
    height: 22,
    borderRadius: Radius.small,
    overflow: 'hidden',
  },
  legend: {
    flexDirection: 'row',
    marginTop: Spacing.one,
  },
  legendItem: {
    flex: 1,
    alignItems: 'flex-start',
  },
  center: {
    alignItems: 'center',
  },
  end: {
    alignItems: 'flex-end',
  },
  legendTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
