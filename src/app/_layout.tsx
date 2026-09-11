import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppearanceProvider } from '@/components/appearance-provider';
import { RatingBadge } from '@/components/rating-badge';
import { RatingProvider } from '@/components/rating-provider';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { DATABASE_NAME, migrateDatabase } from '@/db/schema';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { configureReminderHandling, useReminderTaps } from '@/lib/reminders';

configureReminderHandling();

// Screens opened directly (e.g. from a reminder) still get the tabs underneath,
// so Back returns to Markets instead of leaving the app.
export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const [databaseError, setDatabaseError] = useState<Error | null>(null);
  // SQLiteProvider reports errors while rendering, so defer the state update.
  const handleDatabaseError = useCallback((error: Error) => {
    setTimeout(() => setDatabaseError(error), 0);
  }, []);

  if (databaseError) return <DatabaseError error={databaseError} />;

  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDatabase} onError={handleDatabaseError}>
      <AppearanceProvider>
        <AppShell />
      </AppearanceProvider>
    </SQLiteProvider>
  );
}

function AppShell() {
  const dark = useColorScheme() === 'dark';
  const colors = Colors[dark ? 'dark' : 'light'];
  const base = dark ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.tint,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <RatingProvider>
        <RootStack />
      </RatingProvider>
      <StatusBar style={dark ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

function DatabaseError({ error }: { error: Error }) {
  const colors = Colors[useColorScheme()];
  return (
    <View style={[styles.error, { backgroundColor: colors.background }]}>
      <ThemedText type="subtitle">Couldn’t open your markets</ThemedText>
      <ThemedText themeColor="textSecondary">
        Your data is still on this phone — please don’t uninstall the app. Try closing and reopening it.
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {error.message}
      </ThemedText>
    </View>
  );
}

function RootStack() {
  useReminderTaps();
  return (
    <Stack screenOptions={{ headerShadowVisible: false, headerRight: () => <RatingBadge /> }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Markets' }} />
      <Stack.Screen name="new" options={{ presentation: 'modal', title: 'New market' }} />
      <Stack.Screen name="market/[id]/index" options={{ title: 'Market' }} />
      <Stack.Screen name="market/[id]/edit" options={{ presentation: 'modal', title: 'Edit market' }} />
      <Stack.Screen name="rating" options={{ title: 'Rating' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  error: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
});
