import { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Dialog,
  Icon,
  Modal,
  Portal,
  SegmentedButtons,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import {
  ClientPhotoRow,
  useMyPhotos,
  useSignedPhotoUrl,
} from '@/lib/clientPhotos';
import { useDeleteMyPhoto } from '@/lib/photoConsent';
import { groupPhotoPairs, type PhotoItem } from '@/lib/photoPairs';
import { useFormat } from '@/lib/format';

// Client-facing gallery: the mirror photos taken of the signed-in user across
// all the businesses they've visited. Read access is granted by migration 0026.
function MyPhotosScreen() {
  const theme = useTheme();
  const { t } = useTranslation(['photos', 'common']);
  const { data: photos, isLoading, error } = useMyPhotos();
  // 0254: photos the shop tagged as a before/after pair show as one tile.
  const items = useMemo(() => groupPhotoPairs(photos ?? []), [photos]);
  const [viewerItem, setViewerItem] = useState<PhotoItem<ClientPhotoRow> | null>(null);
  const [side, setSide] = useState<'before' | 'after'>('after');
  // The photo on screen: the single one, or the shown half of a pair.
  const viewer: ClientPhotoRow | null = !viewerItem
    ? null
    : viewerItem.kind === 'single'
      ? viewerItem.photo
      : side === 'before'
        ? viewerItem.before
        : viewerItem.after;
  const openItem = (item: PhotoItem<ClientPhotoRow>) => {
    setSide('after');
    setViewerItem(item);
  };
  // 0172: the subject may delete any photo of themselves.
  const deletePhoto = useDeleteMyPhoto();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const onDelete = async () => {
    if (!viewer) return;
    try {
      await deletePhoto.mutateAsync({ photoId: viewer.id, storagePath: viewer.storage_path });
      setConfirmDelete(false);
      setViewerItem(null);
      setFeedback(t('myPhotos.deleted'));
    } catch (err: any) {
      setConfirmDelete(false);
      setFeedback(err?.message ?? t('myPhotos.deleteFailed'));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('myPhotos.title')} />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
            {error.message}
          </Text>
        </View>
      ) : !photos || photos.length === 0 ? (
        <View style={styles.center}>
          <Icon source="image-multiple-outline" size={40} color={theme.colors.onSurfaceVariant} />
          <Text variant="titleMedium" style={{ marginTop: 8 }}>
            {t('myPhotos.emptyTitle')}
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, textAlign: 'center' }}
          >
            {t('myPhotos.emptyBody')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.key}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => (
            <PhotoThumb
              photo={item.kind === 'single' ? item.photo : item.after}
              paired={item.kind === 'pair'}
              onPress={() => openItem(item)}
            />
          )}
        />
      )}

      <Portal>
        <Modal
          visible={!!viewer}
          onDismiss={() => setViewerItem(null)}
          contentContainerStyle={[styles.viewer, { backgroundColor: theme.colors.surface }]}
        >
          {viewerItem?.kind === 'pair' ? (
            <SegmentedButtons
              value={side}
              onValueChange={(v) => setSide(v as 'before' | 'after')}
              density="small"
              style={{ marginBottom: 12 }}
              buttons={[
                { value: 'before', label: t('myPhotosPairs.before') },
                { value: 'after', label: t('myPhotosPairs.after') },
              ]}
            />
          ) : null}
          {viewer && <PhotoFull photo={viewer} />}
          {viewer && (
            <Button
              mode="text"
              icon="delete-outline"
              textColor={theme.colors.error}
              onPress={() => setConfirmDelete(true)}
              style={{ alignSelf: 'flex-start', marginTop: 8 }}
            >
              {viewerItem?.kind === 'pair' ? t('myPhotosPairs.deleteShown') : t('myPhotos.deletePhoto')}
            </Button>
          )}
        </Modal>

        <Dialog visible={confirmDelete} onDismiss={() => setConfirmDelete(false)}>
          <Dialog.Title>{t('myPhotos.deleteDialog.title')}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {t('myPhotos.deleteDialog.body')}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDelete(false)} disabled={deletePhoto.isPending}>
              {t('myPhotos.deleteDialog.keep')}
            </Button>
            <Button onPress={onDelete} loading={deletePhoto.isPending} disabled={deletePhoto.isPending} textColor={theme.colors.error}>
              {t('common:actions.delete')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={!!feedback} onDismiss={() => setFeedback(null)} duration={3500}>
        {feedback ?? ''}
      </Snackbar>
    </View>
  );
}

function PhotoThumb({
  photo,
  paired,
  onPress,
}: {
  photo: ClientPhotoRow;
  paired: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation('photos');
  const { data: url, isLoading } = useSignedPhotoUrl(photo.storage_path);
  return (
    <Pressable style={styles.thumbWrap} onPress={onPress}>
      <View style={[styles.thumb, { backgroundColor: theme.colors.surfaceVariant }]}>
        {url ? (
          <Image source={{ uri: url }} style={styles.thumbImg} resizeMode="cover" />
        ) : isLoading ? (
          <ActivityIndicator size="small" />
        ) : (
          <Icon source="image-off-outline" size={22} color={theme.colors.onSurfaceVariant} />
        )}
        {paired ? (
          <View style={[styles.pairBadge, { backgroundColor: theme.colors.primary }]}>
            <Text variant="labelSmall" style={{ color: theme.colors.onPrimary }}>
              {t('myPhotosPairs.pairBadge')}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function PhotoFull({ photo }: { photo: ClientPhotoRow }) {
  const theme = useTheme();
  const { t } = useTranslation('photos');
  const f = useFormat();
  const { data: url } = useSignedPhotoUrl(photo.storage_path);
  return (
    <View>
      <View style={styles.viewerImageWrap}>
        {url ? (
          <Image source={{ uri: url }} style={styles.viewerImage} resizeMode="contain" />
        ) : (
          <ActivityIndicator />
        )}
      </View>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
        {f.date(photo.taken_at, 'weekdayDateYearTime')}
        {photo.width && photo.height ? `  ·  ${photo.width}×${photo.height}` : ''}
        {photo.consent_version
          ? `  ·  ${t('myPhotos.takenWithConsent', { version: photo.consent_version })}`
          : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  grid: { padding: 12 },
  gridRow: { gap: 12 },
  thumbWrap: { flex: 1, marginBottom: 12 },
  thumb: {
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImg: { width: '100%', height: '100%' },
  pairBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  viewer: { margin: 16, borderRadius: 20, padding: 16 },
  viewerImageWrap: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
});

export default withScreenErrorBoundary(MyPhotosScreen);
