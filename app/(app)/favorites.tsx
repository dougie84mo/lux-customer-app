import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Avatar, Card, Chip, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { FavoriteButton } from '@/components/FavoriteButton';
import { FavoriteBusiness, useMyFavorites } from '@/lib/favorites';

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// Favorites — the businesses this client has saved. Opens the same business
// profile as discovery; the heart on each row unsaves it (and drops it from the
// list, since the list IS the favorites cache).
//
// A saved business whose plan no longer includes booking (0126) stays in the
// list — it is the client's own data — but says so, and the profile it opens
// has no booking path either.
function FavoritesScreen() {
  const theme = useTheme();
  const { data: favorites, isLoading, error } = useMyFavorites();

  const renderItem = ({ item }: { item: FavoriteBusiness }) => (
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
          {item.booking_enabled === false ? (
            <Chip compact icon="calendar-remove" style={styles.unavailableChip} textStyle={styles.unavailableChipText}>
              Not taking bookings
            </Chip>
          ) : null}
        </View>
        <FavoriteButton business={item} />
      </Card.Content>
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Favorites" />
      </Appbar.Header>

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
          data={favorites ?? []}
          keyExtractor={(b) => b.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
                No favorites yet. Tap the heart on a business to save it here.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },
  unavailableChip: { alignSelf: 'flex-start', marginTop: 6 },
  unavailableChipText: { fontSize: 11, marginVertical: 2 },
  card: { marginBottom: 0 },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});

export default withScreenErrorBoundary(FavoritesScreen);
