import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { MyBookingRequest, useMyBookingRequests } from './booking';
import { getPushEnabled } from './preferences';

// Local (on-device) payment reminders. When a confirmed, unpaid booking's start
// time arrives, the OS fires a notification — even if the app is closed — that
// deep-links straight to the pay screen. This is the "next time you pick up your
// phone" nudge; the in-app DuePaymentPrompt covers the case where the app is
// already open. No server/push token involved — these are scheduled locally.
//
// Same Expo-Go guard as lib/push.ts: importing expo-notifications eagerly runs
// auto-registration that throws in Expo Go, so we only ever lazy-require it in a
// real build.
const REMINDER_PREFIX = 'pay-';

function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

// Bookings we should nudge: confirmed, chargeable (provider + service), not yet
// paid, and starting in the future (past/now is the in-app prompt's job).
function reminderTargets(bookings: MyBookingRequest[], now: number) {
  const out: { id: string; startMs: number; booking: MyBookingRequest }[] = [];
  for (const b of bookings) {
    if (b.status !== 'CONFIRMED' || b.paid) continue;
    if (!b.employee_id || !b.service_id) continue;
    const startMs = new Date(b.confirmed_start ?? b.requested_start).getTime();
    // Skip the past + the next minute (imminent → DuePaymentPrompt handles it).
    if (startMs <= now + 60_000) continue;
    out.push({ id: b.id, startMs, booking: b });
  }
  return out;
}

// Reconcile OS-scheduled reminders against the current bookings: cancel ones that
// are paid/cancelled/rescheduled-away, (re)schedule the rest. Idempotent — safe
// to run on every bookings refresh.
async function reconcileReminders(bookings: MyBookingRequest[]): Promise<void> {
  if (isExpoGo() || !Device.isDevice) return;
  const Notifications = require('expo-notifications') as typeof import('expo-notifications');

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ours = scheduled.filter((s) => (s.identifier ?? '').startsWith(REMINDER_PREFIX));

  // Push turned off → tear down any reminders and stop.
  if (!(await getPushEnabled())) {
    for (const s of ours) await Notifications.cancelScheduledNotificationAsync(s.identifier);
    return;
  }

  const targets = reminderTargets(bookings, Date.now());
  const desired = new Map(targets.map((t) => [`${REMINDER_PREFIX}${t.id}`, t]));

  // Drop reminders that no longer apply or whose start time moved.
  for (const s of ours) {
    const want = desired.get(s.identifier);
    const prevStart = Number((s.content?.data as { startMs?: number } | undefined)?.startMs) || 0;
    if (!want || want.startMs !== prevStart) {
      await Notifications.cancelScheduledNotificationAsync(s.identifier);
    }
  }

  // Schedule any target not already scheduled at the right time.
  for (const [identifier, t] of desired) {
    const already = ours.find(
      (s) =>
        s.identifier === identifier &&
        Number((s.content?.data as { startMs?: number } | undefined)?.startMs) === t.startMs,
    );
    if (already) continue;

    const b = t.booking;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: 'Time to pay?',
        body: `Your ${b.service_name ?? 'appointment'} at ${b.business_name} is starting — tap to pay from your phone.`,
        // Consumed by the tap handler in lib/push.ts to deep-link to the pay screen.
        data: {
          kind: 'pay',
          requestId: b.id,
          startMs: t.startMs,
          businessName: b.business_name,
          ...(b.service_name ? { serviceName: b.service_name } : {}),
          ...(b.employee_id ? { employeeId: b.employee_id } : {}),
          ...(b.employee_name ? { employeeName: b.employee_name } : {}),
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(t.startMs),
        ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
      },
    });
  }
}

// Mount once near the authenticated root (alongside usePushNotifications). Keeps
// the OS reminder schedule in sync with the client's bookings.
export function usePaymentReminders() {
  const { data } = useMyBookingRequests();
  useEffect(() => {
    reconcileReminders(data ?? []).catch((err) =>
      console.warn('payment reminders skipped', err),
    );
  }, [data]);
}
