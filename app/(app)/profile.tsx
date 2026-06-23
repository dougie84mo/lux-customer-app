import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Avatar,
  Button,
  Card,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { avatarUrl, initialsOf, useUploadAvatar } from '@/lib/avatars';
import { useAuth } from '@/lib/auth';
import { useMyProfile, useUpdateMyProfile } from '@/lib/clientProfile';

// Profile — the client's identity + contact info. Moved here from the Account
// screen, which is now a hub of links.
function ProfileScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id;
  const { data: profile, isLoading } = useMyProfile(userId);
  const updateProfile = useUpdateMyProfile();
  const uploadAvatar = useUploadAvatar();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '');
      setPhone(profile.phone ?? '');
    }
  }, [profile]);

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

  const nameDirty = name.trim() !== (profile?.name ?? '');
  const phoneDirty = phone.trim() !== (profile?.phone ?? '');
  const dirty = nameDirty || phoneDirty;

  const onSave = async () => {
    if (!userId) return;
    if (name.trim().length === 0) {
      setFeedback('Name cannot be empty');
      return;
    }
    try {
      await updateProfile.mutateAsync({ userId, name, phone });
      setFeedback('Saved');
    } catch (err: any) {
      setFeedback(err?.message ?? 'Could not save');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Profile" />
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
            </Card.Content>
          </Card>

          <Card style={{ marginTop: 16 }}>
            <Card.Content>
              <Text variant="titleMedium" style={{ marginBottom: 12 }}>
                Contact information
              </Text>
              <TextInput
                label="Email"
                mode="outlined"
                value={profile?.email ?? ''}
                editable={false}
              />
              <TextInput
                label="Phone"
                mode="outlined"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="Optional"
                style={{ marginTop: 8 }}
              />
            </Card.Content>
          </Card>

          <Button
            mode="contained"
            style={{ marginTop: 16 }}
            disabled={!dirty || updateProfile.isPending}
            loading={updateProfile.isPending}
            onPress={onSave}
          >
            Save
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});

export default withScreenErrorBoundary(ProfileScreen);
