import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { todayString } from '@/lib/dates';

/**
 * Today's local date ("YYYY-MM-DD"). Updates just after midnight and whenever
 * the app comes back to the foreground, so "due" labels don't go stale.
 */
export function useToday(): string {
  const [today, setToday] = useState(todayString);

  useEffect(() => {
    const refresh = () => setToday(todayString());
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleMidnight = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = setTimeout(() => {
        refresh();
        scheduleMidnight();
      }, next.getTime() - now.getTime());
    };
    scheduleMidnight();
    return () => {
      subscription.remove();
      clearTimeout(timer);
    };
  }, []);

  return today;
}
