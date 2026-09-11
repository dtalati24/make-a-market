import type { MarketKind, QuoteInput } from '@/db/types';

import type { BackupMarket, BackupQuote } from './backup-format';
import { toDateString } from './dates';

/*
 * Sample markets so a new user can see what Stats looks like. Everything is
 * generated from a fixed seed relative to `now`, so the same `now` always
 * gives the same data. The simulated user is mildly overconfident on Yes/No
 * markets and quotes Number markets a little too tight. Pure data only; the
 * database loading lives in ./actions.ts.
 */

export const DEMO_TAG = 'demo';
export const DEMO_TOPICS = ['career', 'health', 'projects', 'learning', 'money', 'social'] as const;
export type DemoTopic = (typeof DEMO_TOPICS)[number];

const DEMO_SEED = 20260911;
/** Oldest demo market, in days before `now`. */
const MAX_AGE_DAYS = 200;
/** Share of settled Number markets whose value lands inside the quote. */
const NUMBER_HITS = 8;

/** Small, fast, seedable PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type BinaryTemplate = {
  topic: DemoTopic;
  question: string;
  /** Starting quote, 1–99. */
  price: number;
  /** Days from creation to the settle-by date. */
  horizon: number;
  reasoning?: string;
  /** Post-mortems depend on how it turned out. */
  postmortem?: { yes: string; no: string };
  /** A second quote that moves `delta` points towards what happened. */
  requote?: { delta: number; up: string; down: string };
};

type DecisionTemplate = {
  topic: DemoTopic;
  question: string;
  price: number;
  horizon: number;
  options: string[];
  chosen: string;
  criteria: string;
  outcome: 0 | 1;
  quality: number;
  postmortem: string;
};

type NumberTemplate = {
  topic: DemoTopic;
  question: string;
  unit: string;
  bid: number;
  ask: number;
  /** Decimal places of the real value. */
  decimals: 0 | 1;
  horizon: number;
  reasoning?: string;
  postmortem?: string;
  /** A second quote that shifts halfway towards the real value. */
  requote?: { up: string; down: string };
};

const BINARY: BinaryTemplate[] = [
  { topic: 'projects', question: 'Will my team win the university hackathon?', price: 5, horizon: 14, reasoning: 'Good team, but over 40 teams entered.' },
  { topic: 'career', question: 'Will the recruiter from the big tech firm reply to my cold message?', price: 8, horizon: 14 },
  { topic: 'social', question: 'Will the whole friend group make it to the reunion weekend?', price: 10, horizon: 45 },
  { topic: 'projects', question: 'Will the waitlist for my side project pass 50 signups in the first week?', price: 15, horizon: 7 },
  { topic: 'money', question: 'Will the landlord fix the heating within a week of me reporting it?', price: 15, horizon: 7 },
  { topic: 'learning', question: 'Will I score 90% or more on the linear algebra midterm?', price: 20, horizon: 21 },
  { topic: 'health', question: 'Will I finish the 10k race in under 55 minutes?', price: 25, horizon: 30, reasoning: 'Best training pace so far is just over 5:30 per km.' },
  {
    topic: 'career',
    question: 'Will my performance review come back as “exceeds expectations”?',
    price: 25,
    horizon: 60,
    postmortem: {
      yes: 'The launch I led carried a lot of weight. Ask for feedback earlier next time.',
      no: 'Solid review, but I never made my wins visible to my manager.',
    },
  },
  {
    topic: 'social',
    question: 'Will we book the group trip before the prices go up?',
    price: 30,
    horizon: 21,
    requote: { delta: 15, up: 'Everyone finally paid into the shared pot.', down: 'Two people dropped out of the group chat.' },
  },
  { topic: 'health', question: 'Will I make it to the gym 12 times this month?', price: 30, horizon: 30 },
  { topic: 'career', question: 'Will I hear back from the fintech application within three weeks?', price: 35, horizon: 21 },
  { topic: 'health', question: 'Will I average 7+ hours of sleep this week?', price: 40, horizon: 7 },
  { topic: 'learning', question: 'Will I get an A in the algorithms course?', price: 40, horizon: 90 },
  {
    topic: 'career',
    question: 'Will I get the summer internship after the final round?',
    price: 45,
    horizon: 14,
    reasoning: 'The final round went well, but three of us are left.',
    postmortem: {
      yes: 'Preparing real stories for the behavioural questions paid off.',
      no: 'They went with someone with more industry experience. Nothing I could have changed on the day.',
    },
  },
  { topic: 'learning', question: 'Will I finish all 12 lectures of the stats course before the deadline?', price: 50, horizon: 30 },
  { topic: 'money', question: 'Will I sell my old camera for at least $250?', price: 50, horizon: 30 },
  { topic: 'health', question: 'Will I run at least three times a week for the whole month?', price: 55, horizon: 30 },
  { topic: 'learning', question: 'Will I read two books this month?', price: 55, horizon: 30 },
  { topic: 'career', question: 'Will I get through the recruiter screen for the data analyst role?', price: 60, horizon: 14 },
  { topic: 'projects', question: 'Will I finish fixing up the old bike before the weekend ride?', price: 60, horizon: 14 },
  {
    topic: 'money',
    question: 'Will I stay under my $400 grocery budget this month?',
    price: 65,
    horizon: 30,
    postmortem: {
      yes: 'Meal-prepping on Sundays made the difference.',
      no: 'Two takeaway-heavy weeks blew it. Budget for those instead of pretending they won’t happen.',
    },
  },
  { topic: 'health', question: 'Will I hit 10,000 steps on at least five days this week?', price: 65, horizon: 7 },
  { topic: 'career', question: 'Will my manager approve the conference budget?', price: 70, horizon: 14 },
  { topic: 'learning', question: 'Will I keep my language-app streak going for 30 days?', price: 70, horizon: 30 },
  { topic: 'projects', question: 'Will the side-project landing page be live by the end of the month?', price: 75, horizon: 30 },
  {
    topic: 'learning',
    question: 'Will I pass the cloud practitioner exam on the first try?',
    price: 80,
    horizon: 45,
    reasoning: 'Scoring 75–80% on practice tests; the pass mark is 70%.',
    requote: { delta: 10, up: 'Two more practice tests at 85%+.', down: 'Missed a week of study and my practice scores slipped.' },
  },
  { topic: 'career', question: 'Will I ship the onboarding feature before the sprint ends?', price: 80, horizon: 14 },
  {
    topic: 'projects',
    question: 'Will the app update pass store review on the first submission?',
    price: 85,
    horizon: 7,
    postmortem: {
      yes: 'Following the review checklist was worth the extra hour.',
      no: 'Rejected over a missing privacy-policy link. Added it to the release checklist.',
    },
  },
  { topic: 'social', question: 'Will Sam reply about the trip within two days?', price: 90, horizon: 7 },
  { topic: 'money', question: 'Will I get my security deposit back in full?', price: 92, horizon: 45 },
  { topic: 'social', question: 'Will I make it home for the family dinner?', price: 95, horizon: 14 },
];

const DECISIONS: DecisionTemplate[] = [
  {
    topic: 'career',
    question: 'Take the startup offer over the bank graduate scheme',
    price: 65,
    horizon: 90,
    options: ['Startup offer', 'Bank graduate scheme'],
    chosen: 'Startup offer',
    criteria: 'Still glad I picked it after three months, and learning faster than I would at the bank.',
    outcome: 1,
    quality: 5,
    postmortem: 'Did the homework: talked to two engineers there before accepting. It paid off.',
  },
  {
    topic: 'learning',
    question: 'Switch from the CS minor to the data science minor',
    price: 70,
    horizon: 90,
    options: ['Data science minor', 'Stay with the CS minor'],
    chosen: 'Data science minor',
    criteria: 'Enjoying the courses and averaging B+ or better at the end of term.',
    outcome: 0,
    quality: 4,
    postmortem: 'A reasonable call with what I knew. One badly run course dragged everything down.',
  },
  {
    topic: 'money',
    question: 'Buy a used car instead of renewing the bus pass',
    price: 55,
    horizon: 60,
    options: ['Used car', 'Renew the bus pass', 'Bike plus the odd rideshare'],
    chosen: 'Used car',
    criteria: 'Transport costs stay under $250 a month with no big repairs.',
    outcome: 1,
    quality: 2,
    postmortem: 'Got lucky. I skipped the mechanic’s inspection and the car just happened to be fine.',
  },
  {
    topic: 'social',
    question: 'Move in with friends instead of renting a studio alone',
    price: 75,
    horizon: 90,
    options: ['Share with friends', 'Rent a studio alone'],
    chosen: 'Share with friends',
    criteria: 'No serious flatmate fallouts in the first three months.',
    outcome: 0,
    quality: 1,
    postmortem: 'Ignored obvious warning signs about chores and money. I had this coming.',
  },
  {
    topic: 'projects',
    question: 'Rewrite the side project in TypeScript before adding features',
    price: 60,
    horizon: 30,
    options: ['Rewrite first', 'Keep adding features to the old code'],
    chosen: 'Rewrite first',
    criteria: 'The rewrite is done within three weeks and new features ship faster afterwards.',
    outcome: 1,
    quality: 3,
    postmortem: 'Worked out, but it took four weeks, not three. A coin flip in hindsight.',
  },
];

const NUMBERS: NumberTemplate[] = [
  { topic: 'career', question: 'Hours of deep work next week', unit: 'hours', bid: 15, ask: 22, decimals: 0, horizon: 7, postmortem: 'Block the calendar before the week starts, not during it.' },
  { topic: 'learning', question: 'Pages of the novel I read this week', unit: 'pages', bid: 80, ask: 140, decimals: 0, horizon: 7 },
  { topic: 'health', question: 'Kilometres I run this month', unit: 'km', bid: 40, ask: 60, decimals: 0, horizon: 30 },
  { topic: 'career', question: 'Emails left in my inbox on Friday evening', unit: 'emails', bid: 10, ask: 35, decimals: 0, horizon: 7 },
  { topic: 'money', question: 'Grocery spending this month', unit: '$', bid: 320, ask: 400, decimals: 0, horizon: 30 },
  { topic: 'health', question: 'Daily screen time this week (average)', unit: 'hours', bid: 3, ask: 4.5, decimals: 1, horizon: 7 },
  { topic: 'career', question: 'Job applications sent this month', unit: 'applications', bid: 8, ask: 15, decimals: 0, horizon: 30 },
  { topic: 'health', question: 'My time for the Saturday 5k', unit: 'minutes', bid: 24, ask: 27, decimals: 1, horizon: 14 },
  {
    topic: 'career',
    question: 'Hours to finish the take-home coding challenge',
    unit: 'hours',
    bid: 4,
    ask: 7,
    decimals: 1,
    horizon: 7,
    reasoning: 'The last one took about five hours.',
    requote: { up: 'Halfway through, and the API part is taking longer than expected.', down: 'Went faster than expected once the setup was done.' },
  },
  { topic: 'learning', question: 'Practice coding problems solved this month', unit: 'problems', bid: 20, ask: 35, decimals: 0, horizon: 30 },
  { topic: 'learning', question: 'Words written for the essay draft this week', unit: 'words', bid: 1500, ask: 2500, decimals: 0, horizon: 7 },
  { topic: 'money', question: 'Money spent eating out this month', unit: '$', bid: 120, ask: 200, decimals: 0, horizon: 30, postmortem: 'Logging every meal in the budget app kept me honest.' },
  { topic: 'projects', question: 'GitHub stars on my side project after launch week', unit: 'stars', bid: 15, ask: 60, decimals: 0, horizon: 14, reasoning: 'Posting it to two forums; no idea how it will land.' },
  { topic: 'projects', question: 'Hours to set up the home media server', unit: 'hours', bid: 3, ask: 6, decimals: 1, horizon: 14 },
  { topic: 'money', question: 'Money saved this month', unit: '$', bid: 250, ask: 450, decimals: 0, horizon: 30 },
  { topic: 'social', question: 'People who show up to board-game night', unit: 'people', bid: 6, ask: 10, decimals: 0, horizon: 7 },
  { topic: 'health', question: 'Average hours of sleep per night this week', unit: 'hours', bid: 6.5, ask: 7.5, decimals: 1, horizon: 7 },
  { topic: 'social', question: 'Friends I catch up with in person this month', unit: 'friends', bid: 4, ask: 8, decimals: 0, horizon: 30 },
  { topic: 'projects', question: 'Bugs reported in the first week after the app release', unit: 'bugs', bid: 5, ask: 12, decimals: 0, horizon: 14 },
  { topic: 'learning', question: 'Mark on the machine learning coursework', unit: 'marks', bid: 65, ask: 78, decimals: 0, horizon: 45 },
];

/** How many markets `generateDemoMarkets` returns: the templates plus 3 open and 1 void market. */
export const DEMO_MARKET_COUNT = BINARY.length + DECISIONS.length + NUMBERS.length + 4;

function roundTo(value: number, decimals: 0 | 1): number {
  return decimals === 0 ? Math.round(value) : Math.round(value * 10) / 10;
}

function emptyMarket(kind: MarketKind, topic: DemoTopic, question: string, createdAt: Date, resolveBy: string): BackupMarket {
  return {
    kind,
    isDecision: false,
    question,
    unit: '',
    reasoning: '',
    successCriteria: '',
    options: [],
    chosenOption: null,
    createdAt: createdAt.toISOString(),
    resolveBy,
    status: 'open',
    outcome: null,
    settledValue: null,
    settledAt: null,
    postmortem: '',
    decisionQuality: null,
    tags: [DEMO_TAG, topic],
    quotes: [],
  };
}

function binaryQuote(price: number, at: Date, note = ''): BackupQuote {
  return { price: price / 100, bid: null, ask: null, note, createdAt: at.toISOString() };
}

function numberQuote(bid: number, ask: number, at: Date, note = ''): BackupQuote {
  return { price: null, bid, ask, note, createdAt: at.toISOString() };
}

/** The demo markets as plain data, oldest first. Deterministic for a given `now`. */
export function generateDemoMarkets(now: Date): BackupMarket[] {
  const random = mulberry32(DEMO_SEED);
  /** Whole number in [min, max]. */
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  /** Local calendar day `offset` days from `now`, at the given time. */
  const day = (offset: number, hours = 0, minutes = 0) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hours, minutes);
  const latest = now.getTime() - 60_000;

  // Every settled market draws the same number of random values whatever `now`
  // is, so outcomes and values don't change from day to day.
  function settledDates(horizon: number) {
    const createdDaysAgo = int(horizon + 2, MAX_AGE_DAYS);
    const created = day(-createdDaysAgo, int(7, 22), int(0, 59));
    const resolveOffset = horizon - createdDaysAgo; // at most -2: settle-by is in the past
    const resolveStart = day(resolveOffset);
    const delay = [0, 0, 0, 1, 1, 2][int(0, 5)];
    const settled = day(resolveOffset + delay, int(8, 21), int(0, 59));
    return {
      created,
      resolveBy: toDateString(resolveStart),
      settledAt: new Date(Math.min(settled.getTime(), latest)).toISOString(),
      /** A moment between creation and the settle-by date, for a re-quote. */
      between: (share: number) =>
        new Date(Math.round(created.getTime() + share * (resolveStart.getTime() - created.getTime()))),
    };
  }

  const markets: BackupMarket[] = [];

  for (const template of BINARY) {
    const dates = settledDates(template.horizon);
    const market = emptyMarket('binary', template.topic, template.question, dates.created, dates.resolveBy);
    // Mild overconfidence: what really happens is 20% closer to 50/50 than the quote.
    const trueProbability = 0.5 + 0.8 * (template.price / 100 - 0.5);
    const outcome: 0 | 1 = random() < trueProbability ? 1 : 0;
    market.quotes.push(binaryQuote(template.price, dates.created));
    if (template.requote) {
      const at = dates.between(0.3 + 0.4 * random());
      const up = outcome === 1;
      const price = Math.min(99, Math.max(1, template.price + (up ? template.requote.delta : -template.requote.delta)));
      market.quotes.push(binaryQuote(price, at, up ? template.requote.up : template.requote.down));
    }
    market.reasoning = template.reasoning ?? '';
    market.status = 'settled';
    market.outcome = outcome;
    market.settledAt = dates.settledAt;
    market.postmortem = template.postmortem ? (outcome === 1 ? template.postmortem.yes : template.postmortem.no) : '';
    markets.push(market);
  }

  for (const template of DECISIONS) {
    const dates = settledDates(template.horizon);
    const market = emptyMarket('binary', template.topic, template.question, dates.created, dates.resolveBy);
    market.isDecision = true;
    market.options = [...template.options];
    market.chosenOption = template.chosen;
    market.successCriteria = template.criteria;
    market.quotes.push(binaryQuote(template.price, dates.created));
    market.status = 'settled';
    market.outcome = template.outcome;
    market.settledAt = dates.settledAt;
    market.postmortem = template.postmortem;
    market.decisionQuality = template.quality;
    markets.push(market);
  }

  // Exactly NUMBER_HITS of the values land inside the quote, in shuffled order.
  const inside = NUMBERS.map((_, index) => index < NUMBER_HITS);
  for (let i = inside.length - 1; i > 0; i--) {
    const j = int(0, i);
    [inside[i], inside[j]] = [inside[j], inside[i]];
  }

  NUMBERS.forEach((template, index) => {
    const dates = settledDates(template.horizon);
    const market = emptyMarket('number', template.topic, template.question, dates.created, dates.resolveBy);
    const { bid, ask, decimals } = template;
    const step = decimals === 0 ? 1 : 0.1;
    const u = random();
    const side = random();
    let value: number;
    if (inside[index]) {
      value = roundTo(bid + u * (ask - bid), decimals);
    } else if (side < 0.5) {
      value = Math.max(0, Math.min(roundTo(bid - step, decimals), roundTo(bid * (0.92 - 0.4 * u), decimals)));
    } else {
      value = Math.max(roundTo(ask + step, decimals), roundTo(ask * (1.08 + 0.5 * u), decimals));
    }
    market.unit = template.unit;
    market.quotes.push(numberQuote(bid, ask, dates.created));
    if (template.requote) {
      const at = dates.between(0.3 + 0.4 * random());
      const shift = (value - (bid + ask) / 2) / 2;
      const newBid = Math.max(0, roundTo(bid + shift, decimals));
      const newAsk = Math.max(newBid, roundTo(ask + shift, decimals));
      market.quotes.push(numberQuote(newBid, newAsk, at, shift >= 0 ? template.requote.up : template.requote.down));
    }
    market.reasoning = template.reasoning ?? '';
    market.status = 'settled';
    market.settledValue = value;
    market.settledAt = dates.settledAt;
    market.postmortem = template.postmortem ?? '';
    markets.push(market);
  });

  // Open markets: one past its settle-by date (shows under Due), two upcoming.
  const dueCreated = day(-24, 20, 15);
  const due = emptyMarket(
    'binary',
    'projects',
    'Will I finish the portfolio website before the career fair?',
    dueCreated,
    toDateString(day(-3)),
  );
  due.reasoning = 'Design is done; the project write-ups are the slow part.';
  due.quotes.push(binaryQuote(65, dueCreated));
  markets.push(due);

  const thesisCreated = day(-20, 21, 5);
  const thesis = emptyMarket(
    'number',
    'learning',
    'Pages of the thesis draft written before my supervisor check-in',
    thesisCreated,
    toDateString(day(45)),
  );
  thesis.unit = 'pages';
  thesis.quotes.push(numberQuote(25, 40, thesisCreated));
  thesis.quotes.push(numberQuote(30, 42, day(-8, 7, 40), 'Found a writing routine that works: two hours every morning.'));
  markets.push(thesis);

  const interviewCreated = day(-5, 12, 30);
  const interview = emptyMarket(
    'binary',
    'career',
    'Will I be invited to the second-round interview at the consultancy?',
    interviewCreated,
    toDateString(day(12)),
  );
  interview.quotes.push(binaryQuote(40, interviewCreated));
  markets.push(interview);

  // One void market: the event was cancelled, so it couldn't be settled.
  const voidDates = settledDates(21);
  const voided = emptyMarket(
    'binary',
    'social',
    'Will the hiking club’s autumn trip sell out?',
    voidDates.created,
    voidDates.resolveBy,
  );
  voided.quotes.push(binaryQuote(60, voidDates.created));
  voided.status = 'void';
  voided.settledAt = voidDates.settledAt;
  voided.postmortem = 'The trip was cancelled because of the weather, so this couldn’t be settled.';
  markets.push(voided);

  return markets.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** A stored quote as the input `createMarket` / `requoteMarket` expect. */
export function toQuoteInput(kind: MarketKind, quote: BackupQuote): QuoteInput {
  if (kind === 'binary') {
    if (quote.price === null) throw new Error('Demo quote is missing a price');
    return { kind: 'binary', price: quote.price };
  }
  if (quote.bid === null || quote.ask === null) throw new Error('Demo quote is missing a bid or ask');
  return { kind: 'number', bid: quote.bid, ask: quote.ask };
}
