import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatRating, ratingColor, textColorOn } from '@/lib/rating-view';

import { useRating } from './rating-provider';

/** The 0–100 rating, top right on every screen, shaded red → orange → green. Tapping it opens the Rating screen. */
export function RatingBadge() {
  const theme = useTheme();
  const state = useRating();
  const pathname = usePathname();
  const overall = state?.rating.overall ?? null;
  const background = overall === null ? theme.backgroundElement : ratingColor(overall);
  const foreground = overall === null ? theme.textSecondary : textColorOn(background);
  const onRatingScreen = pathname === '/rating';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        state === undefined
          ? 'Rating loading. Open rating details'
          : overall === null
            ? 'Rating: nothing settled yet. Open rating details'
            : `Rating ${formatRating(overall)} out of 100. Open rating details`
      }
      disabled={onRatingScreen}
      hitSlop={8}
      onPress={() => router.push('/rating')}
      style={({ pressed }) => [styles.badge, { backgroundColor: background, opacity: pressed ? 0.75 : 1 }]}>
      <Text style={[styles.label, { color: foreground }]}>{overall === null ? '—' : formatRating(overall)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 44,
    height: 32,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: 800,
    fontVariant: ['tabular-nums'],
  },
});
