import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useState, type DependencyList } from 'react';

import { useDataVersion } from '@/db/events';

export type QueryState<T> = {
  data: T | undefined;
  error: Error | null;
};

/**
 * Runs a database read and re-runs it whenever `deps` change or any write
 * happens anywhere in the app. `deps` must list every value `query` uses.
 */
export function useQuery<T>(query: (db: SQLiteDatabase) => Promise<T>, deps: DependencyList): QueryState<T> {
  const db = useSQLiteContext();
  const version = useDataVersion();
  const [state, setState] = useState<QueryState<T>>({ data: undefined, error: null });

  useEffect(() => {
    let cancelled = false;
    query(db).then(
      (data) => {
        if (!cancelled) setState({ data, error: null });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState((previous) => ({
            data: previous.data,
            error: error instanceof Error ? error : new Error(String(error)),
          }));
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // `query` is intentionally omitted: callers pass an inline function whose
    // inputs are listed in `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version, ...deps]);

  return state;
}
