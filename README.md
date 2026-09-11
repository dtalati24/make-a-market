# Make a Market

An Android app for keeping yourself honest about predictions. For each question you
**make a market**:

- **Yes/No markets** — quote one fair price from 1 to 99 (your probability, in %).
  Scored by Brier score on the starting price: `(price − outcome)²`, where 0 is perfect
  and a 50% guess scores 0.250.
- **Number markets** — quote a bid @ ask and pick your own width. When it settles, the
  cost is `spread + 4 × miss`, measured on a `ln(1 + x)` scale in points. The best
  long-run play is to quote your honest 25th and 75th percentiles, so the answer lands
  inside about half the time.

Markets can be re-quoted as you learn more (the starting quote is what gets scored),
settled, voided or reopened. Decisions can be logged as Yes/No markets with options, a
success criterion and a 1–5 decision-quality rating. The **Stats** tab shows calibration,
Brier breakdown, trends, by-tag tables and, for Number markets, where the answers landed.

All data stays on the phone (SQLite). **Settings** can export a JSON backup or a CSV
spreadsheet through the share menu, import a backup, load demo data and set a daily
settle-by reminder time.

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
