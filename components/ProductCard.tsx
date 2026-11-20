import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Icon, Modal, Portal, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { productImageUrl } from '@/lib/products';
import { BusinessProduct, productPriceDollars } from '@/lib/productsLogic';
import { useFormat } from '@/lib/format';

// Retail (0247) is browse-only: nothing here sells. A card shows the product
// and says where it is bought; the sheet adds the description and, from the
// Shop tab, a way to the shop's page.

// The recommendation attached to a product on the Shop tab. `by` is the
// barber's first name, or null when there is no name to show.
export type ProductRecommendation = { by: string | null; note: string | null };

function ProductPhoto({ path, size, radius }: { path: string | null; size: number; radius: number }) {
  const theme = useTheme();
  const uri = productImageUrl(path);
  return (
    <View
      style={[
        styles.photoWrap,
        { width: size, height: size, borderRadius: radius, backgroundColor: theme.colors.surfaceVariant },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
      ) : (
        <Icon source="shopping-outline" size={size * 0.4} color={theme.colors.onSurfaceVariant} />
      )}
    </View>
  );
}

function OutOfStockChip() {
  const { t } = useTranslation('discover');
  return (
    <Chip compact icon="close-circle-outline" style={styles.stockChip} textStyle={styles.stockChipText}>
      {t('shop.outOfStock')}
    </Chip>
  );
}

function RecommendationLine({ recommendation }: { recommendation: ProductRecommendation }) {
  const theme = useTheme();
  const { t } = useTranslation('discover');
  return (
    <View style={styles.recBlock}>
      <View style={styles.recHead}>
        <Icon source="star-circle-outline" size={16} color={theme.colors.primary} />
        <Text variant="labelMedium" style={[styles.recText, { color: theme.colors.primary }]}>
          {recommendation.by ? t('shop.recommendedBy', { name: recommendation.by }) : t('shop.recommended')}
        </Text>
      </View>
      {recommendation.note ? (
        <Text variant="bodySmall" style={[styles.recNote, { color: theme.colors.onSurface }]}>
          {recommendation.note}
        </Text>
      ) : null}
    </View>
  );
}

// One product in a list: photo, name, price, stock badge, where to buy it.
export function ProductCard({
  product,
  recommendation,
  onPress,
}: {
  product: BusinessProduct;
  recommendation?: ProductRecommendation | null;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation('discover');
  const f = useFormat();
  const price = f.price(productPriceDollars(product));
  return (
    <Card
      mode="outlined"
      onPress={onPress}
      accessibilityLabel={t('shop.openProduct', { name: product.name, price })}
    >
      <Card.Content style={styles.cardRow}>
        <ProductPhoto path={product.image_path} size={76} radius={10} />
        <View style={styles.cardBody}>
          <View style={styles.titleRow}>
            <Text variant="titleSmall" style={styles.name} numberOfLines={2}>
              {product.name}
            </Text>
            <Text variant="titleSmall" style={styles.price}>
              {price}
            </Text>
          </View>
          {!product.in_stock ? <OutOfStockChip /> : null}
          {recommendation ? <RecommendationLine recommendation={recommendation} /> : null}
          <View style={styles.inStoreRow}>
            <Icon source="storefront-outline" size={14} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodySmall" style={[styles.inStoreText, { color: theme.colors.onSurfaceVariant }]}>
              {t('shop.inStoreShort')}
            </Text>
          </View>
        </View>
      </Card.Content>
    </Card>
  );
}

// Product detail. `action` is the optional primary button ("Book at <shop>" on
// the Shop tab); the business page omits it — the client is already there.
export function ProductSheet({
  product,
  shopName,
  recommendation,
  action,
  onDismiss,
}: {
  // null = closed.
  product: BusinessProduct | null;
  shopName?: string | null;
  recommendation?: ProductRecommendation | null;
  action?: { label: string; onPress: () => void } | null;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation(['discover', 'common']);
  const f = useFormat();
  return (
    <Portal>
      <Modal
        visible={!!product}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}
      >
        {product ? (
          <>
            <ScrollView contentContainerStyle={styles.sheetBody}>
              <View style={styles.sheetPhoto}>
                <ProductPhoto path={product.image_path} size={200} radius={16} />
              </View>
              <Text variant="titleLarge" style={styles.sheetName}>
                {product.name}
              </Text>
              {shopName ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                  {shopName}
                </Text>
              ) : null}
              <Text variant="titleMedium" style={styles.sheetPrice}>
                {f.price(productPriceDollars(product))}
              </Text>
              {!product.in_stock ? <OutOfStockChip /> : null}
              {recommendation ? <RecommendationLine recommendation={recommendation} /> : null}
              {product.description ? (
                <Text variant="bodyMedium" style={styles.sheetDescription}>
                  {product.description}
                </Text>
              ) : null}
              <View style={[styles.notice, { backgroundColor: theme.colors.surfaceVariant }]}>
                <Icon source="storefront-outline" size={18} color={theme.colors.onSurfaceVariant} />
                <Text variant="bodySmall" style={[styles.noticeText, { color: theme.colors.onSurfaceVariant }]}>
                  {t('shop.inStoreNotice')}
                </Text>
              </View>
            </ScrollView>
            <View style={styles.sheetActions}>
              <Button onPress={onDismiss}>{t('common:actions.close')}</Button>
              {action ? (
                <Button mode="contained" icon="calendar-plus" onPress={action.onPress} style={styles.sheetAction}>
                  {action.label}
                </Button>
              ) : null}
            </View>
          </>
        ) : null}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  photoWrap: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', height: '100%' },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cardBody: { flex: 1, marginLeft: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { flex: 1, fontWeight: '600' },
  price: { fontWeight: '700' },
  stockChip: { alignSelf: 'flex-start', marginTop: 6 },
  stockChipText: { fontSize: 11, marginVertical: 2 },
  recBlock: { marginTop: 6 },
  recHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  recText: { flex: 1, fontWeight: '600' },
  recNote: { marginTop: 2, fontStyle: 'italic' },
  inStoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  inStoreText: { flex: 1 },
  sheet: { margin: 16, borderRadius: 20, padding: 20, maxHeight: '85%' },
  sheetBody: { paddingBottom: 4 },
  sheetPhoto: { alignItems: 'center', marginBottom: 16 },
  sheetName: { fontWeight: '700' },
  sheetPrice: { fontWeight: '700', marginTop: 8 },
  sheetDescription: { marginTop: 12 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 12, marginTop: 16 },
  noticeText: { flex: 1 },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  sheetAction: { flexShrink: 1 },
});
