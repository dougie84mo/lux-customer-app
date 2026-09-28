import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Avatar,
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
import { useBusinessPublic } from '@/lib/businessDetail';
import { useBusinessBookingInfo } from '@/lib/booking';
import { avatarUrl, initialsOf } from '@/lib/avatars';
import { useTranslation } from 'react-i18next';
import { tMessage } from '@/lib/i18n';
import { useFormat } from '@/lib/format';

// Deposit taken right after a booking request is created (deposit_timing =
// at_request). The booking already exists; this secures it. Skipping is allowed
// for optional deposits — the request stays on the books either way.
function DepositScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const { t } = useTranslation(['payments', 'common']);
  const { money } = useFormat();
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
  const serviceName = typeof params.serviceName === 'string' ? params.serviceName : t('deposit.yourAppointment');
  const required = params.required === '1';
  const depositCents = params.amountCents ? parseInt(params.amountCents, 10) : NaN;

  // What happens to this money if the appointment doesn't go ahead (0128). The
  // shop keeping an unused deposit used to be true by omission, stated nowhere.
  // Say it before they pay, not after.
  const { data: bookingInfo } = useBusinessBookingInfo(
    typeof businessId === 'string' ? businessId : undefined,
  );
  const forfeitCancel = bookingInfo?.policy?.deposit_forfeit_on_cancel;
  const forfeitNoShow = bookingInfo?.policy?.deposit_forfeit_on_no_show;

  const bizPublic = useBusinessPublic(businessId);
  const bizLogo = avatarUrl(bizPublic.data?.logo_url);
  const bizDisplayName = bizPublic.data?.name ?? businessName ?? t('labels.theBusiness');

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
      setFeedback(tMessage(result.error) ?? t('resolved.failed'));
      return;
    }
    const resolved = result.saleId ? await waitForSaleResolved(result.saleId) : 'pending';
    qc.invalidateQueries({ queryKey: ['my-receipts'] });
    qc.invalidateQueries({ queryKey: ['my-booking-requests'] });
    if (resolved === 'succeeded') setDone('paid');
    else if (resolved === 'pending' || resolved === 'processing') setDone('finalizing');
    else setFeedback(t(`resolved.${resolved}`));
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        {/* No back: the booking request is already placed; exit goes to Bookings. */}
        <Appbar.Action icon="close" onPress={toBookings} />
        <Appbar.Content title={required ? t('deposit.titleRequired') : t('deposit.titleSecure')} subtitle={businessName} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.body}>
        {!nativeAvailable ? (
          <Banner visible icon="cellphone-arrow-down" style={styles.banner}>
            {t('deposit.nativeMissing')}
          </Banner>
        ) : null}

        {done === 'paid' ? (
          <Card style={styles.card}>
            <Card.Content style={styles.centerContent}>
              {bizLogo ? (
                <Avatar.Image size={72} source={{ uri: bizLogo }} />
              ) : (
                <Avatar.Text size={72} label={initialsOf(bizDisplayName)} />
              )}
              <View style={styles.paidBadgeRow}>
                <Avatar.Icon size={22} icon="check" color="#fff" style={{ backgroundColor: '#2e7d32' }} />
                <Text variant="titleMedium" style={{ color: '#2e7d32', fontWeight: '700', marginLeft: 6 }}>
                  {t('labels.depositPaid')}
                </Text>
              </View>
              <Text variant="titleMedium" style={{ fontWeight: '700', marginTop: 8, textAlign: 'center' }}>
                {t('deposit.reservedWith', { business: bizDisplayName })}
              </Text>
              <Text variant="bodyMedium" style={{ marginTop: 4, textAlign: 'center' }}>
                {t('deposit.securedBody')}
              </Text>
              <Button mode="contained" style={{ marginTop: 16 }} onPress={toBookings}>
                {t('deposit.viewBookings')}
              </Button>
            </Card.Content>
          </Card>
        ) : done === 'finalizing' ? (
          <Card style={styles.card}>
            <Card.Content style={styles.centerContent}>
              <ActivityIndicator />
              <Text variant="titleMedium" style={{ marginTop: 12, fontWeight: '700' }}>
                {t('deposit.finalizingTitle')}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
                {t('deposit.finalizingBody')}
              </Text>
              <Button mode="contained" style={{ marginTop: 16 }} onPress={toBookings}>
                {t('deposit.viewBookings')}
              </Button>
            </Card.Content>
          </Card>
        ) : (
          <>
            <Card style={styles.card}>
              <Card.Content>
                <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                  {required ? t('deposit.headingRequired') : t('deposit.headingSecure')}
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
                        {t('labels.deposit')}
                      </Text>
                      <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                        {money(depositCents)}
                      </Text>
                    </View>
                  </>
                ) : null}
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
                  {t('deposit.appliedNote')}
                </Text>
                {forfeitCancel !== undefined || forfeitNoShow !== undefined ? (
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}
                  >
                    {forfeitCancel && forfeitNoShow
                      ? t('deposit.forfeitBoth')
                      : forfeitCancel
                        ? t('deposit.forfeitCancel')
                        : forfeitNoShow
                          ? t('deposit.forfeitNoShow')
                          : t('deposit.refundedOnCancel')}
                  </Text>
                ) : null}
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
              {Number.isFinite(depositCents)
                ? t('deposit.payDepositAmount', { amount: money(depositCents) })
                : t('deposit.payDeposit')}
            </Button>

            <Button
              mode="text"
              style={styles.secondaryBtn}
              disabled={processing || !nativeAvailable}
              onPress={() => pay('full')}
            >
              {t('deposit.prepayFull')}
            </Button>

            <Button mode="text" textColor={theme.colors.onSurfaceVariant} onPress={toBookings} disabled={processing}>
              {required ? t('common:actions.notNow') : t('deposit.skip')}
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
  paidBadgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between' },
  payBtn: { marginTop: 4 },
  secondaryBtn: { marginTop: 8 },
});

export default withScreenErrorBoundary(DepositScreen);
