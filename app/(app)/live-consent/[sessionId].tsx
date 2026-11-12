import { useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Dialog,
  Icon,
  IconButton,
  Portal,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { currentLocale, tMessage } from '@/lib/i18n';
import {
  destinationLabel,
  streamConsentText,
  LAN_VIEW_DESTINATION,
  useMyLiveStreamLinks,
  useMyLiveStreamRequests,
  useRespondLiveConsent,
  useSetNeverLiveStream,
  useStopMyLiveStream,
  type MyLiveStreamRequest,
} from '@/lib/liveStreams';

type Outcome = 'declined' | 'stopped' | 'never';

// Live stream request — opened from the live_consent push / inbox row (0231).
// pending + no consent yet → the request (Allow / Decline / Never stream me);
// consented, starting or live → "You're live" with Stop the stream (works
// whether the client agreed here or the stylist attested in person);
// anything else (expired, declined, ended) → no longer active.
function LiveConsentScreen() {
  const theme = useTheme();
  const { t } = useTranslation(['photos', 'common']);
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const focused = useIsFocused();
  const { data, isLoading, error, refetch } = useMyLiveStreamRequests({ poll: focused });
  const { data: links } = useMyLiveStreamLinks(sessionId, { poll: focused });
  const respond = useRespondLiveConsent();
  const stop = useStopMyLiveStream();
  const setNever = useSetNeverLiveStream();

  const [neverOpen, setNeverOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  // What this screen just did, keyed by session so a later request (Tabs keep
  // the screen mounted) starts fresh.
  const [outcome, setOutcome] = useState<{ sessionId: string; kind: Outcome; shop: string } | null>(null);

  const row = (data ?? []).find((r) => r.session_id === sessionId) ?? null;
  const done = outcome && outcome.sessionId === sessionId ? outcome : null;
  const busy = respond.isPending || stop.isPending || setNever.isPending;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(app)'));

  const errorText = (err: unknown, fallback: string) => {
    const msg = (err as { message?: string } | null)?.message;
    if (msg && /expired/i.test(msg)) return t('live.errors.expired');
    return tMessage(msg) ?? fallback;
  };

  const onRespond = async (r: MyLiveStreamRequest, allow: boolean) => {
    try {
      await respond.mutateAsync({ sessionId: r.session_id, allow });
      if (!allow) setOutcome({ sessionId: r.session_id, kind: 'declined', shop: r.business_name });
    } catch (err) {
      setFeedback(errorText(err, t('live.errors.respondFailed')));
    }
  };

  const onStop = async (r: MyLiveStreamRequest) => {
    try {
      await stop.mutateAsync({ sessionId: r.session_id });
      setOutcome({ sessionId: r.session_id, kind: 'stopped', shop: r.business_name });
    } catch (err) {
      setFeedback(errorText(err, t('live.errors.stopFailed')));
    }
  };

  const onNever = async () => {
    try {
      await setNever.mutateAsync({ never: true });
      setOutcome({ sessionId, kind: 'never', shop: row?.business_name ?? '' });
    } catch (err) {
      setFeedback(errorText(err, t('live.settings.saveFailed')));
    } finally {
      setNeverOpen(false);
    }
  };

  const destinations = (r: MyLiveStreamRequest) =>
    r.destinations
      .map((d) => (d === LAN_VIEW_DESTINATION ? t('live.salonApp') : destinationLabel(d)))
      .join(', ');

  const renderMessage = (icon: string, title: string, body: string | null) => (
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
      <Button mode="contained-tonal" onPress={goBack} style={styles.centerButton}>
        {t('common:actions.back')}
      </Button>
    </View>
  );

  const renderRequest = (r: MyLiveStreamRequest) => (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Card>
        <Card.Content style={styles.cardContent}>
          <View style={styles.headRow}>
            <Icon source="broadcast" size={28} color={theme.colors.primary} />
            <Text variant="titleLarge" style={styles.flex}>
              {t('live.request.title', { shop: r.business_name })}
            </Text>
          </View>
          {r.stylist_name ? (
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {t('live.request.stylist', { name: r.stylist_name })}
            </Text>
          ) : null}
          {r.title ? <Text variant="titleSmall">{r.title}</Text> : null}
          <Text variant="bodyMedium" style={styles.bold}>
            {t('live.request.streamingTo', { destinations: destinations(r) })}
          </Text>
          <Text variant="bodyMedium">{streamConsentText(currentLocale())}</Text>
        </Card.Content>
      </Card>

      <View style={styles.actions}>
        <Button
          mode="contained"
          onPress={() => onRespond(r, true)}
          loading={respond.isPending && respond.variables?.allow === true}
          disabled={busy}
          contentStyle={styles.bigButton}
        >
          {t('live.request.allow')}
        </Button>
        <Button
          mode="outlined"
          onPress={() => onRespond(r, false)}
          loading={respond.isPending && respond.variables?.allow === false}
          disabled={busy}
          contentStyle={styles.bigButton}
        >
          {t('live.request.decline')}
        </Button>
        <Button
          mode="text"
          compact
          onPress={() => setNeverOpen(true)}
          disabled={busy}
          textColor={theme.colors.onSurfaceVariant}
          style={styles.neverLink}
        >
          {t('live.request.never')}
        </Button>
      </View>
    </ScrollView>
  );

  const renderOnAir = (r: MyLiveStreamRequest) => {
    const live = r.status === 'live';
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card>
          <Card.Content style={styles.cardContent}>
            <View style={styles.headRow}>
              <Icon
                source={live ? 'broadcast' : 'timer-sand'}
                size={28}
                color={live ? theme.colors.error : theme.colors.primary}
              />
              <Text variant="titleLarge" style={styles.flex}>
                {live ? t('live.onAir.live') : t('live.onAir.preparing')}
              </Text>
            </View>
            <Text variant="bodyMedium">
              {live
                ? t('live.onAir.liveBody', { shop: r.business_name, destinations: destinations(r) })
                : t('live.onAir.preparingBody', { shop: r.business_name, destinations: destinations(r) })}
            </Text>
            {r.title ? <Text variant="titleSmall">{r.title}</Text> : null}
            {(links ?? []).map((l) => (
              <View key={l.url} style={styles.linkRow}>
                <Button
                  mode="outlined"
                  icon={l.kind === 'yt_live' ? 'youtube' : 'facebook'}
                  onPress={() => Linking.openURL(l.url)}
                  style={styles.flex}
                >
                  {t('live.onAir.watch', { label: l.label })}
                </Button>
                <IconButton
                  icon="share-variant"
                  accessibilityLabel={t('live.onAir.share')}
                  onPress={() => Share.share({ message: l.url, url: l.url })}
                />
              </View>
            ))}
          </Card.Content>
        </Card>

        <View style={styles.actions}>
          <Button
            mode="contained"
            icon="stop-circle-outline"
            buttonColor={theme.colors.error}
            textColor={theme.colors.onError}
            onPress={() => onStop(r)}
            loading={stop.isPending}
            disabled={busy}
            contentStyle={styles.stopButton}
            labelStyle={styles.stopLabel}
          >
            {t('live.onAir.stop')}
          </Button>
          <Text variant="bodySmall" style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
            {t('live.onAir.stopHint')}
          </Text>
        </View>
      </ScrollView>
    );
  };

  const renderBody = () => {
    if (done) {
      if (done.kind === 'declined') {
        return renderMessage('check-circle-outline', t('live.done.declined', { shop: done.shop }), null);
      }
      if (done.kind === 'stopped') return renderMessage('stop-circle-outline', t('live.done.stopped'), null);
      return renderMessage('check-circle-outline', t('live.done.never'), null);
    }
    if (isLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      );
    }
    if (error && !data) {
      return (
        <View style={styles.center}>
          <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
            {error.message}
          </Text>
          <Button mode="contained-tonal" onPress={() => refetch()} style={styles.centerButton}>
            {t('common:actions.retry')}
          </Button>
        </View>
      );
    }
    if (!row) return renderMessage('broadcast-off', t('live.inactive.title'), t('live.inactive.body'));
    if (row.status === 'pending' && !row.consent_method) return renderRequest(row);
    return renderOnAir(row);
  };

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={goBack} />
        <Appbar.Content title={t('live.screenTitle')} />
      </Appbar.Header>

      {renderBody()}

      <Portal>
        <Dialog visible={neverOpen} onDismiss={() => !setNever.isPending && setNeverOpen(false)}>
          <Dialog.Title>{t('live.neverDialog.title')}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{t('live.neverDialog.body')}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setNeverOpen(false)} disabled={setNever.isPending}>
              {t('common:actions.cancel')}
            </Button>
            <Button onPress={onNever} loading={setNever.isPending} disabled={setNever.isPending}>
              {t('live.neverDialog.confirm')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={!!feedback} onDismiss={() => setFeedback(null)} duration={3000}>
        {feedback ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scroll: { padding: 16, gap: 16 },
  cardContent: { gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bold: { fontWeight: '600' },
  actions: { gap: 10 },
  bigButton: { paddingVertical: 6 },
  stopButton: { paddingVertical: 12 },
  stopLabel: { fontSize: 17 },
  neverLink: { alignSelf: 'center' },
  hint: { textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  centerTitle: { marginTop: 12, textAlign: 'center' },
  centerBody: { marginTop: 6, textAlign: 'center' },
  centerButton: { marginTop: 20 },
});

export default withScreenErrorBoundary(LiveConsentScreen);
