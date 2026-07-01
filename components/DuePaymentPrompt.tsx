import { useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Avatar, Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { useMyBookingRequests } from '@/lib/booking';
import { bookingStartMs, isPaymentDue } from '@/lib/bookingLogic';
import { useBusinessPublic } from '@/lib/businessDetail';
import { avatarUrl, initialsOf } from '@/lib/avatars';

// How wide the "it's happening now" window is around an appointment's start.
const BEFORE_MS = 30 * 60_000; // nudge from 30 min before
const AFTER_MS = 8 * 3_600_000; // through 8 h after (covers during + just-after)

// Global, app-wide reminder to pay for the appointment you're at. Mounted once in
// the (app) layout so it can surface over ANY screen. It re-evaluates whenever the
// app returns to the foreground — so the next time the client opens their phone
// mid-appointment, the pay sheet is one tap away. Dismissals are per-session and
// per-booking, so it won't nag after "Not now".
export function DuePaymentPrompt() {
  const theme = useTheme();
  const { data } = useMyBookingRequests();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // Bumped on foreground to force a fresh time evaluation.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setTick((t) => t + 1);
    });
    return () => sub.remove();
  }, []);

  const due = useMemo(() => {
    void tick; // re-run on foreground
    const now = Date.now();
    return (
      (data ?? [])
        .filter((b) => isPaymentDue(b, now, BEFORE_MS, AFTER_MS) && !dismissed.has(b.id))
        // Soonest start first — pay for the appointment you're actually at.
        .sort((a, b) => bookingStartMs(a) - bookingStartMs(b))[0] ?? null
    );
  }, [data, dismissed, tick]);

  // Company logo for the payee (hook order stays stable — always called).
  const biz = useBusinessPublic(due?.business_id);
  const logo = avatarUrl(biz.data?.logo_url);

  if (!due) return null;

  const when = due.confirmed_start ?? due.requested_start;
  const dismiss = () => setDismissed((prev) => new Set(prev).add(due.id));

  const payNow = () => {
    dismiss(); // don't re-pop over the pay screen
    router.push({
      pathname: '/(app)/pay/[requestId]',
      params: {
        requestId: due.id,
        businessName: due.business_name,
        ...(due.service_name ? { serviceName: due.service_name } : {}),
        ...(due.employee_id ? { employeeId: due.employee_id } : {}),
        ...(due.employee_name ? { employeeName: due.employee_name } : {}),
      },
    });
  };

  return (
    <Portal>
      <Dialog visible onDismiss={dismiss}>
        <Dialog.Title>Time to pay?</Dialog.Title>
        <Dialog.Content>
          <View style={styles.payee}>
            {logo ? (
              <Avatar.Image size={44} source={{ uri: logo }} />
            ) : (
              <Avatar.Text size={44} label={initialsOf(due.business_name)} />
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text variant="titleSmall" style={{ fontWeight: '700' }} numberOfLines={1}>
                {due.business_name}
              </Text>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
                numberOfLines={1}
              >
                {due.service_name ?? 'Appointment'}
                {due.employee_name ? ` · with ${due.employee_name}` : ''}
              </Text>
            </View>
          </View>
          <Text variant="bodyMedium" style={{ marginTop: 12 }}>
            Your {format(new Date(when), 'h:mm a')} appointment is happening now. Pay right from your
            phone — add a tip and you’re done.
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={dismiss}>Not now</Button>
          <Button mode="contained" icon="credit-card-outline" onPress={payNow}>
            Pay now
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  payee: { flexDirection: 'row', alignItems: 'center' },
});
