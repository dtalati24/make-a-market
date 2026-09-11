import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Scrollable page body with consistent padding, centred on wide (web) screens. */
export function ScrollScreen({ children, safeTop = false }: { children: ReactNode; safeTop?: boolean }) {
  const theme = useTheme();
  const body = (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.scrollContent}
      style={{ backgroundColor: theme.background }}>
      <View style={styles.column}>{children}</View>
    </ScrollView>
  );
  if (!safeTop) return body;
  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: theme.background }]}>
      {body}
    </SafeAreaView>
  );
}

/** Non-scrolling page (for screens that host their own list). */
export function FixedScreen({ children, safeTop = false }: { children: ReactNode; safeTop?: boolean }) {
  const theme = useTheme();
  return (
    <SafeAreaView
      edges={safeTop ? ['top'] : []}
      style={[styles.fill, { backgroundColor: theme.background }]}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.three,
    paddingBottom: Spacing.six * 2,
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
  },
});
