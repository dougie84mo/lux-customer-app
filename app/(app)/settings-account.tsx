import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  Card,
  Dialog,
  Divider,
  HelperText,
  List,
  Portal,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { tMessage } from '@/lib/i18n';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { supabase } from '@/lib/supabase';
import { changePasswordSchema } from '@/lib/schemas';
import { getIdentities, linkGoogle, unlinkGoogle } from '@/lib/googleAuth';
import { unlinkApple } from '@/lib/appleAuth';
import { useDeleteAccount } from '@/lib/account';

type PasswordField = 'newPassword' | 'confirmPassword';

// Settings › Account & sign-in — connected accounts, password, delete account.
// Split out of the settings hub 2026-09-13 to match the business app's layout.
function SettingsAccountScreen() {
  const theme = useTheme();
  const { t } = useTranslation(['account', 'common']);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Account deletion (App Store 5.1.1(v) / Play data safety). Type-to-confirm;
  // the server refuses with a reason if this login still owns a business or
  // has money in flight in the business app.
  const deleteAccount = useDeleteAccount();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const onDeleteAccount = async () => {
    try {
      await deleteAccount.mutateAsync();
      // onSuccess signed out locally; the auth listener returns to login.
    } catch (err: any) {
      setConfirmDelete(false);
      setConfirmText('');
      setFeedback(err?.message ?? t('signIn.deleteFailed'));
    }
  };

  // Connected accounts (Google, Apple). null = still checking.
  const [googleLinked, setGoogleLinked] = useState<boolean | null>(null);
  const [appleLinked, setAppleLinked] = useState<boolean | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const [identityCount, setIdentityCount] = useState(0);

  const refreshIdentities = useCallback(async () => {
    try {
      const ids = await getIdentities();
      setIdentityCount(ids.length);
      setGoogleLinked(ids.some((i) => i.provider === 'google'));
      setAppleLinked(ids.some((i) => i.provider === 'apple'));
    } catch {
      setGoogleLinked(null);
      setAppleLinked(null);
    }
  }, []);

  useEffect(() => {
    refreshIdentities();
  }, [refreshIdentities]);

  const onToggleGoogle = async () => {
    setLinkBusy(true);
    try {
      if (googleLinked) {
        // Never strip the user's only sign-in method.
        if (identityCount <= 1) {
          setFeedback(t('signIn.googleLastMethod'));
          return;
        }
        await unlinkGoogle();
        setFeedback(t('signIn.googleDisconnected'));
      } else {
        const linked = await linkGoogle();
        if (linked) setFeedback(t('signIn.googleConnected'));
      }
      await refreshIdentities();
    } catch (err: any) {
      setFeedback(tMessage(err?.message) ?? t('signIn.googleFailed'));
    } finally {
      setLinkBusy(false);
    }
  };

  // No native link API for Apple (supabase-js linkIdentity is web-redirect
  // only) — connecting happens by signing in with Apple on the login screen;
  // matching verified emails auto-link. Here we only support disconnecting.
  const onDisconnectApple = async () => {
    setAppleBusy(true);
    try {
      if (identityCount <= 1) {
        setFeedback(t('signIn.appleLastMethod'));
        return;
      }
      await unlinkApple();
      setFeedback(t('signIn.appleDisconnected'));
      await refreshIdentities();
    } catch (err: any) {
      setFeedback(err?.message ?? t('signIn.appleFailed'));
    } finally {
      setAppleBusy(false);
    }
  };

  // Password change. Plain state to match this screen's lightweight form
  // style; validated with the shared Zod schema. Current-password
  // verification stays disabled (see changePasswordSchema).
  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState<Partial<Record<PasswordField, string>>>({});
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const onChangePassword = async () => {
    setPwErrors({});
    const parsed = changePasswordSchema.safeParse({
      newPassword: pw.next,
      confirmPassword: pw.confirm,
    });
    if (!parsed.success) {
      const next: Partial<Record<PasswordField, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as PasswordField;
        if (!next[key]) next[key] = issue.message;
      }
      setPwErrors(next);
      return;
    }
    setPwSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw.next });
      if (error) throw error;
      setPw({ next: '', confirm: '' });
      setFeedback(t('signIn.passwordUpdated'));
    } catch (err: any) {
      setFeedback(err?.message ?? t('signIn.passwordFailed'));
    } finally {
      setPwSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('signIn.title')} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Profile lives on its own screen; link it so this screen covers
            everything "account" the way the business app's does. */}
        <Card>
          <List.Item
            title={t('hub.profile')}
            description={t('hub.profileDescription')}
            left={(p) => <List.Icon {...p} icon="account-circle-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/profile')}
          />
        </Card>

        {/* Connected accounts */}
        <Card style={{ marginTop: 16 }}>
          <Card.Content>
            <Text variant="titleMedium">{t('signIn.connectedAccounts')}</Text>
          </Card.Content>
          <Divider />
          <List.Item
            title="Google"
            description={
              googleLinked == null
                ? t('signIn.checking')
                : googleLinked
                  ? t('signIn.connected')
                  : t('signIn.notConnected')
            }
            left={(p) => <List.Icon {...p} icon="google" />}
            right={() => (
              <Button
                compact
                onPress={onToggleGoogle}
                loading={linkBusy}
                disabled={linkBusy || googleLinked == null}
              >
                {googleLinked ? t('signIn.disconnect') : t('signIn.connect')}
              </Button>
            )}
          />
          <List.Item
            title="Apple"
            description={
              appleLinked == null
                ? t('signIn.checking')
                : appleLinked
                  ? t('signIn.connected')
                  : t('signIn.appleConnectHint')
            }
            left={(p) => <List.Icon {...p} icon="apple" />}
            right={() =>
              appleLinked ? (
                <Button compact onPress={onDisconnectApple} loading={appleBusy} disabled={appleBusy}>
                  {t('signIn.disconnect')}
                </Button>
              ) : null
            }
          />
        </Card>

        {/* Password */}
        <Card style={{ marginTop: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 12 }}>
              {t('signIn.password')}
            </Text>
            <TextInput
              label={t('signIn.newPassword')}
              mode="outlined"
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              secureTextEntry={!showPw}
              value={pw.next}
              onChangeText={(v) => setPw((s) => ({ ...s, next: v }))}
              error={!!pwErrors.newPassword}
              right={
                <TextInput.Icon icon={showPw ? 'eye-off' : 'eye'} onPress={() => setShowPw((v) => !v)} />
              }
            />
            <HelperText type="error" visible={!!pwErrors.newPassword}>
              {tMessage(pwErrors.newPassword)}
            </HelperText>
            <TextInput
              label={t('signIn.confirmPassword')}
              mode="outlined"
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              secureTextEntry={!showPw}
              value={pw.confirm}
              onChangeText={(v) => setPw((s) => ({ ...s, confirm: v }))}
              error={!!pwErrors.confirmPassword}
            />
            <HelperText type="error" visible={!!pwErrors.confirmPassword}>
              {tMessage(pwErrors.confirmPassword)}
            </HelperText>
            <Button
              mode="contained"
              style={{ marginTop: 4, alignSelf: 'flex-start' }}
              disabled={pwSubmitting}
              loading={pwSubmitting}
              onPress={onChangePassword}
            >
              {t('signIn.updatePassword')}
            </Button>
          </Card.Content>
        </Card>

        {/* Danger zone */}
        <Card style={{ marginTop: 16 }}>
          <Card.Content>
            <Text variant="titleMedium">{t('signIn.dangerZone')}</Text>
          </Card.Content>
          <Divider />
          <List.Item
            title={t('signIn.deleteAccount')}
            titleStyle={{ color: theme.colors.error }}
            description={t('signIn.deleteAccountDescription')}
            left={(p) => <List.Icon {...p} icon="account-remove-outline" color={theme.colors.error} />}
            onPress={() => setConfirmDelete(true)}
          />
        </Card>
      </ScrollView>

      <Portal>
        <Dialog visible={confirmDelete} onDismiss={() => !deleteAccount.isPending && setConfirmDelete(false)}>
          <Dialog.Title>{t('signIn.deleteTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{t('signIn.deleteBody')}</Text>
            <Text variant="bodyMedium" style={{ marginTop: 12 }}>
              {t('signIn.deleteConfirmPrompt', { word: 'DELETE' })}
            </Text>
            <TextInput
              mode="outlined"
              autoCapitalize="characters"
              autoCorrect={false}
              value={confirmText}
              onChangeText={setConfirmText}
              style={{ marginTop: 8 }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button disabled={deleteAccount.isPending} onPress={() => setConfirmDelete(false)}>
              {t('signIn.keepAccount')}
            </Button>
            <Button
              textColor={theme.colors.error}
              disabled={confirmText.trim() !== 'DELETE' || deleteAccount.isPending}
              loading={deleteAccount.isPending}
              onPress={onDeleteAccount}
            >
              {t('signIn.deleteAccount')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={!!feedback} onDismiss={() => setFeedback(null)} duration={2500}>
        {feedback ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
});

export default withScreenErrorBoundary(SettingsAccountScreen);
