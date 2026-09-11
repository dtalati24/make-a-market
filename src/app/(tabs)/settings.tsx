import Constants from 'expo-constants';
import { useSQLiteContext } from 'expo-sqlite';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ScrollScreen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { TimeField } from '@/components/time-field';
import { Spacing } from '@/constants/theme';
import { exportData } from '@/db/backup';
import { listMarkets } from '@/db/markets';
import { getReminderSettings, getThemePreference, saveThemePreference } from '@/db/settings';
import type { ReminderSettings, ThemePreference } from '@/db/types';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteAllMarketsAction,
  importBackupAction,
  loadDemoDataAction,
  removeDemoDataAction,
  saveReminderSettingsAction,
} from '@/lib/actions';
import { buildBackup, buildCsv, CSV_BOM, parseBackup, serializeBackup } from '@/lib/backup-format';
import { pickTextFile, shareTextFile } from '@/lib/backup-io';
import { confirm, showMessage } from '@/lib/confirm';
import { formatTime, todayString } from '@/lib/dates';
import { DEMO_TAG } from '@/lib/demo-data';
import { errorMessage } from '@/lib/errors';
import { ensureReminderPermission } from '@/lib/reminders';

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function countMarkets(n: number): string {
  return `${n} market${n === 1 ? '' : 's'}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <ThemedText type="caption" themeColor="textSecondary">
        {title}
      </ThemedText>
      {children}
    </Card>
  );
}

function Note({ children }: { children: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {children}
    </ThemedText>
  );
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { data: settings } = useQuery(getReminderSettings, []);
  const { data: markets } = useQuery(listMarkets, []);
  const { data: themePreference } = useQuery(getThemePreference, []);
  /** What's running right now (e.g. "export"), so buttons can't be pressed twice. */
  const [busy, setBusy] = useState<string | null>(null);
  /** The reminder settings being saved, shown straight away instead of waiting for the save. */
  const [pendingReminders, setPendingReminders] = useState<ReminderSettings | null>(null);

  if (settings === undefined || markets === undefined || themePreference === undefined) {
    return (
      <ScrollScreen safeTop>
        <ScreenTitle title="Settings" />
        <ActivityIndicator color={theme.tint} />
      </ScrollScreen>
    );
  }

  const reminders = pendingReminders ?? settings;
  const demoCount = markets.filter((m) => m.tags.some((t) => t.toLowerCase() === DEMO_TAG)).length;
  const version = Constants.expoConfig?.version ?? '1.0.0';

  /** Runs one action at a time and shows any error; `failure` completes "Couldn’t …". */
  async function run(label: string, failure: string, work: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    try {
      await work();
    } catch (error) {
      showMessage(`Couldn’t ${failure}`, errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function updateReminders(next: ReminderSettings) {
    if (busy) return;
    setPendingReminders(next);
    run('reminders', 'update reminders', async () => {
      try {
        const turningOn = next.enabled && !reminders.enabled;
        if (turningOn && Platform.OS !== 'web' && !(await ensureReminderPermission())) {
          showMessage(
            'Notifications are off',
            'Allow notifications for Make a Market in your phone’s settings to get settle-by reminders.',
          );
        }
        await saveReminderSettingsAction(db, next);
      } finally {
        setPendingReminders(null);
      }
    });
  }

  function exportJson() {
    run('export', 'export the backup', async () => {
      const data = await exportData(db);
      const backup = buildBackup(data.markets, data.quotesByMarket, data.settings, new Date());
      await shareTextFile(`make-a-market-backup-${todayString()}.json`, serializeBackup(backup), 'application/json');
    });
  }

  function exportCsv() {
    run('csv', 'export the spreadsheet', async () => {
      const all = await listMarkets(db);
      await shareTextFile(`make-a-market-${todayString()}.csv`, CSV_BOM + buildCsv(all), 'text/csv');
    });
  }

  function importJson() {
    run('import', 'import the backup', async () => {
      const text = await pickTextFile();
      if (text === null) return;
      const backup = parseBackup(text);
      const current = (await listMarkets(db)).length;
      const ok = await confirm({
        title: 'Replace all data?',
        message: `Your ${countMarkets(current)} will be replaced by the ${countMarkets(backup.markets.length)} in this backup, and its reminder settings will be restored. This can’t be undone.`,
        confirmLabel: 'Replace',
        destructive: true,
      });
      if (!ok) return;
      const imported = await importBackupAction(db, backup);
      showMessage('Backup restored', `Imported ${countMarkets(imported)}.`);
    });
  }

  function loadDemo() {
    run('demo', 'load the demo data', async () => {
      const added = await loadDemoDataAction(db);
      showMessage(
        'Demo data added',
        `Added ${countMarkets(added)} tagged #${DEMO_TAG}. Have a look at Stats, then remove them here when you’re done.`,
      );
    });
  }

  function removeDemo() {
    run('demo', 'remove the demo data', async () => {
      const ok = await confirm({
        title: 'Remove demo data?',
        message: `Deletes the ${countMarkets(demoCount)} tagged #${DEMO_TAG}, including any of your own markets with that tag.`,
        confirmLabel: 'Remove',
        destructive: true,
      });
      if (ok) await removeDemoDataAction(db);
    });
  }

  function deleteAll() {
    run('delete', 'delete your markets', async () => {
      const ok = await confirm({
        title: 'Delete all markets?',
        message: `Deletes all ${countMarkets(markets?.length ?? 0)}, with their quotes and tags. Settings are kept. Export a backup first if you might want them back — this can’t be undone.`,
        confirmLabel: 'Delete all',
        destructive: true,
      });
      if (ok) await deleteAllMarketsAction(db);
    });
  }

  return (
    <ScrollScreen safeTop>
      <ScreenTitle title="Settings" />

      <Section title="Appearance">
        <Segmented
          options={THEME_OPTIONS}
          value={themePreference}
          onChange={(value) => {
            run('theme', 'change the appearance', () => saveThemePreference(db, value));
          }}
        />
        <Note>System follows your phone’s light or dark setting.</Note>
      </Section>

      <Section title="Reminders">
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <ThemedText type="smallBold">Remind me to settle</ThemedText>
            <Note>{`One notification on each open market’s settle-by date, at ${formatTime(reminders.time)}.`}</Note>
          </View>
          <Switch
            accessibilityLabel="Settle-by reminders"
            value={reminders.enabled}
            disabled={busy !== null}
            onValueChange={(enabled) => updateReminders({ ...reminders, enabled })}
            trackColor={{ false: theme.border, true: theme.tint }}
            thumbColor={Platform.OS === 'android' ? theme.card : undefined}
          />
        </View>
        <TimeField
          label="Reminder time"
          value={reminders.time}
          disabled={!reminders.enabled || busy !== null}
          onChange={(time) => {
            if (time !== reminders.time) updateReminders({ ...reminders, time });
          }}
        />
        {Platform.OS === 'web' ? <Note>Reminders only work in the Android app.</Note> : null}
      </Section>

      <Section title="Backup">
        <Note>
          Your markets are stored only on this phone, and uninstalling the app deletes them. Export a backup to keep
          them safe or move them to a new phone.
        </Note>
        <Button title="Export backup (JSON)" variant="secondary" disabled={busy !== null} onPress={exportJson} />
        <Button title="Export spreadsheet (CSV)" variant="secondary" disabled={busy !== null} onPress={exportCsv} />
        <Button title="Import backup…" variant="secondary" disabled={busy !== null} onPress={importJson} />
        <Note>Importing replaces everything in the app with the backup’s markets and reminder settings.</Note>
      </Section>

      <Section title="Demo data">
        {demoCount > 0 ? (
          <>
            <Note>{`${countMarkets(demoCount)} tagged #${DEMO_TAG}.`}</Note>
            <Button title="Remove demo data" variant="secondary" disabled={busy !== null} onPress={removeDemo} />
          </>
        ) : (
          <>
            <Note>
              Adds about 60 sample markets of both kinds, most of them settled, so you can see what Stats looks like.
              They’re tagged #demo and can be removed in one tap.
            </Note>
            <Button title="Load demo data" variant="secondary" disabled={busy !== null} onPress={loadDemo} />
          </>
        )}
      </Section>

      <Section title="Danger zone">
        <Button
          title="Delete all markets"
          variant="danger"
          disabled={busy !== null || markets.length === 0}
          onPress={deleteAll}
        />
      </Section>

      <Section title="About">
        <ThemedText type="smallBold">{`Make a Market ${version}`}</ThemedText>
        <Note>
          Yes/No markets score 100 − 200 × Brier on your starting price, where the Brier score is (price − outcome)²:
          a 50% quote scores 50 and a perfect call 100.
        </Note>
        <Note>
          Number markets score 0 if the answer lands outside your quote. If it lands inside, they score 100 ÷ (1 +
          (3.33 × width ÷ answer)²): close to 100 for a very narrow quote, and 50 when the width is 30% of the answer.
        </Note>
        <Note>Tap the rating in the top-right corner to see how your overall 0–100 rating is worked out.</Note>
      </Section>

      {busy !== null ? <ActivityIndicator color={theme.tint} /> : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  flex: {
    flex: 1,
    gap: Spacing.half,
  },
});
