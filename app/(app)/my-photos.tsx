import { useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Icon,
  Modal,
  Portal,
  Text,
  useTheme,
} from 'react-native-paper';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import {
  ClientPhotoRow,
  useMyPhotos,
  useSignedPhotoUrl,
} from '@/lib/clientPhotos';

// Client-facing gallery: the mirror photos taken of the signed-in user across
// all the businesses they've visited. Read access is granted by migration 0026.
function MyPhotosScreen() {
  const theme = useTheme();
  const { data: photos, isLoading, error } = useMyPhotos();
  const [viewer, setViewer] = useState<ClientPhotoRow | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="My photos" />
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
            No photos yet
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, textAlign: 'center' }}
          >
            When a salon captures a look on the mirror during your visit, it shows up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(p) => p.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => (
            <PhotoThumb photo={item} onPress={() => setViewer(item)} />
          )}
        />
      )}

      <Portal>
        <Modal
          visible={!!viewer}
          onDismiss={() => setViewer(null)}
          contentContainerStyle={[styles.viewer, { backgroundColor: theme.colors.surface }]}
        >
          {viewer && <PhotoFull photo={viewer} />}
        </Modal>
      </Portal>
    </View>
  );
}

function PhotoThumb({ photo, onPress }: { photo: ClientPhotoRow; onPress: () => void }) {
  const theme = useTheme();
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
      </View>
    </Pressable>
  );
}

function PhotoFull({ photo }: { photo: ClientPhotoRow }) {
  const theme = useTheme();
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
        {format(new Date(photo.taken_at), 'EEE MMM d, yyyy · h:mm a')}
        {photo.width && photo.height ? `  ·  ${photo.width}×${photo.height}` : ''}
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
  viewer: { margin: 16, borderRadius: 20, padding: 16 },
  viewerImageWrap: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
});

export default withScreenErrorBoundary(MyPhotosScreen);
