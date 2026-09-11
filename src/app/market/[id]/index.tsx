import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { QuoteHistoryChart } from '@/components/charts/quote-history-chart';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { NumberQuoteInput } from '@/components/number-quote-input';
import { PricePicker } from '@/components/price-picker';
import { useRating } from '@/components/rating-provider';
import { ScrollScreen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { getMarket, getQuotes, requoteMarket, saveReview } from '@/db/markets';
import type { Market, Quote, QuoteInput } from '@/db/types';
import { ValidationError } from '@/db/validation';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { useToday } from '@/hooks/use-today';
import {
  deleteMarketAction,
  reopenMarketAction,
  settleBinaryAction,
  settleNumberAction,
  voidMarketAction,
} from '@/lib/actions';
import { confirm, showMessage } from '@/lib/confirm';
import { formatDate, formatDateTime, parseLocalDate, relativeDays } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { goBack } from '@/lib/navigation';
import { formatNumber, formatPoints, formatPrice, parseNumberInput } from '@/lib/format';
import {
  currentQuote,
  formatBinaryQuote,
  formatNumberQuote,
  initialQuote,
  marketScore,
  noLabel,
  numberScoreAt,
  outcomeLabel,
  positionPhrase,
  wasRequoted,
  withUnit,
  yesLabel,
} from '@/lib/market-view';
import { formatChange, formatRating } from '@/lib/rating-view';
import { quoteWidthShare, WIDTH_K } from '@/scoring';

function Caption({ children }: { children: string }) {
  return (
    <ThemedText type="caption" themeColor="textSecondary">
      {children}
    </ThemedText>
  );
}

function screenTitle(market: Market): string {
  if (market.isDecision) return 'Decision';
  return market.kind === 'binary' ? 'Yes/No market' : 'Number market';
}

function statusLine(market: Market, today: string): string {
  if (market.status === 'open') {
    return `Settle by ${formatDate(market.resolveBy)} · ${relativeDays(market.resolveBy, parseLocalDate(today))}`;
  }
  const when = market.settledAt ? formatDateTime(market.settledAt) : '';
  return `${market.status === 'void' ? 'Voided' : 'Settled'} ${when} · made ${formatDateTime(market.createdAt)}`;
}

function caption(market: Market): string {
  return market.isDecision ? 'chance it works out' : 'chance of YES';
}

export default function MarketScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const db = useSQLiteContext();
  const theme = useTheme();
  const { data: market } = useQuery((database) => getMarket(database, id), [id]);
  const [deleting, setDeleting] = useState(false);
  const today = useToday();

  if (market === undefined || deleting) {
    return (
      <ScrollScreen>
        <ActivityIndicator />
      </ScrollScreen>
    );
  }
  if (market === null) {
    return (
      <ScrollScreen>
        <EmptyState title="Market not found" message="It may have been deleted." />
      </ScrollScreen>
    );
  }

  async function remove() {
    const ok = await confirm({
      title: 'Delete this market?',
      message: 'Its quotes and result are deleted too. This can’t be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteMarketAction(db, id);
      goBack();
    } catch (error) {
      setDeleting(false);
      showMessage('Couldn’t delete', errorMessage(error));
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: screenTitle(market) }} />
      <ScrollScreen>
        <View style={styles.header}>
          <ThemedText type="subtitle">{market.question}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {statusLine(market, today)}
          </ThemedText>
          {market.tags.length > 0 ? (
            <View style={styles.wrap}>
              {market.tags.map((tag) => (
                <Chip key={tag} label={`#${tag}`} />
              ))}
            </View>
          ) : null}
        </View>

        <QuoteCard market={market} />
        {market.status === 'open' ? <RequoteCard market={market} /> : null}
        <QuoteHistoryCard market={market} />
        {market.isDecision ? <DecisionCard market={market} /> : null}
        {market.reasoning ? (
          <Card>
            <Caption>Reasoning</Caption>
            <ThemedText>{market.reasoning}</ThemedText>
          </Card>
        ) : null}

        {market.status === 'open' ? (
          market.kind === 'binary' ? (
            <SettleBinaryCard market={market} />
          ) : (
            <SettleNumberCard market={market} />
          )
        ) : (
          <>
            <ResultCard market={market} />
            <ReviewCard key={market.id} market={market} />
          </>
        )}

        <View style={styles.row}>
          <Button
            title="Edit"
            variant="secondary"
            onPress={() => router.push({ pathname: '/market/[id]/edit', params: { id: String(id) } })}
            style={styles.flex}
          />
          <Button title="Delete" variant="ghost" color={theme.ask} onPress={remove} style={styles.flex} />
        </View>
      </ScrollScreen>
    </>
  );
}

function QuoteCard({ market }: { market: Market }) {
  const open = market.status === 'open';
  const requoted = wasRequoted(market);
  const shown = open ? currentQuote(market) : initialQuote(market);

  let note: string;
  if (market.kind === 'binary') {
    note = `${formatPrice(open ? market.price! : market.initialPrice!)}% ${caption(market)}`;
  } else {
    const bid = open ? market.bid! : market.initialBid!;
    const ask = open ? market.ask! : market.initialAsk!;
    note = `Width ${formatNumber(ask - bid)} · ${Math.round(quoteWidthShare(bid, ask) * 100)}% of the midpoint${market.unit ? ` · ${market.unit}` : ''}`;
  }

  return (
    <Card>
      <Caption>{open ? 'Your quote' : 'Your starting quote'}</Caption>
      <ThemedText type="number" numberOfLines={1} adjustsFontSizeToFit>
        {shown}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {note}
      </ThemedText>
      {requoted ? (
        <ThemedText type="small" themeColor="textSecondary">
          {open
            ? `Started at ${initialQuote(market)}. The starting quote is the one that gets scored.`
            : `Your final quote was ${currentQuote(market)}.`}
        </ThemedText>
      ) : null}
    </Card>
  );
}

function RequoteCard({ market }: { market: Market }) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(50);
  const [bid, setBid] = useState('');
  const [ask, setAsk] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A ref as well as state, so a fast double tap can't save the quote twice.
  const savingRef = useRef(false);

  function start() {
    setPrice(Math.round((market.price ?? 0.5) * 100));
    setBid(market.bid === null ? '' : String(market.bid));
    setAsk(market.ask === null ? '' : String(market.ask));
    setNote('');
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      let quote: QuoteInput;
      if (market.kind === 'binary') {
        quote = { kind: 'binary', price: price / 100 };
      } else {
        const bidValue = parseNumberInput(bid);
        const askValue = parseNumberInput(ask);
        if (bidValue === null || askValue === null) throw new ValidationError('Enter your bid and ask as numbers.');
        quote = { kind: 'number', bid: bidValue, ask: askValue };
      }
      await requoteMarket(db, market.id, quote, note);
      setEditing(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!editing) return <Button title="Re-quote" variant="secondary" onPress={start} />;

  return (
    <Card>
      <Caption>Re-quote</Caption>
      <ThemedText type="small" themeColor="textSecondary">
        Changed your mind? Record a new quote. Your starting quote is still the one that’s scored.
      </ThemedText>
      {market.kind === 'binary' ? (
        <PricePicker value={price} onChange={setPrice} caption={caption(market)} />
      ) : (
        <NumberQuoteInput bid={bid} ask={ask} onChangeBid={setBid} onChangeAsk={setAsk} />
      )}
      <TextField
        label="What changed? (optional)"
        value={note}
        onChangeText={setNote}
        placeholder="e.g. Heard back from the recruiter"
        multiline
      />
      {error ? (
        <ThemedText type="smallBold" style={{ color: theme.ask }}>
          {error}
        </ThemedText>
      ) : null}
      <View style={styles.row}>
        <Button title="Cancel" variant="secondary" onPress={() => setEditing(false)} style={styles.flex} />
        <Button title="Save quote" onPress={save} disabled={saving} style={styles.flex} />
      </View>
    </Card>
  );
}

function quoteText(kind: Market['kind'], quote: Quote): string {
  return kind === 'binary' ? formatBinaryQuote(quote.price ?? 0) : formatNumberQuote(quote.bid ?? 0, quote.ask ?? 0);
}

function QuoteHistoryCard({ market }: { market: Market }) {
  const { data: quotes } = useQuery((database) => getQuotes(database, market.id), [market.id]);
  if (!quotes || quotes.length < 2) return null;

  let settleLevel: number | null = null;
  if (market.status === 'settled') {
    settleLevel = market.kind === 'binary' ? (market.outcome ?? 0) * 100 : market.settledValue;
  }

  return (
    <Card>
      <Caption>Quote history</Caption>
      <QuoteHistoryChart kind={market.kind} quotes={quotes} settleLevel={settleLevel} />
      {quotes.map((quote, index) => (
        <View key={quote.id} style={styles.historyRow}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.historyDate}>
            {formatDateTime(quote.createdAt)}
          </ThemedText>
          <ThemedText type="smallBold" style={styles.historyQuote}>
            {quoteText(market.kind, quote)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            {index === 0 ? 'Starting quote' : quote.note || '—'}
          </ThemedText>
        </View>
      ))}
    </Card>
  );
}

function DecisionCard({ market }: { market: Market }) {
  return (
    <Card>
      <Caption>Options</Caption>
      {market.options.map((option) => {
        const chosen = option === market.chosenOption;
        return (
          <ThemedText key={option} type={chosen ? 'smallBold' : 'small'} themeColor={chosen ? 'text' : 'textSecondary'}>
            {chosen ? `✓ ${option} (chosen)` : `   ${option}`}
          </ThemedText>
        );
      })}
      {market.successCriteria ? (
        <>
          <Caption>“Worked out” means</Caption>
          <ThemedText>{market.successCriteria}</ThemedText>
        </>
      ) : null}
    </Card>
  );
}

function VoidButton({ market }: { market: Market }) {
  const db = useSQLiteContext();
  async function voidIt() {
    const ok = await confirm({
      title: 'Void this market?',
      message: 'Use this when the question can’t be settled. Void markets aren’t scored.',
      confirmLabel: 'Void',
    });
    if (!ok) return;
    try {
      await voidMarketAction(db, market.id);
    } catch (error) {
      showMessage('Couldn’t void', errorMessage(error));
    }
  }
  return <Button title="Void — can’t be settled" variant="ghost" small onPress={voidIt} />;
}

function SettleBinaryCard({ market }: { market: Market }) {
  const db = useSQLiteContext();
  const theme = useTheme();

  async function settle(outcome: 0 | 1) {
    const label = outcome === 1 ? yesLabel(market) : noLabel(market);
    const ok = await confirm({
      title: `Settle: ${label}?`,
      message: 'You can reopen it later if you got it wrong.',
      confirmLabel: 'Settle',
    });
    if (!ok) return;
    try {
      await settleBinaryAction(db, market.id, outcome);
    } catch (error) {
      showMessage('Couldn’t settle', errorMessage(error));
    }
  }

  return (
    <Card>
      <Caption>Settle</Caption>
      <ThemedText>{market.isDecision ? 'Did it work out?' : 'What happened?'}</ThemedText>
      <View style={styles.row}>
        <Button title={yesLabel(market)} color={theme.bid} onPress={() => settle(1)} style={styles.flex} />
        <Button title={noLabel(market)} color={theme.ask} onPress={() => settle(0)} style={styles.flex} />
      </View>
      <VoidButton market={market} />
    </Card>
  );
}

function SettleNumberCard({ market }: { market: Market }) {
  const db = useSQLiteContext();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function settle() {
    const value = parseNumberInput(text);
    if (value === null) {
      setError('Enter the real value as a number.');
      return;
    }
    if (value < 0) {
      setError('The value can’t be negative.');
      return;
    }
    setError(null);
    const result = numberScoreAt(market, value);
    const ok = await confirm({
      title: `Settle at ${withUnit(value, market.unit)}?`,
      message:
        result.position === 'inside'
          ? `That’s inside your quote, for a score of ${formatPoints(result.score)} out of 100.`
          : `That’s ${positionPhrase(result.position)}, so it scores 0.`,
      confirmLabel: 'Settle',
    });
    if (!ok) return;
    try {
      await settleNumberAction(db, market.id, value);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card>
      <Caption>Settle</Caption>
      <TextField
        label={market.unit ? `Real value (${market.unit})` : 'Real value'}
        value={text}
        onChangeText={setText}
        placeholder="What did it come in at?"
        keyboardType="decimal-pad"
        error={error}
      />
      <Button title="Settle" onPress={settle} />
      <VoidButton market={market} />
    </Card>
  );
}

function ResultCard({ market }: { market: Market }) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const score = marketScore(market);
  const movement = useRating()?.rating.history.find((step) => step.id === market.id) ?? null;

  async function reopen() {
    const ok = await confirm({
      title: 'Reopen this market?',
      message: 'Its result and score are cleared until you settle it again.',
      confirmLabel: 'Reopen',
    });
    if (!ok) return;
    try {
      await reopenMarketAction(db, market.id);
    } catch (error) {
      showMessage('Couldn’t reopen', errorMessage(error));
    }
  }

  return (
    <Card>
      <Caption>Result</Caption>
      <ThemedText type="subtitle" style={{ color: score ? (score.good ? theme.bid : theme.ask) : theme.text }}>
        {outcomeLabel(market)}
      </ThemedText>
      {market.status === 'void' ? (
        <ThemedText type="small" themeColor="textSecondary">
          Void markets aren’t scored.
        </ThemedText>
      ) : null}
      {score?.kind === 'binary' ? (
        <>
          <ThemedText type="smallBold">{`Score ${formatPoints(score.points)} / 100`}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {`Brier (${market.initialPrice!.toFixed(2)} − ${market.outcome})² = ${score.brier.toFixed(3)}, so the score is 100 − 200 × ${score.brier.toFixed(3)} = ${formatPoints(score.points)}. A 50% quote scores 50.`}
          </ThemedText>
        </>
      ) : null}
      {score?.kind === 'number' ? (
        <>
          <ThemedText type="smallBold">{`Score ${formatPoints(score.points)} / 100`}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {score.result.position === 'inside'
              ? `It landed inside your quote: 100 ÷ (1 + (${WIDTH_K.toFixed(2)} × ${formatNumber(score.result.width)} ÷ ${formatNumber(Math.max(market.settledValue!, 1))})²) = ${formatPoints(score.points)}. The narrower your quote compared with the answer, the higher.`
              : `It landed ${positionPhrase(score.result.position)}, so it scores 0.`}
          </ThemedText>
        </>
      ) : null}
      {movement ? (
        <ThemedText type="small" themeColor="textSecondary">
          {movement.before === null
            ? `Your first scored market: your rating is now ${formatRating(movement.after)}.`
            : `It moved your rating from ${movement.before.toFixed(1)} to ${movement.after.toFixed(1)} (${formatChange(movement.after - movement.before)}).`}
        </ThemedText>
      ) : null}
      <Button title="Reopen" variant="secondary" small onPress={reopen} style={styles.alignStart} />
    </Card>
  );
}

const QUALITY_LABELS = ['1 · Bad call', '2', '3', '4', '5 · Great call'];

function ReviewCard({ market }: { market: Market }) {
  const db = useSQLiteContext();
  const [postmortem, setPostmortem] = useState(market.postmortem);
  const [quality, setQuality] = useState<number | null>(market.decisionQuality);
  const rateDecision = market.isDecision && market.status === 'settled';
  const dirty = postmortem.trim() !== market.postmortem || (rateDecision && quality !== market.decisionQuality);

  async function save() {
    try {
      await saveReview(db, market.id, { postmortem, decisionQuality: rateDecision ? quality : market.decisionQuality });
    } catch (error) {
      showMessage('Couldn’t save', errorMessage(error));
    }
  }

  return (
    <Card>
      <Caption>Post-mortem</Caption>
      {rateDecision ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Given what you knew at the time, how good was the call? (Separate from how it turned out.)
          </ThemedText>
          <View style={styles.wrap}>
            {QUALITY_LABELS.map((label, index) => {
              const value = index + 1;
              return (
                <Chip
                  key={value}
                  label={label}
                  selected={quality === value}
                  onPress={() => setQuality(quality === value ? null : value)}
                />
              );
            })}
          </View>
        </>
      ) : null}
      <TextField
        value={postmortem}
        onChangeText={setPostmortem}
        placeholder="What did you miss? What would you do differently?"
        multiline
      />
      <Button title="Save" small disabled={!dirty} onPress={save} style={styles.alignStart} />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.two,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  alignStart: {
    alignSelf: 'flex-start',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  historyDate: {
    width: 96,
  },
  historyQuote: {
    minWidth: 72,
  },
});
