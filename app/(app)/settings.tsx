import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  Card,
  Divider,
  HelperText,
  List,
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

type PasswordField = 'newPassword' | 'confirmPassword';

function SettingsScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [feedback, setFeedback] = useState<string | null>(null);

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
      </ScrollView>

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
