import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Avatar,
  Button,
  Card,
  Divider,
  HelperText,
  List,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { supabase } from '@/lib/supabase';
import { avatarUrl, initialsOf, useUploadAvatar } from '@/lib/avatars';
import { useAuth } from '@/lib/auth';
import { useMyProfile, useUpdateMyProfile } from '@/lib/clientProfile';
import { changePasswordSchema } from '@/lib/schemas';

type PasswordField = 'newPassword' | 'confirmPassword';

function AccountScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id;
  const { data: profile, isLoading } = useMyProfile(userId);
  const updateProfile = useUpdateMyProfile();
  const uploadAvatar = useUploadAvatar();

  const [name, setName] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const onChangePhoto = async () => {
    if (!userId) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const f = res.assets[0];
      await uploadAvatar.mutateAsync({
        userId,
        fileUri: f.uri,
        ext: (f.name.split('.').pop() || 'jpg').toLowerCase(),
      });
      setFeedback('Photo updated');
    } catch (err: any) {
      setFeedback(err?.message ?? 'Could not update photo');
    }
  };

  // Password change (signed-in user). Kept as plain state to match this
  // screen's lightweight form style; validated with the shared Zod schema.
  // NOTE: current-password verification is temporarily disabled (see
  // changePasswordSchema). Restore the `current` field + reauth to re-enable.
  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState<Partial<Record<PasswordField, string>>>({});
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (profile?.name) setName(profile.name);
  }, [profile?.name]);

  const dirty = name.trim().length > 0 && name.trim() !== (profile?.name ?? '');

  const onSave = async () => {
    if (!userId) return;
    try {
      await updateProfile.mutateAsync({ userId, name });
      setFeedback('Saved');
    } catch (err: any) {
      setFeedback(err?.message ?? 'Could not save');
    }
  };

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
        <Appbar.Content title="Account" />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Card>
            <Card.Content>
              <Text variant="titleMedium" style={{ marginBottom: 12 }}>
                Profile
              </Text>
              <View style={styles.photoRow}>
                {avatarUrl(profile?.avatar_path) ? (
                  <Avatar.Image size={64} source={{ uri: avatarUrl(profile?.avatar_path)! }} />
                ) : (
                  <Avatar.Text size={64} label={initialsOf(profile?.name)} />
                )}
                <Button
                  mode="outlined"
                  icon="camera"
                  compact
                  loading={uploadAvatar.isPending}
                  disabled={uploadAvatar.isPending}
                  onPress={onChangePhoto}
                >
                  {profile?.avatar_path ? 'Change photo' : 'Add photo'}
                </Button>
              </View>
              <TextInput
                label="Name"
                mode="outlined"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
              <TextInput
                label="Email"
                mode="outlined"
                value={profile?.email ?? ''}
                editable={false}
                style={{ marginTop: 8 }}
              />
              <Button
                mode="contained"
                style={{ marginTop: 12, alignSelf: 'flex-start' }}
                disabled={!dirty || updateProfile.isPending}
                loading={updateProfile.isPending}
                onPress={onSave}
              >
                Save
              </Button>
            </Card.Content>
          </Card>

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
                  <TextInput.Icon
                    icon={showPw ? 'eye-off' : 'eye'}
                    onPress={() => setShowPw((v) => !v)}
                  />
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

          <Button
            mode="outlined"
            icon="logout"
            textColor={theme.colors.error}
            style={styles.signOut}
            onPress={() => supabase.auth.signOut()}
          >
            Sign out
          </Button>
        </ScrollView>
      )}

      <Snackbar visible={!!feedback} onDismiss={() => setFeedback(null)} duration={2500}>
        {feedback ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12 },
  signOut: { marginTop: 24, borderColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});

export default withScreenErrorBoundary(AccountScreen);
