import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  Card,
  Dialog,
  Divider,
  List,
  Portal,
  Snackbar,
  Switch,
  Text,
  useTheme,
} from 'react-native-paper';
import { router } from 'expo-router';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import {
  useDeleteMyPhotosAtBusiness,
  useGrantPhotoConsent,
  useMyPhotoConsents,
  useRevokePhotoConsent,
} from '@/lib/photoConsent';

// Settings › Mirror photos — per-salon photo consent (0167). The server
// refuses a capture without a current consent; this is the client's switch.
// Split out of the settings hub 2026-09-13 to match the business app's layout.
function SettingsPhotosScreen() {
  const theme = useTheme();
  const [feedback, setFeedback] = useState<string | null>(null);

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

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Mirror photos" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Card>
          <Card.Content>
            <Text variant="titleMedium">Salons</Text>
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

        <Card style={{ marginTop: 16 }}>
          <List.Item
            title="My photos"
            description="See the mirror photos shared with you"
            left={(p) => <List.Icon {...p} icon="image-multiple-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/my-photos')}
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

export default withScreenErrorBoundary(SettingsPhotosScreen);
