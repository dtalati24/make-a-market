import { useSyncExternalStore } from 'react';

/**
 * A counter bumped after every write, so screens can re-run their queries.
 * Simpler than SQLite change hooks and works the same on web and Android.
 */
let version = 0;
const listeners = new Set<() => void>();
let batchDepth = 0;
let pendingChange = false;

export function notifyDataChanged(): void {
  if (batchDepth > 0) {
    pendingChange = true;
    return;
  }
  version++;
  for (const listener of listeners) listener();
}

/**
 * Runs many writes (e.g. loading demo data) with a single refresh at the end,
 * instead of every screen re-querying after each write.
 */
export async function batchDataChanges<T>(work: () => Promise<T>): Promise<T> {
  batchDepth++;
  try {
    return await work();
  } finally {
    batchDepth--;
    if (batchDepth === 0 && pendingChange) {
      pendingChange = false;
      notifyDataChanged();
    }
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getVersion(): number {
  return version;
}

export function useDataVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}
