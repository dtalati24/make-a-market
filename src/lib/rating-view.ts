import type { Market } from '@/db/types';
import { binaryPoints, computeRating, numberScore, type Rating, type ScoredMarket } from '@/scoring';

import { settledInOrder } from './stats-view';

/* Pure helpers behind the 0–100 rating badge and the Rating screen. */

/** A settled market's score from its starting quote (Yes/No: 100 − 200 × Brier; Number: 0–100); null otherwise. */
export function marketPoints(market: Market): number | null {
  if (market.status !== 'settled') return null;
  if (market.kind === 'binary') {
    return market.initialPrice === null || market.outcome === null
      ? null
      : binaryPoints(market.initialPrice, market.outcome);
  }
  if (market.initialBid === null || market.initialAsk === null || market.settledValue === null) return null;
  return numberScore(market.initialBid, market.initialAsk, market.settledValue).score;
}

/** Settled markets as rating inputs, in the order they settled. Open and void markets are skipped. */
export function scoredMarkets(markets: readonly Market[]): ScoredMarket[] {
  const scored: ScoredMarket[] = [];
  for (const market of settledInOrder(markets)) {
    const score = marketPoints(market);
    if (score !== null) scored.push({ id: market.id, kind: market.kind, score });
  }
  return scored;
}

export function ratingFor(markets: readonly Market[]): Rating {
  return computeRating(scoredMarkets(markets));
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const h = (((hue % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((h % 2) - 1));
  let rgb: [number, number, number];
  if (h < 1) rgb = [c, x, 0];
  else if (h < 2) rgb = [x, c, 0];
  else if (h < 3) rgb = [0, c, x];
  else if (h < 4) rgb = [0, x, c];
  else if (h < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = lightness - c / 2;
  const hex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${rgb.map(hex).join('')}`.toUpperCase();
}

/** Badge colour: red at 0, orange at 50, green at 100, blending smoothly in between. */
export function ratingColor(value: number): string {
  const v = Math.min(100, Math.max(0, value));
  // Hue 0 (red) → 30 (orange) → 130 (green).
  const hue = v <= 50 ? (v / 50) * 30 : 30 + ((v - 50) / 50) * 100;
  return hslToHex(hue, 0.8, 0.46);
}

/** Black or white, whichever reads better on the given "#RRGGBB" background. */
export function textColorOn(background: string): '#000000' | '#FFFFFF' {
  const channel = (start: number) => {
    const v = parseInt(background.slice(start, start + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#FFFFFF';
}

/** The overall rating as shown on the badge: a whole number. */
export function formatRating(value: number): string {
  return String(Math.round(value));
}

/** A change in rating to one decimal: "+1.2", "−0.8", "0.0". */
export function formatChange(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded > 0) return `+${rounded.toFixed(1)}`;
  if (rounded < 0) return `−${(-rounded).toFixed(1)}`;
  return '0.0';
}
