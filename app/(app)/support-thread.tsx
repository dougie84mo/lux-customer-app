import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Button, HelperText, IconButton, Text, TextInput, useTheme } from 'react-native-paper';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useManualRefresh } from '@/hooks/use-manual-refresh';
import { useFormat } from '@/lib/format';
import { tMessage } from '@/lib/i18n';
import { SUPPORT_CATEGORIES, SupportCategory } from '@/lib/schemas';
import { SupportThreadMessage, useReplyToSupportRequest, useSupportThread } from '@/lib/support';

const MAX_REPLY = 5000;
const isKnownCategory = (c: string): c is SupportCategory =>
  (SUPPORT_CATEGORIES as readonly string[]).includes(c);

// One support request as a conversation: their first message, every LUX
// Support reply (always shown as "LUX Support") and their own follow-ups,
// with a reply box. Opening it marks LUX's replies read (my_support_thread,
// 0268); a reply to an answered or resolved request reopens it. A reply push
// lands here (lib/push.ts). Identical in both apps.
function SupportThreadScreen() {
  const theme = useTheme();
  const { t } = useTranslation(['account', 'common']);
  const f = useFormat();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : undefined;
  const focused = useIsFocused();
  const thread = useSupportThread(id, focused);
  const reply = useReplyToSupportRequest(id);
  const { refreshing, onRefresh } = useManualRefresh(thread.refetch);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  // Tab screens stay mounted: another thread opened later reuses this
  // screen, so a draft never carries across.
  const resetReply = reply.reset;
  useEffect(() => {
    setDraft('');
    resetReply();
  }, [id, resetReply]);

  // A reply that arrived while away shows on return, and opening counts as
  // read. (The query is enabled only while focused, so it refetches here.)
  const refetch = thread.refetch;
  useFocusEffect(
    useCallback(() => {
      if (id) refetch();
    }, [id, refetch]),
  );

  const send = () => {
    const body = draft.trim();
    if (!body || reply.isPending) return;
    reply.mutate(body, { onSuccess: () => setDraft('') });
  };

  const data = thread.data;
  const muted = { color: theme.colors.onSurfaceVariant };
  const title = data
    ? isKnownCategory(data.category)
      ? t(`support.categories.${data.category}`)
      : t('support.categories.general')
    : t('support.requests.title');

  const renderMessage = (m: SupportThreadMessage) => {
    const mine = m.author === 'member';
    return (
      <View key={m.id} style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: mine ? theme.colors.primaryContainer : theme.colors.surfaceVariant,
            },
          ]}
        >
          <Text
            variant="labelMedium"
            style={{ color: mine ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant }}
          >
            {mine ? t('support.thread.you') : t('support.thread.luxSupport')}
          </Text>
          <Text
            variant="bodyLarge"
            selectable
            style={{ color: mine ? theme.colors.onPrimaryContainer : theme.colors.onSurface }}
          >
            {m.body}
          </Text>
        </View>
        <Text variant="labelSmall" style={[styles.when, muted]}>
          {f.date(m.created_at, 'dateTime')}
        </Text>
      </View>
    );
  };

  const replyError = reply.isError
    ? (tMessage((reply.error as { message?: string } | null)?.message) ?? t('common:errors.generic'))
    : null;

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content
          title={title}
          subtitle={data ? t(`support.requests.state.${data.state}`) : undefined}
        />
      </Appbar.Header>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {thread.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : !data ? (
          <View style={styles.center}>
            <Text variant="bodyMedium" style={{ color: theme.colors.error, textAlign: 'center' }}>
              {tMessage((thread.error as { message?: string } | null)?.message) ??
                t('common:errors.generic')}
            </Text>
            <Button mode="text" onPress={() => thread.refetch()} style={styles.action}>
              {t('common:actions.retry')}
            </Button>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            {data.messages.map(renderMessage)}
            <Text variant="bodySmall" style={[styles.footnote, muted]}>
              {data.state === 'resolved'
                ? t('support.thread.resolvedHint')
                : data.state === 'new'
                  ? t('support.thread.waitingHint')
                  : t('support.thread.emailHint', { email: data.email })}
            </Text>
          </ScrollView>
        )}

        {!!data && (
          <View
            style={[
              styles.composer,
              { borderTopColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface },
            ]}
          >
            {!!replyError && (
              <HelperText type="error" visible style={styles.error}>
                {replyError}
              </HelperText>
            )}
            <View style={styles.composerRow}>
              <TextInput
                mode="outlined"
                dense
                multiline
                value={draft}
                onChangeText={setDraft}
                maxLength={MAX_REPLY}
                placeholder={t('support.thread.placeholder')}
                style={styles.input}
                accessibilityLabel={t('support.thread.placeholder')}
              />
              <IconButton
                icon="send"
                mode="contained"
                disabled={!draft.trim() || reply.isPending}
                loading={reply.isPending}
                onPress={send}
                accessibilityLabel={t('support.thread.send')}
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 24, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  action: { marginTop: 16 },
  row: { maxWidth: '85%', gap: 2 },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  when: { marginHorizontal: 6 },
  footnote: { textAlign: 'center', marginTop: 8 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingVertical: 6 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  input: { flex: 1, maxHeight: 140 },
  error: { paddingHorizontal: 8 },
});

export default withScreenErrorBoundary(SupportThreadScreen);
