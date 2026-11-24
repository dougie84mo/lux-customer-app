import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Button, Icon, List, Surface, Text, useTheme } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { HELP_APP, SUPPORT_URL } from '@/constants/support';
import { useFormat } from '@/lib/format';
import { useHelpFeed, useHelpFeedback } from '@/lib/help';
import { findArticle, HelpBlock, relatedForApp } from '@/lib/helpLogic';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

// One help article, drawn from the same blocks the website renders
// (heading / paragraph / numbered steps / note). The vote and "Still stuck?"
// match the website's article page: the vote is the same record, and Contact
// support opens with this article attached. Identical in both apps.
function HelpArticleScreen() {
  const theme = useTheme();
  const { t } = useTranslation(['account', 'common']);
  const f = useFormat();
  const params = useLocalSearchParams<{ id?: string; device?: string }>();
  const id = one(params.id) ?? '';
  const device = one(params.device);
  const feed = useHelpFeed();
  const feedback = useHelpFeedback();
  const [vote, setVote] = useState<boolean | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Tab screens stay mounted: opening another article (a Related link)
  // reuses this screen, so start it at the top with no vote recorded.
  const resetFeedback = feedback.reset;
  useEffect(() => {
    setVote(null);
    resetFeedback();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [id, resetFeedback]);

  const article = feed.data ? findArticle(feed.data, id) : null;
  const related = feed.data && article ? relatedForApp(feed.data, article, HELP_APP) : [];
  const muted = { color: theme.colors.onSurfaceVariant };

  const sendVote = useCallback(
    (helpful: boolean) => {
      setVote(helpful);
      feedback.mutate({ articleId: id, helpful });
    },
    [feedback, id],
  );

  const contact = () =>
    router.push({
      pathname: '/(app)/support',
      params: device ? { article: id, device } : { article: id },
    });

  const renderBlock = (b: HelpBlock, i: number) => (
    <View key={i} style={styles.block}>
      {!!b.h && (
        <Text variant="titleMedium" style={styles.h}>
          {b.h}
        </Text>
      )}
      {!!b.p && <Text variant="bodyLarge">{b.p}</Text>}
      {b.steps?.map((step, n) => (
        <View key={n} style={styles.step}>
          <View style={[styles.stepNum, { backgroundColor: theme.colors.primaryContainer }]}>
            <Text variant="labelLarge" style={{ color: theme.colors.onPrimaryContainer }}>
              {n + 1}
            </Text>
          </View>
          <Text variant="bodyLarge" style={styles.stepText}>
            {step}
          </Text>
        </View>
      ))}
      {!!b.note && (
        <Surface
          style={[styles.note, { borderLeftColor: theme.colors.primary }]}
          elevation={0}
          mode="flat"
        >
          <Text variant="bodyMedium">{b.note}</Text>
        </Surface>
      )}
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('support.help.title')} />
      </Appbar.Header>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
        {feed.isLoading ? (
          <ActivityIndicator style={styles.loading} />
        ) : !article ? (
          <Surface style={styles.card} elevation={1}>
            <Icon source="file-question-outline" size={40} color={theme.colors.onSurfaceVariant} />
            <Text variant="titleMedium" style={styles.center}>
              {t('support.help.notFound')}
            </Text>
            <Text variant="bodyMedium" style={[styles.center, muted]}>
              {t('support.help.notFoundBody')}
            </Text>
            <Button
              mode="contained-tonal"
              icon="open-in-new"
              onPress={() => WebBrowser.openBrowserAsync(SUPPORT_URL).catch(() => {})}
            >
              {t('support.help.openWeb')}
            </Button>
          </Surface>
        ) : (
          <>
            <View style={styles.body}>
              <Text variant="headlineSmall">{article.title}</Text>
              {!!article.summary && (
                <Text variant="bodyLarge" style={[styles.summary, muted]}>
                  {article.summary}
                </Text>
              )}
              {article.blocks.map(renderBlock)}
              {!!article.lastReviewed && (
                <Text variant="bodySmall" style={[styles.reviewed, muted]}>
                  {t('support.help.lastReviewed', { date: f.date(article.lastReviewed, 'date') })}
                </Text>
              )}
            </View>

            <Surface style={styles.card} elevation={1}>
              {vote === null ? (
                <>
                  <Text variant="titleMedium">{t('support.help.helpful.question')}</Text>
                  <View style={styles.voteRow}>
                    <Button mode="outlined" icon="thumb-up-outline" onPress={() => sendVote(true)}>
                      {t('support.help.helpful.yes')}
                    </Button>
                    <Button mode="outlined" icon="thumb-down-outline" onPress={() => sendVote(false)}>
                      {t('support.help.helpful.no')}
                    </Button>
                  </View>
                </>
              ) : (
                <Text variant="bodyMedium" style={styles.center}>
                  {vote ? t('support.help.helpful.thanks') : t('support.help.helpful.sorry')}
                </Text>
              )}
            </Surface>

            <Surface style={styles.card} elevation={1}>
              <Text variant="titleMedium">{t('support.help.stillStuck')}</Text>
              <Text variant="bodyMedium" style={[styles.center, muted]}>
                {t('support.help.stillStuckArticle')}
              </Text>
              <Button mode="contained" icon="email-outline" onPress={contact}>
                {t('support.contact')}
              </Button>
            </Surface>

            {related.length > 0 && (
              <List.Section>
                <List.Subheader>{t('support.help.related')}</List.Subheader>
                {related.map((r) => (
                  <List.Item
                    key={r.id}
                    title={r.title}
                    description={r.summary}
                    titleNumberOfLines={2}
                    descriptionNumberOfLines={2}
                    right={(p) => <List.Icon {...p} icon="chevron-right" />}
                    onPress={() =>
                      router.setParams(device ? { id: r.id, device } : { id: r.id })
                    }
                  />
                ))}
              </List.Section>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingBottom: 32 },
  loading: { marginVertical: 48 },
  body: { padding: 20, gap: 4 },
  summary: { marginTop: 6, marginBottom: 8 },
  block: { marginTop: 12, gap: 8 },
  h: { marginTop: 4 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1 },
  note: { borderLeftWidth: 3, borderRadius: 8, padding: 12 },
  reviewed: { marginTop: 20 },
  card: { marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 20, alignItems: 'center', gap: 10 },
  voteRow: { flexDirection: 'row', gap: 12 },
  center: { textAlign: 'center' },
});

export default withScreenErrorBoundary(HelpArticleScreen);
