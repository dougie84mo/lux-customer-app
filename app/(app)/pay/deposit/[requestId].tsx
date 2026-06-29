import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Banner,
  Button,
  Card,
  Divider,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useDepositCheckout } from '@/lib/checkout';
import { DepositMode, waitForSaleResolved } from '@/lib/payments';

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// Deposit taken right after a booking request is created (deposit_timing =
// at_request). The booking already exists; this secures it. Skipping is allowed
// for optional deposits — the request stays on the books either way.
function DepositScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{
    requestId: string;
    businessId: string;
    businessName?: string;
    serviceName?: string;
    amountCents?: string;
    required?: string;
  }>();
  const requestId = params.requestId;
  const businessId = params.businessId;
  const businessName = typeof params.businessName === 'string' ? params.businessName : undefined;
  const serviceName = typeof params.serviceName === 'string' ? params.serviceName : 'your appointment';
  const required = params.required === '1';
  const depositCents = params.amountCents ? parseInt(params.amountCents, 10) : NaN;

  const { runDepositCheckout, processing, nativeAvailable } = useDepositCheckout();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [done, setDone] = useState<'paid' | 'finalizing' | null>(null);

  const toBookings = () => router.replace('/(app)/my-bookings');

  const pay = async (mode: DepositMode) => {
    if (!businessId || !requestId) return;
    const result = await runDepositCheckout({
      businessId,
      bookingRequestId: requestId,
      mode,
      merchantName: businessName ?? 'LUX Booking',
    });
    if (result.status === 'canceled') return;
    if (result.status === 'failed') {
      setFeedback(result.error ?? 'Payment failed.');
      return;
    }
    const resolved = result.saleId ? await waitForSaleResolved(result.saleId) : 'pending';
    qc.invalidateQueries({ queryKey: ['my-receipts'] });
    qc.invalidateQueries({ queryKey: ['my-booking-requests'] });
    if (resolved === 'succeeded') setDone('paid');
    else if (resolved === 'pending' || resolved === 'processing') setDone('finalizing');
    else setFeedback(`Payment ${resolved}.`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        {/* No back: the booking request is already placed; exit goes to Bookings. */}
        <Appbar.Action icon="close" onPress={toBookings} />
        <Appbar.Content title={required ? 'Deposit required' : 'Secure your booking'} subtitle={businessName} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.body}>
        {!nativeAvailable ? (
          <Banner visible icon="cellphone-arrow-down" style={styles.banner}>
            Payments need the latest app build. Reinstall the dev client to pay a deposit.
          </Banner>
        ) : null}

        {done === 'paid' ? (
          <Card style={styles.card}>
            <Card.Content style={styles.centerContent}>
              <Text variant="headlineSmall" style={{ color: '#2e7d32', fontWeight: '700' }}>
                Deposit paid
              </Text>
              <Text variant="bodyMedium" style={{ marginTop: 4, textAlign: 'center' }}>
                Your spot is secured. The deposit comes off your balance at checkout.
              </Text>
              <Button mode="contained" style={{ marginTop: 16 }} onPress={toBookings}>
                View my bookings
              </Button>
            </Card.Content>
          </Card>
        ) : done === 'finalizing' ? (
          <Card style={styles.card}>
            <Card.Content style={styles.centerContent}>
              <ActivityIndicator />
              <Text variant="titleMedium" style={{ marginTop: 12, fontWeight: '700' }}>
                Finalizing your deposit…
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
                Your card was charged. It can take a moment to confirm — check My
                bookings shortly.
              </Text>
              <Button mode="contained" style={{ marginTop: 16 }} onPress={toBookings}>
                View my bookings
              </Button>
            </Card.Content>
          </Card>
        ) : (
          <>
            <Card style={styles.card}>
              <Card.Content>
                <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                  {required ? 'A deposit is required to book' : 'Secure your spot with a deposit'}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                  {serviceName}
                  {businessName ? ` · ${businessName}` : ''}
                </Text>
                {Number.isFinite(depositCents) ? (
                  <>
                    <Divider style={{ marginVertical: 12 }} />
                    <View style={styles.lineRow}>
                      <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                        Deposit
                      </Text>
                      <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                        {money(depositCents)}
                      </Text>
                    </View>
                  </>
                ) : null}
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
                  The deposit is applied to your balance — you only pay the rest at checkout.
                </Text>
              </Card.Content>
            </Card>

            <Button
              mode="contained"
              icon="credit-card-outline"
              style={styles.payBtn}
              loading={processing}
              disabled={processing || !nativeAvailable}
              onPress={() => pay('deposit')}
            >
              {Number.isFinite(depositCents) ? `Pay deposit ${money(depositCents)}` : 'Pay deposit'}
            </Button>

            <Button
              mode="text"
              style={styles.secondaryBtn}
              disabled={processing || !nativeAvailable}
              onPress={() => pay('full')}
            >
              Prepay the full price instead
            </Button>

            <Button mode="text" textColor={theme.colors.onSurfaceVariant} onPress={toBookings} disabled={processing}>
              {required ? 'Not now' : 'Skip — pay later'}
            </Button>
          </>
        )}
      </ScrollView>

      <Snackbar visible={!!feedback} onDismiss={() => setFeedback(null)} duration={5000}>
        {feedback ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16 },
  banner: { marginBottom: 12 },
  card: { marginBottom: 12 },
  centerContent: { alignItems: 'center', paddingVertical: 16 },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between' },
  payBtn: { marginTop: 4 },
  secondaryBtn: { marginTop: 8 },
});

export default withScreenErrorBoundary(DepositScreen);
