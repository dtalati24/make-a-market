import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ActivityIndicator } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { MarketForm } from '@/components/market-form';
import { ScrollScreen } from '@/components/screen';
import { getMarket, listTagNames } from '@/db/markets';
import { useQuery } from '@/hooks/use-query';
import { updateMarketAction } from '@/lib/actions';
import { goBack } from '@/lib/navigation';

export default function EditMarketScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const db = useSQLiteContext();
  const { data: market } = useQuery((database) => getMarket(database, id), [id]);
  const { data: tagNames } = useQuery(listTagNames, []);

  if (market === undefined || tagNames === undefined) {
    return (
      <ScrollScreen>
        <ActivityIndicator />
      </ScrollScreen>
    );
  }
  if (market === null) {
    return (
      <ScrollScreen>
        <EmptyState title="Market not found" message="It may have been deleted." />
      </ScrollScreen>
    );
  }

  const allowQuoteEdit = market.status === 'open' && market.quoteCount <= 1;

  return (
    <ScrollScreen>
      <MarketForm
        key={market.id}
        initial={market}
        allowKindChange={false}
        allowQuoteEdit={allowQuoteEdit}
        tagSuggestions={tagNames}
        submitLabel="Save changes"
        onSubmit={async ({ input, quote }) => {
          await updateMarketAction(db, id, input, allowQuoteEdit && quote ? quote : undefined);
          goBack();
        }}
      />
    </ScrollScreen>
  );
}
