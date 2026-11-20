import { useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { IconButton, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { PortfolioImage, portfolioImageUrl } from '@/lib/portfolio';

type Side = 'before' | 'after';

// One full-screen page. A before/after pair opens on the finished cut and
// carries its own Before/After toggle, so flipping one photo never changes
// what the next one shows.
function ViewerPage({ photo, width, height }: { photo: PortfolioImage; width: number; height: number }) {
  const theme = useTheme();
  const { t } = useTranslation('discover');
  const [side, setSide] = useState<Side>('after');
  const isPair = !!photo.before_path;
  const uri = portfolioImageUrl(side === 'before' && isPair ? photo.before_path : photo.storage_path);
  const label = photo.service_name ?? photo.caption ?? t('portfolio.photo');

  return (
    <View style={{ width, height }}>
      <View style={styles.imageWrap}>
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel={
              isPair ? `${label} (${t(side === 'before' ? 'portfolio.before' : 'portfolio.after')})` : label
            }
          />
        ) : null}
      </View>
      <View style={styles.meta}>
        {isPair ? (
          <SegmentedButtons
            value={side}
            onValueChange={(v) => setSide(v as Side)}
            density="small"
            style={styles.toggle}
            buttons={[
              { value: 'before', label: t('portfolio.before') },
              { value: 'after', label: t('portfolio.after') },
            ]}
          />
        ) : null}
        {photo.service_name ? (
          <Text variant="labelLarge" style={{ color: theme.colors.primary }}>
            {photo.service_name}
          </Text>
        ) : null}
        {photo.caption ? (
          <Text variant="bodyMedium" style={styles.caption}>
            {photo.caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ViewerBody({
  photos,
  startIndex,
  onClose,
}: {
  photos: PortfolioImage[];
  startIndex: number;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation('discover');
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(startIndex);
  // A horizontal list does not stretch its pages to its own height, so the
  // page area is measured and handed to each page.
  const [pageHeight, setPageHeight] = useState(0);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(Math.min(Math.max(next, 0), photos.length - 1));
  };

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.colors.background, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.bar}>
        <IconButton icon="close" onPress={onClose} accessibilityLabel={t('portfolio.close')} />
        <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
          {t('portfolio.counter', { index: index + 1, total: photos.length })}
        </Text>
        {/* Balances the close button so the counter sits centred. */}
        <View style={styles.barSpacer} />
      </View>
      <View style={styles.pages} onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}>
        {pageHeight > 0 ? (
          <FlatList
            // A new width (rotation) re-lays the pages out from the current photo.
            key={width}
            data={photos}
            keyExtractor={(p) => p.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={onScrollEnd}
            initialNumToRender={1}
            windowSize={3}
            renderItem={({ item }) => <ViewerPage photo={item} width={width} height={pageHeight} />}
          />
        ) : null}
      </View>
    </View>
  );
}

// Full-screen, swipeable portfolio viewer. `index` is the photo to open on, or
// null when closed — the body mounts fresh each time so it starts on that photo.
export function PortfolioViewer({
  photos,
  index,
  onClose,
}: {
  photos: PortfolioImage[];
  index: number | null;
  onClose: () => void;
}) {
  const open = index != null && index >= 0 && index < photos.length;
  return (
    <Modal visible={open} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {open ? <ViewerBody photos={photos} startIndex={index} onClose={onClose} /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barSpacer: { width: 48 },
  pages: { flex: 1 },
  imageWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  meta: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, minHeight: 72 },
  toggle: { alignSelf: 'center', marginBottom: 12 },
  caption: { marginTop: 4 },
});
