import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Avatar,
  Button,
  Card,
  Divider,
  Icon,
  Snackbar,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { SelectableChip } from '@/components/SelectableChip';
import { avatarUrl, initialsOf } from '@/lib/avatars';
import { useBusinessBookingInfo } from '@/lib/booking';
import { useBusinessPublic } from '@/lib/businessDetail';
import { useFormat } from '@/lib/format';
import { tMessage } from '@/lib/i18n';
import {
  useBusinessAcceptsWalkIns,
  useCancelWalkInRequest,
  useMyWalkInRequests,
  useRequestWalkIn,
  useWalkInBoard,
  type MyWalkInRequest,
  type WalkInBoardRow,
} from '@/lib/walkIn';
import {
  activeWalkInFor,
  canCancelWalkIn,
  formatCountdown,
  shortestWalkInWait,
  walkInMinutesLeft,
  walkInSecondsLeft,
} from '@/lib/walkInLogic';

const STEPS = ['service', 'barber', 'confirm'] as const;
type Step = (typeof STEPS)[number];

// The "Any barber" choice on the board; sent to the server as a null employee.
const ANY_BARBER = '__any__';

// A clock for the status view: ticks every `intervalMs`, or not at all (0).
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (intervalMs <= 0) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// One request's state, updating on its own (the list behind it is realtime +
// a 5s poll while PENDING): waiting with a countdown, in, declined, expired or
// cancelled.
function WalkInStatus({
  request,
  cancelling,
  canStartOver,
  onCancel,
  onBookInstead,
  onStartOver,
}: {
  request: MyWalkInRequest;
  cancelling: boolean;
  canStartOver: boolean;
  onCancel: () => void;
  onBookInstead: () => void;
  onStartOver: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation('booking');
  const f = useFormat();
  const now = useNow(request.status === 'PENDING' ? 1_000 : request.status === 'ACCEPTED' ? 30_000 : 0);
  const shop = request.business_name;

  let icon = 'timer-sand';
  let color = theme.colors.primary;
  let title = t('walkIn.status.pending.title');
  let body: string | null = null;
  let extra: string | null = null;

  if (request.status === 'PENDING') {
    const left = walkInSecondsLeft(request.expires_at, now);
    body =
      left > 0
        ? t('walkIn.status.pending.body', { shop, time: formatCountdown(left) })
        : t('walkIn.status.pending.checking', { shop });
  } else if (request.status === 'ACCEPTED') {
    const minutes = walkInMinutesLeft(request, now);
    const name = request.provider_name;
    icon = 'check-circle-outline';
    title = t('walkIn.status.accepted.title');
    if (minutes != null && minutes > 0) {
      const wait = f.duration(minutes);
      body = name
        ? t('walkIn.status.accepted.waitWithName', { wait, name })
        : t('walkIn.status.accepted.wait', { wait });
    } else {
      body = name ? t('walkIn.status.accepted.nowWithName', { name }) : t('walkIn.status.accepted.now');
    }
    if (request.appointment_start) {
      extra = t('walkIn.status.accepted.around', { time: f.date(request.appointment_start, 'time') });
    }
  } else if (request.status === 'DECLINED') {
    icon = 'close-circle-outline';
    color = theme.colors.error;
    title = t('walkIn.status.declined.title');
    body = t('walkIn.status.declined.body', { shop });
  } else if (request.status === 'EXPIRED') {
    icon = 'timer-off-outline';
    color = theme.colors.onSurfaceVariant;
    title = t('walkIn.status.expired.title');
    body = t('walkIn.status.expired.body', { shop });
  } else {
    icon = 'cancel';
    color = theme.colors.onSurfaceVariant;
    title = t('walkIn.status.cancelled.title');
    body = t('walkIn.status.cancelled.body');
  }

  const terminal = request.status !== 'PENDING' && request.status !== 'ACCEPTED';
  const offerBooking = request.status === 'DECLINED' || request.status === 'EXPIRED';

  return (
    <ScrollView contentContainerStyle={styles.statusScroll}>
      <Icon source={icon} size={64} color={color} />
      <Text variant="headlineMedium" style={styles.statusTitle}>
        {title}
      </Text>
      {body ? (
        <Text variant="titleMedium" style={styles.statusBody}>
          {body}
        </Text>
      ) : null}
      {extra ? (
        <Text variant="bodyLarge" style={[styles.statusExtra, { color: theme.colors.onSurfaceVariant }]}>
          {extra}
        </Text>
      ) : null}
      {request.status === 'PENDING' ? <ActivityIndicator style={styles.statusSpinner} /> : null}

      <Card mode="outlined" style={styles.statusCard}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.bold}>
            {shop}
          </Text>
          <Text variant="bodyMedium" style={styles.statusLine}>
            {request.service_name}
          </Text>
          <Text variant="bodySmall" style={[styles.statusLine, { color: theme.colors.onSurfaceVariant }]}>
            {request.provider_name
              ? t('walkIn.withBarber', { name: request.provider_name })
              : t('walkIn.anyBarber')}
          </Text>
        </Card.Content>
      </Card>

      <View style={styles.statusActions}>
        {canCancelWalkIn(request, now) ? (
          <Button
            mode="outlined"
            icon="close-circle-outline"
            onPress={onCancel}
            loading={cancelling}
            disabled={cancelling}
            contentStyle={styles.bigButton}
          >
            {t('walkIn.cancel')}
          </Button>
        ) : null}
        {offerBooking ? (
          <Button mode="contained" icon="calendar-plus" onPress={onBookInstead} contentStyle={styles.bigButton}>
            {t('walkIn.bookInstead')}
          </Button>
        ) : null}
        {terminal && canStartOver ? (
          <Button mode={offerBooking ? 'text' : 'contained-tonal'} icon="walk" onPress={onStartOver}>
            {t('walkIn.newRequest')}
          </Button>
        ) : null}
      </View>
    </ScrollView>
  );
}

// Walk in now — for someone standing in the shop (0244). Pick a service, see
// each barber's live wait, send a request; then this screen is the status
// view until the shop answers (10 minutes) and through the wait. Opens from
// the business page, My bookings, a walk_in_* notification (requestId param),
// luxbooking://walk-in/<id>, and the shop's QR link
// https://theluxmirror.com/book/<id>?walkin=1 (app/+native-intent.ts).
function WalkInScreen() {
  const theme = useTheme();
  const { t } = useTranslation(['booking', 'common', 'discover']);
  const f = useFormat();
  const { businessId, name, requestId: paramRequestId } = useLocalSearchParams<{
    businessId: string;
    name?: string;
    requestId?: string;
  }>();
  const focused = useIsFocused();

  const { data: info, isLoading: infoLoading, error: infoError, refetch: refetchInfo } =
    useBusinessBookingInfo(businessId);
  const { data: pub } = useBusinessPublic(businessId);
  const accepts = useBusinessAcceptsWalkIns(businessId);
  const requests = useMyWalkInRequests({ poll: focused });
  const requestWalkIn = useRequestWalkIn();
  const cancel = useCancelWalkInRequest();

  const [step, setStep] = useState<Step>('service');
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  // Which request the status view is following, keyed by the route it was
  // opened with (Tabs keep this screen mounted). id null = the client asked to
  // start a new request, so show the wizard even though the route names an
  // old one.
  const paramKey = `${businessId}:${paramRequestId ?? ''}`;
  const [pinned, setPinned] = useState<{ key: string; id: string | null } | null>(null);
  const pin = pinned && pinned.key === paramKey ? pinned : null;

  const all = requests.data ?? [];
  const wantedId = pin ? pin.id : (paramRequestId ?? null);
  const startOver = pin !== null && pin.id === null;
  const shown: MyWalkInRequest | null = startOver
    ? null
    : ((wantedId ? all.find((r) => r.id === wantedId && r.business_id === businessId) : undefined) ??
      activeWalkInFor(all, businessId, Date.now()));
  const shownId = shown?.id ?? null;

  // Keep following a request once it is on screen, so a decline / expiry /
  // cancel stays visible as that request's outcome instead of dropping back
  // to the wizard.
  useEffect(() => {
    if (shownId && wantedId !== shownId) setPinned({ key: paramKey, id: shownId });
  }, [shownId, wantedId, paramKey]);

  const resetWizard = useCallback(() => {
    setStep('service');
    setServiceId(null);
    setChoice(null);
  }, []);

  // A fresh start every visit: leaving the screen forgets the wizard and the
  // followed request (the next visit re-derives it from the server).
  useFocusEffect(
    useCallback(
      () => () => {
        resetWizard();
        setPinned(null);
        setFeedback(null);
      },
      [resetWizard],
    ),
  );

  // A different shop arriving while the screen is open (notification tap).
  useEffect(() => {
    resetWizard();
  }, [businessId, resetWizard]);

  const inWizard = !shown;
  const board = useWalkInBoard(businessId, serviceId ?? undefined, {
    poll: focused && inWizard && step !== 'service',
  });
  const rows = board.data ?? [];
  const shortest = shortestWalkInWait(rows);

  const bizName = name ?? pub?.name;
  const shopName = shown?.business_name ?? bizName;
  const services = info?.services ?? [];
  const service = services.find((s) => s.id === serviceId) ?? null;
  const chosenRow = choice && choice !== ANY_BARBER ? (rows.find((r) => r.provider_id === choice) ?? null) : null;
  const chosenWait = choice === ANY_BARBER ? shortest : (chosenRow?.wait_minutes ?? null);

  const waitLabel = (minutes: number | null) =>
    minutes == null
      ? t('walkIn.notAvailableToday')
      : minutes === 0
        ? t('walkIn.freeNow')
        : t('walkIn.aboutWait', { wait: f.duration(minutes) });

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/(app)'));

  const onBack = () => {
    if (inWizard && step !== 'service') {
      setStep(STEPS[STEPS.indexOf(step) - 1]);
      return;
    }
    leave();
  };

  const goBook = () =>
    router.push({
      pathname: '/(app)/book/[businessId]',
      params: { businessId, ...(shopName ? { name: shopName } : {}) },
    });

  const onSend = async () => {
    if (!serviceId || !choice) return;
    try {
      const id = await requestWalkIn.mutateAsync({
        businessId,
        serviceId,
        employeeId: choice === ANY_BARBER ? null : choice,
      });
      setPinned({ key: paramKey, id });
      resetWizard();
    } catch (err) {
      // The server's reasons are readable ("You already have an open walk-in
      // request at this shop."); show them as sent.
      const msg = (err as { message?: string } | null)?.message;
      setFeedback(tMessage(msg) ?? t('walkIn.requestFailed'));
    }
  };

  const onCancel = async (r: MyWalkInRequest) => {
    try {
      const ok = await cancel.mutateAsync(r.id);
      setFeedback(ok ? t('walkIn.cancelled') : t('walkIn.cannotCancel'));
    } catch (err) {
      const msg = (err as { message?: string } | null)?.message;
      setFeedback(tMessage(msg) ?? t('walkIn.cancelFailed'));
    }
  };

  const onStartOver = () => {
    resetWizard();
    setPinned({ key: paramKey, id: null });
  };

  const renderCenter = (icon: string, title: string, body: string | null, action?: ReactNode) => (
    <View style={styles.center}>
      <Icon source={icon} size={44} color={theme.colors.onSurfaceVariant} />
      <Text variant="titleMedium" style={styles.centerTitle}>
        {title}
      </Text>
      {body ? (
        <Text variant="bodyMedium" style={[styles.centerBody, { color: theme.colors.onSurfaceVariant }]}>
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  );

  const renderBoardRow = (key: string, opts: {
    avatar: ReactNode;
    title: string;
    wait: string;
    free: boolean;
    queue: string | null;
    disabled: boolean;
  }) => {
    const selected = choice === key;
    return (
      <View key={key}>
        {key === ANY_BARBER ? null : <Divider style={styles.rowDivider} />}
        <TouchableRipple
          disabled={opts.disabled}
          onPress={() => {
            setChoice(key);
            setStep('confirm');
          }}
          accessibilityRole="button"
          accessibilityState={{ selected, disabled: opts.disabled }}
        >
          <View style={[styles.boardRow, opts.disabled ? styles.dimmed : null]}>
            {opts.avatar}
            <View style={styles.rowText}>
              <Text variant="bodyLarge" style={styles.bold}>
                {opts.title}
              </Text>
              <Text
                variant="bodyMedium"
                style={{ color: opts.free ? theme.colors.primary : theme.colors.onSurfaceVariant }}
              >
                {opts.wait}
              </Text>
              {opts.queue ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {opts.queue}
                </Text>
              ) : null}
            </View>
            <Icon
              source={selected ? 'check-circle' : 'chevron-right'}
              size={22}
              color={selected ? theme.colors.primary : theme.colors.onSurfaceVariant}
            />
          </View>
        </TouchableRipple>
      </View>
    );
  };

  const renderBarberRow = (b: WalkInBoardRow) => {
    const uri = avatarUrl(b.avatar_path);
    return renderBoardRow(b.provider_id, {
      avatar: uri ? (
        <Avatar.Image size={44} source={{ uri }} />
      ) : (
        <Avatar.Text size={44} label={initialsOf(b.name)} />
      ),
      title: b.name,
      wait: waitLabel(b.wait_minutes),
      free: b.wait_minutes === 0,
      queue: b.queue_length > 0 ? t('walkIn.waiting', { count: b.queue_length }) : t('walkIn.noneWaiting'),
      disabled: b.wait_minutes == null,
    });
  };

  const renderService = () => (
    <>
      <Text variant="titleMedium" style={styles.stepTitle}>
        {t('walkIn.serviceTitle')}
      </Text>
      {services.length === 0 ? (
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {t('walkIn.noServices')}
        </Text>
      ) : (
        <Card mode="outlined">
          {services.map((s, i) => (
            <View key={s.id}>
              {i > 0 ? <Divider style={styles.rowDivider} /> : null}
              <TouchableRipple
                onPress={() => {
                  setServiceId(s.id);
                  setChoice(null);
                  setStep('barber');
                }}
              >
                <View style={styles.boardRow}>
                  <View style={styles.rowTextFirst}>
                    <Text variant="bodyLarge" style={styles.bold}>
                      {s.name}
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {t('book.priceDuration', { price: f.price(s.price), duration: f.duration(s.duration) })}
                    </Text>
                  </View>
                  <Icon
                    source={s.id === serviceId ? 'check-circle' : 'chevron-right'}
                    size={22}
                    color={s.id === serviceId ? theme.colors.primary : theme.colors.onSurfaceVariant}
                  />
                </View>
              </TouchableRipple>
            </View>
          ))}
        </Card>
      )}
    </>
  );

  const renderBoard = () => {
    if (board.isLoading) {
      return (
        <View style={styles.inlineCenter}>
          <ActivityIndicator />
        </View>
      );
    }
    if (board.error && !board.data) {
      return (
        <View style={styles.inlineCenter}>
          <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
            {board.error.message}
          </Text>
          <Button mode="contained-tonal" onPress={() => board.refetch()} style={styles.centerButton}>
            {t('common:actions.retry')}
          </Button>
        </View>
      );
    }
    if (rows.length === 0) {
      return (
        <View style={styles.inlineCenter}>
          <Icon source="account-clock-outline" size={36} color={theme.colors.onSurfaceVariant} />
          <Text variant="bodyMedium" style={[styles.centerBody, { color: theme.colors.onSurfaceVariant }]}>
            {t('walkIn.boardEmpty')}
          </Text>
          <Button mode="contained-tonal" icon="calendar-plus" onPress={goBook} style={styles.centerButton}>
            {t('walkIn.bookInstead')}
          </Button>
        </View>
      );
    }
    return (
      <>
        <Text variant="titleMedium" style={styles.stepTitle}>
          {t('walkIn.boardTitle')}
        </Text>
        <Card mode="outlined">
          {renderBoardRow(ANY_BARBER, {
            avatar: <Avatar.Icon size={44} icon="account-group" />,
            title: t('walkIn.anyBarber'),
            wait:
              shortest == null
                ? t('walkIn.anyBarberNone')
                : shortest === 0
                  ? t('walkIn.anyBarberFree')
                  : t('walkIn.anyBarberWait', { wait: f.duration(shortest) }),
            free: shortest === 0,
            queue: null,
            disabled: shortest == null,
          })}
          {rows.map(renderBarberRow)}
        </Card>
        <Text variant="bodySmall" style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
          {t('walkIn.boardHint')}
        </Text>
      </>
    );
  };

  const renderConfirm = () => (
    <>
      <Text variant="titleMedium" style={styles.stepTitle}>
        {t('walkIn.confirm.title')}
      </Text>
      <Card mode="outlined">
        <Card.Content style={styles.summary}>
          <View>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {t('walkIn.confirm.service')}
            </Text>
            <Text variant="bodyLarge" style={styles.bold}>
              {service?.name ?? ''}
            </Text>
            {service ? (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {t('book.priceDuration', {
                  price: f.price(service.price),
                  duration: f.duration(service.duration),
                })}
              </Text>
            ) : null}
          </View>
          <View>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {t('walkIn.confirm.barber')}
            </Text>
            <Text variant="bodyLarge" style={styles.bold}>
              {choice === ANY_BARBER ? t('walkIn.anyBarber') : (chosenRow?.name ?? '')}
            </Text>
          </View>
          <View>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {t('walkIn.confirm.wait')}
            </Text>
            <Text variant="bodyLarge" style={styles.bold}>
              {waitLabel(chosenWait)}
            </Text>
          </View>
        </Card.Content>
      </Card>
      <Text variant="bodySmall" style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
        {t('walkIn.confirm.note')}
      </Text>
      <Button
        mode="contained"
        icon="walk"
        onPress={onSend}
        loading={requestWalkIn.isPending}
        // The board keeps refreshing under this step: a barber whose day just
        // filled up can no longer be asked.
        disabled={requestWalkIn.isPending || chosenWait == null}
        style={styles.sendButton}
        contentStyle={styles.bigButton}
      >
        {t('walkIn.confirm.send')}
      </Button>
    </>
  );

  const renderWizard = () => (
    <>
      <View style={styles.stepStrip}>
        {STEPS.map((s, i) => {
          const reachable = i <= STEPS.indexOf(step);
          return (
            <SelectableChip
              key={s}
              selected={s === step}
              disabled={!reachable}
              onPress={() => {
                if (reachable) setStep(s);
              }}
            >
              {t(`walkIn.steps.${s}`)}
            </SelectableChip>
          );
        })}
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {step === 'service' ? renderService() : step === 'barber' ? renderBoard() : renderConfirm()}
      </ScrollView>
    </>
  );

  const renderBody = () => {
    if (shown) {
      return (
        <WalkInStatus
          request={shown}
          cancelling={cancel.isPending}
          canStartOver={accepts.data !== false}
          onCancel={() => onCancel(shown)}
          onBookInstead={goBook}
          onStartOver={onStartOver}
        />
      );
    }
    // A request this screen was sent to follow (just created, or named by a
    // notification) that the list has not delivered yet.
    if (requests.isLoading || accepts.isLoading || infoLoading || (wantedId && requests.isFetching)) {
      return (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      );
    }
    if (accepts.data === false) {
      return renderCenter(
        'walk',
        t('walkIn.notAccepting.title'),
        t('walkIn.notAccepting.body', { name: bizName ?? t('discover:business.thisBusiness') }),
        <Button mode="contained" icon="calendar-plus" onPress={goBook} style={styles.centerButton}>
          {t('walkIn.bookInstead')}
        </Button>,
      );
    }
    if (infoError && !info) {
      return (
        <View style={styles.center}>
          <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
            {infoError.message}
          </Text>
          <Button mode="contained-tonal" onPress={() => refetchInfo()} style={styles.centerButton}>
            {t('common:actions.retry')}
          </Button>
        </View>
      );
    }
    return renderWizard();
  };

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={onBack} />
        <Appbar.Content title={shopName ? `${t('walkIn.title')} · ${shopName}` : t('walkIn.title')} />
      </Appbar.Header>

      {renderBody()}

      <Snackbar visible={!!feedback} onDismiss={() => setFeedback(null)} duration={4000}>
        {feedback ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '600' },
  scroll: { padding: 16, paddingBottom: 32 },
  stepStrip: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  stepTitle: { fontWeight: '700', marginBottom: 12 },
  rowDivider: { opacity: 0.4 },
  boardRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  rowText: { flex: 1, marginLeft: 12, marginRight: 8 },
  rowTextFirst: { flex: 1, marginRight: 8 },
  dimmed: { opacity: 0.5 },
  hint: { marginTop: 10, textAlign: 'center' },
  summary: { gap: 14 },
  sendButton: { marginTop: 20 },
  bigButton: { paddingVertical: 6 },
  inlineCenter: { alignItems: 'center', paddingVertical: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  centerTitle: { marginTop: 12, textAlign: 'center' },
  centerBody: { marginTop: 6, textAlign: 'center' },
  centerButton: { marginTop: 20 },
  statusScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  statusTitle: { fontWeight: '700', marginTop: 16, textAlign: 'center' },
  statusBody: { marginTop: 8, textAlign: 'center' },
  statusExtra: { marginTop: 4, textAlign: 'center' },
  statusSpinner: { marginTop: 16 },
  statusCard: { alignSelf: 'stretch', marginTop: 24 },
  statusLine: { marginTop: 2 },
  statusActions: { alignSelf: 'stretch', gap: 10, marginTop: 20 },
});

export default withScreenErrorBoundary(WalkInScreen);
