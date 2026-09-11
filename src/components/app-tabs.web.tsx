import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// The web build is only a preview of the Android app, so this mimics a
// bottom tab bar rather than a website header.
export default function AppTabs() {
  const theme = useTheme();
  return (
    <Tabs style={{ flex: 1 }}>
      <TabSlot style={{ flex: 1 }} />
      <TabList style={[styles.bar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        <TabTrigger name="index" href="/" asChild>
          <TabButton>Markets</TabButton>
        </TabTrigger>
        <TabTrigger name="stats" href="/stats" asChild>
          <TabButton>Stats</TabButton>
        </TabTrigger>
        <TabTrigger name="settings" href="/settings" asChild>
          <TabButton>Settings</TabButton>
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const theme = useTheme();
  return (
    <Pressable {...props} style={styles.button}>
      <View style={[styles.pill, isFocused && { backgroundColor: theme.backgroundSelected }]}>
        <Text style={[styles.label, { color: isFocused ? theme.text : theme.textSecondary }]}>{children}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: Spacing.two,
  },
  button: {
    flex: 1,
    alignItems: 'center',
  },
  pill: {
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.four,
    borderRadius: 999,
  },
  label: {
    fontSize: 14,
    fontWeight: 700,
  },
});
