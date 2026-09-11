import type { Market, MarketKind } from '@/db/types';
import {
  brierScore,
  mean,
  numberScore,
  rollingMean,
  type BinaryItem,
  type CalibrationBin,
  type ConfidenceVerdict,
  type NumberItem,
  type RollingPoint,
} from '@/scoring';

import { allTags } from './market-view';

/* Pure helpers that turn the market list into what the Stats screen displays. */

/** Which quote to score: the starting one (the default everywhere) or the latest re-quote. */
export type QuoteSet = 'initial' | 'final';

/** Settled markets, oldest settlement first (ties broken by id). Open and void markets are dropped. */
export function settledInOrder(markets: readonly Market[]): Market[] {
  return markets
    .filter((m) => m.status === 'settled')
    .sort((a, b) => (a.settledAt ?? '').localeCompare(b.settledAt ?? '') || a.id - b.id);
}

function toBinaryItem(market: Market, which: QuoteSet): BinaryItem | null {
  if (market.kind !== 'binary' || market.status !== 'settled' || market.outcome === null) return null;
  const p = which === 'final' ? (market.price ?? market.initialPrice) : market.initialPrice;
  return p === null ? null : { p, outcome: market.outcome };
}

function toNumberItem(market: Market, which: QuoteSet): NumberItem | null {
  if (market.kind !== 'number' || market.status !== 'settled' || market.settledValue === null) return null;
  const bid = which === 'final' ? (market.bid ?? market.initialBid) : market.initialBid;
  const ask = which === 'final' ? (market.ask ?? market.initialAsk) : market.initialAsk;
  return bid === null || ask === null ? null : { bid, ask, value: market.settledValue };
}

/** Brier (Yes/No) or 0–100 score (Number) of one settled market; null if it isn't a settled market of that kind. */
function scoreOf(market: Market, kind: MarketKind, which: QuoteSet): number | null {
  if (kind === 'binary') {
    const item = toBinaryItem(market, which);
    return item === null ? null : brierScore(item.p, item.outcome);
  }
  const item = toNumberItem(market, which);
  return item === null ? null : numberScore(item.bid, item.ask, item.value).score;
}

function collect<T>(markets: readonly Market[], pick: (market: Market) => T | null): T[] {
  const out: T[] = [];
  for (const market of settledInOrder(markets)) {
    const value = pick(market);
    if (value !== null) out.push(value);
  }
  return out;
}

/** Scoring inputs for settled Yes/No markets, in settlement order. */
export function binaryItems(markets: readonly Market[], which: QuoteSet): BinaryItem[] {
  return collect(markets, (m) => toBinaryItem(m, which));
}

/** Scoring inputs for settled Number markets, in settlement order. */
export function numberItems(markets: readonly Market[], which: QuoteSet): NumberItem[] {
  return collect(markets, (m) => toNumberItem(m, which));
}

/** Rolling mean Brier (starting quotes) over the last `window` settled Yes/No markets. */
export function binaryTrend(markets: readonly Market[], window = 10): RollingPoint[] {
  return rollingMean(
    binaryItems(markets, 'initial').map((item) => brierScore(item.p, item.outcome)),
    window,
  );
}

/** Rolling mean score (starting quotes) over the last `window` settled Number markets. */
export function numberTrend(markets: readonly Market[], window = 10): RollingPoint[] {
  return rollingMean(
    numberItems(markets, 'initial').map((item) => numberScore(item.bid, item.ask, item.value).score),
    window,
  );
}

export type TagRow = { tag: string; n: number; score: number };

/**
 * Mean Brier (Yes/No) or mean score (Number) per tag, over settled markets of that kind.
 * Tags are matched case-insensitively and shown with their first-seen spelling.
 * Sorted by count (most first), then tag name.
 */
export function byTag(markets: readonly Market[], kind: MarketKind): TagRow[] {
  const groups = new Map<string, { tag: string; scores: number[] }>();
  for (const market of settledInOrder(markets)) {
    const score = scoreOf(market, kind, 'initial');
    if (score === null) continue;
    const seen = new Set<string>();
    for (const tag of market.tags) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const group = groups.get(key) ?? { tag, scores: [] };
      group.scores.push(score);
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .map((group) => ({ tag: group.tag, n: group.scores.length, score: mean(group.scores) }))
    .sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, undefined, { sensitivity: 'base' }));
}

export type RequoteEffect = { n: number; initial: number; final: number };

/**
 * Starting-quote vs final-quote score, over only the settled markets of `kind` that were
 * re-quoted. Null when there are none.
 */
export function requoteEffect(markets: readonly Market[], kind: MarketKind): RequoteEffect | null {
  const initial: number[] = [];
  const final: number[] = [];
  for (const market of settledInOrder(markets)) {
    if (market.quoteCount <= 1) continue;
    const a = scoreOf(market, kind, 'initial');
    const b = scoreOf(market, kind, 'final');
    if (a === null || b === null) continue;
    initial.push(a);
    final.push(b);
  }
  if (initial.length === 0) return null;
  return { n: initial.length, initial: mean(initial), final: mean(final) };
}

export type DecisionGrid = {
  /** Good call (4–5), worked out. */
  earned: number;
  /** Good call, didn't work out. */
  badLuck: number;
  /** Bad call (1–2), worked out. */
  dumbLuck: number;
  /** Bad call, didn't work out. */
  deserved: number;
  /** Rated 3 or not rated. */
  unrated: number;
};

/** Decision quality vs outcome for settled Yes/No decisions. */
export function decisionGrid(markets: readonly Market[]): DecisionGrid {
  const grid: DecisionGrid = { earned: 0, badLuck: 0, dumbLuck: 0, deserved: 0, unrated: 0 };
  for (const market of markets) {
    if (market.kind !== 'binary' || !market.isDecision || market.status !== 'settled' || market.outcome === null) {
      continue;
    }
    const quality = market.decisionQuality;
    const worked = market.outcome === 1;
    if (quality !== null && quality >= 4) {
      if (worked) grid.earned++;
      else grid.badLuck++;
    } else if (quality !== null && quality <= 2) {
      if (worked) grid.dumbLuck++;
      else grid.deserved++;
    } else {
      grid.unrated++;
    }
  }
  return grid;
}

export function decisionCount(grid: DecisionGrid): number {
  return grid.earned + grid.badLuck + grid.dumbLuck + grid.deserved + grid.unrated;
}

/** Markets carrying `tag` (case-insensitive); all of them when `tag` is null. */
export function filterByTag(markets: readonly Market[], tag: string | null): Market[] {
  if (tag === null) return [...markets];
  const key = tag.toLowerCase();
  return markets.filter((m) => m.tags.some((t) => t.toLowerCase() === key));
}

/** Tags used on settled markets of `kind`, once each, sorted. */
export function settledTags(markets: readonly Market[], kind: MarketKind): string[] {
  return allTags(markets.filter((m) => m.kind === kind && m.status === 'settled'));
}

/* ---------- Display text ---------- */

/** Skill vs base rate as a signed percentage: 0.123 → "+12%", −0.05 → "−5%", null → "—". */
export function formatSkill(skill: number | null): string {
  if (skill === null) return '—';
  const pct = Math.round(skill * 100);
  if (pct === 0) return '0%';
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

export function confidenceText(verdict: ConfidenceVerdict): string {
  switch (verdict.kind) {
    case 'insufficient':
      return 'Settle at least 5 markets for a verdict';
    case 'calibrated':
      return 'Well calibrated (within 3 points)';
    case 'overconfident':
      return `Overconfident by ${Math.round(verdict.points)} points`;
    case 'underconfident':
      return `Underconfident by ${Math.round(verdict.points)} points`;
  }
}

/** The small-sample warning, or null when there's nothing (or enough) to warn about. */
export function noiseWarning(n: number): string | null {
  if (n < 1 || n >= 20) return null;
  return `Based on ${n} settled market${n === 1 ? '' : 's'} — numbers are noisy until about 20.`;
}

/**
 * "Starting quotes: 0.180 · Final quotes: 0.150 — re-quoting helped". Lower is better for
 * Brier (Yes/No); pass `higherIsBetter` for Number scores.
 */
export function requoteLine(effect: RequoteEffect, digits: number, higherIsBetter = false): string {
  const initial = effect.initial.toFixed(digits);
  const final = effect.final.toFixed(digits);
  const improved = higherIsBetter ? effect.final > effect.initial : effect.final < effect.initial;
  let verdict: string;
  if (initial === final) verdict = 're-quoting made no difference';
  else verdict = improved ? 're-quoting helped' : 're-quoting hurt';
  return `Starting quotes: ${initial} · Final quotes: ${final} — ${verdict}`;
}

/* ---------- Chart helpers ---------- */

/** Calibration dot radius: grows with √n, clamped to 4–12 px. */
export function dotRadius(n: number): number {
  return Math.min(12, Math.max(4, 3 * Math.sqrt(n)));
}

/**
 * Y range for a trend chart: covers every value and the optional reference line, with 10%
 * padding either side, never dipping below 0 when all inputs are non-negative.
 */
export function trendDomain(values: readonly number[], reference?: number): { min: number; max: number } {
  const all = reference === undefined ? [...values] : [...values, reference];
  if (all.length === 0) return { min: 0, max: 1 };
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = hi > lo ? (hi - lo) * 0.1 : lo === 0 ? 1 : Math.abs(lo) * 0.1;
  return { min: lo >= 0 ? Math.max(0, lo - pad) : lo - pad, max: hi + pad };
}

/** Screen-reader summary of the calibration chart. */
export function calibrationLabel(bins: readonly CalibrationBin[]): string {
  if (bins.length === 0) return 'Calibration chart: no settled markets yet.';
  const parts = bins.map((bin) => {
    const hits = Math.round(bin.freq * bin.n);
    return `priced ${Math.round(bin.lo * 100)} to ${Math.round(bin.hi * 100)}%: ${hits} of ${bin.n} happened`;
  });
  return `Calibration chart. ${parts.join('; ')}.`;
}
