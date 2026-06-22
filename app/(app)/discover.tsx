import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Avatar,
  Card,
  Chip,
  Divider,
  Menu,
  Searchbar,
  Text,
  useTheme,
} from 'react-native-paper';
import { router } from 'expo-router';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import {
  BookableBusiness,
  useBookableBusinesses,
  useServiceCategories,
} from '@/lib/booking';

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'BARBER', label: 'Barber' },
  { value: 'SALON', label: 'Salon' },
  { value: 'SPA', label: 'Spa' },
];

function DiscoverScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  // Multi-select: empty array = no filter (standard search-filter semantics).
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [categoryMenu, setCategoryMenu] = useState(false);
  const { data: categories } = useServiceCategories();
  const { data: businesses, isLoading, error } = useBookableBusinesses(
    query,
    typeFilter,
    categoryFilter,
  );

  const toggle = (setter: (fn: (cur: string[]) => string[]) => void, value: string) =>
    setter((cur) => (cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]));

  const renderItem = ({ item }: { item: BookableBusiness }) => (
    <Card
      style={styles.card}
      onPress={() =>
        router.push({
          pathname: '/(app)/book/[businessId]',
          params: { businessId: item.id, name: item.name },
        })
      }
    >
      <Card.Content style={styles.cardRow}>
        {item.logo_url ? (
          <Avatar.Image size={44} source={{ uri: item.logo_url }} />
        ) : (
          <Avatar.Text size={44} label={item.name.slice(0, 2).toUpperCase()} />
        )}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text variant="titleSmall" style={{ fontWeight: '600' }} numberOfLines={1}>
            {item.name}
          </Text>
          <Text
            variant="bodySmall"
            numberOfLines={1}
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
          >
            {item.description || titleCase(item.type)}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.Content title="Book" />
      </Appbar.Header>

      <View style={styles.searchWrap}>
        <Searchbar
          placeholder="Search businesses"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.filterRow}>
        {TYPE_OPTIONS.map((t) => {
          const on = typeFilter.includes(t.value);
          return (
            <Chip
              key={t.value}
              selected={on}
              showSelectedCheck={false}
              showSelectedOverlay
              icon={on ? 'check' : undefined}
              onPress={() => toggle(setTypeFilter, t.value)}
            >
              {t.label}
            </Chip>
          );
        })}
        {(categories ?? []).length > 0 && (
          <Menu
            visible={categoryMenu}
            onDismiss={() => setCategoryMenu(false)}
            anchor={
              <Chip
                icon="tag-outline"
                selected={categoryFilter.length > 0}
                showSelectedOverlay
                onPress={() => setCategoryMenu(true)}
              >
                {categoryFilter.length > 0 ? `Category (${categoryFilter.length})` : 'Category'}
              </Chip>
            }
          >
            {(categories ?? []).map((c) => (
              <Menu.Item
                key={c}
                title={c}
                leadingIcon={categoryFilter.includes(c) ? 'checkbox-marked' : 'checkbox-blank-outline'}
                // Keep the menu open so several categories can be toggled at once.
                onPress={() => toggle(setCategoryFilter, c)}
              />
            ))}
            <Divider />
            <Menu.Item
              title="Clear categories"
              disabled={categoryFilter.length === 0}
              onPress={() => {
                setCategoryFilter([]);
                setCategoryMenu(false);
              }}
            />
          </Menu>
        )}
        {(typeFilter.length > 0 || categoryFilter.length > 0) && (
          <Chip
            icon="filter-remove-outline"
            onPress={() => {
              setTypeFilter([]);
              setCategoryFilter([]);
            }}
          >
            Clear
          </Chip>
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
            {error.message}
          </Text>
        </View>
      ) : (
        <FlatList
          data={businesses ?? []}
          keyExtractor={(b) => b.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {query || typeFilter.length > 0 || categoryFilter.length > 0
                  ? 'No businesses match your filters.'
                  : 'No bookable businesses yet.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const styles = StyleSheet.create({
  searchWrap: { padding: 16, paddingBottom: 8 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  list: { padding: 16, paddingTop: 8, gap: 8 },
  card: { marginBottom: 0 },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});

export default withScreenErrorBoundary(DiscoverScreen);
