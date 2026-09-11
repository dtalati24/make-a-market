import { ScrollScreen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

export default function SettingsScreen() {
  return (
    <ScrollScreen safeTop>
      <ThemedText type="title">Settings</ThemedText>
    </ScrollScreen>
  );
}
