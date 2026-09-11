import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { TrendChart } from '@/components/charts/trend-chart';
import { EmptyState } from '@/components/empty-state';
import { useRating } from '@/components/rating-provider';
import { ScrollScreen } from '@/components/screen';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPoints } from '@/lib/format';
import { formatChange, formatRating, ratingColor, textColorOn } from '@/lib/rating-view';
import { MIN_GAIN, PRIOR_MEAN, PRIOR_WEIGHT, type KindRating } from '@/scoring';

function Caption({ children }: { children: string }) {
  return (
    <ThemedText type="caption" themeColor="textSecondary">
      {children}
    </ThemedText>
  );
}

function Note({ children }: { children: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {children}
    </ThemedText>
  );
}

function countMarkets(n: number): string {
  return `${n} settled market${n === 1 ? '' : 's'}`;
}

export default function RatingScreen() {
  const theme = useTheme();
  const state = useRating();

  if (state === undefined) {
    return (
      <ScrollScreen>
        <ActivityIndicator color={theme.tint} />
      </ScrollScreen>
    );
  }

  const { rating, markets } = state;
  if (rating.overall === null) {
    return (
      <ScrollScreen>
        <EmptyState
          title="No rating yet"
          message="Settle a market and your 0–100 rating shows up here and in the top-right corner of every screen."
        />
        <HowItWorks />
      </ScrollScreen>
    );
  }

  const background = ratingColor(rating.overall);
  const questions = new Map(markets.map((market) => [market.id, market.question]));
  const recent = rating.history.slice(-10).reverse();
  const trend = rating.history.map((step, index) => ({ index, value: step.after }));

  return (
    <ScrollScreen>
      <Card style={styles.hero}>
        <View
          accessible
          accessibilityLabel={`Your rating: ${formatRating(rating.overall)} out of 100`}
          style={[styles.circle, { backgroundColor: background }]}>
          <ThemedText style={[styles.bigNumber, { color: textColorOn(background) }]}>
            {formatRating(rating.overall)}
          </ThemedText>
        </View>
        <ThemedText type="subtitle">Your rating</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
          {`Out of 100 · ±${Math.round(rating.margin ?? 0)} · based on ${countMarkets(rating.binary.n + rating.number.n)}`}
        </ThemedText>
      </Card>

      <StatGrid>
        <KindTile label="Yes/No rating" kind={rating.binary} />
        <KindTile label="Number rating" kind={rating.number} />
      </StatGrid>

      {trend.length >= 2 ? (
        <Card>
          <Caption>Over time</Caption>
          <TrendChart
            points={trend}
            formatValue={(value) => value.toFixed(0)}
            label="Rating"
            reference={PRIOR_MEAN}
            referenceLabel="start"
          />
        </Card>
      ) : null}

      <Card>
        <Caption>Recent markets</Caption>
        {recent.map((step) => (
          <Pressable
            key={step.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/market/[id]', params: { id: String(step.id) } })}
            style={({ pressed }) => [styles.recentRow, { opacity: pressed ? 0.6 : 1 }]}>
            <ThemedText type="small" numberOfLines={1} style={styles.flex}>
              {questions.get(step.id) ?? 'Market'}
            </ThemedText>
            <ThemedText type="smallBold" style={styles.score}>
              {formatPoints(step.score)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.change}>
              {step.before === null ? 'first' : formatChange(step.after - step.before)}
            </ThemedText>
          </Pressable>
        ))}
        <Note>Each market’s score, and how much it moved your rating.</Note>
      </Card>

      <HowItWorks />
    </ScrollScreen>
  );
}

function KindTile({ label, kind }: { label: string; kind: KindRating }) {
  if (kind.n === 0) return <StatTile label={label} value="—" caption="nothing settled yet" />;
  return (
    <StatTile
      label={label}
      value={formatPoints(kind.rating)}
      caption={`±${Math.round(kind.margin)} · ${countMarkets(kind.n)} · avg score ${formatPoints(kind.averageScore ?? 0)}`}
    />
  );
}

function HowItWorks() {
  const first = `1/${Math.round(1 + PRIOR_WEIGHT)}`;
  const floor = `1/${Math.round(1 / MIN_GAIN)}`;
  return (
    <Card>
      <Caption>How it works</Caption>
      <Note>
        Each settled market gets a score. Yes/No: 100 − 200 × Brier, so a 50% quote scores 50, a perfect call 100, and
        a confident wrong call can go below 0. Number: 0 if the answer lands outside your quote; inside, 100 ÷ (1 +
        (3.33 × width ÷ answer)²), so the narrower your quote compared with the answer, the higher.
      </Note>
      <Note>
        {`Your Yes/No and Number ratings start at ${PRIOR_MEAN} and move towards each new score: ${first} of the way for your first market, less as you settle more, but never less than ${floor}, so they follow your recent form.`}
      </Note>
      <Note>
        The overall rating averages the two, giving each kind more weight the more markets it has, and stays between 0
        and 100. The ± shows how sure the app is so far.
      </Note>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  circle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigNumber: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: 800,
    fontVariant: ['tabular-nums'],
  },
  centerText: {
    textAlign: 'center',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  flex: {
    flex: 1,
  },
  score: {
    width: 44,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  change: {
    width: 48,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
