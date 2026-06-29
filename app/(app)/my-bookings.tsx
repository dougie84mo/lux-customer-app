import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Chip,
  SegmentedButtons,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';
import { router } from 'expo-router';
import { format, isBefore, parseISO, startOfDay } from 'date-fns';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { RescheduleSheet } from '@/components/RescheduleSheet';
import { ReviewSheet } from '@/components/ReviewSheet';
import { NotificationBell } from '@/components/NotificationBell';
import { useManualRefresh } from '@/hooks/use-manual-refresh';
import {
  BookingRequestStatus,
  MyBookingRequest,
  useCancelBookingRequest,
  useClientCheckIn,
  useMyBookingRequests,
  useRescheduleBookingRequest,
} from '@/lib/booking';

const STATUS_META: Record<BookingRequestStatus, { label: string; color: string }> = {
  PENDING: { label: 'Requested', color: '#1976d2' },
  CONFIRMED: { label: 'Confirmed', color: '#2e7d32' },
  DECLINED: { label: 'Declined', color: '#c62828' },
  CANCELLED: { label: 'Cancelled', color: '#9e9e9e' },
};

type Segment = 'upcoming' | 'past' | 'all';

// A booking is "upcoming" while it's still live (requested/confirmed) and its
// effective time is today or later; everything else (declined, cancelled, or in
// the past) reads as history.
function isUpcoming(item: MyBookingRequest): boolean {
  if (item.status !== 'PENDING' && item.status !== 'CONFIRMED') return false;
  const when = item.confirmed_start ?? item.requested_start;
  return !isBefore(parseISO(when), startOfDay(new Date()));
}

function MyBookingsScreen() {
  const theme = useTheme();
  const { data, isLoading, error, refetch } = useMyBookingRequests();
  const { refreshing, onRefresh } = useManualRefresh(refetch);
  const cancel = useCancelBookingRequest();
  const reschedule = useRescheduleBookingRequest();
  const checkInClient = useClientCheckIn();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<MyBookingRequest | null>(null);
  const [reviewing, setReviewing] = useState<MyBookingRequest | null>(null);
  const [segment, setSegment] = useState<Segment>('upcoming');

  const { upcomingCount, list } = useMemo(() => {
    const all = data ?? [];
    const up = all.filter(isUpcoming);
    const filtered =
      segment === 'upcoming' ? up : segment === 'past' ? all.filter((i) => !isUpcoming(i)) : all;
    return { upcomingCount: up.length, list: filtered };
  }, [data, segment]);

  const onCheckIn = async (id: string) => {
    try {
      await checkInClient.mutateAsync(id);
      setFeedback('Checked in — see you soon!');
    } catch (err: any) {
      setFeedback(err?.message ?? 'Could not check in');
    }
  };

  const onCancel = async (id: string) => {
    try {
      await cancel.mutateAsync(id);
      setFeedback('Booking cancelled');
    } catch (err: any) {
      setFeedback(err?.message ?? 'Could not cancel');
    }
  };

  const onConfirmReschedule = async (start: Date) => {
    if (!rescheduling) return;
    try {
      await reschedule.mutateAsync({ requestId: rescheduling.id, start });
      setRescheduling(null);
      setFeedback('Booking rescheduled');
    } catch (err: any) {
      setFeedback(err?.message ?? 'Could not reschedule');
    }
  };

  const bookAgain = (item: MyBookingRequest) =>
    router.push({
      pathname: '/(app)/book/[businessId]',
      params: {
        businessId: item.business_id,
        name: item.business_name,
        // Preselect the same service so they land straight on the provider step.
        ...(item.service_id ? { serviceId: item.service_id } : {}),
      },
    });

  const goPay = (item: MyBookingRequest) =>
    router.push({
      pathname: '/(app)/pay/[requestId]',
      params: {
        requestId: item.id,
        businessName: item.business_name,
        ...(item.service_name ? { serviceName: item.service_name } : {}),
      },
    });

  const renderItem = ({ item }: { item: MyBookingRequest }) => {
    const when = item.confirmed_start ?? item.requested_start;
    const whenMs = new Date(when).getTime();
    // Use the SAME calendar-day boundary as isUpcoming() so a booking earlier
    // today stays "live" here (and in the Upcoming tab) instead of flipping to
    // "Completed" mid-day. canCheckIn keeps its exact-time window below.
    const isPastDay = isBefore(parseISO(when), startOfDay(new Date()));
    const live = item.status === 'PENDING' || item.status === 'CONFIRMED';
    // Only a still-live booking on today-or-later can be rescheduled or cancelled.
    const manageable = live && !isPastDay;
    // A confirmed booking on a past day actually happened — it can't be
    // rescheduled/cancelled, only reviewed or re-booked.
    const attended = item.status === 'CONFIRMED' && isPastDay;
    // Reviewable: an attended booking with a barber. submit_review enforces
    // COMPLETED server-side.
    const reviewable = attended && !!item.employee_id;
    // Offer self-check-in for a confirmed booking around its time (−2h … +12h).
    const canCheckIn =
      item.status === 'CONFIRMED' &&
      !item.checked_in_at &&
      whenMs <= Date.now() + 12 * 3_600_000 &&
      whenMs >= Date.now() - 2 * 3_600_000;
    // Paid: a full payment exists for this booking's appointment (from the RPC,
    // single source of truth — migration 0068).
    const paid = item.paid;
    // Payable: a confirmed booking with an assigned barber + service (the client
    // pay path requires both server-side), not already paid. Covers pay-ahead and
    // pay-after; the pay screen resolves the appointment + shows a receipt too.
    const payable =
      item.status === 'CONFIRMED' && !!item.employee_id && !!item.service_id && !paid;

    // Display status: an attended booking reads as "Completed", not "Confirmed".
    const display = attended ? { label: 'Completed', color: '#2e7d32' } : STATUS_META[item.status];
    const whenPrefix = attended
      ? 'Completed '
      : item.status === 'CONFIRMED'
        ? 'Confirmed for '
        : item.status === 'PENDING' && isPastDay
          ? 'Was requested for '
          : item.status === 'PENDING'
            ? 'Requested for '
            : ''; // declined / cancelled — chip already says it

    return (
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.headerRow}>
            <Text variant="titleSmall" style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
              {item.business_name}
            </Text>
            <Chip
              compact
              textStyle={{ color: display.color, fontSize: 12 }}
              style={{ backgroundColor: display.color + '22' }}
            >
              {display.label}
            </Chip>
          </View>

          <Text variant="bodyMedium" style={{ marginTop: 6 }}>
            {item.service_name ?? 'Appointment'}
            {item.location_name ? ` · ${item.location_name}` : ''}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
            {item.employee_name ? `with ${item.employee_name}` : 'Any available provider'}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
            {whenPrefix}
            {format(new Date(when), 'EEE MMM d, yyyy · h:mm a')}
          </Text>
          {item.notes ? (
            <Text variant="bodySmall" style={{ marginTop: 6, fontStyle: 'italic' }}>
              “{item.notes}”
            </Text>
          ) : null}

          {item.checked_in_at ? (
            <Chip compact icon="check" style={styles.checkIn}>
              Checked in
            </Chip>
          ) : canCheckIn ? (
            <Button
              mode="contained-tonal"
              compact
              icon="map-marker-check"
              style={styles.checkIn}
              loading={checkInClient.isPending}
              onPress={() => onCheckIn(item.id)}
            >
              I&apos;m here
            </Button>
          ) : null}

          {paid ? (
            <Chip compact icon="check-circle" style={[styles.checkIn, styles.paidChip]}>
              Paid
            </Chip>
          ) : payable ? (
            <Button
              mode="contained"
              icon="credit-card-outline"
              style={styles.payNow}
              contentStyle={styles.payNowContent}
              onPress={() => goPay(item)}
            >
              Pay now
            </Button>
          ) : null}

          {/* One contextual action row. Future-live: reschedule/cancel.
              Otherwise: leave a review (when attended) and/or book again. */}
          {manageable ? (
            <View style={styles.cardActions}>
              <Button mode="text" compact icon="calendar-clock" onPress={() => setRescheduling(item)}>
                Reschedule
              </Button>
              <Button
                mode="text"
                compact
                textColor={theme.colors.error}
                loading={cancel.isPending}
                onPress={() => onCancel(item.id)}
              >
                Cancel
              </Button>
            </View>
          ) : (
            <View style={styles.cardActions}>
              {reviewable ? (
                <Button mode="text" compact icon="star-outline" onPress={() => setReviewing(item)}>
                  Leave a review
                </Button>
              ) : null}
              <Button mode="text" compact icon="repeat" onPress={() => bookAgain(item)}>
                Book again
              </Button>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <NotificationBell />
        <Appbar.Content title="My bookings" />
      </Appbar.Header>

      <View style={styles.segmentWrap}>
        <SegmentedButtons
          value={segment}
          onValueChange={(v) => setSegment(v as Segment)}
          density="small"
          buttons={[
            {
              value: 'upcoming',
              label: upcomingCount > 0 ? `Upcoming (${upcomingCount})` : 'Upcoming',
              icon: 'calendar-arrow-right',
            },
            { value: 'past', label: 'Past', icon: 'history' },
            { value: 'all', label: 'All' },
          ]}
        />
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
          data={list}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {segment === 'past'
                  ? 'No past bookings yet.'
                  : segment === 'upcoming'
                    ? 'Nothing on the books. Find a business to make your next appointment.'
                    : 'No bookings yet.'}
              </Text>
              {segment !== 'past' && (
                <Button
                  mode="contained"
                  style={{ marginTop: 16 }}
                  icon="storefront-outline"
                  onPress={() => router.push('/(app)/discover')}
                >
                  Find a business
                </Button>
              )}
            </View>
          }
        />
      )}

      <RescheduleSheet
        visible={!!rescheduling}
        businessId={rescheduling?.business_id}
        employeeId={rescheduling?.employee_id}
        anyProvider={!rescheduling?.employee_id}
        durationMinutes={rescheduling?.duration}
        currentStart={rescheduling?.confirmed_start ?? rescheduling?.requested_start}
        submitting={reschedule.isPending}
        onDismiss={() => setRescheduling(null)}
        onConfirm={onConfirmReschedule}
      />

      <ReviewSheet
        booking={reviewing}
        onClose={() => setReviewing(null)}
        onDone={(m) => setFeedback(m)}
      />

      <Snackbar visible={!!feedback} onDismiss={() => setFeedback(null)} duration={3000}>
        {feedback ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  segmentWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  list: { padding: 16, gap: 8, flexGrow: 1 },
  card: { marginBottom: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4, marginTop: 8 },
  checkIn: { alignSelf: 'flex-start', marginTop: 8 },
  payNow: { marginTop: 10, borderRadius: 10 },
  payNowContent: { paddingVertical: 4 },
  paidChip: { backgroundColor: '#2e7d3222' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});

export default withScreenErrorBoundary(MyBookingsScreen);
