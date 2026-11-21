import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Avatar,
  Chip,
  Divider,
  Icon,
  Text,
  useTheme,
} from 'react-native-paper';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { PortfolioViewer } from '@/components/PortfolioViewer';
import { Stars } from '@/components/Stars';
import { avatarUrl, initialsOf } from '@/lib/avatars';
import { useBarberProfile } from '@/lib/barberProfile';
import { portfolioImageUrl, useProviderPortfolio } from '@/lib/portfolio';
import { useMemberRating, useMemberReviews } from '@/lib/reviews';
import { useFormat } from '@/lib/format';

function ProviderProfileScreen() {
  const theme = useTheme();
  const { t } = useTranslation('discover');
  const f = useFormat();
  const { userId, businessId, name } = useLocalSearchParams<{
    userId: string;
    businessId: string;
    name?: string;
  }>();
  const { data: profile, isLoading } = useBarberProfile(businessId, userId);
  const { data: rating } = useMemberRating(businessId, userId);
  const { data: reviews } = useMemberReviews(businessId, userId);
  // 0246: the barber's own published work. A failed or empty read just leaves
  // the section out — the profile never depends on it.
  const portfolioQuery = useProviderPortfolio(businessId, userId);
  const portfolio = portfolioQuery.data ?? [];
  const refetchPortfolio = portfolioQuery.refetch;
  // Hidden tab routes stay mounted: re-read on every visit so a photo added
  // or withdrawn since shows straight away.
  useFocusEffect(
    useCallback(() => {
      void refetchPortfolio();
    }, [refetchPortfolio]),
  );
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  // Three square tiles across the padded scroll area.
  const tileSize = Math.floor((windowWidth - SCROLL_PADDING * 2 - GRID_GAP * 2) / 3);

  const displayName = profile?.name ?? name ?? t('provider.titleFallback');
  const avg = rating?.avg_rating ?? null;
  const count = rating?.review_count ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={displayName} />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            {avatarUrl(profile?.avatar_path) ? (
              <Avatar.Image size={88} source={{ uri: avatarUrl(profile?.avatar_path)! }} />
            ) : (
              <Avatar.Text size={88} label={initialsOf(displayName)} />
            )}
            <Text variant="headlineSmall" style={styles.name}>
              {displayName}
            </Text>

            {/* Rating summary */}
            {count > 0 && avg != null ? (
              <View style={styles.ratingRow}>
                <Stars value={avg} size={18} />
                <Text variant="bodyMedium" style={{ marginLeft: 8, fontWeight: '600' }}>
                  {avg.toFixed(1)}
                </Text>
                <Text variant="bodySmall" style={{ marginLeft: 4, color: theme.colors.onSurfaceVariant }}>
                  ({count})
                </Text>
              </View>
            ) : (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>
                {t('reviews.noReviews')}
              </Text>
            )}

            {profile?.years_experience != null ? (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>
                {t('provider.experience', { count: profile.years_experience })}
              </Text>
            ) : null}
          </View>

          {profile?.bio ? (
            <Text variant="bodyMedium" style={styles.bio}>
              {profile.bio}
            </Text>
          ) : null}

          {profile?.specialties && profile.specialties.length > 0 ? (
            <View style={styles.chipWrap}>
              {profile.specialties.map((s) => (
                <Chip key={s} compact icon="content-cut">
                  {s}
                </Chip>
              ))}
            </View>
          ) : null}

          {/* Portfolio */}
          {portfolio.length > 0 ? (
            <>
              <View style={styles.sectionHead}>
                <Icon source="image-multiple-outline" size={18} color={theme.colors.primary} />
                <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                  {t('portfolio.title')}
                </Text>
              </View>
              <View style={styles.grid}>
                {portfolio.map((p, i) => (
                  <Pressable
                    key={p.id}
                    onPress={() => setViewerIndex(i)}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={t('portfolio.openPhoto', {
                      index: i + 1,
                      total: portfolio.length,
                    })}
                    style={[
                      styles.tile,
                      { width: tileSize, height: tileSize, backgroundColor: theme.colors.surfaceVariant },
                    ]}
                  >
                    <Image
                      source={{ uri: portfolioImageUrl(p.storage_path)! }}
                      style={styles.tileImg}
                      resizeMode="cover"
                    />
                    {p.before_path ? (
                      <View style={[styles.pairBadge, { backgroundColor: theme.colors.backdrop }]}>
                        <Icon source="compare" size={14} color={theme.colors.onPrimary} />
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {/* Reviews */}
          {(reviews ?? []).length > 0 ? (
            <>
              <View style={styles.sectionHead}>
                <Icon source="star-outline" size={18} color={theme.colors.primary} />
                <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                  {t('reviews.title')}
                </Text>
              </View>
              {(reviews ?? []).map((r) => (
                <View key={r.id} style={styles.review}>
                  <View style={styles.reviewHead}>
                    <Text variant="bodyMedium" style={{ fontWeight: '600', flex: 1 }}>
                      {r.reviewer_name}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {f.date(new Date(r.created_at), 'date')}
                    </Text>
                  </View>
                  <Stars value={r.rating} size={14} />
                  {r.body ? (
                    <Text variant="bodySmall" style={{ marginTop: 4 }}>
                      {r.body}
                    </Text>
                  ) : null}
                  <Divider style={{ marginTop: 12 }} />
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      )}

      <PortfolioViewer photos={portfolio} index={viewerIndex} onClose={() => setViewerIndex(null)} />
    </View>
  );
}

const SCROLL_PADDING = 16;
const GRID_GAP = 6;

const styles = StyleSheet.create({
  scroll: { padding: SCROLL_PADDING, paddingBottom: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, marginTop: 4 },
  tile: { borderRadius: 8, overflow: 'hidden' },
  tileImg: { width: '100%', height: '100%' },
  pairBadge: { position: 'absolute', top: 6, right: 6, borderRadius: 10, padding: 3 },
  header: { alignItems: 'center', paddingVertical: 8 },
  name: { fontWeight: '700', marginTop: 12, textAlign: 'center' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  bio: { marginTop: 20 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 28, marginBottom: 8 },
  review: { marginTop: 12 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});

export default withScreenErrorBoundary(ProviderProfileScreen);
