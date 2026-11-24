import { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Button, Icon, List, Surface, Text, useTheme } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { HELP_APP, SUPPORT_URL } from '@/constants/support';
import { useManualRefresh } from '@/hooks/use-manual-refresh';
import { useHelpFeed } from '@/lib/help';
import { sectionsForApp } from '@/lib/helpLogic';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

// Help center — the articles from support.theluxmirror.com, drawn natively
// and narrowed to this app (lib/help.ts). `section` opens one section only
// (a mirror's page sends `fix-it`); `device` rides along to Contact support
// so a ticket from here names that mirror. Identical in both apps.
function HelpScreen() {
  const theme = useTheme();
  const { t } = useTranslation(['account', 'common']);
  const params = useLocalSearchParams<{ section?: string; device?: string }>();
  const onlySection = one(params.section);
  const device = one(params.device);
  const feed = useHelpFeed();
  const { refreshing, onRefresh } = useManualRefresh(feed.refetch);

  const sections = useMemo(
    () => (feed.data ? sectionsForApp(feed.data, HELP_APP, onlySection) : []),
    [feed.data, onlySection],
  );
  // An unknown section (an old link) falls back to the whole help center.
  const shown = sections.length || !feed.data ? sections : sectionsForApp(feed.data, HELP_APP);
  const title = onlySection && sections.length === 1 ? sections[0].title : t('support.help.title');
  const muted = { color: theme.colors.onSurfaceVariant };

  const contact = () =>
    router.push({ pathname: '/(app)/support', params: device ? { device } : {} });
  const openWeb = () => WebBrowser.openBrowserAsync(SUPPORT_URL).catch(() => {});

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={title} />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {feed.isLoading ? (
          <ActivityIndicator style={styles.loading} />
        ) : !feed.data ? (
          <Surface style={styles.card} elevation={1}>
            <Icon source="cloud-question" size={40} color={theme.colors.onSurfaceVariant} />
            <Text variant="titleMedium" style={styles.center}>
              {t('support.help.loadFailed')}
            </Text>
            <Text variant="bodyMedium" style={[styles.center, muted]}>
              {t('support.help.loadFailedBody')}
            </Text>
            <Button mode="contained-tonal" icon="open-in-new" onPress={openWeb}>
              {t('support.help.openWeb')}
            </Button>
          </Surface>
        ) : (
          shown.map((section) => (
            <List.Section key={section.id}>
              <List.Subheader>{section.title}</List.Subheader>
              {!!section.blurb && (
                <Text variant="bodySmall" style={[styles.blurb, muted]}>
                  {section.blurb}
                </Text>
              )}
              {section.articles.map((a) => (
                <List.Item
                  key={a.id}
                  title={a.title}
                  description={a.summary}
                  titleNumberOfLines={2}
                  descriptionNumberOfLines={2}
                  right={(p) => <List.Icon {...p} icon="chevron-right" />}
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/help-article',
                      params: device ? { id: a.id, device } : { id: a.id },
                    })
                  }
                />
              ))}
            </List.Section>
          ))
        )}

        <Surface style={styles.card} elevation={1}>
          <Text variant="titleMedium">{t('support.help.stillStuck')}</Text>
          <Text variant="bodyMedium" style={[styles.center, muted]}>
            {t('support.help.stillStuckBody')}
          </Text>
          <Button mode="contained" icon="email-outline" onPress={contact}>
            {t('support.contact')}
          </Button>
        </Surface>

        {!!feed.data && (
          <Button mode="text" icon="open-in-new" onPress={openWeb} style={styles.web}>
            {t('support.help.openWeb')}
          </Button>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingBottom: 32 },
  loading: { marginVertical: 48 },
  blurb: { paddingHorizontal: 16, marginTop: -4, marginBottom: 4 },
  card: { margin: 16, borderRadius: 16, padding: 20, alignItems: 'center', gap: 10 },
  center: { textAlign: 'center' },
  web: { alignSelf: 'center' },
});

export default withScreenErrorBoundary(HelpScreen);
