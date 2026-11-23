import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Button, Icon, List, Surface, Text, useTheme } from 'react-native-paper';
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { STATUS_URL } from '@/constants/support';
import { useManualRefresh } from '@/hooks/use-manual-refresh';
import { useCloudReachable, useSystemStatus } from '@/lib/status';
import { overallState, OverallState, ServiceState } from '@/lib/statusLogic';

const SUMMARY_ICON: Record<OverallState, string> = {
  operational: 'check-circle',
  degraded: 'alert-circle',
  outage: 'close-circle',
};
const SUMMARY_STATE: Record<OverallState, ServiceState> = {
  operational: 'up',
  degraded: 'degraded',
  outage: 'down',
};

// System status — what status.theluxmirror.com reports, laid out for a phone,
// plus one live check from this phone. Reads the status page's own summary
// file (lib/status.ts), so the two always agree.
function SystemStatusScreen() {
  const theme = useTheme();
  const { t } = useTranslation(['account', 'common']);
  const status = useSystemStatus();
  const reachable = useCloudReachable();

  const stateColor: Record<ServiceState, string> = {
    up: theme.dark ? '#66bb6a' : '#2e7d32',
    degraded: theme.dark ? '#ffb74d' : '#b26a00',
    down: theme.colors.error,
  };

  const refetchStatus = status.refetch;
  const refetchReachable = reachable.refetch;
  const refetchAll = useCallback(
    () => Promise.all([refetchStatus(), refetchReachable()]),
    [refetchStatus, refetchReachable],
  );
  const { refreshing, onRefresh } = useManualRefresh(refetchAll);

  // Tab screens stay mounted, so a second visit would show the last visit's
  // answer. Ask again every time the screen is opened.
  useFocusEffect(
    useCallback(() => {
      refetchAll();
    }, [refetchAll]),
  );

  const services = status.data;
  const overall = services ? overallState(services) : null;
  const muted = { color: theme.colors.onSurfaceVariant };

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('support.systemStatus.title')} />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Surface style={styles.summary} elevation={1}>
          {overall ? (
            <>
              <Icon source={SUMMARY_ICON[overall]} size={48} color={stateColor[SUMMARY_STATE[overall]]} />
              <Text variant="titleLarge" style={styles.summaryTitle}>
                {t(`support.systemStatus.overall.${overall}`)}
              </Text>
              <Text variant="bodyMedium" style={[styles.summaryBody, muted]}>
                {t('support.systemStatus.checkedEvery')}
              </Text>
            </>
          ) : status.isError ? (
            <>
              <Icon source="cloud-question" size={48} color={theme.colors.onSurfaceVariant} />
              <Text variant="titleLarge" style={styles.summaryTitle}>
                {t('support.systemStatus.unavailable')}
              </Text>
              <Text variant="bodyMedium" style={[styles.summaryBody, muted]}>
                {t('support.systemStatus.unavailableBody')}
              </Text>
            </>
          ) : (
            <ActivityIndicator style={styles.loading} />
          )}
        </Surface>

        <List.Section>
          <List.Subheader>{t('support.systemStatus.thisPhone')}</List.Subheader>
          <List.Item
            title={t('support.systemStatus.connection')}
            description={
              reachable.data === undefined
                ? t('support.systemStatus.connectionChecking')
                : reachable.data
                  ? t('support.systemStatus.connectionOk')
                  : t('support.systemStatus.connectionFailed')
            }
            descriptionNumberOfLines={3}
            left={(p) =>
              reachable.data === undefined ? (
                <List.Icon {...p} icon="dots-horizontal" />
              ) : (
                <List.Icon
                  {...p}
                  icon={reachable.data ? 'check-circle' : 'close-circle'}
                  color={stateColor[reachable.data ? 'up' : 'down']}
                />
              )
            }
          />
        </List.Section>

        {services && (
          <List.Section>
            <List.Subheader>{t('support.systemStatus.services')}</List.Subheader>
            {services.map((s) => (
              <List.Item
                key={s.slug}
                title={s.key ? t(`support.systemStatus.service.${s.key}`) : s.name}
                left={(p) => <List.Icon {...p} icon="circle" color={stateColor[s.state]} />}
                right={() => (
                  <Text variant="labelLarge" style={[styles.state, { color: stateColor[s.state] }]}>
                    {t(`support.systemStatus.state.${s.state}`)}
                  </Text>
                )}
              />
            ))}
          </List.Section>
        )}

        <Button
          mode="text"
          icon="open-in-new"
          onPress={() => WebBrowser.openBrowserAsync(STATUS_URL).catch(() => {})}
          style={styles.full}
        >
          {t('support.systemStatus.openFull')}
        </Button>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  summary: { borderRadius: 16, padding: 24, alignItems: 'center', minHeight: 168, justifyContent: 'center' },
  summaryTitle: { marginTop: 12, textAlign: 'center' },
  summaryBody: { marginTop: 6, textAlign: 'center' },
  loading: { marginVertical: 24 },
  state: { alignSelf: 'center' },
  full: { marginTop: 8 },
});

export default withScreenErrorBoundary(SystemStatusScreen);
