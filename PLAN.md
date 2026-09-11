# Make a Market — Project Plan (v1)

Status: **approved 2026-09-11**. Building milestone by milestone.

## 1. What it is

An Android app where you **make markets** on things in your life, then settle them when the
answer is known. Two kinds of market:

- **Yes/No markets:** "Will I get the offer by Oct 31?" You quote one fair price, 1–99
  (e.g. **72** means you think it's 72% likely).
- **Number markets:** "Hours of deep work this week?" You quote a bid and an ask
  (e.g. **18 @ 24**). You choose the width. Tighter quotes score better, but only if
  the real number lands inside them.

Decisions ("take job A over B") are Yes/No markets on "will this work out?", with extra
decision fields.

Over time the app rates you on each kind of market and shows where you're over- or
under-confident. Everything is stored on the phone. No account, no server, no internet.

## 2. Tech stack

| Piece | Choice |
|---|---|
| Language / framework | TypeScript, React Native 0.86 via Expo SDK 57 |
| Navigation | Expo Router: native bottom tabs + stack screens + modals |
| Storage | `expo-sqlite` (plain SQL, versioned migrations via `PRAGMA user_version`) |
| Charts | Custom SVG with `react-native-svg` |
| Reminders | `expo-notifications` (local only) |
| Inputs | `@react-native-community/slider`, `@react-native-community/datetimepicker` |
| Backup | `expo-file-system` + `expo-sharing` (export), `expo-document-picker` (import) |
| Dates | `date-fns` |
| Tests / checks | Jest (`jest-expo`), `tsc --noEmit`, ESLint (`eslint-config-expo`) |
| Builds | EAS Build (cloud, account `dtalati24`) → installable APK |

App name **Make a Market**, Android package `com.dtalati24.makeamarket`. The project folder
stays `forecast-journal`.

## 3. Scoring

All scores use your **starting quote**, i.e. your honest first call. Stats also shows the
final-quote version under "did re-quoting help?". Void markets are excluded from all scores.

### Yes/No markets

p = your price ÷ 100, capped at 0.01–0.99. o = 1 if YES, 0 if NO.

- **Brier score:** the average of (p − o)². 0 is perfect; always saying 50 scores 0.25.
- **Skill vs base rate:** 1 − Brier ÷ (ō(1−ō)), where ō is the overall YES rate. Above 0
  means you beat always quoting your base rate. Not shown when ō is 0 or 1.
- **Log score:** the average of o·ln p + (1−o)·ln(1−p). Closer to 0 is better.
- **Calibration buckets:** ten 10-point buckets by price, i.e. bucket = min(floor(p·10), 9).
  For each: average p, how often YES actually happened, count, and a 95% Wilson interval.
- **Overconfidence:** average of max(p, 1−p), minus the share of markets where you picked
  the right side (a price of exactly 50 counts as half right). Positive means overconfident.
- **Murphy breakdown**, over the same buckets:
  - reliability = Σ nₖ(p̄ₖ − ōₖ)² / N (calibration error)
  - resolution = Σ nₖ(ōₖ − ō)² / N
  - uncertainty = ō(1−ō)
  - Brier ≈ reliability − resolution + uncertainty. It's exact when every market in a
    bucket has the same price.
- **Trend:** rolling Brier over the last 10 settled markets, in order of settlement.

### Number markets

Values must be **≥ 0**. For things that can go negative, make a market on the level
instead of the change (e.g. "my weight on Dec 1" rather than "weight change").

**Score of a market, 0–100** (higher is better):

- **0** if the real value lands outside your quote (a value exactly on the bid or ask
  counts as inside).
- **100 ÷ (1 + (k × width ÷ max(value, 1))²)** if it lands inside, with k = 10/3, so a
  quote whose width is 30% of the answer scores 50, an exact quote scores 100, and one
  like 1 @ 100000 scores about 0. Answers below 1 are divided by 1.
- The app gives no coaching on how wide to quote, and the rule has no fixed recipe: a
  simulation showed the best quote catches the answer ~88–97% of the time when you're
  sure and only ~12–19% when you're unsure, and neither "always cover X%" nor "always
  quote ±X%" comes close to quoting each market on its merits. Dividing by the answer
  doesn't reward quoting low or high (the best window stays centred on your median).
- **Summary figures:** number settled, **average score**, hit rate, average width ÷
  answer, share landing below / inside / above, average score when inside.
- **Trend:** rolling average score over the last 10 settled markets.

### Rating (0–100)

- Every settled market gets a score: Yes/No = **100 − 200 × Brier** (a 50% quote scores
  50; a confident wrong call can go below 0); Number = the 0–100 score above.
- The Yes/No and Number ratings each start at 50 and move towards every new score by
  gain = max(1 ÷ (markets so far + 5), 1/30). Until the gain reaches 1/30 this is the
  Bayesian average with a prior of 50 worth 5 markets; after that it follows roughly the
  last 30 markets. Each has a ~95% ± range.
- The **overall rating** averages the two, each weighted by n ÷ (n + 5), and is held
  between 0 and 100. It's shown top right on every screen, red (0) → orange (50) →
  green (100); tapping it opens the Rating screen.

All scoring lives in pure TypeScript functions (`src/scoring/`), unit-tested against
hand-calculated values.

## 4. Screens

Bottom tabs: **Markets · Stats · Settings**. Plus a **New market** modal, a **Market**
detail screen and an **Edit** modal. The rating badge sits top right on every screen and
opens a **Rating** screen (overall and per-kind ratings with ± ranges, a chart over time,
recent markets and how it works).

### Markets (home)
- An **Open | Settled** switch at the top.
- **Open:**
  - **Due** (past the settle date, oldest first), then **Upcoming** (by settle date)
  - rows show the question, your quote, a Decision badge, tags and a due label
    ("in 5d", "2d overdue")
- **Settled:**
  - compact rows showing the question, your quote, the result, and the score in green or red
  - most recent first
- Search box, plus filter chips for All / Yes-No / Number / Decisions and for tags.
  Filters apply to both views.
- A **+** button opens New market.

### New market (modal)
- Type: **Yes/No** or **Number**, with a **This is a decision** toggle for Yes/No.
- Question. Number markets also get a unit, e.g. "hours".
- **Quote:**
  - **Yes/No:** a slider (1–99), quick picks (10/25/50/75/90) and −/+ buttons
  - **Number:** bid and ask fields, with a live readout of the width (as % of the
    midpoint) and what the quote would score if the answer landed in the middle
- **Decision fields:** options (2 or more), which one you chose, what "worked out" means.
- **Settle by:** quick picks (1 week, 1 month, 3 months, 6 months, 1 year) or a date picker.
- **Tags:** tap existing tags or type new ones.
- **Reasoning:** optional.
- Saving also schedules the reminder.

### Market detail
- Summary: question, current quote and starting quote, created and settle-by dates, tags,
  reasoning.
- For decisions: the options with the chosen one highlighted, and what "worked out" means.
- **Quote history:** a chart (a price line for Yes/No, a bid–ask band for Number) and a list
  of re-quotes, each with a note.
- **Re-quote** (open markets only).
- **Settle:**
  - Yes/No: YES / NO. Decisions show "Worked out / Didn't".
  - Number: enter the real value.
  - **Void** is available for both. Every option asks for confirmation.
- After settling, a result card with:
  - the score breakdown (Yes/No: 100 − 200 × Brier; Number: 0 outside, the width
    formula inside) and how much the market moved your rating
  - a post-mortem note
  - for decisions: a 1–5 decision-quality rating
- **Reopen**, **Edit** and **Delete** (asks for confirmation).
- The starting quote can be edited only while the market is open and has never been
  re-quoted.

### Stats
- A **Yes/No | Number** switch, plus a tag filter.
- **Yes/No:**
  - headline numbers: settled count, Brier, skill vs base rate, log score
  - confidence verdict and calibration chart (with Wilson error bars)
  - Brier breakdown and trend
  - by-tag table
  - whether re-quoting helped
  - decision quality vs outcome (2×2 grid):

    |  | Worked out | Didn't |
    |---|---|---|
    | **Good call (4–5)** | Earned | Bad luck |
    | **Bad call (1–2)** | Dumb luck | Deserved |

    Decisions rated 3 aren't placed in the grid.
- **Number:**
  - headline numbers: settled count, average score, hit rate, average width ÷ answer
  - "where the answer landed" bar (below / inside / above), with no targets
  - score trend
  - by-tag table
  - whether re-quoting helped
- Below 20 settled markets, a note warns that the numbers are noisy.

### Settings
- Appearance: System (follows the phone), Light or Dark.
- Reminders on/off and time of day (default 9:00 AM).
- Export as JSON (full backup) or CSV, through the Android share menu.
- Import a JSON backup. Replaces all data, with confirmation.
- Demo data: sample settled markets of both kinds, tagged `demo`. Removed with one tap.
- Delete all data, with confirmation.
- App version.

## 5. Data model (SQLite)

**markets**

| Column | Notes |
|---|---|
| id | integer, primary key |
| kind | `binary` or `number` |
| is_decision | 0/1 |
| question | text |
| unit | text |
| initial_price, price | Yes/No markets; real, 0.01–0.99 |
| initial_bid, initial_ask, bid, ask | Number markets; real, ≥ 0, bid ≤ ask |
| reasoning | text |
| success_criteria | text |
| options | JSON array |
| chosen_option | text |
| created_at | ISO datetime |
| resolve_by | `YYYY-MM-DD` |
| status | `open`, `settled` or `void` |
| outcome | 0/1, Yes/No markets |
| settled_value | Number markets |
| settled_at | ISO datetime |
| postmortem | text |
| decision_quality | 1–5 |
| notification_id | ID of the scheduled reminder |

**quotes**: id, market_id (deleted along with its market), price, bid, ask, note, created_at.
The starting quote is the first row.

**tags**: id, name (unique, case-insensitive)

**market_tags**: market_id, tag_id

**settings**: key, value

## 6. Reminders

- Notification permission is requested the first time you save a market, not at launch.
- Each open market gets one reminder on its settle-by date at your reminder time.
  Tapping it opens that market.
- Editing the date, or changing the reminder time, reschedules reminders. Settling,
  voiding or deleting cancels them. Reopening schedules the reminder again if the date is
  still in the future.
- If the reminder time has already passed, no reminder is scheduled. The market simply
  shows up under **Due**.

## 7. Project structure

```
src/
  app/                        routes
    _layout.tsx               database provider, theme, root stack, notification taps
    (tabs)/_layout.tsx        Markets / Stats / Settings
    (tabs)/index.tsx          Markets
    (tabs)/stats.tsx          Stats
    (tabs)/settings.tsx       Settings
    new.tsx                   New market (modal)
    market/[id]/index.tsx     Market detail
    market/[id]/edit.tsx      Edit (modal)
  db/                         schema + migrations, types, queries, data-change events
  scoring/                    Yes/No + Number scoring, stats + tests
  lib/                        reminders, dates, format, export/import, demo data, confirm
  components/                 inputs, rows, charts, UI primitives
  constants/theme.ts          colours, spacing, fonts
scripts/generate-icons.js     draws the app / tab / notification icons
```

## 8. Building and installing

- `eas.json` profile `preview` builds an APK. Each build increases the version number
  automatically, so a new APK installs over the old one and keeps your data.
- Build command: `eas build -p android --profile preview`. You get a link or QR code to
  install from.
- Uninstalling the app wipes its data, so export a backup first.

## 9. Testing

- **Unit tests:** all scoring maths, date helpers, number parsing, import validation.
- **Every milestone:** type check, lint, and tests pass. I also check the screens in the
  web preview.
- **Web preview limitations:** web SQLite is experimental, and reminders are turned off
  on web.
- **Phone-only checks:** reminders and Android-specific behaviour. APKs are built at the
  checkpoints below.

## 10. Milestones

Each milestone ends with a local commit (authored by dtalati24, no Claude co-author line).

1. Setup & skeleton: rename, config, remove template content, tabs/routes
2. Data layer + core Markets flow (create / list / detail / settle / edit / delete) → **APK 1**
3. Scoring engine + tests
4. Stats screen + demo data
5. Re-quotes + reminders
6. Decisions
7. Settings (export/import, reminder time, delete all) + polish + icons → **APK 2 (v1.0)**

## 11. Not in v1

- A counterparty that trades against your Yes/No quotes. Claude would quote an outside
  view, and Yes/No markets would get a bid/ask width.
- Number markets on values that can go negative.
- Multi-option markets. Cloud backup/sync. Home-screen widget. iOS build.
