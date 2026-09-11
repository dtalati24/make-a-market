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
 * "1,200" (thousands), "2,5" (a decimal comma, as some keyboards type it) and
 * surrounding spaces; returns null for anything else.
 */
export function parseNumberInput(text: string): number | null {
  let cleaned = text.trim();
  if (/^-?\d{1,3}(,\d{3})+(\.\d*)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, '');
  } else if (/^-?\d*,\d*$/.test(cleaned)) {
    cleaned = cleaned.replace(',', '.');
  }
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

/** A score rounded to a whole number, with a proper minus sign: 82, −62. */
export function formatPoints(value: number): string {
  const rounded = Math.round(value);
  return rounded < 0 ? `−${-rounded}` : String(Math.abs(rounded));
}
