import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Button, Icon, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { ProductCard, ProductRecommendation, ProductSheet } from '@/components/ProductCard';
import { useManualRefresh } from '@/hooks/use-manual-refresh';
import { useMyShopProducts } from '@/lib/products';
import { groupProductsByShop, recommendedProducts, recommenderName, ShopProduct } from '@/lib/productsLogic';
import { tMessage } from '@/lib/i18n';

const recommendationOf = (p: ShopProduct): ProductRecommendation | null =>
  p.recommended ? { by: recommenderName(p), note: p.recommended_note?.trim() || null } : null;

// Shop tab (0247) — products from the shops this client has saved or visited.
// Browse-only: there is no cart and no buy button; a product is bought in the
// shop, added to the visit's checkout by the barber. "Recommended for you"
// (what a barber picked for this client) comes first, then every shop's shelf.
function ShopScreen() {
  const theme = useTheme();
  const { t } = useTranslation(['discover', 'common']);
  const { data, isLoading, error, refetch } = useMyShopProducts();
  const { refreshing, onRefresh } = useManualRefresh(refetch);
  const [open, setOpen] = useState<ShopProduct | null>(null);

  const recommended = useMemo(() => recommendedProducts(data), [data]);
  const groups = useMemo(() => groupProductsByShop(data), [data]);

  const goShop = (p: Pick<ShopProduct, 'business_id' | 'business_name'>) =>
    router.push({
      pathname: '/(app)/business/[businessId]',
      params: { businessId: p.business_id, name: p.business_name },
    });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.Content title={t('shop.title')} />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {error ? (
            <View style={styles.center}>
              <Text variant="bodyMedium" style={{ color: theme.colors.error, textAlign: 'center' }}>
                {tMessage(error.message) ?? t('common:errors.loadFailed')}
              </Text>
            </View>
          ) : groups.length === 0 ? (
            <View style={styles.center}>
              <Icon source="shopping-outline" size={48} color={theme.colors.onSurfaceVariant} />
              <Text variant="titleMedium" style={styles.emptyTitle}>
                {t('shop.emptyTitle')}
              </Text>
              <Text variant="bodyMedium" style={[styles.emptyBody, { color: theme.colors.onSurfaceVariant }]}>
                {t('shop.emptyBody')}
              </Text>
              <Button
                mode="contained"
                icon="storefront-outline"
                style={styles.emptyButton}
                onPress={() => router.navigate('/(app)/discover')}
              >
                {t('shop.findShops')}
              </Button>
            </View>
          ) : (
            <>
              <View style={[styles.banner, { backgroundColor: theme.colors.surfaceVariant }]}>
                <Icon source="storefront-outline" size={18} color={theme.colors.onSurfaceVariant} />
                <Text variant="bodySmall" style={[styles.bannerText, { color: theme.colors.onSurfaceVariant }]}>
                  {t('shop.inStoreNotice')}
                </Text>
              </View>

              {recommended.length > 0 ? (
                <>
                  <View style={styles.sectionHead}>
                    <Icon source="star-circle-outline" size={18} color={theme.colors.primary} />
                    <Text variant="titleMedium" style={styles.sectionTitle}>
                      {t('shop.recommendedTitle')}
                    </Text>
                  </View>
                  {recommended.map((p) => (
                    <View key={`rec-${p.id}`} style={styles.item}>
                      <ProductCard product={p} recommendation={recommendationOf(p)} onPress={() => setOpen(p)} />
                      <Text variant="labelSmall" style={[styles.recShop, { color: theme.colors.onSurfaceVariant }]}>
                        {p.business_name}
                      </Text>
                    </View>
                  ))}
                </>
              ) : null}

              {groups.map((g) => (
                <View key={g.businessId}>
                  <View style={styles.sectionHead}>
                    <Icon source="storefront-outline" size={18} color={theme.colors.primary} />
                    <Text variant="titleMedium" style={styles.sectionTitle} numberOfLines={1}>
                      {g.businessName}
                    </Text>
                    <Button
                      compact
                      onPress={() => goShop({ business_id: g.businessId, business_name: g.businessName })}
                    >
                      {t('shop.viewShop')}
                    </Button>
                  </View>
                  {g.products.map((p) => (
                    <View key={p.id} style={styles.item}>
                      <ProductCard product={p} onPress={() => setOpen(p)} />
                    </View>
                  ))}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}

      <ProductSheet
        product={open}
        shopName={open?.business_name}
        recommendation={open ? recommendationOf(open) : null}
        action={
          open
            ? {
                label: t('shop.bookAt', { shop: open.business_name }),
                onPress: () => {
                  const target = open;
                  setOpen(null);
                  goShop(target);
                },
              }
            : null
        }
        onDismiss={() => setOpen(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32, flexGrow: 1 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 12 },
  bannerText: { flex: 1 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, minHeight: 40 },
  sectionTitle: { flex: 1, fontWeight: '700' },
  item: { marginTop: 8 },
  recShop: { marginTop: 4, marginLeft: 4 },
  emptyTitle: { fontWeight: '700', marginTop: 12, textAlign: 'center' },
  emptyBody: { marginTop: 6, textAlign: 'center' },
  emptyButton: { marginTop: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});

export default withScreenErrorBoundary(ShopScreen);
