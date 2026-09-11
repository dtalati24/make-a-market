import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import type { Market, MarketInput, MarketKind, QuoteInput } from '@/db/types';
import { normalizeMarketInput, validateQuote, ValidationError } from '@/db/validation';
import { useTheme } from '@/hooks/use-theme';
import { presetDate } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { parseNumberInput } from '@/lib/format';

import { Button } from './button';
import { Card } from './card';
import { DateField } from './date-field';
import { Icon } from './icon';
import { NumberQuoteInput } from './number-quote-input';
import { PricePicker } from './price-picker';
import { Segmented } from './segmented';
import { TagInput } from './tag-input';
import { TextField } from './text-field';
import { ThemedText } from './themed-text';

export type MarketFormValues = {
  input: MarketInput;
  /** Null when the form isn't allowed to change the quote (edit after a re-quote). */
  quote: QuoteInput | null;
};

const KIND_OPTIONS = [
  { value: 'binary', label: 'Yes / No' },
  { value: 'number', label: 'Number' },
] as const;

/** Shared by New market and Edit market. */
export function MarketForm({
  initial,
  allowKindChange,
  allowQuoteEdit,
  tagSuggestions,
  submitLabel,
  onSubmit,
}: {
  initial?: Market;
  allowKindChange: boolean;
  allowQuoteEdit: boolean;
  tagSuggestions: readonly string[];
  submitLabel: string;
  onSubmit: (values: MarketFormValues) => Promise<void>;
}) {
  const theme = useTheme();
  const [kind, setKind] = useState<MarketKind>(initial?.kind ?? 'binary');
  const [isDecision, setIsDecision] = useState(initial?.isDecision ?? false);
  const [question, setQuestion] = useState(initial?.question ?? '');
  const [unit, setUnit] = useState(initial?.unit ?? '');
  const [price, setPrice] = useState(
    initial?.initialPrice !== null && initial?.initialPrice !== undefined ? Math.round(initial.initialPrice * 100) : 50,
  );
  const [bid, setBid] = useState(initial?.initialBid !== null && initial?.initialBid !== undefined ? String(initial.initialBid) : '');
  const [ask, setAsk] = useState(initial?.initialAsk !== null && initial?.initialAsk !== undefined ? String(initial.initialAsk) : '');
  const [options, setOptions] = useState<string[]>(
    initial && initial.options.length >= 2 ? initial.options : ['', ''],
  );
  const [chosenIndex, setChosenIndex] = useState(() => {
    const index = initial?.chosenOption ? initial.options.indexOf(initial.chosenOption) : -1;
    return index >= 0 ? index : 0;
  });
  const [successCriteria, setSuccessCriteria] = useState(initial?.successCriteria ?? '');
  const [resolveBy, setResolveBy] = useState(initial?.resolveBy ?? presetDate('1m'));
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [reasoning, setReasoning] = useState(initial?.reasoning ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A ref as well as state, so a fast double tap can't save the market twice.
  const submittingRef = useRef(false);

  const decision = kind === 'binary' && isDecision;
  const showQuote = !initial || allowQuoteEdit;

  function buildQuote(): QuoteInput {
    if (kind === 'binary') return { kind: 'binary', price: price / 100 };
    const bidValue = parseNumberInput(bid);
    const askValue = parseNumberInput(ask);
    if (bidValue === null || askValue === null) throw new ValidationError('Enter your bid and ask as numbers.');
    return { kind: 'number', bid: bidValue, ask: askValue };
  }

  async function submit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    try {
      const quote = showQuote ? buildQuote() : null;
      if (quote) validateQuote(quote);
      const input: MarketInput = {
        isDecision: decision,
        question,
        unit,
        reasoning,
        successCriteria,
        options,
        chosenOption: options[chosenIndex] ?? null,
        resolveBy,
        tags: [...tags, ...tagDraft.split(',')],
      };
      // Validate here for a friendly message; the database layer checks again.
      normalizeMarketInput(input, kind);
      setSaving(true);
      await onSubmit({ input, quote });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  function removeOption(index: number) {
    setOptions((current) => current.filter((_, i) => i !== index));
    setChosenIndex((chosen) => (chosen === index ? 0 : chosen > index ? chosen - 1 : chosen));
  }

  const questionLabel = decision ? 'What are you deciding?' : kind === 'binary' ? 'Question' : 'What are you estimating?';
  const questionPlaceholder = decision
    ? 'e.g. Take the Acme offer over staying'
    : kind === 'binary'
      ? 'e.g. Will I get the offer by Oct 31?'
      : 'e.g. Hours of deep work this week';

  return (
    <View style={styles.container}>
      {allowKindChange ? (
        <Segmented options={KIND_OPTIONS} value={kind} onChange={setKind} />
      ) : null}

      <TextField
        label={questionLabel}
        value={question}
        onChangeText={setQuestion}
        placeholder={questionPlaceholder}
        multiline
      />

      {kind === 'binary' ? (
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <ThemedText type="smallBold">This is a decision</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Record your options and the one you chose, then price whether it works out.
            </ThemedText>
          </View>
          <Switch
            accessibilityLabel="This is a decision"
            value={isDecision}
            onValueChange={setIsDecision}
            trackColor={{ true: theme.tint, false: theme.backgroundSelected }}
            thumbColor={theme.card}
          />
        </View>
      ) : (
        <TextField label="Unit (optional)" value={unit} onChangeText={setUnit} placeholder="e.g. hours" autoCapitalize="none" />
      )}

      {decision ? (
        <Card>
          <ThemedText type="caption" themeColor="textSecondary">
            Options — tap the one you chose
          </ThemedText>
          {options.map((option, index) => (
            <View key={index} style={styles.optionRow}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: chosenIndex === index }}
                accessibilityLabel={`Chose option ${index + 1}`}
                onPress={() => setChosenIndex(index)}
                hitSlop={8}
                style={[styles.radio, { borderColor: chosenIndex === index ? theme.tint : theme.textSecondary }]}>
                {chosenIndex === index ? <View style={[styles.radioDot, { backgroundColor: theme.tint }]} /> : null}
              </Pressable>
              <TextField
                value={option}
                onChangeText={(text) => setOptions((current) => current.map((o, i) => (i === index ? text : o)))}
                placeholder={`Option ${index + 1}`}
                style={styles.flex}
              />
              {options.length > 2 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove option ${index + 1}`}
                  onPress={() => removeOption(index)}
                  hitSlop={8}>
                  <Icon name="close" color={theme.textSecondary} />
                </Pressable>
              ) : null}
            </View>
          ))}
          <Button title="+ Add option" variant="ghost" small onPress={() => setOptions((current) => [...current, ''])} />
          <TextField
            label="What does “worked out” mean?"
            value={successCriteria}
            onChangeText={setSuccessCriteria}
            placeholder="e.g. Still happy with the move in 6 months"
            multiline
          />
        </Card>
      ) : null}

      {showQuote ? (
        <Card>
          <ThemedText type="caption" themeColor="textSecondary">
            {initial ? 'Starting quote' : 'Your quote'}
          </ThemedText>
          {kind === 'binary' ? (
            <PricePicker
              value={price}
              onChange={setPrice}
              caption={decision ? 'chance it works out' : 'chance of YES'}
            />
          ) : (
            <NumberQuoteInput bid={bid} ask={ask} onChangeBid={setBid} onChangeAsk={setAsk} />
          )}
        </Card>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          The starting quote is locked once a market has been re-quoted or settled.
        </ThemedText>
      )}

      <DateField label="Settle by" value={resolveBy} onChange={setResolveBy} />

      <TagInput value={tags} onChange={setTags} draft={tagDraft} onDraftChange={setTagDraft} suggestions={tagSuggestions} />

      <TextField
        label="Reasoning (optional)"
        value={reasoning}
        onChangeText={setReasoning}
        placeholder="Why this quote? What would change your mind?"
        multiline
      />

      {error ? (
        <ThemedText type="smallBold" style={{ color: theme.ask }}>
          {error}
        </ThemedText>
      ) : null}
      <Button title={saving ? 'Saving…' : submitLabel} onPress={submit} disabled={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.four,
  },
  flex: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: Radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: Radius.pill,
  },
});
