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
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { avatarUrl, initialsOf } from '@/lib/avatars';
import { useMyBookingRequests } from '@/lib/booking';
import { SaleStatus, useReceiptDetail } from '@/lib/payments';
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

// A single payment, in full: who you paid (business logo + provider), what for,
// the amount breakdown, its status, and the reference.
function ReceiptDetailScreen() {
  const theme = useTheme();
  const { t } = useTranslation(['payments', 'common']);
  const f = useFormat();
  const money = f.money;
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
  const { saleId } = useLocalSearchParams<{ saleId: string }>();
  const { data, isLoading, error } = useReceiptDetail(saleId);
  // Provider name comes from the cached bookings list (carries employee_name).
  const { data: bookings } = useMyBookingRequests();

  const providerName = (() => {
    if (!data?.bookingRequestId || !bookings) return null;
    return bookings.find((b) => b.id === data.bookingRequestId)?.employee_name ?? null;
  })();

  const status = data ? statusMeta(data.status) : null;
  const total = data ? data.gross_cents + data.tip_cents : 0;
  const logo = avatarUrl(data?.businessLogoUrl);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('receipt.title')} />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : error || !data ? (
        <View style={styles.center}>
          <Text variant="bodyMedium" style={{ color: theme.colors.error, textAlign: 'center' }}>
            {tMessage(error?.message) ?? t('receipt.notFound')}
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
                  {data.businessName ?? t('labels.payment')}
                </Text>
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
                  numberOfLines={1}
                >
                  {data.serviceName ?? kindLabel(data.kind)}
                  {providerName ? ` · ${t('labels.withProvider', { name: providerName })}` : ''}
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
                <Text variant="bodyMedium">{data.kind === 'deposit' ? t('labels.deposit') : t('labels.service')}</Text>
                <Text variant="bodyMedium">{money(data.gross_cents)}</Text>
              </View>
              {data.tip_cents > 0 ? (
                <View style={styles.line}>
                  <Text variant="bodyMedium">{t('labels.tip')}</Text>
                  <Text variant="bodyMedium">{money(data.tip_cents)}</Text>
                </View>
              ) : null}
              <Divider style={{ marginVertical: 10 }} />
              <View style={styles.line}>
                <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                  {t('labels.total')}
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
              <MetaRow label={t('receipt.date')} value={when(data.created_at)} />
              <MetaRow label={t('receipt.currency')} value={data.currency.toUpperCase()} />
              {data.paymentRef ? (
                <MetaRow label={t('receipt.reference')} value={data.paymentRef} mono />
              ) : null}
            </Card.Content>
          </Card>

          <Text variant="bodySmall" style={styles.footnote}>
            {t('receipt.footnote', { business: data.businessName ?? t('labels.theBusiness') })}
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
