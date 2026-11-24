import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  Chip,
  HelperText,
  Icon,
  Menu,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useAuth } from '@/lib/auth';
import { useMyProfile } from '@/lib/clientProfile';
import { currentLocale, tMessage } from '@/lib/i18n';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_MESSAGE_MAX,
  SupportTicketForm,
  supportTicketSchema,
} from '@/lib/schemas';
import { useSubmitSupportTicket } from '@/lib/support';
import { useHelpFeed } from '@/lib/help';
import { categoryForArticle, findArticle, isArticleId } from '@/lib/helpLogic';

// Contact support — one message into LUX's support queue
// (submit_support_ticket, 0208 in ../app). Replies come by email, so the
// form's only job is to say who is asking and about what.
function SupportScreen() {
  const theme = useTheme();
  const { t } = useTranslation(['account', 'common']);
  const { session } = useAuth();
  const userId = session?.user.id;
  const { data: contact } = useMyProfile(userId);
  const submit = useSubmitSupportTicket();
  const [categoryMenu, setCategoryMenu] = useState(false);
  const helpFeed = useHelpFeed();
  // Opened from a help article (`article`, "section/slug"): the ticket
  // carries it along, as the website's ticket form does.
  const params = useLocalSearchParams<{ article?: string }>();
  const paramArticle = typeof params.article === 'string' ? params.article : undefined;
  const [articleSlug, setArticleSlug] = useState<string | null>(null);
  const articleTitle =
    articleSlug && helpFeed.data ? findArticle(helpFeed.data, articleSlug)?.title : undefined;

  // Prefill from the account. The row arrives after first render, so it is
  // applied as a reset that keeps anything the person has already typed.
  const prefill = useMemo<SupportTicketForm>(
    () => ({
      category: 'general',
      name: contact?.name ?? '',
      email: contact?.email ?? session?.user.email ?? '',
      phone: contact?.phone ?? '',
      message: '',
    }),
    [contact?.name, contact?.email, contact?.phone, session?.user.email],
  );

  const { control, handleSubmit, reset, watch, setValue } = useForm<SupportTicketForm>({
    resolver: zodResolver(supportTicketSchema),
    defaultValues: prefill,
  });

  useEffect(() => {
    reset(prefill, { keepDirtyValues: true });
  }, [prefill, reset]);

  // A payments article opens a payments ticket (the website's rule). Marked
  // dirty so the account prefill above doesn't put the category back.
  useEffect(() => {
    setArticleSlug(isArticleId(paramArticle) ? paramArticle : null);
    const fromArticle = categoryForArticle(paramArticle);
    if (fromArticle) setValue('category', fromArticle, { shouldDirty: true });
  }, [paramArticle, setValue]);

  const messageLength = watch('message').length;

  // Tab screens stay mounted: leaving after a sent message has to clear it,
  // or the next visit would open on the old confirmation.
  const leaveState = useRef({ sent: false, prefill });
  useEffect(() => {
    leaveState.current = { sent: submit.isSuccess, prefill };
  }, [submit.isSuccess, prefill]);
  const resetMutation = submit.reset;
  useFocusEffect(
    useCallback(
      () => () => {
        if (!leaveState.current.sent) return;
        resetMutation();
        reset(leaveState.current.prefill);
        setArticleSlug(null);
      },
      [reset, resetMutation],
    ),
  );

  const onSubmit = (values: SupportTicketForm) => {
    submit.mutate({ ...values, lang: currentLocale(), articleSlug });
  };

  const serverError = submit.isError
    ? ((submit.error as { message?: string } | null)?.message ?? t('common:errors.generic'))
    : null;

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('support.title')} />
      </Appbar.Header>

      {submit.isSuccess ? (
        <View style={styles.sent}>
          <Icon source="check-circle-outline" size={56} color={theme.colors.primary} />
          <Text variant="titleLarge" style={styles.sentTitle}>
            {t('support.sentTitle')}
          </Text>
          <Text
            variant="bodyMedium"
            style={[styles.sentBody, { color: theme.colors.onSurfaceVariant }]}
          >
            {t('support.sentBody')}
          </Text>
          <Button mode="contained" onPress={() => router.back()} style={styles.sentButton}>
            {t('common:actions.done')}
          </Button>
          <Button mode="text" onPress={() => router.push('/(app)/support-requests')}>
            {t('support.viewRequests')}
          </Button>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {t('support.intro')}
            </Text>

            {!!articleSlug && (
              <Chip
                icon="file-document-outline"
                onClose={() => setArticleSlug(null)}
                style={styles.article}
              >
                {t('support.fromArticle', { title: articleTitle ?? articleSlug })}
              </Chip>
            )}

            <Text variant="labelLarge" style={styles.label}>
              {t('support.category')}
            </Text>
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <Menu
                  visible={categoryMenu}
                  onDismiss={() => setCategoryMenu(false)}
                  anchor={
                    <Button
                      mode="outlined"
                      icon="chevron-down"
                      onPress={() => setCategoryMenu(true)}
                      style={styles.dropdown}
                      contentStyle={styles.dropdownContent}
                      accessibilityLabel={t('support.category')}
                    >
                      {t(`support.categories.${field.value}`)}
                    </Button>
                  }
                >
                  {SUPPORT_CATEGORIES.map((c) => (
                    <Menu.Item
                      key={c}
                      title={t(`support.categories.${c}`)}
                      leadingIcon={field.value === c ? 'check' : undefined}
                      onPress={() => {
                        field.onChange(c);
                        setCategoryMenu(false);
                      }}
                    />
                  ))}
                </Menu>
              )}
            />

            <Controller
              control={control}
              name="message"
              render={({ field, fieldState }) => (
                <View style={styles.messageField}>
                  <TextInput
                    label={t('support.message')}
                    placeholder={t('support.messagePlaceholder')}
                    mode="outlined"
                    multiline
                    numberOfLines={6}
                    maxLength={SUPPORT_MESSAGE_MAX}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={!!fieldState.error}
                    style={styles.message}
                  />
                  <HelperText type={fieldState.error ? 'error' : 'info'} visible>
                    {fieldState.error
                      ? tMessage(fieldState.error.message)
                      : t('support.messageCount', {
                          used: messageLength,
                          max: SUPPORT_MESSAGE_MAX,
                        })}
                  </HelperText>
                </View>
              )}
            />

            <Controller
              control={control}
              name="name"
              render={({ field, fieldState }) => (
                <View>
                  <TextInput
                    label={t('support.name')}
                    mode="outlined"
                    autoCapitalize="words"
                    autoComplete="name"
                    maxLength={200}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={!!fieldState.error}
                  />
                  <HelperText type="error" visible={!!fieldState.error}>
                    {tMessage(fieldState.error?.message)}
                  </HelperText>
                </View>
              )}
            />

            <Controller
              control={control}
              name="email"
              render={({ field, fieldState }) => (
                <View>
                  <TextInput
                    label={t('support.email')}
                    mode="outlined"
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    maxLength={320}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={!!fieldState.error}
                  />
                  <HelperText type={fieldState.error ? 'error' : 'info'} visible>
                    {fieldState.error
                      ? tMessage(fieldState.error.message)
                      : t('support.emailHint')}
                  </HelperText>
                </View>
              )}
            />

            <Controller
              control={control}
              name="phone"
              render={({ field, fieldState }) => (
                <View>
                  <TextInput
                    label={t('support.phone')}
                    mode="outlined"
                    autoComplete="tel"
                    keyboardType="phone-pad"
                    maxLength={40}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={!!fieldState.error}
                  />
                  <HelperText type="error" visible={!!fieldState.error}>
                    {tMessage(fieldState.error?.message)}
                  </HelperText>
                </View>
              )}
            />

            {serverError && (
              <HelperText type="error" visible style={styles.serverError}>
                {serverError}
              </HelperText>
            )}

            <Button
              mode="contained"
              icon="send"
              onPress={handleSubmit(onSubmit)}
              loading={submit.isPending}
              disabled={submit.isPending}
              style={styles.submit}
            >
              {t('support.send')}
            </Button>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  label: { marginTop: 20, marginBottom: 8 },
  // The chevron sits at the right edge, like a select field.
  dropdown: { alignSelf: 'stretch' },
  dropdownContent: { flexDirection: 'row-reverse', justifyContent: 'space-between' },
  article: { alignSelf: 'flex-start', marginTop: 16 },
  messageField: { marginTop: 20 },
  message: { minHeight: 140 },
  serverError: { paddingHorizontal: 0 },
  submit: { marginTop: 8 },
  sent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  sentTitle: { marginTop: 16, textAlign: 'center' },
  sentBody: { marginTop: 8, textAlign: 'center' },
  sentButton: { marginTop: 24, alignSelf: 'stretch' },
});

export default withScreenErrorBoundary(SupportScreen);
