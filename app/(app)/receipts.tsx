import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Card, Chip, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useManualRefresh } from '@/hooks/use-manual-refresh';
import { Receipt, SaleStatus, useMyReceipts } from '@/lib/payments';
import { useTranslation } from 'react-i18next';
import { tMessage } from '@/lib/i18n';
import { useFormat } from '@/lib/format';

// Sale kinds with a translated label (payments:kind.*). Unknowns fall back to
// a title-cased version of the raw kind.
const KNOWN_KINDS = ['sale', 'deposit', 'no_show_fee', 'late_cancel_fee'] as const;
type KnownKind = (typeof KNOWN_KINDS)[number];
const isKnownKind = (kind: string): kind is KnownKind => (KNOWN_KINDS as readonly string[]).includes(kind);

const STATUS_COLOR: Record<SaleStatus, string> = {
  pending: '#1976d2',
  processing: '#1976d2',
  succeeded: '#2e7d32',
  failed: '#c62828',
  refunded: '#9e9e9e',
  partially_refunded: '#9e9e9e',
  canceled: '#9e9e9e',
};

function ReceiptsScreen() {
  const theme = useTheme();
  const { t } = useTranslation(['payments', 'common']);
  const f = useFormat();
  const money = f.money;
  const { data, isLoading, error, refetch } = useMyReceipts();
  const kindLabel = (kind: string): string =>
    isKnownKind(kind)
      ? t(`kind.${kind}`)
      : kind.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  const statusMeta = (s: SaleStatus): { label: string; color: string } =>
    STATUS_COLOR[s]
      ? { label: t(`status.${s}`), color: STATUS_COLOR[s] }
      : { label: s, color: theme.colors.onSurfaceVariant };
  // "Tue Sep 30, 2026 · 2:30 PM" — weekday + the dated-time style.
  const when = (iso: string) => f.date(iso, 'weekdayDateYearTime');
  const { refreshing, onRefresh } = useManualRefresh(refetch);

  const renderItem = ({ item }: { item: Receipt }) => {
    const total = item.gross_cents + item.tip_cents;
    const status = statusMeta(item.status);
    return (
      <Card
        style={styles.card}
        onPress={() =>
          router.push({ pathname: '/(app)/receipts/[saleId]', params: { saleId: item.id } })
        }
      >
        <Card.Content>
          <View style={styles.headerRow}>
            <Text variant="titleSmall" style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
              {item.businessName ?? t('labels.payment')}
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
            {when(item.created_at)}
            {item.tip_cents > 0 ? ` · ${t('receipts.tipIncluded', { amount: money(item.tip_cents) })}` : ''}
          </Text>
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('receipts.title')} />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
            {tMessage(error.message)}
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
                {t('receipts.empty')}
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
