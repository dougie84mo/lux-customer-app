import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Avatar,
  Card,
  Chip,
  Divider,
  Text,
  useTheme,
} from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { avatarUrl, initialsOf } from '@/lib/avatars';
import { useMyBookingRequests } from '@/lib/booking';
import { SaleStatus, useReceiptDetail } from '@/lib/payments';

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

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

// A single payment, in full: who you paid (business logo + provider), what for,
// the amount breakdown, its status, and the reference.
function ReceiptDetailScreen() {
  const theme = useTheme();
  const { saleId } = useLocalSearchParams<{ saleId: string }>();
  const { data, isLoading, error } = useReceiptDetail(saleId);
  // Provider name comes from the cached bookings list (carries employee_name).
  const { data: bookings } = useMyBookingRequests();

  const providerName = (() => {
    if (!data?.bookingRequestId || !bookings) return null;
    return bookings.find((b) => b.id === data.bookingRequestId)?.employee_name ?? null;
  })();

  const status = data ? STATUS_META[data.status] ?? { label: data.status, color: theme.colors.onSurfaceVariant } : null;
  const total = data ? data.gross_cents + data.tip_cents : 0;
  const logo = avatarUrl(data?.businessLogoUrl);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Payment" />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : error || !data ? (
        <View style={styles.center}>
          <Text variant="bodyMedium" style={{ color: theme.colors.error, textAlign: 'center' }}>
            {error?.message ?? 'This payment could not be found.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {/* Who you paid */}
          <Card style={styles.card}>
            <Card.Content style={styles.payee}>
              {logo ? (
                <Avatar.Image size={56} source={{ uri: logo }} />
              ) : (
                <Avatar.Text size={56} label={initialsOf(data.businessName)} />
              )}
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text variant="titleMedium" style={{ fontWeight: '700' }} numberOfLines={1}>
                  {data.businessName ?? 'Payment'}
                </Text>
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
                  numberOfLines={1}
                >
                  {data.serviceName ?? kindLabel(data.kind)}
                  {providerName ? ` · with ${providerName}` : ''}
                </Text>
              </View>
              {status ? (
                <Chip
                  compact
                  textStyle={{ color: status.color, fontSize: 12 }}
                  style={{ backgroundColor: status.color + '22' }}
                >
                  {status.label}
                </Chip>
              ) : null}
            </Card.Content>
          </Card>

          {/* Amount breakdown */}
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleSmall" style={styles.sectionLabel}>
                {kindLabel(data.kind)}
              </Text>
              <View style={styles.line}>
                <Text variant="bodyMedium">{data.kind === 'deposit' ? 'Deposit' : 'Service'}</Text>
                <Text variant="bodyMedium">{money(data.gross_cents)}</Text>
              </View>
              {data.tip_cents > 0 ? (
                <View style={styles.line}>
                  <Text variant="bodyMedium">Tip</Text>
                  <Text variant="bodyMedium">{money(data.tip_cents)}</Text>
                </View>
              ) : null}
              <Divider style={{ marginVertical: 10 }} />
              <View style={styles.line}>
                <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                  Total
                </Text>
                <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                  {money(total)}
                </Text>
              </View>
            </Card.Content>
          </Card>

          {/* Metadata */}
          <Card style={styles.card}>
            <Card.Content>
              <MetaRow label="Date" value={format(parseISO(data.created_at), 'EEE MMM d, yyyy · h:mm a')} />
              <MetaRow label="Currency" value={data.currency.toUpperCase()} />
              {data.paymentRef ? (
                <MetaRow label="Reference" value={data.paymentRef} mono />
              ) : null}
            </Card.Content>
          </Card>

          <Text variant="bodySmall" style={styles.footnote}>
            100% of any tip goes to your provider. Questions about a charge? Reach out to{' '}
            {data.businessName ?? 'the business'} directly.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.metaRow}>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        {label}
      </Text>
      <Text
        variant="bodySmall"
        style={[styles.metaValue, mono ? styles.mono : null]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 12 },
  card: { marginBottom: 0 },
  payee: { flexDirection: 'row', alignItems: 'center' },
  sectionLabel: { fontWeight: '700', marginBottom: 4 },
  line: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, gap: 12 },
  metaValue: { flex: 1, textAlign: 'right' },
  mono: { fontFamily: 'monospace', fontSize: 11 },
  footnote: { textAlign: 'center', opacity: 0.6, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});

export default withScreenErrorBoundary(ReceiptDetailScreen);
