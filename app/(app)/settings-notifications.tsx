import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  Card,
  Divider,
  HelperText,
  List,
  SegmentedButtons,
  Snackbar,
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { router } from 'expo-router';
import { formatDistanceToNow } from 'date-fns';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useAuth } from '@/lib/auth';
import { usePushEnabled } from '@/lib/preferences';
import { registerForPushNotifications, unregisterPushNotifications } from '@/lib/push';
import {
  CLIENT_NOTIFICATION_CATEGORIES,
  DEFAULT_NOTIFICATION_CHANNELS,
  UserNotificationChannels,
  useMyPushTokens,
  useUpsertUserNotificationChannels,
  useUserNotificationChannels,
} from '@/lib/notificationChannels';
import { SMS_CONSENT_CTA, useMySmsStatus, useSetSmsConsent } from '@/lib/smsConsent';
import { toE164US } from '@/lib/bookingLogic';

type ChannelTab = 'app' | 'email' | 'text';

// Every way LUX can reach a client, in one place, split by WHERE it arrives:
// the phone (push), the inbox (email), the phone number (SMS). Same layout as
// the business app's Settings › Notifications so the two apps read alike —
// and so the public policy pages (theluxmirror.com/policies/…) can describe
// one path for both.
function SettingsNotificationsScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [tab, setTab] = useState<ChannelTab>('app');
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data: channels, isLoading } = useUserNotificationChannels(userId);
  const upsert = useUpsertUserNotificationChannels();
  const settings = channels ?? DEFAULT_NOTIFICATION_CHANNELS;
  const locked = isLoading || !userId;

  const patch = (partial: Partial<UserNotificationChannels>) => {
    if (!userId) return;
    upsert.mutate({ userId, settings: { ...settings, ...partial } });
  };

  // Device-level push switch: registers / removes this phone's token.
  const { enabled: pushEnabled, loaded: pushLoaded, setEnabled: setPushEnabled } = usePushEnabled();
  const [pushBusy, setPushBusy] = useState(false);
  const onTogglePush = async (next: boolean) => {
    setPushBusy(true);
    try {
      await setPushEnabled(next);
      if (userId) {
        if (next) await registerForPushNotifications(userId);
        else await unregisterPushNotifications(userId);
      }
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Notifications" />
      </Appbar.Header>

      <View style={styles.tabs}>
        <SegmentedButtons
          value={tab}
          onValueChange={(v) => setTab(v as ChannelTab)}
          buttons={[
            { value: 'app', label: 'App', icon: 'cellphone' },
            { value: 'email', label: 'Email', icon: 'email-outline' },
            { value: 'text', label: 'Text', icon: 'message-text-outline' },
          ]}
          density="small"
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'app' && (
          <>
            <Card style={styles.card}>
              <List.Item
                title="Push notifications"
                description="Get appointment updates on this device"
                left={(p) => <List.Icon {...p} icon="bell-outline" />}
                right={() => (
                  <Switch
                    value={pushEnabled}
                    onValueChange={onTogglePush}
                    disabled={!pushLoaded || pushBusy}
                  />
                )}
              />
            </Card>
            <PushDeliveryCard userId={userId} />
            <Card style={styles.card}>
              <Card.Content>
                <Text
                  variant="labelMedium"
                  style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}
                >
                  Push to this account
                </Text>
                {CLIENT_NOTIFICATION_CATEGORIES.map((c, i) => (
                  <View key={c.key}>
                    {i > 0 && <Divider style={styles.divider} />}
                    <View style={styles.row}>
                      <View style={styles.flex1}>
                        <Text variant="bodyMedium">{c.title}</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {c.description}
                        </Text>
                      </View>
                      <Switch
                        value={settings[`push_${c.key}`]}
                        disabled={locked}
                        onValueChange={(v) => patch({ [`push_${c.key}`]: v })}
                      />
                    </View>
                  </View>
                ))}
              </Card.Content>
            </Card>
            <Text style={[styles.footnote, { color: theme.colors.onSurfaceVariant }]}>
              A reminder to pay when an unpaid appointment starts is set on this phone by the
              app itself and follows the Push notifications switch above.
            </Text>
          </>
        )}

        {tab === 'email' && (
          <>
            <Card style={styles.card}>
              <Card.Content>
                <Text
                  variant="labelMedium"
                  style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}
                >
                  Email to {session?.user.email ?? 'your address'}
                </Text>
                {CLIENT_NOTIFICATION_CATEGORIES.map((c, i) => (
                  <View key={c.key}>
                    {i > 0 && <Divider style={styles.divider} />}
                    <View style={styles.row}>
                      <View style={styles.flex1}>
                        <Text variant="bodyMedium">{c.title}</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {c.description}
                        </Text>
                      </View>
                      <Switch
                        value={settings[`email_${c.key}`]}
                        disabled={locked}
                        onValueChange={(v) => patch({ [`email_${c.key}`]: v })}
                      />
                    </View>
                  </View>
                ))}
              </Card.Content>
            </Card>
            <Text style={[styles.footnote, { color: theme.colors.onSurfaceVariant }]}>
              Receipts and sign-in emails are always sent. We never email marketing to clients.
            </Text>
          </>
        )}

        {tab === 'text' && <TextMessagesCard userId={userId} onFeedback={setFeedback} />}

        {upsert.isError && (
          <Text variant="bodySmall" style={[styles.error, { color: theme.colors.error }]}>
            {upsert.error instanceof Error ? upsert.error.message : 'Could not save'}
          </Text>
        )}
      </ScrollView>

      <Snackbar visible={!!feedback} onDismiss={() => setFeedback(null)} duration={3000}>
        {feedback ?? ''}
      </Snackbar>
    </View>
  );
}

// Whether a push can physically arrive on any phone signed in as this account.
function PushDeliveryCard({ userId }: { userId: string | undefined }) {
  const theme = useTheme();
  const { data: tokens, isLoading } = useMyPushTokens(userId);
  if (isLoading) return null;
  const count = tokens?.length ?? 0;

  return (
    <Card style={styles.card}>
      <Card.Content>
        <Text
          variant="labelMedium"
          style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}
        >
          Where push arrives
        </Text>
        {count === 0 ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            No device is registered for push on this account yet. Turn on Push notifications
            above and allow notifications when your phone asks.
          </Text>
        ) : (
          (tokens ?? []).map((t) => (
            <View key={t.id} style={styles.row}>
              <List.Icon icon={t.platform === 'ios' ? 'apple' : 'android'} />
              <View style={styles.flex1}>
                <Text variant="bodyMedium">{t.device_name || t.platform}</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Last active {formatDistanceToNow(new Date(t.last_used_at), { addSuffix: true })}
                </Text>
              </View>
            </View>
          ))
        )}
      </Card.Content>
    </Card>
  );
}

// Text messages (0174): off until asked for, bound to the mobile number typed
// here. The server records every switch with the wording version. The
// disclosure sits between the number and the switch so it is read before
// consent is given (carrier opt-in form rule); this is the screen the 10DLC
// reviewer sees on theluxmirror.com/policies/text-messages.
function TextMessagesCard({
  userId,
  onFeedback,
}: {
  userId: string | undefined;
  onFeedback: (message: string) => void;
}) {
  const theme = useTheme();
  const { data: smsStatus } = useMySmsStatus(!!userId);
  const setSmsConsent = useSetSmsConsent();
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (smsStatus?.phone_e164 && !touched) setPhone(smsStatus.phone_e164);
  }, [smsStatus?.phone_e164, touched]);
  const on = !!smsStatus?.sms_on && !!smsStatus?.is_current;
  const e164 = toE164US(phone);
  const invalid = phone.trim().length > 0 && !e164;

  const onToggle = async (next: boolean) => {
    if (next && !e164) {
      onFeedback('Enter a US mobile number first.');
      return;
    }
    try {
      await setSmsConsent.mutateAsync({ phoneE164: e164, on: next, source: 'settings' });
      onFeedback(next ? 'Text messages on.' : 'Text messages off. You will not be texted.');
    } catch (err: any) {
      onFeedback(err?.message ?? 'Could not update text messages');
    }
  };

  return (
    <>
      <Card style={styles.card}>
        <Card.Content>
          <Text
            variant="labelMedium"
            style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}
          >
            Text messages
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Appointment confirmations, reminders and changes from the salons you book with, sent
            as SMS to the number below. Optional, and never marketing.
          </Text>
          <TextInput
            mode="outlined"
            dense
            label="Mobile number"
            value={phone}
            onChangeText={(v) => {
              setTouched(true);
              setPhone(v);
            }}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            placeholder="(610) 555-0123"
            error={invalid}
            disabled={on}
            style={{ marginTop: 10 }}
          />
          <HelperText type={invalid ? 'error' : 'info'} visible>
            {invalid
              ? 'Enter a 10-digit US mobile number.'
              : on
                ? 'Switch texts off to change the number.'
                : 'US and Canadian mobile numbers only.'}
          </HelperText>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {SMS_CONSENT_CTA}
          </Text>
          <Divider style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.flex1}>
              <Text variant="bodyMedium">Text messages</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {on
                  ? 'On — reply STOP to any text to opt out'
                  : smsStatus?.consent_version && !smsStatus.is_current && smsStatus.sms_on
                    ? 'Our text terms changed — turn on again to continue'
                    : 'Off'}
              </Text>
            </View>
            <Switch
              value={on}
              disabled={!userId || setSmsConsent.isPending || (!on && !e164)}
              onValueChange={onToggle}
            />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginLeft: -8, marginTop: 2 }}>
            <Button
              compact
              mode="text"
              onPress={() => router.push({ pathname: '/(app)/legal/[doc]', params: { doc: 'terms' } })}
            >
              Terms
            </Button>
            <Button
              compact
              mode="text"
              onPress={() => router.push({ pathname: '/(app)/legal/[doc]', params: { doc: 'privacy' } })}
            >
              Privacy Policy
            </Button>
          </View>
        </Card.Content>
      </Card>
      <Text style={[styles.footnote, { color: theme.colors.onSurfaceVariant }]}>
        Replying STOP to any text turns this off; HELP gets you support. We will not share your
        number with third parties for promotional or marketing purposes.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: { paddingHorizontal: 16, paddingTop: 12 },
  content: { paddingVertical: 16 },
  card: { marginHorizontal: 16, marginBottom: 12 },
  sectionLabel: { marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  flex1: { flex: 1 },
  divider: { marginVertical: 2 },
  footnote: { marginHorizontal: 16, marginTop: 4, fontSize: 12, lineHeight: 17 },
  error: { marginHorizontal: 16, marginTop: 8 },
});

export default withScreenErrorBoundary(SettingsNotificationsScreen);
