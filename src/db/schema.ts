import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'makeamarket.db';

/**
 * Each entry upgrades the schema by one version. Never edit a shipped
 * migration — append a new one so existing installs keep their data.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE markets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('binary', 'number')),
    is_decision INTEGER NOT NULL DEFAULT 0 CHECK (is_decision IN (0, 1)),
    question TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT '',
    initial_price REAL,
    price REAL,
    initial_bid REAL,
    initial_ask REAL,
    bid REAL,
    ask REAL,
    reasoning TEXT NOT NULL DEFAULT '',
    success_criteria TEXT NOT NULL DEFAULT '',
    options TEXT NOT NULL DEFAULT '[]',
    chosen_option TEXT,
    created_at TEXT NOT NULL,
    resolve_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled', 'void')),
    outcome INTEGER CHECK (outcome IN (0, 1)),
    settled_value REAL,
    settled_at TEXT,
    postmortem TEXT NOT NULL DEFAULT '',
    decision_quality INTEGER CHECK (decision_quality BETWEEN 1 AND 5),
    notification_id TEXT,
    CHECK (kind = 'number' OR (initial_price > 0 AND initial_price < 1 AND price > 0 AND price < 1)),
    CHECK (kind = 'binary' OR (initial_bid >= 0 AND initial_ask >= initial_bid AND bid >= 0 AND ask >= bid)),
    CHECK (kind = 'binary' OR is_decision = 0)
  );

  CREATE TABLE quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market_id INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    price REAL,
    bid REAL,
    ask REAL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX quotes_by_market ON quotes (market_id, id);

  CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
  );

  CREATE TABLE market_tags (
    market_id INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (market_id, tag_id)
  );
  CREATE INDEX market_tags_by_tag ON market_tags (tag_id);

  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  // Foreign keys are off by default in SQLite and must be enabled per connection.
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync('PRAGMA journal_mode = WAL;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `Database is from a newer version of the app (schema ${current}, app supports ${SCHEMA_VERSION}).`,
    );
  }

  // Nothing else touches the database while the provider initialises, so a
  // plain transaction is enough (the exclusive variant isn't available on web).
  for (let version = current; version < SCHEMA_VERSION; version++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
