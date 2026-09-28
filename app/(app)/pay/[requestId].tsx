import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Avatar,
  Banner,
  Button,
  Card,
  Divider,
  HelperText,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { SelectableChip } from '@/components/SelectableChip';
import { supabase } from '@/lib/supabase';
import { useAppointmentCheckout } from '@/lib/checkout';
import { useMyAppointmentSale, useMyDepositApplied, waitForSaleResolved } from '@/lib/payments';
import { paymentBalanceCents } from '@/lib/bookingLogic';
import { useBusinessPublic } from '@/lib/businessDetail';
import { useBarberProfile } from '@/lib/barberProfile';
import { avatarUrl, initialsOf } from '@/lib/avatars';
import { useTranslation } from 'react-i18next';
import { tMessage } from '@/lib/i18n';
import { useFormat } from '@/lib/format';

// Tip presets as a fraction of the service subtotal. Custom lets the client type
// a dollar amount instead.
const TIP_PRESETS = [0, 0.15, 0.18, 0.2, 0.25];

// Everything the pay screen needs, resolved from the booking request id:
// the appointment to charge (my_booking_requests doesn't expose it) and the
// service's price/name (authoritative subtotal for display — the edge function
// re-derives the real charge server-side).
type PayContext = {
  appointmentId: string | null;
  businessId: string;
  serviceId: string | null;
  serviceName: string | null;
  priceCents: number | null;
};

function usePayContext(requestId: string | undefined) {
  return useQuery({
    queryKey: ['pay-context', requestId],
    enabled: !!requestId,
    queryFn: async (): Promise<PayContext> => {
      // RLS booking_requests_select_own lets the requester read their own row.
      const { data: br, error: brErr } = await supabase
        .from('booking_requests')
        .select('appointment_id, business_id, service_id')
        .eq('id', requestId!)
        .maybeSingle();
      if (brErr) throw brErr;
      if (!br) throw new Error('payments:errors.bookingNotFound');
      const row = br as { appointment_id: string | null; business_id: string; service_id: string | null };

      let serviceName: string | null = null;
      let priceCents: number | null = null;
      if (row.service_id) {
        const { data: svcs, error: svcErr } = await supabase.rpc('business_services_public', {
          p_business_id: row.business_id,
        });
        if (svcErr) throw svcErr;
        const svc = ((svcs ?? []) as { id: string; name: string; price: number }[]).find(
          (s) => s.id === row.service_id,
        );
        if (svc) {
          serviceName = svc.name;
          priceCents = Math.round(svc.price * 100);
        }
      }
      return {
        appointmentId: row.appointment_id,
        businessId: row.business_id,
        serviceId: row.service_id,
        serviceName,
        priceCents,
      };
    },
  });
}

function PayScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const { t } = useTranslation(['payments', 'common']);
  const { money } = useFormat();
  const {
    requestId,
    businessName,
    serviceName: serviceNameParam,
    employeeId,
    employeeName,
  } = useLocalSearchParams<{
    requestId: string;
    businessName?: string;
    serviceName?: string;
    employeeId?: string;
    employeeName?: string;
  }>();

  const ctx = usePayContext(requestId);
  const appointmentId = ctx.data?.appointmentId ?? undefined;
  const businessId = ctx.data?.businessId;
  const existingSale = useMyAppointmentSale(appointmentId);
  const depositApplied = useMyDepositApplied({
    bookingRequestId: typeof requestId === 'string' ? requestId : undefined,
    appointmentId,
  });
  const { runCheckout, processing, nativeAvailable } = useAppointmentCheckout();

  // For the paid landing: who you paid (company logo) + your provider.
  const bizPublic = useBusinessPublic(businessId);
  const provider = useBarberProfile(businessId, typeof employeeId === 'string' ? employeeId : undefined);
  const businessDisplayName =
    bizPublic.data?.name ?? (typeof businessName === 'string' ? businessName : undefined) ?? t('labels.theBusiness');
  const providerDisplayName =
    provider.data?.name ?? (typeof employeeName === 'string' ? employeeName : undefined) ?? null;
  const bizLogo = avatarUrl(bizPublic.data?.logo_url);

  const [tipPreset, setTipPreset] = useState<number | 'custom'>(0);
  const [customTip, setCustomTip] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [done, setDone] = useState<'paid' | 'finalizing' | null>(null);

  const priceCents = ctx.data?.priceCents ?? 0;

  const tipCents = useMemo(() => {
    if (tipPreset === 'custom') {
      const dollars = parseFloat(customTip.replace(/[^0-9.]/g, ''));
      return Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : 0;
    }
    return Math.round(priceCents * tipPreset);
  }, [tipPreset, customTip, priceCents]);

  // A prior deposit is auto-applied by the edge function, so the client only owes
  // the balance (never below zero) plus any tip.
  const depositCents = depositApplied.data ?? 0;
  const totalCents = paymentBalanceCents(priceCents, depositCents, tipCents);
  const serviceName = ctx.data?.serviceName ?? serviceNameParam ?? t('labels.appointment');
  const alreadyPaid = existingSale.data?.status === 'succeeded';

  const onPay = async () => {
    if (!ctx.data?.businessId || !appointmentId) return;
    const result = await runCheckout({
      businessId: ctx.data.businessId,
      appointmentId,
      tipCents,
      merchantName: typeof businessName === 'string' ? businessName : 'LUX Booking',
    });
    if (result.status === 'canceled') return; // user dismissed the sheet
    if (result.status === 'failed') {
      setFeedback(tMessage(result.error) ?? t('resolved.failed'));
      return;
    }
    // Captured client-side — confirm the webhook reconciled it before showing paid.
    const resolved = result.saleId ? await waitForSaleResolved(result.saleId) : 'pending';
    qc.invalidateQueries({ queryKey: ['my-appointment-sale', appointmentId] });
    qc.invalidateQueries({ queryKey: ['my-booking-requests'] });
    qc.invalidateQueries({ queryKey: ['my-receipts'] });
    if (resolved === 'succeeded') {
      setDone('paid');
    } else if (resolved === 'pending' || resolved === 'processing') {
      setDone('finalizing');
    } else {
      setFeedback(t(`resolved.${resolved}`));
    }
  };

  const loading = ctx.isLoading || existingSale.isLoading;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('pay.title')} subtitle={typeof businessName === 'string' ? businessName : undefined} />
      </Appbar.Header>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : ctx.error ? (
        <View style={styles.center}>
          <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
            {tMessage(ctx.error.message)}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {!nativeAvailable ? (
            <Banner visible icon="cellphone-arrow-down" style={styles.banner}>
              {t('pay.nativeMissing')}
            </Banner>
          ) : null}

          {/* Already paid (by me) → dynamic receipt: who you paid + your provider. */}
          {alreadyPaid || done === 'paid' ? (
            <Card style={styles.card}>
              <Card.Content style={styles.paidContent}>
                {bizLogo ? (
                  <Avatar.Image size={76} source={{ uri: bizLogo }} />
                ) : (
                  <Avatar.Text size={76} label={initialsOf(businessDisplayName)} />
                )}
                <View style={styles.paidBadgeRow}>
                  <Avatar.Icon
                    size={22}
                    icon="check"
                    color="#fff"
                    style={{ backgroundColor: '#2e7d32' }}
                  />
                  <Text variant="titleMedium" style={{ color: '#2e7d32', fontWeight: '700', marginLeft: 6 }}>
                    {t('labels.paid')}
                  </Text>
                </View>
                <Text variant="titleMedium" style={{ fontWeight: '700', marginTop: 8, textAlign: 'center' }}>
                  {t('pay.youPaid', { business: businessDisplayName })}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                  {serviceName}
                  {existingSale.data
                    ? ` · ${money(existingSale.data.gross_cents + existingSale.data.tip_cents)}`
                    : ''}
                </Text>

                {providerDisplayName ? (
                  <View style={styles.providerRow}>
                    {avatarUrl(provider.data?.avatar_path) ? (
                      <Avatar.Image size={28} source={{ uri: avatarUrl(provider.data?.avatar_path)! }} />
                    ) : (
                      <Avatar.Text size={28} label={initialsOf(providerDisplayName)} />
                    )}
                    <Text variant="bodySmall" style={{ marginLeft: 8 }}>
                      {t('labels.withProvider', { name: providerDisplayName })}
                    </Text>
                  </View>
                ) : null}

                {existingSale.data ? (
                  <Button
                    mode="text"
                    icon="receipt"
                    style={{ marginTop: 12 }}
                    onPress={() =>
                      router.push({
                        pathname: '/(app)/receipts/[saleId]',
                        params: { saleId: existingSale.data!.id },
                      })
                    }
                  >
                    {t('pay.viewReceipt')}
                  </Button>
                ) : null}
                <Button mode="contained" style={{ marginTop: 4 }} onPress={() => router.back()}>
                  {t('common:actions.done')}
                </Button>
              </Card.Content>
            </Card>
          ) : done === 'finalizing' ? (
            <Card style={styles.card}>
              <Card.Content style={styles.paidContent}>
                <ActivityIndicator />
                <Text variant="titleMedium" style={{ marginTop: 12, fontWeight: '700' }}>
                  {t('pay.finalizingTitle')}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
                  {t('pay.finalizingBody')}
                </Text>
                <Button mode="contained" style={{ marginTop: 16 }} onPress={() => router.back()}>
                  {t('common:actions.done')}
                </Button>
              </Card.Content>
            </Card>
          ) : !appointmentId ? (
            <Card style={styles.card}>
              <Card.Content>
                <Text variant="bodyMedium">
                  {t('pay.notConfirmed')}
                </Text>
              </Card.Content>
            </Card>
          ) : (
            <>
              <Card style={styles.card}>
                <Card.Content>
                  <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                    {serviceName}
                  </Text>
                  <View style={styles.lineRow}>
                    <Text variant="bodyMedium">{t('labels.service')}</Text>
                    <Text variant="bodyMedium">{money(priceCents)}</Text>
                  </View>
                  {depositCents > 0 ? (
                    <View style={styles.lineRow}>
                      <Text variant="bodyMedium" style={{ color: '#2e7d32' }}>
                        {t('labels.depositPaid')}
                      </Text>
                      <Text variant="bodyMedium" style={{ color: '#2e7d32' }}>
                        −{money(depositCents)}
                      </Text>
                    </View>
                  ) : null}
                  {tipCents > 0 ? (
                    <View style={styles.lineRow}>
                      <Text variant="bodyMedium">{t('labels.tip')}</Text>
                      <Text variant="bodyMedium">{money(tipCents)}</Text>
                    </View>
                  ) : null}
                  <Divider style={{ marginVertical: 8 }} />
                  <View style={styles.lineRow}>
                    <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                      {t('labels.total')}
                    </Text>
                    <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                      {money(totalCents)}
                    </Text>
                  </View>
                </Card.Content>
              </Card>

              <Text variant="titleSmall" style={styles.sectionLabel}>
                {t('pay.addTip')}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                {t('pay.tipNote')}
              </Text>
              <View style={styles.tipRow}>
                {TIP_PRESETS.map((p) => (
                  <SelectableChip
                    key={p}
                    selected={tipPreset === p}
                    onPress={() => setTipPreset(p)}
                    style={styles.tipChip}
                  >
                    {p === 0 ? t('pay.noTip') : t('pay.tipPercent', { percent: Math.round(p * 100) })}
                  </SelectableChip>
                ))}
                <SelectableChip
                  selected={tipPreset === 'custom'}
                  onPress={() => setTipPreset('custom')}
                  style={styles.tipChip}
                >
                  {t('pay.customTip')}
                </SelectableChip>
              </View>
              {tipPreset === 'custom' ? (
                <TextInput
                  mode="outlined"
                  label={t('pay.tipAmount')}
                  keyboardType="decimal-pad"
                  left={<TextInput.Affix text="$" />}
                  value={customTip}
                  onChangeText={setCustomTip}
                  style={styles.customTip}
                />
              ) : null}

              <HelperText type="info" visible={priceCents === 0}>
                {t('pay.finalAmountNote')}
              </HelperText>

              {totalCents === 0 ? (
                <HelperText type="info" visible style={{ marginTop: 8 }}>
                  {t('pay.depositCoversAll')}
                </HelperText>
              ) : null}
              <Button
                mode="contained"
                icon="credit-card-outline"
                style={styles.payBtn}
                loading={processing}
                disabled={processing || !nativeAvailable || totalCents === 0}
                onPress={onPay}
              >
                {t('pay.payAmount', { amount: money(totalCents) })}
              </Button>
            </>
          )}
        </ScrollView>
      )}

      <Snackbar visible={!!feedback} onDismiss={() => setFeedback(null)} duration={5000}>
        {feedback ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  banner: { marginBottom: 12 },
  card: { marginBottom: 12 },
  paidContent: { alignItems: 'center', paddingVertical: 16 },
  paidBadgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  providerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  sectionLabel: { marginTop: 8, fontWeight: '700' },
  tipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tipChip: { marginBottom: 4 },
  customTip: { marginTop: 8 },
  payBtn: { marginTop: 20 },
});

export default withScreenErrorBoundary(PayScreen);
