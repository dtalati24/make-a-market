import { createContext, useContext, type ReactNode } from 'react';

import { listMarkets } from '@/db/markets';
import type { Market } from '@/db/types';
import { useQuery } from '@/hooks/use-query';
import { ratingFor } from '@/lib/rating-view';
import type { Rating } from '@/scoring';

export type RatingState = { rating: Rating; markets: Market[] };

const RatingContext = createContext<RatingState | undefined>(undefined);

/** Works out the rating once for the whole app; the badge and the Rating screen read it from here. */
export function RatingProvider({ children }: { children: ReactNode }) {
  const { data: markets } = useQuery(listMarkets, []);
  const value = markets === undefined ? undefined : { rating: ratingFor(markets), markets };
  return <RatingContext value={value}>{children}</RatingContext>;
}

/** The current rating, or undefined while the markets are loading. */
export function useRating(): RatingState | undefined {
  return useContext(RatingContext);
}
