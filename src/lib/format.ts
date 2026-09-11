/** Probability (0.01–0.99) → market price as shown to the user, e.g. 0.72 → "72". */
export function formatPrice(probability: number): string {
  return String(Math.round(probability * 100));
}

/** Up to 2 decimals, trailing zeros dropped, thousands separated: 1234.5 → "1,234.5". */
export function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const [whole, fraction] = Math.abs(rounded).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const trimmed = fraction.replace(/0+$/, '');
  return `${rounded < 0 ? '-' : ''}${grouped}${trimmed ? `.${trimmed}` : ''}`;
}

/**
 * Parses what a user typed into a number field. Accepts "12", "12.5", ".5",
 * "1,200" and surrounding spaces; returns null for anything else.
 */
export function parseNumberInput(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, '');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function formatScore(value: number, digits: number): string {
  return value.toFixed(digits);
}

/** Share (0–1) → "48%". */
export function formatPercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}
