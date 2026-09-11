import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { normalizeTags } from '@/db/validation';
import { errorMessage } from '@/lib/errors';

import { Chip } from './chip';
import { TextField } from './text-field';
import { ThemedText } from './themed-text';

/**
 * Selected tags as removable chips, a box to type new ones (comma or return
 * adds them) and existing tags to tap. `draft` is lifted so a half-typed tag
 * is still saved when the form is submitted.
 */
export function TagInput({
  value,
  onChange,
  draft,
  onDraftChange,
  suggestions,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  draft: string;
  onDraftChange: (text: string) => void;
  suggestions: readonly string[];
}) {
  const [error, setError] = useState<string | null>(null);

  function add(text: string) {
    try {
      onChange(normalizeTags([...value, ...text.split(',')]));
      onDraftChange('');
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const selected = new Set(value.map((tag) => tag.toLowerCase()));
  const available = suggestions.filter((tag) => !selected.has(tag.toLowerCase())).slice(0, 12);

  return (
    <View style={styles.container}>
      <ThemedText type="caption" themeColor="textSecondary">
        Tags
      </ThemedText>
      {value.length > 0 ? (
        <View style={styles.wrap}>
          {value.map((tag) => (
            <Chip
              key={tag}
              label={`${tag}  ✕`}
              selected
              onPress={() => onChange(value.filter((t) => t !== tag))}
            />
          ))}
        </View>
      ) : null}
      <TextField
        value={draft}
        onChangeText={(text) => (text.endsWith(',') ? add(text) : onDraftChange(text))}
        onSubmitEditing={() => add(draft)}
        placeholder="Add a tag, e.g. career"
        returnKeyType="done"
        autoCapitalize="none"
        error={error}
      />
      {available.length > 0 ? (
        <View style={styles.wrap}>
          {available.map((tag) => (
            <Chip key={tag} label={`+ ${tag}`} onPress={() => add(tag)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
