import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
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
import { useMyAppointmentSale, waitForSaleResolved } from '@/lib/payments';

// Tip presets as a fraction of the service subtotal. Custom lets the client type
// a dollar amount instead.
const TIP_PRESETS = [0, 0.15, 0.18, 0.2, 0.25];

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

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
      if (!br) throw new Error('Booking not found.');
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
  const { requestId, businessName, serviceName: serviceNameParam } = useLocalSearchParams<{
    requestId: string;
    businessName?: string;
    serviceName?: string;
  }>();

  const ctx = usePayContext(requestId);
  const appointmentId = ctx.data?.appointmentId ?? undefined;
  const existingSale = useMyAppointmentSale(appointmentId);
  const { runCheckout, processing, nativeAvailable } = useAppointmentCheckout();

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

  const totalCents = priceCents + tipCents;
  const serviceName = ctx.data?.serviceName ?? serviceNameParam ?? 'Appointment';
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
      setFeedback(result.error ?? 'Payment failed.');
      return;
    }
    // Captured client-side — confirm the webhook reconciled it before showing paid.
    const resolved = result.saleId ? await waitForSaleResolved(result.saleId) : 'pending';
    qc.invalidateQueries({ queryKey: ['my-appointment-sale', appointmentId] });
    qc.invalidateQueries({ queryKey: ['my-booking-requests'] });
    qc.invalidateQueries({ queryKey: ['my-paid-booking-ids'] });
    if (resolved === 'succeeded') {
      setDone('paid');
    } else if (resolved === 'pending' || resolved === 'processing') {
      setDone('finalizing');
    } else {
      setFeedback(`Payment ${resolved}.`);
    }
  };

  const loading = ctx.isLoading || existingSale.isLoading;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Pay" subtitle={typeof businessName === 'string' ? businessName : undefined} />
      </Appbar.Header>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : ctx.error ? (
        <View style={styles.center}>
          <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
            {ctx.error.message}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {!nativeAvailable ? (
            <Banner visible icon="cellphone-arrow-down" style={styles.banner}>
              Payments need the latest app build. Reinstall the dev client to pay in-app.
            </Banner>
          ) : null}

          {/* Already paid (by me) → receipt, no pay controls. */}
          {alreadyPaid || done === 'paid' ? (
            <Card style={styles.card}>
              <Card.Content style={styles.paidContent}>
                <Text variant="headlineSmall" style={{ color: '#2e7d32', fontWeight: '700' }}>
                  Paid
                </Text>
                <Text variant="bodyMedium" style={{ marginTop: 4 }}>
                  {serviceName}
                  {existingSale.data
                    ? ` · ${money(existingSale.data.gross_cents + existingSale.data.tip_cents)}`
                    : ''}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
                  Thanks! Your payment is complete.
                </Text>
                <Button mode="contained" style={{ marginTop: 16 }} onPress={() => router.back()}>
                  Done
                </Button>
              </Card.Content>
            </Card>
          ) : done === 'finalizing' ? (
            <Card style={styles.card}>
              <Card.Content style={styles.paidContent}>
                <ActivityIndicator />
                <Text variant="titleMedium" style={{ marginTop: 12, fontWeight: '700' }}>
                  Finalizing your payment…
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
                  Your card was charged. This can take a moment to confirm — check My
                  bookings shortly.
                </Text>
                <Button mode="contained" style={{ marginTop: 16 }} onPress={() => router.back()}>
                  Done
                </Button>
              </Card.Content>
            </Card>
          ) : !appointmentId ? (
            <Card style={styles.card}>
              <Card.Content>
                <Text variant="bodyMedium">
                  This booking isn’t confirmed yet, so there’s nothing to pay. Once the
                  shop confirms your appointment you can pay here.
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
                    <Text variant="bodyMedium">Service</Text>
                    <Text variant="bodyMedium">{money(priceCents)}</Text>
                  </View>
                  {tipCents > 0 ? (
                    <View style={styles.lineRow}>
                      <Text variant="bodyMedium">Tip</Text>
                      <Text variant="bodyMedium">{money(tipCents)}</Text>
                    </View>
                  ) : null}
                  <Divider style={{ marginVertical: 8 }} />
                  <View style={styles.lineRow}>
                    <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                      Total
                    </Text>
                    <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                      {money(totalCents)}
                    </Text>
                  </View>
                </Card.Content>
              </Card>

              <Text variant="titleSmall" style={styles.sectionLabel}>
                Add a tip
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                100% of your tip goes to your stylist.
              </Text>
              <View style={styles.tipRow}>
                {TIP_PRESETS.map((p) => (
                  <SelectableChip
                    key={p}
                    selected={tipPreset === p}
                    onPress={() => setTipPreset(p)}
                    style={styles.tipChip}
                  >
                    {p === 0 ? 'No tip' : `${Math.round(p * 100)}%`}
                  </SelectableChip>
                ))}
                <SelectableChip
                  selected={tipPreset === 'custom'}
                  onPress={() => setTipPreset('custom')}
                  style={styles.tipChip}
                >
                  Custom
                </SelectableChip>
              </View>
              {tipPreset === 'custom' ? (
                <TextInput
                  mode="outlined"
                  label="Tip amount"
                  keyboardType="decimal-pad"
                  left={<TextInput.Affix text="$" />}
                  value={customTip}
                  onChangeText={setCustomTip}
                  style={styles.customTip}
                />
              ) : null}

              <HelperText type="info" visible={priceCents === 0}>
                The shop sets the final amount; your card is charged the total shown at
                checkout.
              </HelperText>

              <Button
                mode="contained"
                icon="credit-card-outline"
                style={styles.payBtn}
                loading={processing}
                disabled={processing || !nativeAvailable}
                onPress={onPay}
              >
                Pay {money(totalCents)}
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
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  sectionLabel: { marginTop: 8, fontWeight: '700' },
  tipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tipChip: { marginBottom: 4 },
  customTip: { marginTop: 8 },
  payBtn: { marginTop: 20 },
});

export default withScreenErrorBoundary(PayScreen);
