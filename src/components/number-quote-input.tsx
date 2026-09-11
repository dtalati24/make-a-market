import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { validateNumberQuote, ValidationError } from '@/db/validation';
import { useTheme } from '@/hooks/use-theme';
import { parseNumberInput } from '@/lib/format';
import { spreadPoints } from '@/scoring';

import { TextField } from './text-field';
import { ThemedText } from './themed-text';

/** Live feedback on a bid/ask pair as typed. */
function describeQuote(bidText: string, askText: string): { text: string; error: boolean } | null {
  const bid = parseNumberInput(bidText);
  const ask = parseNumberInput(askText);
  if ((bidText.trim() && bid === null) || (askText.trim() && ask === null)) {
    return { text: 'Enter plain numbers, e.g. 18 or 2.5.', error: true };
  }
  if (bid === null || ask === null) return null;
  try {
    validateNumberQuote(bid, ask);
  } catch (error) {
    return { text: error instanceof ValidationError ? error.message : 'Invalid quote.', error: true };
  }
  const spread = Math.round(spreadPoints(bid, ask));
  return { text: `Spread ${spread} pts (about ${spread}% wide)`, error: false };
}

export function NumberQuoteInput({
  bid,
  ask,
  onChangeBid,
  onChangeAsk,
}: {
  bid: string;
  ask: string;
  onChangeBid: (text: string) => void;
  onChangeAsk: (text: string) => void;
}) {
  const theme = useTheme();
  const feedback = describeQuote(bid, ask);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <TextField
          label="Bid (low)"
          value={bid}
          onChangeText={onChangeBid}
          placeholder="e.g. 18"
          keyboardType="decimal-pad"
          style={styles.field}
        />
        <ThemedText type="subtitle" themeColor="textSecondary" style={styles.at}>
          @
        </ThemedText>
        <TextField
          label="Ask (high)"
          value={ask}
          onChangeText={onChangeAsk}
          placeholder="e.g. 24"
          keyboardType="decimal-pad"
          style={styles.field}
        />
      </View>
      {feedback ? (
        <ThemedText type="smallBold" style={{ color: feedback.error ? theme.ask : theme.text }}>
          {feedback.text}
        </ThemedText>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary">
        Aim for a range you’re 50% sure will contain the answer. You always pay the spread; if the answer lands
        outside, you also pay 4× how far it missed.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  field: {
    flex: 1,
  },
  at: {
    paddingBottom: Spacing.two + 2,
  },
});
