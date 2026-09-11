# Make a Market

An Android app for keeping yourself honest about predictions. For each question you
**make a market**:

- **Yes/No markets** — quote one fair price from 1 to 99 (your probability, in %).
  Each settled market scores `100 − 200 × Brier` on the starting price, where the Brier
  score is `(price − outcome)²`: a 50% quote scores 50, a perfect call 100, and a
  confident wrong call can go below 0.
- **Number markets** — quote a bid @ ask and pick your own width. If the answer lands
  outside your quote it scores 0. If it lands inside, it scores
  `100 ÷ (1 + (3.33 × width ÷ answer)²)`: close to 100 for a very narrow quote, 50 when
  the width is 30% of the answer, and about 0 for something like 1 @ 100000.

Your overall **rating** (0–100) sits in the top-right corner of every screen, shaded from
red through orange to green. The Yes/No and Number ratings each start at 50 and move
towards every new score — a Bayesian average with a prior worth 5 markets that follows
roughly your last 30 markets — and the overall rating combines the two. Tap it to see the
breakdown.

Markets can be re-quoted as you learn more (the starting quote is what gets scored),
settled, voided or reopened. Decisions can be logged as Yes/No markets with options, a
success criterion and a 1–5 decision-quality rating. The **Stats** tab shows calibration,
Brier breakdown, trends, by-tag tables and, for Number markets, where the answers landed.

All data stays on the phone (SQLite). **Settings** can export a JSON backup or a CSV
spreadsheet through the share menu, import a backup, load demo data, set a daily
settle-by reminder time, and switch between System, Light and Dark appearance.

The full spec is in [PLAN.md](PLAN.md).

## Stack

Expo SDK 57 · React Native 0.86 · TypeScript (strict) · Expo Router · expo-sqlite ·
expo-notifications (local reminders) · react-native-svg charts.

## Development

```bash
npm install
npm run web        # browser preview (reminders are off on web)
npm run android    # needs a development build or emulator
```

Checks:

```bash
npm run typecheck
npm run lint
npm test
```

## Building the APK

Builds run in the cloud on EAS (project `@dtalati24/make-a-market`). The `preview`
profile produces an installable APK and bumps the version code automatically, so a new
APK installs over the old one and keeps your data.

```bash
npx eas-cli build -p android --profile preview
```

Uninstalling the app deletes its data — export a backup from Settings first.

## Project layout

```
src/app/          routes: tabs (Markets, Stats, Settings), New, Market, Edit
src/db/           schema + migrations, queries, backup, data-change events
src/scoring/      Brier / log score / calibration and Number-market cost, with tests
src/lib/          dates, formatting, reminders, backup format, demo data, actions
src/components/   inputs, rows, charts and UI primitives
scripts/          generate-icons.js draws the app, tab and notification icons
```
