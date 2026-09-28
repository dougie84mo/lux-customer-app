import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Chip,
  IconButton,
  Menu,
  SegmentedButtons,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';
import { router } from 'expo-router';
import { isBefore, parseISO, startOfDay } from 'date-fns';
import { useTranslation } from 'react-i18next';
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
import { isBookingUpcoming } from '@/lib/bookingLogic';
import { useFormat } from '@/lib/format';

// Labels come from booking:myBookings.status.<STATUS>.
const STATUS_COLOR: Record<BookingRequestStatus, string> = {
  PENDING: '#1976d2',
  CONFIRMED: '#2e7d32',
  DECLINED: '#c62828',
  CANCELLED: '#9e9e9e',
};

type Segment = 'upcoming' | 'past' | 'all';

// A booking is "upcoming" while it's still live (requested/confirmed) and its
// effective time is today or later; everything else (declined, cancelled, or in
// the past) reads as history. Pure logic lives in lib/bookingLogic (tested).
const isUpcoming = (item: MyBookingRequest): boolean => isBookingUpcoming(item, Date.now());

function MyBookingsScreen() {
  const theme = useTheme();
  const { t } = useTranslation(['booking', 'common']);
  const f = useFormat();
  const { data, isLoading, error, refetch } = useMyBookingRequests();
  const { refreshing, onRefresh } = useManualRefresh(refetch);
  const cancel = useCancelBookingRequest();
  const reschedule = useRescheduleBookingRequest();
  const checkInClient = useClientCheckIn();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<MyBookingRequest | null>(null);
  const [reviewing, setReviewing] = useState<MyBookingRequest | null>(null);
  const [segment, setSegment] = useState<Segment>('upcoming');
  // Which card's overflow menu is open (FlatList shares one render path).
  const [menuFor, setMenuFor] = useState<string | null>(null);

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
      setFeedback(t('myBookings.feedback.checkedIn'));
    } catch (err: any) {
      setFeedback(err?.message ?? t('myBookings.feedback.checkInFailed'));
    }
  };

  const onCancel = async (id: string) => {
    try {
      await cancel.mutateAsync(id);
      setFeedback(t('myBookings.feedback.cancelled'));
    } catch (err: any) {
      setFeedback(err?.message ?? t('myBookings.feedback.cancelFailed'));
    }
  };

  const onConfirmReschedule = async (start: Date) => {
    if (!rescheduling) return;
    try {
      await reschedule.mutateAsync({ requestId: rescheduling.id, start });
      setRescheduling(null);
      setFeedback(t('myBookings.feedback.rescheduled'));
    } catch (err: any) {
      setFeedback(err?.message ?? t('myBookings.feedback.rescheduleFailed'));
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
        // Pass the provider through so the paid landing can greet by name +
        // avatar without another round-trip.
        ...(item.employee_id ? { employeeId: item.employee_id } : {}),
        ...(item.employee_name ? { employeeName: item.employee_name } : {}),
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
    const display = attended
      ? { label: t('myBookings.status.COMPLETED'), color: '#2e7d32' }
      : { label: t(`myBookings.status.${item.status}`), color: STATUS_COLOR[item.status] };
    const whenText = f.date(when, 'weekdayDateTime');
    const whenLine = attended
      ? t('myBookings.when.completed', { when: whenText })
      : item.status === 'CONFIRMED'
        ? t('myBookings.when.confirmedFor', { when: whenText })
        : item.status === 'PENDING' && isPastDay
          ? t('myBookings.when.wasRequestedFor', { when: whenText })
          : item.status === 'PENDING'
            ? t('myBookings.when.requestedFor', { when: whenText })
            : whenText; // declined / cancelled — chip already says it

    // Inline row only renders when there's a time-sensitive action to show, so a
    // plain booking card stays short.
    const showInline = paid || payable || canCheckIn || !!item.checked_in_at;

    return (
      <Card style={styles.card}>
        <Card.Content style={styles.cardContent}>
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
            <Menu
              visible={menuFor === item.id}
              onDismiss={() => setMenuFor(null)}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  size={20}
                  style={styles.menuBtn}
                  onPress={() => setMenuFor(item.id)}
                  accessibilityLabel={t('myBookings.options')}
                />
              }
            >
              {manageable ? (
                <>
                  <Menu.Item
                    leadingIcon="calendar-clock"
                    title={t('myBookings.reschedule')}
                    onPress={() => {
                      setMenuFor(null);
                      setRescheduling(item);
                    }}
                  />
                  <Menu.Item
                    leadingIcon="close-circle-outline"
                    title={t('myBookings.cancelBooking')}
                    onPress={() => {
                      setMenuFor(null);
                      onCancel(item.id);
                    }}
                  />
                </>
              ) : (
                <>
                  {reviewable ? (
                    <Menu.Item
                      leadingIcon="star-outline"
                      title={t('myBookings.leaveReview')}
                      onPress={() => {
                        setMenuFor(null);
                        setReviewing(item);
                      }}
                    />
                  ) : null}
                  <Menu.Item
                    leadingIcon="repeat"
                    title={t('myBookings.bookAgain')}
                    onPress={() => {
                      setMenuFor(null);
                      bookAgain(item);
                    }}
                  />
                </>
              )}
            </Menu>
          </View>

          <Text variant="bodyMedium" style={{ marginTop: 2 }} numberOfLines={1}>
            {item.service_name ?? t('myBookings.appointment')}
            {item.location_name ? ` · ${item.location_name}` : ''}
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
            numberOfLines={1}
          >
            {item.employee_name
              ? t('myBookings.withProvider', { name: item.employee_name })
              : t('myBookings.anyProvider')}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
            {whenLine}
          </Text>
          {item.notes ? (
            <Text
              variant="bodySmall"
              style={{ marginTop: 4, fontStyle: 'italic' }}
              numberOfLines={1}
            >
              “{item.notes}”
            </Text>
          ) : null}

          {showInline ? (
            <View style={styles.inlineActions}>
              {item.checked_in_at ? (
                <Chip compact icon="check" style={styles.chip}>
                  {t('myBookings.checkedIn')}
                </Chip>
              ) : canCheckIn ? (
                <Button
                  mode="contained-tonal"
                  compact
                  icon="map-marker-check"
                  loading={checkInClient.isPending}
                  onPress={() => onCheckIn(item.id)}
                >
                  {t('myBookings.imHere')}
                </Button>
              ) : null}
              {paid ? (
                <Chip compact icon="check-circle" style={[styles.chip, styles.paidChip]}>
                  {t('myBookings.paid')}
                </Chip>
              ) : payable ? (
                <Button mode="contained" compact icon="credit-card-outline" onPress={() => goPay(item)}>
                  {t('myBookings.payNow')}
                </Button>
              ) : null}
            </View>
          ) : null}
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <NotificationBell />
        <Appbar.Content title={t('myBookings.title')} />
      </Appbar.Header>

      <View style={styles.segmentWrap}>
        <SegmentedButtons
          value={segment}
          onValueChange={(v) => setSegment(v as Segment)}
          density="small"
          buttons={[
            {
              value: 'upcoming',
              label:
                upcomingCount > 0
                  ? t('myBookings.segments.upcomingWithCount', { n: upcomingCount })
                  : t('myBookings.segments.upcoming'),
              icon: 'calendar-arrow-right',
            },
            { value: 'past', label: t('myBookings.segments.past'), icon: 'history' },
            { value: 'all', label: t('myBookings.segments.all') },
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
                  ? t('myBookings.empty.past')
                  : segment === 'upcoming'
                    ? t('myBookings.empty.upcoming')
                    : t('myBookings.empty.all')}
              </Text>
              {segment !== 'past' && (
                <Button
                  mode="contained"
                  style={{ marginTop: 16 }}
                  icon="storefront-outline"
                  onPress={() => router.push('/(app)/discover')}
                >
                  {t('myBookings.findBusiness')}
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
  cardContent: { paddingVertical: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuBtn: { margin: 0, marginRight: -8, marginVertical: -6 },
  inlineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  chip: { alignSelf: 'center' },
  paidChip: { backgroundColor: '#2e7d3222' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});

export default withScreenErrorBoundary(MyBookingsScreen);
