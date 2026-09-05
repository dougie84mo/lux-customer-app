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
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { router } from 'expo-router';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { changePasswordSchema } from '@/lib/schemas';
import { usePushEnabled } from '@/lib/preferences';
import { registerForPushNotifications, unregisterPushNotifications } from '@/lib/push';
import { getIdentities, linkGoogle, unlinkGoogle } from '@/lib/googleAuth';
import { unlinkApple } from '@/lib/appleAuth';
import { useDeleteAccount } from '@/lib/account';
import {
  useDeleteMyPhotosAtBusiness,
  useGrantPhotoConsent,
  useMyPhotoConsents,
  useRevokePhotoConsent,
} from '@/lib/photoConsent';

type PasswordField = 'newPassword' | 'confirmPassword';

function SettingsScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id;
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
      setFeedback(err?.message ?? 'Could not delete account');
    }
  };

  // Mirror photo consent, per shop (0167). The server refuses a capture
  // without a current consent; this is the client's switch.
  const { data: photoConsents } = useMyPhotoConsents();
  const grantConsent = useGrantPhotoConsent();
  const revokeConsent = useRevokePhotoConsent();
  const deletePhotosAt = useDeleteMyPhotosAtBusiness();
  const [consentBusy, setConsentBusy] = useState<string | null>(null);
  const [deletePhotosFor, setDeletePhotosFor] = useState<{ businessId: string; name: string } | null>(null);

  const onTogglePhotoConsent = async (customerId: string, next: boolean) => {
    setConsentBusy(customerId);
    try {
      if (next) await grantConsent.mutateAsync({ customerId });
      else await revokeConsent.mutateAsync({ customerId });
      setFeedback(next ? 'Mirror photos allowed at this salon.' : 'Mirror photos withdrawn at this salon.');
    } catch (err: any) {
      setFeedback(err?.message ?? 'Could not update mirror photo consent');
    } finally {
      setConsentBusy(null);
    }
  };

  const onDeletePhotosAt = async () => {
    if (!deletePhotosFor) return;
    try {
      const n = await deletePhotosAt.mutateAsync({ businessId: deletePhotosFor.businessId });
      setFeedback(n === 0 ? 'No photos to delete.' : `Deleted ${n} photo${n === 1 ? '' : 's'}.`);
    } catch (err: any) {
      setFeedback(err?.message ?? 'Could not delete photos');
    } finally {
      setDeletePhotosFor(null);
    }
  };

  // Preferences
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
        await unlinkGoogle();
        setFeedback('Google disconnected');
      } else {
        const linked = await linkGoogle();
        if (linked) setFeedback('Google connected');
      }
      await refreshIdentities();
    } catch (err: any) {
      setFeedback(err?.message ?? 'Could not update Google connection');
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
        setFeedback('Add another sign-in method before disconnecting Apple.');
        return;
      }
      await unlinkApple();
      setFeedback('Apple disconnected');
      await refreshIdentities();
    } catch (err: any) {
      setFeedback(err?.message ?? 'Could not disconnect Apple');
    } finally {
      setAppleBusy(false);
    }
  };

  // Password change (moved from the Account screen). Kept as plain state to
  // match this screen's lightweight form style; validated with the shared Zod
  // schema. Current-password verification stays disabled (see changePasswordSchema).
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
      setFeedback('Password updated');
    } catch (err: any) {
      setFeedback(err?.message ?? 'Could not update password');
    } finally {
      setPwSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Settings" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Preferences */}
        <Card>
          <Card.Content>
            <Text variant="titleMedium">Preferences</Text>
          </Card.Content>
          <Divider />
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

        {/* Mirror photos — one switch per salon that can take them (0167) */}
        <Card style={{ marginTop: 16 }}>
          <Card.Content>
            <Text variant="titleMedium">Mirror photos</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
              A salon can only photograph you on its LUX mirror while this is on for that salon.
              Withdrawing stops future photos; delete existing ones separately.
            </Text>
          </Card.Content>
          <Divider />
          {(photoConsents ?? []).length === 0 ? (
            <List.Item
              title="No salons yet"
              description="Shops that take mirror photos appear here after you book with them."
              left={(p) => <List.Icon {...p} icon="camera-account" />}
            />
          ) : (
            (photoConsents ?? []).map((c) => (
              <View key={c.business_id}>
                <List.Item
                  title={c.business_name}
                  description={
                    c.is_current
                      ? 'Photos allowed'
                      : c.consent_id
                        ? 'Photo terms changed — allow again to continue'
                        : 'Photos not allowed'
                  }
                  left={(p) => <List.Icon {...p} icon="camera-account" />}
                  right={() => (
                    <Switch
                      value={c.is_current}
                      onValueChange={(next) => onTogglePhotoConsent(c.customer_id, next)}
                      disabled={consentBusy === c.customer_id}
                    />
                  )}
                />
                <Button
                  compact
                  mode="text"
                  textColor={theme.colors.error}
                  onPress={() => setDeletePhotosFor({ businessId: c.business_id, name: c.business_name })}
                  style={{ alignSelf: 'flex-start', marginLeft: 8, marginBottom: 4 }}
                >
                  Delete my photos at this salon
                </Button>
              </View>
            ))
          )}
        </Card>

        {/* Connected accounts */}
        <Card style={{ marginTop: 16 }}>
          <Card.Content>
            <Text variant="titleMedium">Connected accounts</Text>
          </Card.Content>
          <Divider />
          <List.Item
            title="Google"
            description={
              googleLinked == null ? 'Checking…' : googleLinked ? 'Connected' : 'Not connected'
            }
            left={(p) => <List.Icon {...p} icon="google" />}
            right={() => (
              <Button
                compact
                onPress={onToggleGoogle}
                loading={linkBusy}
                disabled={linkBusy || googleLinked == null}
              >
                {googleLinked ? 'Disconnect' : 'Connect'}
              </Button>
            )}
          />
          <List.Item
            title="Apple"
            description={
              appleLinked == null
                ? 'Checking…'
                : appleLinked
                  ? 'Connected'
                  : 'Sign in with Apple on the login screen to connect'
            }
            left={(p) => <List.Icon {...p} icon="apple" />}
            right={() =>
              appleLinked ? (
                <Button compact onPress={onDisconnectApple} loading={appleBusy} disabled={appleBusy}>
                  Disconnect
                </Button>
              ) : null
            }
          />
        </Card>

        {/* Password */}
        <Card style={{ marginTop: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 12 }}>
              Password
            </Text>
            <TextInput
              label="New password"
              mode="outlined"
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              secureTextEntry={!showPw}
              value={pw.next}
              onChangeText={(t) => setPw((s) => ({ ...s, next: t }))}
              error={!!pwErrors.newPassword}
              right={
                <TextInput.Icon icon={showPw ? 'eye-off' : 'eye'} onPress={() => setShowPw((v) => !v)} />
              }
            />
            <HelperText type="error" visible={!!pwErrors.newPassword}>
              {pwErrors.newPassword}
            </HelperText>
            <TextInput
              label="Confirm new password"
              mode="outlined"
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              secureTextEntry={!showPw}
              value={pw.confirm}
              onChangeText={(t) => setPw((s) => ({ ...s, confirm: t }))}
              error={!!pwErrors.confirmPassword}
            />
            <HelperText type="error" visible={!!pwErrors.confirmPassword}>
              {pwErrors.confirmPassword}
            </HelperText>
            <Button
              mode="contained"
              style={{ marginTop: 4, alignSelf: 'flex-start' }}
              disabled={pwSubmitting}
              loading={pwSubmitting}
              onPress={onChangePassword}
            >
              Update password
            </Button>
          </Card.Content>
        </Card>

        {/* Legal */}
        <Card style={{ marginTop: 16 }}>
          <Card.Content>
            <Text variant="titleMedium">Legal</Text>
          </Card.Content>
          <Divider />
          <List.Item
            title="Privacy Policy"
            left={(p) => <List.Icon {...p} icon="shield-account-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/legal/privacy')}
          />
          <List.Item
            title="Terms of Service"
            left={(p) => <List.Icon {...p} icon="file-document-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/legal/terms')}
          />
        </Card>

        {/* Danger zone */}
        <Card style={{ marginTop: 16 }}>
          <Card.Content>
            <Text variant="titleMedium">Danger zone</Text>
          </Card.Content>
          <Divider />
          <List.Item
            title="Delete account"
            titleStyle={{ color: theme.colors.error }}
            description="Permanently erase your account and sign-in methods"
            left={(p) => <List.Icon {...p} icon="account-remove-outline" color={theme.colors.error} />}
            onPress={() => setConfirmDelete(true)}
          />
        </Card>
      </ScrollView>

      <Portal>
        <Dialog visible={!!deletePhotosFor} onDismiss={() => !deletePhotosAt.isPending && setDeletePhotosFor(null)}>
          <Dialog.Title>Delete your photos at {deletePhotosFor?.name ?? 'this salon'}?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              Every mirror photo of you at this salon is removed from your photos and from the
              salon&apos;s record. This can&apos;t be undone. Your consent setting is not changed.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeletePhotosFor(null)} disabled={deletePhotosAt.isPending}>
              Keep
            </Button>
            <Button
              onPress={onDeletePhotosAt}
              loading={deletePhotosAt.isPending}
              disabled={deletePhotosAt.isPending}
              textColor={theme.colors.error}
            >
              Delete photos
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={confirmDelete} onDismiss={() => !deleteAccount.isPending && setConfirmDelete(false)}>
          <Dialog.Title>Delete your account?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              This permanently removes your name, email, phone, photo, saved payment methods, and
              every way to sign in. It cannot be undone. Your bookings stay in the salon&apos;s own
              records without your identity.
            </Text>
            <Text variant="bodyMedium" style={{ marginTop: 12 }}>
              Type DELETE to confirm.
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
              Keep account
            </Button>
            <Button
              textColor={theme.colors.error}
              disabled={confirmText.trim() !== 'DELETE' || deleteAccount.isPending}
              loading={deleteAccount.isPending}
              onPress={onDeleteAccount}
            >
              Delete account
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

export default withScreenErrorBoundary(SettingsScreen);
