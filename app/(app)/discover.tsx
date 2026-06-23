import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Avatar,
  Button,
  Card,
  Chip,
  Divider,
  List,
  Modal,
  Portal,
  Searchbar,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';
import { router } from 'expo-router';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { NotificationBell } from '@/components/NotificationBell';
import {
  BookableBusiness,
  useBookableBusinesses,
  useServiceCategories,
} from '@/lib/booking';
import { useDeviceLocation } from '@/lib/location';

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'BARBER', label: 'Barber' },
  { value: 'SALON', label: 'Salon' },
  { value: 'SPA', label: 'Spa' },
];

// Section header with Select-all / Deselect-all, mirroring the business app's
// Appointments filter modal.
function FilterSectionHeader({
  title,
  onSelectAll,
  onDeselectAll,
}: {
  title: string;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="titleSmall" style={{ fontWeight: '700' }}>
        {title}
      </Text>
      <View style={styles.sectionHeaderActions}>
        <Button compact onPress={onSelectAll}>
          Select all
        </Button>
        <Button compact onPress={onDeselectAll}>
          Clear
        </Button>
      </View>
    </View>
  );
}

function DiscoverScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  // Multi-select: empty array = no filter (standard search-filter semantics).
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [nearMe, setNearMe] = useState(false);
  const { coords, loading: locLoading, error: locError, request: requestLocation, clear: clearLocation } =
    useDeviceLocation();
  const { data: categories } = useServiceCategories();
  const { data: businesses, isLoading, error } = useBookableBusinesses(
    query,
    typeFilter,
    categoryFilter,
    nearMe ? coords : null,
  );

  const toggleNearMe = async () => {
    if (nearMe) {
      setNearMe(false);
      clearLocation();
      return;
    }
    const c = await requestLocation();
    // On failure the hook sets `error`, which the Snackbar surfaces.
    setNearMe(!!c);
  };

  const allCategories = categories ?? [];
  const activeCount = typeFilter.length + categoryFilter.length;

  const toggle = (setter: (fn: (cur: string[]) => string[]) => void, value: string) =>
    setter((cur) => (cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]));

  const resetFilters = () => {
    setTypeFilter([]);
    setCategoryFilter([]);
  };

  const renderItem = ({ item }: { item: BookableBusiness }) => (
    <Card
      style={styles.card}
      onPress={() =>
        router.push({
          pathname: '/(app)/business/[businessId]',
          params: {
            businessId: item.id,
            name: item.name,
            type: item.type,
            ...(item.logo_url ? { logo_url: item.logo_url } : {}),
            ...(item.description ? { description: item.description } : {}),
          },
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
          {typeof item.distance_km === 'number' ? (
            <Text variant="labelSmall" style={{ color: theme.colors.primary, marginTop: 2 }}>
              {item.distance_km < 1
                ? `${Math.round(item.distance_km * 1000)} m away`
                : `${item.distance_km.toFixed(1)} km away`}
            </Text>
          ) : null}
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <NotificationBell />
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

      {/* Filter trigger row */}
      <View style={styles.filterRow}>
        <Button
          mode={activeCount > 0 ? 'contained-tonal' : 'outlined'}
          icon="tune-variant"
          onPress={() => setFiltersOpen(true)}
        >
          {activeCount > 0 ? `Filters · ${activeCount}` : 'Filters'}
        </Button>
        <Chip
          icon={nearMe ? 'map-marker' : 'map-marker-outline'}
          selected={nearMe}
          showSelectedOverlay
          onPress={toggleNearMe}
          disabled={locLoading}
        >
          Near me
        </Chip>
        {activeCount > 0 && (
          <Chip icon="filter-remove-outline" onPress={resetFilters}>
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
                {query || activeCount > 0
                  ? 'No businesses match your filters.'
                  : 'No bookable businesses yet.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Filter modal — sectioned, Select-all/Deselect-all, Reset/Done. */}
      <Portal>
        <Modal
          visible={filtersOpen}
          onDismiss={() => setFiltersOpen(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
        >
          <View style={styles.modalHeader}>
            <Text variant="titleLarge" style={{ fontWeight: '700' }}>
              Filters
            </Text>
          </View>

          <View style={styles.modalScroll}>
            <FilterSectionHeader
              title="Business type"
              onSelectAll={() => setTypeFilter(TYPE_OPTIONS.map((t) => t.value))}
              onDeselectAll={() => setTypeFilter([])}
            />
            <View style={styles.typeChips}>
              {TYPE_OPTIONS.map((t) => {
                const on = typeFilter.includes(t.value);
                return (
                  <Chip
                    key={t.value}
                    selected={on}
                    showSelectedOverlay
                    showSelectedCheck={false}
                    icon={on ? 'check' : undefined}
                    onPress={() => toggle(setTypeFilter, t.value)}
                  >
                    {t.label}
                  </Chip>
                );
              })}
            </View>

            {allCategories.length > 0 && (
              <>
                <Divider style={styles.modalDivider} />
                <FilterSectionHeader
                  title="Service category"
                  onSelectAll={() => setCategoryFilter([...allCategories])}
                  onDeselectAll={() => setCategoryFilter([])}
                />
                {allCategories.map((c) => {
                  const on = categoryFilter.includes(c);
                  return (
                    <List.Item
                      key={c}
                      title={c}
                      onPress={() => toggle(setCategoryFilter, c)}
                      left={(p) => (
                        <List.Icon
                          {...p}
                          icon={on ? 'checkbox-marked' : 'checkbox-blank-outline'}
                          color={on ? theme.colors.primary : undefined}
                        />
                      )}
                    />
                  );
                })}
              </>
            )}
          </View>

          <View style={styles.modalActions}>
            <Button onPress={resetFilters} disabled={activeCount === 0}>
              Reset
            </Button>
            <Button mode="contained" onPress={() => setFiltersOpen(false)}>
              Done
            </Button>
          </View>
        </Modal>
      </Portal>

      <Snackbar visible={!!locError} onDismiss={clearLocation} duration={4000}>
        {locError ?? ''}
      </Snackbar>
    </View>
  );
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const styles = StyleSheet.create({
  searchWrap: { padding: 16, paddingBottom: 8 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  list: { padding: 16, paddingTop: 8, gap: 8 },
  card: { marginBottom: 0 },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  // Filter modal
  modal: { margin: 20, borderRadius: 16, maxHeight: '80%', overflow: 'hidden' },
  modalHeader: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  modalScroll: { paddingHorizontal: 8, paddingBottom: 8 },
  modalDivider: { marginVertical: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 12,
    paddingRight: 4,
    marginTop: 4,
  },
  sectionHeaderActions: { flexDirection: 'row', alignItems: 'center' },
  typeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});

export default withScreenErrorBoundary(DiscoverScreen);
