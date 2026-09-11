export type MarketKind = 'binary' | 'number';
export type MarketStatus = 'open' | 'settled' | 'void';

/**
 * A market as the app sees it. Yes/No ("binary") markets use the price fields
 * (probabilities in 0.01–0.99); Number markets use bid/ask. The "initial" quote
 * is what gets scored; the current one reflects any re-quotes.
 */
export type Market = {
  id: number;
  kind: MarketKind;
  isDecision: boolean;
  question: string;
  unit: string;
  initialPrice: number | null;
  price: number | null;
  initialBid: number | null;
  initialAsk: number | null;
  bid: number | null;
  ask: number | null;
  reasoning: string;
  successCriteria: string;
  options: string[];
  chosenOption: string | null;
  createdAt: string;
  resolveBy: string;
  status: MarketStatus;
  outcome: 0 | 1 | null;
  settledValue: number | null;
  settledAt: string | null;
  postmortem: string;
  decisionQuality: number | null;
  notificationId: string | null;
  tags: string[];
  quoteCount: number;
};

export type Quote = {
  id: number;
  marketId: number;
  price: number | null;
  bid: number | null;
  ask: number | null;
  note: string;
  createdAt: string;
};

export type QuoteInput = { kind: 'binary'; price: number } | { kind: 'number'; bid: number; ask: number };

export type MarketInput = {
  isDecision: boolean;
  question: string;
  unit: string;
  reasoning: string;
  successCriteria: string;
  options: string[];
  chosenOption: string | null;
  resolveBy: string;
  tags: string[];
};

export type NewMarketInput = MarketInput & { quote: QuoteInput };

export type ReminderSettings = {
  enabled: boolean;
  /** "HH:MM", 24-hour, local time. */
  time: string;
};

/** Light / dark appearance: follow the phone ('system') or force one. */
export type ThemePreference = 'system' | 'light' | 'dark';
