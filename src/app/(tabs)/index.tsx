import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, SectionList, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { MarketRow } from '@/components/market-row';
import { FixedScreen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { listMarkets } from '@/db/markets';
import type { Market } from '@/db/types';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { useToday } from '@/hooks/use-today';
import {
  allTags,
  groupOpenMarkets,
  matchesFilter,
  settledMarkets,
  type TypeFilter,
} from '@/lib/market-view';

type View_ = 'open' | 'settled';

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'binary', label: 'Yes/No' },
  { value: 'number', label: 'Number' },
  { value: 'decision', label: 'Decisions' },
];

function openMarket(market: Market) {
  router.push({ pathname: '/market/[id]', params: { id: String(market.id) } });
}

export default function MarketsScreen() {
  const theme = useTheme();
  const { data: markets } = useQuery(listMarkets, []);
  const today = useToday();
  const [view, setView] = useState<View_>('open');
  const [type, setType] = useState<TypeFilter>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const all = markets ?? [];
  const tags = allTags(all);
  const activeTag = tag && tags.includes(tag) ? tag : null;
  const filtered = all.filter((market) => matchesFilter(market, { type, tag: activeTag, search }));
  const openCount = all.filter((market) => market.status === 'open').length;
  const settledCount = all.length - openCount;

  let sections: { title: string; data: Market[] }[];
  if (view === 'open') {
    const { due, upcoming } = groupOpenMarkets(filtered, today);
    sections = [
      { title: `Due · ${due.length}`, data: due },
      { title: `Upcoming · ${upcoming.length}`, data: upcoming },
    ].filter((section) => section.data.length > 0);
  } else {
    const settled = settledMarkets(filtered);
    sections = settled.length > 0 ? [{ title: '', data: settled }] : [];
  }

  const filtersActive = type !== 'all' || activeTag !== null || search.trim() !== '';

  const header = (
    <View style={styles.header}>
      <ScreenTitle title="Markets">
        <Button title="+ New" small onPress={() => router.push('/new')} />
      </ScreenTitle>
      <Segmented
        options={[
          { value: 'open', label: `Open · ${openCount}` },
          { value: 'settled', label: `Settled · ${settledCount}` },
        ]}
        value={view}
        onChange={setView}
      />
      {all.length > 0 ? (
        <>
          <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Icon name="search" color={theme.textSecondary} size={18} />
            <TextInput
              accessibilityLabel="Search markets"
              value={search}
              onChangeText={setSearch}
              placeholder="Search"
              placeholderTextColor={theme.textSecondary}
              style={[styles.searchInput, { color: theme.text }]}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {TYPE_FILTERS.map((filter) => (
              <Chip
                key={filter.value}
                label={filter.label}
                selected={type === filter.value}
                onPress={() => setType(filter.value)}
              />
            ))}
            {tags.length > 0 ? <View style={[styles.divider, { backgroundColor: theme.border }]} /> : null}
            {tags.map((name) => (
              <Chip
                key={name}
                label={`#${name}`}
                selected={activeTag === name}
                onPress={() => setTag(activeTag === name ? null : name)}
              />
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );

  let empty: React.ReactElement | null = null;
  if (markets === undefined) {
    empty = null;
  } else if (all.length === 0) {
    empty = (
      <EmptyState
        title="Make your first market"
        message="Quote a price on a Yes/No question, or a bid and ask on a number. Settle it when you find out."
        actionLabel="New market"
        onAction={() => router.push('/new')}
      />
    );
  } else if (filtersActive) {
    empty = <EmptyState title="No markets match" message="Try a different search or filter." />;
  } else if (view === 'open') {
    empty = <EmptyState title="Nothing open" message="Every market is settled. Time to make a new one." />;
  } else {
    empty = <EmptyState title="Nothing settled yet" message="Settled markets and their scores show up here." />;
  }

  return (
    <FixedScreen safeTop>
      <SectionList
        sections={sections}
        keyExtractor={(market) => String(market.id)}
        extraData={today}
        renderItem={({ item }) => <MarketRow market={item} today={today} onPress={() => openMarket(item)} />}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <ThemedText type="caption" themeColor="textSecondary" style={styles.sectionTitle}>
              {section.title}
            </ThemedText>
          ) : null
        }
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
      />
    </FixedScreen>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  list: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three - 4,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    fontSize: 16,
  },
  chips: {
    gap: Spacing.two,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 20,
  },
  sectionTitle: {
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
  },
  separator: {
    height: Spacing.two,
  },
});
