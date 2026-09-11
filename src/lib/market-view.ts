import type { Market } from '@/db/types';
import { binaryPoints, brierScore, numberScore, type NumberScore } from '@/scoring';

import { formatNumber, formatPoints, formatPrice } from './format';

/* Pure helpers that turn a Market into what the screens display. */

function required(value: number | null, field: string): number {
  if (value === null) throw new Error(`Market is missing ${field}`);
  return value;
}

export function formatBinaryQuote(price: number): string {
  return `${formatPrice(price)}%`;
}

export function formatNumberQuote(bid: number, ask: number): string {
  return `${formatNumber(bid)} @ ${formatNumber(ask)}`;
}

export function currentQuote(market: Market): string {
  return market.kind === 'binary'
    ? formatBinaryQuote(required(market.price, 'price'))
    : formatNumberQuote(required(market.bid, 'bid'), required(market.ask, 'ask'));
}

/** The starting quote — the one that gets scored. */
export function initialQuote(market: Market): string {
  return market.kind === 'binary'
    ? formatBinaryQuote(required(market.initialPrice, 'initial price'))
    : formatNumberQuote(required(market.initialBid, 'initial bid'), required(market.initialAsk, 'initial ask'));
}

export function wasRequoted(market: Market): boolean {
  return market.quoteCount > 1;
}

export function yesLabel(market: Pick<Market, 'isDecision'>): string {
  return market.isDecision ? 'Worked out' : 'YES';
}

export function noLabel(market: Pick<Market, 'isDecision'>): string {
  return market.isDecision ? 'Didn’t work out' : 'NO';
}

export function withUnit(value: number, unit: string): string {
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
}

/** "YES", "Worked out", "31 hours", "Void" — or null while open. */
export function outcomeLabel(market: Market): string | null {
  if (market.status === 'void') return 'Void';
  if (market.status !== 'settled') return null;
  if (market.kind === 'binary') return market.outcome === 1 ? yesLabel(market) : noLabel(market);
  return withUnit(required(market.settledValue, 'settled value'), market.unit);
}

export type MarketScore =
  | { kind: 'binary'; brier: number; points: number; good: boolean }
  | { kind: 'number'; result: NumberScore; points: number; good: boolean };

/**
 * Score of a settled market, from its starting quote. `points` is its score on the rating
 * scale (Yes/No: 100 − 200 × Brier; Number: 0–100). "Good" means above 50, i.e. better than
 * a 50/50 guess on a Yes/No market.
 */
export function marketScore(market: Market): MarketScore | null {
  if (market.status !== 'settled') return null;
  if (market.kind === 'binary') {
    if (market.outcome === null) return null;
    const p = required(market.initialPrice, 'initial price');
    const points = binaryPoints(p, market.outcome);
    return { kind: 'binary', brier: brierScore(p, market.outcome), points, good: points > 50 };
  }
  const result = numberScore(
    required(market.initialBid, 'initial bid'),
    required(market.initialAsk, 'initial ask'),
    required(market.settledValue, 'settled value'),
  );
  return { kind: 'number', result, points: result.score, good: result.score > 50 };
}

/** How a Number market would score if it settled at `value` (for the settle preview). */
export function numberScoreAt(market: Market, value: number): NumberScore {
  return numberScore(required(market.initialBid, 'initial bid'), required(market.initialAsk, 'initial ask'), value);
}

export function positionPhrase(position: NumberScore['position']): string {
  return { below: 'below your bid', inside: 'inside your quote', above: 'above your ask' }[position];
}

export function scoreLabel(score: MarketScore): string {
  return `Score ${formatPoints(score.points)}`;
}

export type TypeFilter = 'all' | 'binary' | 'number' | 'decision';
export type MarketFilter = { type: TypeFilter; tag: string | null; search: string };

export function matchesFilter(market: Market, filter: MarketFilter): boolean {
  if (filter.type === 'binary' && market.kind !== 'binary') return false;
  if (filter.type === 'number' && market.kind !== 'number') return false;
  if (filter.type === 'decision' && !market.isDecision) return false;
  const tag = filter.tag?.toLowerCase();
  if (tag && !market.tags.some((t) => t.toLowerCase() === tag)) return false;
  const search = filter.search.trim().toLowerCase();
  if (!search) return true;
  return (
    market.question.toLowerCase().includes(search) ||
    market.reasoning.toLowerCase().includes(search) ||
    market.tags.some((t) => t.toLowerCase().includes(search))
  );
}

function byResolveBy(a: Market, b: Market): number {
  return a.resolveBy.localeCompare(b.resolveBy) || a.id - b.id;
}

/** Open markets split into due (settle-by date today or earlier) and upcoming. */
export function groupOpenMarkets(markets: readonly Market[], today: string): { due: Market[]; upcoming: Market[] } {
  const open = markets.filter((m) => m.status === 'open').sort(byResolveBy);
  return {
    due: open.filter((m) => m.resolveBy <= today),
    upcoming: open.filter((m) => m.resolveBy > today),
  };
}

/** Settled and void markets, most recently settled first. */
export function settledMarkets(markets: readonly Market[]): Market[] {
  return markets
    .filter((m) => m.status !== 'open')
    .sort((a, b) => (b.settledAt ?? '').localeCompare(a.settledAt ?? '') || b.id - a.id);
}

export function allTags(markets: readonly Market[]): string[] {
  const byKey = new Map<string, string>();
  for (const market of markets) {
    for (const tag of market.tags) {
      if (!byKey.has(tag.toLowerCase())) byKey.set(tag.toLowerCase(), tag);
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
