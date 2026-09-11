import type { SQLiteDatabase } from 'expo-sqlite';

/*
 * expo-sqlite shares one connection, so transactions must never overlap: if a
 * second BEGIN fails because one is already open, withTransactionAsync rolls
 * back the *first* transaction. Every transaction therefore waits for the
 * previous one to finish. Never call transaction() from inside another
 * transaction — it would wait for itself forever.
 */
let queue: Promise<unknown> = Promise.resolve();

export function transaction(db: Pick<SQLiteDatabase, 'withTransactionAsync'>, work: () => Promise<void>): Promise<void> {
  const run = queue.then(() => db.withTransactionAsync(work));
  // The next transaction waits for this one whether it succeeds or fails.
  queue = run.catch(() => {});
  return run;
}
