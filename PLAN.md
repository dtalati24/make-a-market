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

Everything is measured on a log(1 + value) scale, so 10 points ≈ 10%. Written as
t(x) = ln(1 + x):

- **Spread** = 100 · (t(ask) − t(bid)). This is how wide you quoted.
- **Miss** = 100 · how far outside your quote the real value landed, on the same scale:
  - t(bid) − t(value) if it landed below your bid
  - t(value) − t(ask) if it landed above your ask
  - 0 if it landed inside
- **Cost of a market** = spread + 4 × miss. Lower is better.
  - If the value lands inside, the cost depends only on how tight you were.
  - If it lands outside, the cost depends on how tight you were and how far off it was.
- The best strategy is to quote your honest 25th and 75th percentiles, so the real value
  should land inside about **half** the time. A simulation confirmed this: the best quote
  was 15.25 @ 26.25 against true quartiles of 15.27 @ 26.19, and it caught the value 50.4%
  of the time.
- **Summary figures:**
  - number settled
  - **average cost** (the Number rating)
  - average spread
  - **hit rate** (target 50%) with a 95% Wilson interval
  - share landing below / inside / above (target 25 / 50 / 25)
  - average miss when missed
- **Verdict:**
  - fewer than 5 settled → "not enough data yet"
  - Wilson upper bound < 50% → "quotes too tight"
  - Wilson lower bound > 50% → "quotes too wide"
  - otherwise → "width about right"
- **Trend:** rolling average cost over the last 10 settled markets.

### Ratings

Each kind of market has its own headline rating: **Brier** for Yes/No and **average cost**
for Number. They're in different units and aren't merged into one number.

All scoring lives in pure TypeScript functions (`src/scoring/`), unit-tested against
hand-calculated values.

## 4. Screens

Bottom tabs: **Markets · Stats · Settings**. Plus a **New market** modal, a **Market**
detail screen and an **Edit** modal.

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
  - **Number:** bid and ask fields, with a live spread readout and the hint "aim for a
    range you're 50% sure of"
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
  - the score breakdown (Yes/No: Brier; Number: spread + 4 × miss = cost)
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
  - headline numbers: settled count, average cost, hit rate, average spread
  - width verdict
  - "where the answer landed" bar (below / inside / above vs 25 / 50 / 25)
  - cost trend
  - by-tag table
  - whether re-quoting helped
- Below 20 settled markets, a note warns that the numbers are noisy.

### Settings
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
