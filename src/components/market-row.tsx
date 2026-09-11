import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { Market } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { dueLabel, formatDateTime, parseLocalDate } from '@/lib/dates';
import { currentQuote, initialQuote, marketScore, outcomeLabel, scoreLabel } from '@/lib/market-view';

import { Card } from './card';
import { ThemedText } from './themed-text';

/** `today` ("YYYY-MM-DD", from useToday) is passed in so due labels refresh at midnight. */
export function MarketRow({ market, today, onPress }: { market: Market; today: string; onPress: () => void }) {
  const theme = useTheme();
  const open = market.status === 'open';
  const score = marketScore(market);
  const meta = [market.isDecision ? 'Decision' : null, ...market.tags].filter(Boolean).join(' · ');

  let when: string;
  let whenColor: string = theme.textSecondary;
  if (open) {
    when = dueLabel(market.resolveBy, parseLocalDate(today));
    if (market.resolveBy <= today) whenColor = theme.warning;
  } else {
    when = market.settledAt ? formatDateTime(market.settledAt) : '';
  }

  return (
    <Card onPress={onPress} style={styles.row}>
      <View style={styles.main}>
        <ThemedText numberOfLines={2}>{market.question}</ThemedText>
        <ThemedText type="small" numberOfLines={1}>
          <ThemedText type="small" style={{ color: whenColor }}>
            {when}
          </ThemedText>
          {meta ? (
            <ThemedText type="small" themeColor="textSecondary">
              {when ? ' · ' : ''}
              {meta}
            </ThemedText>
          ) : null}
        </ThemedText>
      </View>
      <View style={styles.side}>
        {open ? (
          <>
            <ThemedText type="subtitle" style={styles.quote}>
              {currentQuote(market)}
            </ThemedText>
            {market.unit ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {market.unit}
              </ThemedText>
            ) : null}
          </>
        ) : (
          <>
            <ThemedText
              type="smallBold"
              numberOfLines={1}
              style={{ color: score ? (score.good ? theme.bid : theme.ask) : theme.textSecondary }}>
              {outcomeLabel(market)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {score ? scoreLabel(score) : initialQuote(market)}
            </ThemedText>
          </>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  main: {
    flex: 1,
    gap: Spacing.one,
  },
  side: {
    alignItems: 'flex-end',
    maxWidth: '40%',
  },
  quote: {
    fontVariant: ['tabular-nums'],
  },
});
