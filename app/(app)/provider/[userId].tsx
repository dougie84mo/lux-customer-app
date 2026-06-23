import { ScrollView, StyleSheet, View } from 'react-native';
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
import { router, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { Stars } from '@/components/Stars';
import { avatarUrl, initialsOf } from '@/lib/avatars';
import { useBarberProfile } from '@/lib/barberProfile';
import { useMemberRating, useMemberReviews } from '@/lib/reviews';

function ProviderProfileScreen() {
  const theme = useTheme();
  const { userId, businessId, name } = useLocalSearchParams<{
    userId: string;
    businessId: string;
    name?: string;
  }>();
  const { data: profile, isLoading } = useBarberProfile(businessId, userId);
  const { data: rating } = useMemberRating(businessId, userId);
  const { data: reviews } = useMemberReviews(businessId, userId);

  const displayName = profile?.name ?? name ?? 'Barber';
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
        <ScrollView contentContainerStyle={styles.scroll}>
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
                No reviews yet
              </Text>
            )}

            {profile?.years_experience != null ? (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>
                {profile.years_experience} {profile.years_experience === 1 ? 'year' : 'years'} of
                experience
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

          {/* Reviews */}
          {(reviews ?? []).length > 0 ? (
            <>
              <View style={styles.sectionHead}>
                <Icon source="star-outline" size={18} color={theme.colors.primary} />
                <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                  Reviews
                </Text>
              </View>
              {(reviews ?? []).map((r) => (
                <View key={r.id} style={styles.review}>
                  <View style={styles.reviewHead}>
                    <Text variant="bodyMedium" style={{ fontWeight: '600', flex: 1 }}>
                      {r.reviewer_name}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {format(new Date(r.created_at), 'MMM d, yyyy')}
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
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32 },
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
