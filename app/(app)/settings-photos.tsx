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
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['photos', 'common']);
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
      setFeedback(next ? t('settingsPhotos.allowedFeedback') : t('settingsPhotos.withdrawnFeedback'));
    } catch (err: any) {
      setFeedback(err?.message ?? t('settingsPhotos.consentUpdateFailed'));
    } finally {
      setConsentBusy(null);
    }
  };

  const onDeletePhotosAt = async () => {
    if (!deletePhotosFor) return;
    try {
      const n = await deletePhotosAt.mutateAsync({ businessId: deletePhotosFor.businessId });
      setFeedback(n === 0 ? t('settingsPhotos.noPhotosToDelete') : t('settingsPhotos.deleted', { count: n }));
    } catch (err: any) {
      setFeedback(err?.message ?? t('settingsPhotos.deleteFailed'));
    } finally {
      setDeletePhotosFor(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('settingsPhotos.title')} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Card>
          <Card.Content>
            <Text variant="titleMedium">{t('settingsPhotos.salons')}</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
              {t('settingsPhotos.intro')}
            </Text>
          </Card.Content>
          <Divider />
          {(photoConsents ?? []).length === 0 ? (
            <List.Item
              title={t('settingsPhotos.noSalons')}
              description={t('settingsPhotos.noSalonsDescription')}
              left={(p) => <List.Icon {...p} icon="camera-account" />}
            />
          ) : (
            (photoConsents ?? []).map((c) => (
              <View key={c.business_id}>
                <List.Item
                  title={c.business_name}
                  description={
                    c.is_current
                      ? t('settingsPhotos.allowed')
                      : c.consent_id
                        ? t('settingsPhotos.termsChanged')
                        : t('settingsPhotos.notAllowed')
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
                  {t('settingsPhotos.deleteAtSalon')}
                </Button>
              </View>
            ))
          )}
        </Card>

        <Card style={{ marginTop: 16 }}>
          <List.Item
            title={t('settingsPhotos.myPhotos')}
            description={t('settingsPhotos.myPhotosDescription')}
            left={(p) => <List.Icon {...p} icon="image-multiple-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/my-photos')}
          />
        </Card>
      </ScrollView>

      <Portal>
        <Dialog visible={!!deletePhotosFor} onDismiss={() => !deletePhotosAt.isPending && setDeletePhotosFor(null)}>
          <Dialog.Title>
            {t('settingsPhotos.deleteDialog.title', {
              shop: deletePhotosFor?.name ?? t('settingsPhotos.deleteDialog.thisSalon'),
            })}
          </Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {t('settingsPhotos.deleteDialog.body')}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeletePhotosFor(null)} disabled={deletePhotosAt.isPending}>
              {t('settingsPhotos.deleteDialog.keep')}
            </Button>
            <Button
              onPress={onDeletePhotosAt}
              loading={deletePhotosAt.isPending}
              disabled={deletePhotosAt.isPending}
              textColor={theme.colors.error}
            >
              {t('settingsPhotos.deleteDialog.confirm')}
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
