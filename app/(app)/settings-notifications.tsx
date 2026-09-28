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
import { useTranslation } from 'react-i18next';
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
import { smsSwitchState, toE164US } from '@/lib/bookingLogic';
import { useFormat } from '@/lib/format';

type ChannelTab = 'app' | 'email' | 'text';

// Every way LUX can reach a client, in one place, split by WHERE it arrives:
// the phone (push), the inbox (email), the phone number (SMS). Same layout as
// the business app's Settings › Notifications so the two apps read alike —
// and so the public policy pages (theluxmirror.com/policies/…) can describe
// one path for both.
function SettingsNotificationsScreen() {
  const theme = useTheme();
  const { t } = useTranslation(['inbox', 'common']);
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
        <Appbar.Content title={t('settings.title')} />
      </Appbar.Header>

      <View style={styles.tabs}>
        <SegmentedButtons
          value={tab}
          onValueChange={(v) => setTab(v as ChannelTab)}
          buttons={[
            { value: 'app', label: t('settings.tabs.app'), icon: 'cellphone' },
            { value: 'email', label: t('settings.tabs.email'), icon: 'email-outline' },
            { value: 'text', label: t('settings.tabs.text'), icon: 'message-text-outline' },
          ]}
          density="small"
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'app' && (
          <>
            <Card style={styles.card}>
              <List.Item
                title={t('settings.push.title')}
                description={t('settings.push.description')}
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
                  {t('settings.push.sectionLabel')}
                </Text>
                {CLIENT_NOTIFICATION_CATEGORIES.map((c, i) => (
                  <View key={c.key}>
                    {i > 0 && <Divider style={styles.divider} />}
                    <View style={styles.row}>
                      <View style={styles.flex1}>
                        <Text variant="bodyMedium">{t(`settings.categories.${c.key}.title`)}</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {t(`settings.categories.${c.key}.description`)}
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
              {t('settings.push.payReminderNote')}
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
                  {t('settings.email.sectionLabel', {
                    email: session?.user.email ?? t('settings.email.yourAddress'),
                  })}
                </Text>
                {CLIENT_NOTIFICATION_CATEGORIES.map((c, i) => (
                  <View key={c.key}>
                    {i > 0 && <Divider style={styles.divider} />}
                    <View style={styles.row}>
                      <View style={styles.flex1}>
                        <Text variant="bodyMedium">{t(`settings.categories.${c.key}.title`)}</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {t(`settings.categories.${c.key}.description`)}
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
              {t('settings.email.footnote')}
            </Text>
          </>
        )}

        {tab === 'text' && <TextMessagesCard userId={userId} onFeedback={setFeedback} />}

        {upsert.isError && (
          <Text variant="bodySmall" style={[styles.error, { color: theme.colors.error }]}>
            {upsert.error instanceof Error ? upsert.error.message : t('settings.saveFailed')}
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
  const { t } = useTranslation('inbox');
  const f = useFormat();
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
          {t('settings.delivery.title')}
        </Text>
        {count === 0 ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('settings.delivery.none')}
          </Text>
        ) : (
          (tokens ?? []).map((tok) => (
            <View key={tok.id} style={styles.row}>
              <List.Icon icon={tok.platform === 'ios' ? 'apple' : 'android'} />
              <View style={styles.flex1}>
                <Text variant="bodyMedium">{tok.device_name || tok.platform}</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {t('settings.delivery.lastActive', { when: f.fromNow(tok.last_used_at) })}
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
  const { t } = useTranslation('inbox');
  const f = useFormat();
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
      onFeedback(t('sms.enterNumberFirst'));
      return;
    }
    try {
      await setSmsConsent.mutateAsync({ phoneE164: e164, on: next, source: 'settings' });
      onFeedback(next ? t('sms.turnedOn') : t('sms.turnedOff'));
    } catch (err: any) {
      onFeedback(err?.message ?? t('sms.updateFailed'));
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
            {t('sms.title')}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('sms.intro')}
          </Text>
          <TextInput
            mode="outlined"
            dense
            label={t('sms.mobileNumber')}
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
              ? t('sms.invalidNumber')
              : on
                ? t('sms.switchOffToChange')
                : t('sms.usCanadaOnly')}
          </HelperText>
          {/* SMS_CONSENT_CTA is the carrier-reviewed opt-in wording recorded with
              SMS_CONSENT_VERSION — it stays English. Other languages get a
              plain-language summary above it that points at the legal text. */}
          {f.locale !== 'en' && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
              {t('sms.legalNote')}
            </Text>
          )}
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {SMS_CONSENT_CTA}
          </Text>
          <Divider style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.flex1}>
              <Text variant="bodyMedium">{t('sms.title')}</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {t(`sms.switch.${smsSwitchState(smsStatus)}`)}
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
              {t('sms.terms')}
            </Button>
            <Button
              compact
              mode="text"
              onPress={() => router.push({ pathname: '/(app)/legal/[doc]', params: { doc: 'privacy' } })}
            >
              {t('sms.privacyPolicy')}
            </Button>
          </View>
        </Card.Content>
      </Card>
      <Text style={[styles.footnote, { color: theme.colors.onSurfaceVariant }]}>
        {t('sms.footnote')}
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
