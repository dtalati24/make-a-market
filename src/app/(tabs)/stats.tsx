import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { CalibrationChart } from '@/components/charts/calibration-chart';
import { LandingBar } from '@/components/charts/landing-bar';
import { TrendChart } from '@/components/charts/trend-chart';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { ScrollScreen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { Segmented } from '@/components/segmented';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { listMarkets } from '@/db/markets';
import type { Market, MarketKind } from '@/db/types';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { formatPercent } from '@/lib/format';
import {
  binaryItems,
  binaryTrend,
  byTag,
  confidenceText,
  decisionCount,
  decisionGrid,
  filterByTag,
  formatSkill,
  noiseWarning,
  numberItems,
  numberTrend,
  requoteEffect,
  requoteLine,
  settledTags,
  type DecisionGrid,
  type RequoteEffect,
  type TagRow,
} from '@/lib/stats-view';
import { confidenceVerdict, summarizeBinary, summarizeNumber, type BinarySummary } from '@/scoring';

const KINDS: readonly { value: MarketKind; label: string }[] = [
  { value: 'binary', label: 'Yes/No' },
  { value: 'number', label: 'Number' },
];

/** Markets per point on the trend charts; the chart appears once there are this many. */
const TREND_WINDOW = 10;

function Caption({ children }: { children: string }) {
  return (
    <ThemedText type="caption" themeColor="textSecondary">
      {children}
    </ThemedText>
  );
}

function Note({ children }: { children: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {children}
    </ThemedText>
  );
}

export default function StatsScreen() {
  const theme = useTheme();
  const { data: markets } = useQuery(listMarkets, []);
  const [kind, setKind] = useState<MarketKind>('binary');
  const [tag, setTag] = useState<string | null>(null);

  const all = markets ?? [];
  const tags = settledTags(all, kind);
  // Match case-insensitively so a tag picked on one kind carries over to the other.
  const activeTag = tag === null ? null : (tags.find((t) => t.toLowerCase() === tag.toLowerCase()) ?? null);
  const scoped = filterByTag(all, activeTag);

  let body;
  if (markets === undefined) body = <ActivityIndicator color={theme.tint} />;
  else if (kind === 'binary') body = <BinaryStats markets={scoped} tag={activeTag} />;
  else body = <NumberStats markets={scoped} tag={activeTag} />;

  return (
    <ScrollScreen safeTop>
      <ScreenTitle title="Stats" />
      <Segmented options={KINDS} value={kind} onChange={setKind} />
      {tags.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="All" selected={activeTag === null} onPress={() => setTag(null)} />
          {tags.map((name) => (
            <Chip
              key={name}
              label={`#${name}`}
              selected={activeTag === name}
              onPress={() => setTag(activeTag === name ? null : name)}
            />
          ))}
        </ScrollView>
      ) : null}
      {body}
    </ScrollScreen>
  );
}

function NoiseWarning({ n }: { n: number }) {
  const text = noiseWarning(n);
  if (text === null) return null;
  return (
    <ThemedText type="small" themeColor="warning">
      {text}
    </ThemedText>
  );
}

/* ---------- Yes/No ---------- */

function BinaryStats({ markets, tag }: { markets: readonly Market[]; tag: string | null }) {
  const summary = summarizeBinary(binaryItems(markets, 'initial'));
  if (summary === null) {
    return (
      <EmptyState
        title={tag ? `No settled Yes/No markets tagged #${tag}` : 'No settled Yes/No markets yet'}
        message="Settle a Yes/No market and your Brier score, calibration chart and confidence verdict show up here. Void markets aren’t scored."
      />
    );
  }

  const trend = summary.n >= TREND_WINDOW ? binaryTrend(markets, TREND_WINDOW) : [];
  const tagRows = byTag(markets, 'binary');
  const requote = requoteEffect(markets, 'binary');
  const grid = decisionGrid(markets);

  return (
    <>
      <NoiseWarning n={summary.n} />
      <StatGrid>
        <StatTile label="Settled" value={String(summary.n)} caption="void markets excluded" />
        <StatTile label="Brier" value={summary.brier.toFixed(3)} caption="lower is better · 50% guess = 0.250" />
        <StatTile
          label="Skill vs base rate"
          value={formatSkill(summary.skill)}
          caption={summary.skill === null ? 'needs both YES and NO results' : 'above 0 beats your base rate'}
        />
        <StatTile label="Log score" value={summary.logScore.toFixed(3)} caption="closer to 0 is better" />
      </StatGrid>

      <ConfidenceCard summary={summary} />

      <Card>
        <Caption>Calibration</Caption>
        <Note>
          Each dot is a 10-point price bucket; bigger dots hold more markets. On the dashed line, things happened
          exactly as often as you priced them. Bars show the 95% range.
        </Note>
        <CalibrationChart bins={summary.bins} />
      </Card>

      <BreakdownCard summary={summary} />

      {trend.length > 0 ? (
        <Card>
          <Caption>Brier trend</Caption>
          <Note>{`Average Brier over each run of ${TREND_WINDOW} settled markets, oldest to newest. Lower is better; the dashed line is a 50% guess.`}</Note>
          <TrendChart
            points={trend}
            formatValue={(value) => value.toFixed(3)}
            label="Rolling Brier"
            reference={0.25}
            referenceLabel="50% guess"
          />
        </Card>
      ) : null}

      {tagRows.length > 0 ? <ByTagCard rows={tagRows} scoreLabel="Brier" digits={3} /> : null}
      {requote ? <RequoteCard effect={requote} digits={3} /> : null}
      {decisionCount(grid) > 0 ? <DecisionsCard grid={grid} /> : null}
    </>
  );
}

function ConfidenceCard({ summary }: { summary: BinarySummary }) {
  const theme = useTheme();
  const verdict = confidenceVerdict(summary);
  let color: string = theme.text;
  if (verdict.kind === 'calibrated') color = theme.bid;
  else if (verdict.kind !== 'insufficient') color = theme.warning;

  return (
    <Card>
      <Caption>Confidence</Caption>
      <ThemedText type="subtitle" style={{ color }}>
        {confidenceText(verdict)}
      </ThemedText>
      <Note>
        {`Average confidence ${formatPercent(summary.averageConfidence)} vs hit rate ${formatPercent(summary.hitRate)} — how often the side you leaned toward happened.`}
      </Note>
    </Card>
  );
}

function BreakdownCard({ summary }: { summary: BinarySummary }) {
  const { reliability, resolution, uncertainty, brier } = summary;
  const approx = reliability - resolution + uncertainty;
  return (
    <Card>
      <Caption>Brier breakdown</Caption>
      <BreakdownRow
        name="Reliability"
        value={reliability}
        note="Calibration error: the gap between your prices and how often things happened. Lower is better."
      />
      <BreakdownRow
        name="Resolution"
        value={resolution}
        note="How well your prices separate what happens from what doesn’t. Higher is better."
      />
      <BreakdownRow
        name="Uncertainty"
        value={uncertainty}
        note="How unpredictable the questions were: base rate × (1 − base rate). Not up to you."
      />
      <Note>
        {`Brier ≈ reliability − resolution + uncertainty = ${reliability.toFixed(3)} − ${resolution.toFixed(3)} + ${uncertainty.toFixed(3)} = ${approx.toFixed(3)} (actual ${brier.toFixed(3)}).`}
      </Note>
    </Card>
  );
}

function BreakdownRow({ name, value, note }: { name: string; value: number; note: string }) {
  return (
    <View style={styles.breakdownRow}>
      <View style={styles.rowBetween}>
        <ThemedText type="smallBold">{name}</ThemedText>
        <ThemedText type="smallBold" style={styles.tabular}>
          {value.toFixed(3)}
        </ThemedText>
      </View>
      <Note>{note}</Note>
    </View>
  );
}

function DecisionsCard({ grid }: { grid: DecisionGrid }) {
  return (
    <Card>
      <Caption>Decisions</Caption>
      <Note>
        How good the call was (your 1–5 rating after settling) against how it turned out. Luck lives on the
        diagonal from top right to bottom left.
      </Note>
      <View style={styles.gridRow}>
        <View style={styles.gridRowHeader} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.gridColHeader}>
          Worked out
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.gridColHeader}>
          Didn’t
        </ThemedText>
      </View>
      <View style={styles.gridRow}>
        <View style={styles.gridRowHeader}>
          <ThemedText type="smallBold">Good call (4–5)</ThemedText>
        </View>
        <GridCell label="Earned" count={grid.earned} />
        <GridCell label="Bad luck" count={grid.badLuck} />
      </View>
      <View style={styles.gridRow}>
        <View style={styles.gridRowHeader}>
          <ThemedText type="smallBold">Bad call (1–2)</ThemedText>
        </View>
        <GridCell label="Dumb luck" count={grid.dumbLuck} />
        <GridCell label="Deserved" count={grid.deserved} />
      </View>
      {grid.unrated > 0 ? (
        <Note>{`${grid.unrated} unrated — decisions rated 3 or not yet rated aren’t placed in the grid.`}</Note>
      ) : null}
    </Card>
  );
}

function GridCell({ label, count }: { label: string; count: number }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${count}`}
      style={[styles.gridCell, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="subtitle" style={styles.tabular}>
        {String(count)}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

/* ---------- Number ---------- */

function NumberStats({ markets, tag }: { markets: readonly Market[]; tag: string | null }) {
  const summary = summarizeNumber(numberItems(markets, 'initial'));
  if (summary === null) {
    return (
      <EmptyState
        title={tag ? `No settled Number markets tagged #${tag}` : 'No settled Number markets yet'}
        message="Settle a Number market and your average score, hit rate and where the answers landed show up here. Void markets aren’t scored."
      />
    );
  }

  const trend = summary.n >= TREND_WINDOW ? numberTrend(markets, TREND_WINDOW) : [];
  const tagRows = byTag(markets, 'number');
  const requote = requoteEffect(markets, 'number');

  return (
    <>
      <NoiseWarning n={summary.n} />
      <StatGrid>
        <StatTile label="Settled" value={String(summary.n)} caption="void markets excluded" />
        <StatTile label="Avg score" value={summary.averageScore.toFixed(0)} caption="0–100, higher is better" />
        <StatTile label="Hit rate" value={formatPercent(summary.hitRate)} caption="landed inside your quote" />
        <StatTile label="Avg width" value={formatPercent(summary.averageRelativeWidth)} caption="width ÷ answer" />
      </StatGrid>

      <Card>
        <Caption>Where the answer landed</Caption>
        <LandingBar below={summary.below} inside={summary.inside} above={summary.above} />
        <Note>
          {summary.averageScoreWhenInside === null
            ? 'None of the answers has landed inside your quote yet. Answers outside score 0.'
            : `When it landed inside, you scored ${summary.averageScoreWhenInside.toFixed(0)} on average. Answers outside score 0.`}
        </Note>
      </Card>

      {trend.length > 0 ? (
        <Card>
          <Caption>Score trend</Caption>
          <Note>{`Average score over each run of ${TREND_WINDOW} settled markets, oldest to newest. Higher is better.`}</Note>
          <TrendChart points={trend} formatValue={(value) => value.toFixed(0)} label="Rolling average score" />
        </Card>
      ) : null}

      {tagRows.length > 0 ? <ByTagCard rows={tagRows} scoreLabel="Avg score" digits={0} higherIsBetter /> : null}
      {requote ? <RequoteCard effect={requote} digits={0} higherIsBetter /> : null}
    </>
  );
}

/* ---------- Shared ---------- */

function ByTagCard({
  rows,
  scoreLabel,
  digits,
  higherIsBetter = false,
}: {
  rows: readonly TagRow[];
  scoreLabel: string;
  digits: number;
  higherIsBetter?: boolean;
}) {
  const theme = useTheme();
  return (
    <Card>
      <Caption>By tag</Caption>
      <View style={styles.tableRow}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.tagCell}>
          Tag
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.numCell}>
          Markets
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.numCell}>
          {scoreLabel}
        </ThemedText>
      </View>
      {rows.map((row) => (
        <View key={row.tag} style={[styles.tableRow, styles.tableDivider, { borderTopColor: theme.border }]}>
          <ThemedText type="small" numberOfLines={1} style={styles.tagCell}>
            {`#${row.tag}`}
          </ThemedText>
          <ThemedText type="small" style={styles.numCell}>
            {String(row.n)}
          </ThemedText>
          <ThemedText type="smallBold" style={styles.numCell}>
            {row.score.toFixed(digits)}
          </ThemedText>
        </View>
      ))}
      <Note>{`${higherIsBetter ? 'Higher' : 'Lower'} is better. A market with several tags counts under each.`}</Note>
    </Card>
  );
}

function RequoteCard({
  effect,
  digits,
  higherIsBetter = false,
}: {
  effect: RequoteEffect;
  digits: number;
  higherIsBetter?: boolean;
}) {
  return (
    <Card>
      <Caption>Did re-quoting help?</Caption>
      <ThemedText type="smallBold">{requoteLine(effect, digits, higherIsBetter)}</ThemedText>
      <Note>
        {`Over the ${effect.n} settled market${effect.n === 1 ? '' : 's'} you re-quoted. ${higherIsBetter ? 'Higher' : 'Lower'} is better. Everything else on this screen scores your starting quotes.`}
      </Note>
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: {
    gap: Spacing.two,
    alignItems: 'center',
  },
  breakdownRow: {
    gap: Spacing.half,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  tableDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tagCell: {
    flex: 1,
  },
  numCell: {
    width: 72,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.two,
  },
  gridRowHeader: {
    width: 88,
    justifyContent: 'center',
  },
  gridColHeader: {
    flex: 1,
    textAlign: 'center',
  },
  gridCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
    gap: Spacing.half,
  },
});
