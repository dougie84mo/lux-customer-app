import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Card, Chip, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useManualRefresh } from '@/hooks/use-manual-refresh';
import { Receipt, SaleStatus, useMyReceipts } from '@/lib/payments';

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// Human label per sale kind. Falls back to a title-cased version of unknowns.
const KIND_LABEL: Record<string, string> = {
  sale: 'Payment',
  deposit: 'Deposit',
  no_show_fee: 'No-show fee',
  late_cancel_fee: 'Late-cancellation fee',
};

const STATUS_META: Record<SaleStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#1976d2' },
  processing: { label: 'Processing', color: '#1976d2' },
  succeeded: { label: 'Paid', color: '#2e7d32' },
  failed: { label: 'Failed', color: '#c62828' },
  refunded: { label: 'Refunded', color: '#9e9e9e' },
  partially_refunded: { label: 'Partly refunded', color: '#9e9e9e' },
  canceled: { label: 'Canceled', color: '#9e9e9e' },
};

function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function ReceiptsScreen() {
  const theme = useTheme();
  const { data, isLoading, error, refetch } = useMyReceipts();
  const { refreshing, onRefresh } = useManualRefresh(refetch);

  const renderItem = ({ item }: { item: Receipt }) => {
    const total = item.gross_cents + item.tip_cents;
    const status = STATUS_META[item.status] ?? { label: item.status, color: theme.colors.onSurfaceVariant };
    return (
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.headerRow}>
            <Text variant="titleSmall" style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
              {item.businessName ?? 'Payment'}
            </Text>
            <Text variant="titleSmall" style={{ fontWeight: '700' }}>
              {money(total)}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>
              {kindLabel(item.kind)}
              {item.serviceName ? ` · ${item.serviceName}` : ''}
            </Text>
            <Chip
              compact
              textStyle={{ color: status.color, fontSize: 12 }}
              style={{ backgroundColor: status.color + '22' }}
            >
              {status.label}
            </Chip>
          </View>

          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>
            {format(parseISO(item.created_at), 'EEE MMM d, yyyy · h:mm a')}
            {item.tip_cents > 0 ? ` · incl. ${money(item.tip_cents)} tip` : ''}
          </Text>
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Payments" />
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
          data={data ?? []}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
                No payments yet. When you pay for an appointment, your receipts show up here.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8, flexGrow: 1 },
  card: { marginBottom: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});

export default withScreenErrorBoundary(ReceiptsScreen);
