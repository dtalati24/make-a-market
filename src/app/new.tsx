import { useSQLiteContext } from 'expo-sqlite';

import { MarketForm } from '@/components/market-form';
import { ScrollScreen } from '@/components/screen';
import { listTagNames } from '@/db/markets';
import { ValidationError } from '@/db/validation';
import { useQuery } from '@/hooks/use-query';
import { createMarketAction } from '@/lib/actions';
import { goBack } from '@/lib/navigation';

export default function NewMarketScreen() {
  const db = useSQLiteContext();
  const { data: tagNames } = useQuery(listTagNames, []);

  return (
    <ScrollScreen>
      <MarketForm
        allowKindChange
        allowQuoteEdit
        tagSuggestions={tagNames ?? []}
        submitLabel="Create market"
        onSubmit={async ({ input, quote }) => {
          if (!quote) throw new ValidationError('Enter your quote.');
          await createMarketAction(db, { ...input, quote });
          goBack();
        }}
      />
    </ScrollScreen>
  );
}
