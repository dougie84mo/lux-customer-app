import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Avatar,
  Button,
  Card,
  Chip,
  Divider,
  Icon,
  SegmentedButtons,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { FavoriteButton } from '@/components/FavoriteButton';
import { PunchCard } from '@/components/PunchCard';
import { Stars } from '@/components/Stars';
import { avatarUrl, initialsOf } from '@/lib/avatars';
import { BookingPolicy, BookingService, useBusinessBookingInfo } from '@/lib/booking';
import { BookableProvider, useBookableProviders } from '@/lib/schedules';
import { BusinessReview, useBusinessReviews, useMemberRating } from '@/lib/reviews';
import { useLoyaltyProgram, useMyLoyalty } from '@/lib/loyalty';

type Tab = 'profile' | 'reviews' | 'deals';

// One tappable barber row with an inline rating summary (own hook per row so the
// rating loads independently). Opens the full barber profile.
function BarberRow({ businessId, provider }: { businessId: string; provider: BookableProvider }) {
  const theme = useTheme();
  const { data: rating } = useMemberRating(businessId, provider.id);
  const avg = rating?.avg_rating ?? null;
  const count = rating?.review_count ?? 0;
  const uri = avatarUrl(provider.avatar_path);
  return (
    <TouchableRipple
      onPress={() =>
        router.push({
          pathname: '/(app)/provider/[userId]',
          params: { userId: provider.id, businessId, name: provider.name },
        })
      }
    >
      <View style={styles.barberRow}>
        {uri ? (
          <Avatar.Image size={44} source={{ uri }} />
        ) : (
          <Avatar.Text size={44} label={initialsOf(provider.name)} />
        )}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text variant="bodyLarge" style={{ fontWeight: '600' }}>
            {provider.name}
          </Text>
          {count > 0 && avg != null ? (
            <View style={styles.barberRating}>
              <Stars value={avg} size={13} />
              <Text variant="bodySmall" style={{ marginLeft: 6, color: theme.colors.onSurfaceVariant }}>
                {avg.toFixed(1)} ({count})
              </Text>
            </View>
          ) : (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
              No reviews yet
            </Text>
          )}
        </View>
        <Icon source="chevron-right" size={22} color={theme.colors.onSurfaceVariant} />
      </View>
    </TouchableRipple>
  );
}

// A single review entry. In the location-wide list we also show which barber it
// was for (showMember); when filtered to one member that's redundant.
function ReviewCard({ review, showMember }: { review: BusinessReview; showMember: boolean }) {
  const theme = useTheme();
  return (
    <Card style={styles.section} mode="outlined">
      <Card.Content>
        <View style={styles.reviewHead}>
          <Stars value={review.rating} size={14} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {format(new Date(review.created_at), 'MMM d, yyyy')}
          </Text>
        </View>
        {showMember ? (
          <Text variant="labelSmall" style={{ color: theme.colors.primary, marginTop: 4 }}>
            {review.member_name}
          </Text>
        ) : null}
        {review.body ? (
          <Text variant="bodyMedium" style={{ marginTop: 6 }}>
            {review.body}
          </Text>
        ) : null}
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>
          — {review.reviewer_name}
        </Text>
      </Card.Content>
    </Card>
  );
}

// Whether a policy has anything worth showing the client.
function hasPolicy(p: BookingPolicy): boolean {
  return (
    !!p.cancellation_window_hours ||
    p.no_show_fee > 0 ||
    p.late_cancel_fee > 0 ||
    !!p.cancellation_policy
  );
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// Business profile — the customer taps a business on Book and lands here first.
// The identity header + service menu stay OUTSIDE the tab system so a client who
// just wants to book goes straight from a service into the booking flow. The
// secondary info (Profile = locations/contact/team/policy, Reviews, Deals) lives
// behind a simple tab nav below the service menu.
function BusinessProfileScreen() {
  const theme = useTheme();
  const { businessId, name, type, logo_url, description } = useLocalSearchParams<{
    businessId: string;
    name?: string;
    type?: string;
    logo_url?: string;
    description?: string;
  }>();
  const { data: info, isLoading, error } = useBusinessBookingInfo(businessId);
  const providers = useBookableProviders(businessId).data ?? [];
  const { data: loyalty } = useLoyaltyProgram(businessId);
  const { data: myLoyalty } = useMyLoyalty(businessId);

  const [tab, setTab] = useState<Tab>('profile');
  // null = location-wide ("All"); otherwise filter reviews to one team member.
  const [reviewMember, setReviewMember] = useState<string | null>(null);
  const { reviews, isLoading: reviewsLoading } = useBusinessReviews(
    businessId,
    providers.map((p) => ({ id: p.id, name: p.name })),
  );
  const shownReviews = reviewMember
    ? reviews.filter((r) => r.member_id === reviewMember)
    : reviews;

  const locations = info?.locations ?? [];
  const hasDeals = !!loyalty?.is_active;

  // Loyalty progress (display-only; redemption ships with payments).
  const loyaltyToNext =
    myLoyalty && myLoyalty.reward_every > 0
      ? myLoyalty.completed_visits % myLoyalty.reward_every
      : 0;
  const loyaltyAvailable =
    myLoyalty && myLoyalty.reward_every > 0
      ? Math.floor(myLoyalty.completed_visits / myLoyalty.reward_every) - myLoyalty.rewards_redeemed
      : 0;

  // Group the service menu by category for a scannable, "menu"-style layout.
  // Services with no category fall under "Other".
  const grouped = useMemo(() => {
    const map = new Map<string, BookingService[]>();
    for (const s of info?.services ?? []) {
      const key = s.category?.trim() || 'Other';
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [info?.services]);

  const goBook = (serviceId?: string) =>
    router.push({
      pathname: '/(app)/book/[businessId]',
      params: { businessId, ...(name ? { name } : {}), ...(serviceId ? { serviceId } : {}) },
    });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={name ?? 'Business'} />
        <FavoriteButton
          business={{
            id: businessId,
            name: name ?? '',
            type: type ?? '',
            logo_url: logo_url ?? null,
            description: description ?? null,
          }}
        />
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
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Header (identity — always visible) */}
          <View style={styles.header}>
            {logo_url ? (
              <Avatar.Image size={72} source={{ uri: logo_url }} />
            ) : (
              <Avatar.Text size={72} label={(name ?? '?').slice(0, 2).toUpperCase()} />
            )}
            <Text variant="headlineSmall" style={styles.bizName}>
              {name}
            </Text>
            {type ? (
              <Chip compact icon="storefront-outline" style={styles.typeChip}>
                {titleCase(type)}
              </Chip>
            ) : null}
            {description ? (
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }}
              >
                {description}
              </Text>
            ) : null}
          </View>

          <Button mode="contained" icon="calendar-plus" style={styles.cta} onPress={() => goBook()}>
            Book an appointment
          </Button>

          {/* Service menu (OUTSIDE the tabs — the primary booking path) */}
          <View style={styles.sectionHead}>
            <Icon source="format-list-bulleted" size={18} color={theme.colors.primary} />
            <Text variant="titleMedium" style={{ fontWeight: '700' }}>
              Services
            </Text>
          </View>

          {grouped.length === 0 ? (
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
              No services listed yet.
            </Text>
          ) : (
            grouped.map(([category, items]) => (
              <Card key={category} style={styles.section} mode="outlined">
                <Card.Content style={{ paddingHorizontal: 0, paddingVertical: 4 }}>
                  <Text variant="labelLarge" style={styles.categoryLabel}>
                    {category}
                  </Text>
                  <Divider />
                  {items.map((s, i) => (
                    <View key={s.id}>
                      {i > 0 ? <Divider style={{ opacity: 0.4 }} /> : null}
                      <TouchableRipple onPress={() => goBook(s.id)}>
                        <View style={styles.serviceRow}>
                          <View style={{ flex: 1, paddingRight: 12 }}>
                            <Text variant="bodyLarge" style={{ fontWeight: '600' }}>
                              {s.name}
                            </Text>
                            {s.description ? (
                              <Text
                                variant="bodySmall"
                                numberOfLines={2}
                                style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
                              >
                                {s.description}
                              </Text>
                            ) : null}
                            <Text
                              variant="labelMedium"
                              style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
                            >
                              {s.duration} min
                            </Text>
                          </View>
                          <View style={styles.priceCol}>
                            <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                              ${s.price.toFixed(0)}
                            </Text>
                            <Icon source="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
                          </View>
                        </View>
                      </TouchableRipple>
                    </View>
                  ))}
                </Card.Content>
              </Card>
            ))
          )}

          {/* ---------------------------------------------------------- TABS */}
          <Divider style={{ marginTop: 24 }} />
          <View style={styles.tabBar}>
            <SegmentedButtons
              value={tab}
              onValueChange={(v) => setTab(v as Tab)}
              density="small"
              buttons={[
                { value: 'profile', label: 'Profile', icon: 'storefront-outline' },
                { value: 'reviews', label: 'Reviews', icon: 'star-outline' },
                ...(hasDeals
                  ? [{ value: 'deals', label: 'Deals', icon: 'tag-outline' }]
                  : []),
              ]}
            />
          </View>

          {/* -------------------------------------------------- PROFILE TAB */}
          {tab === 'profile' ? (
            <>
              {/* Locations + contact info */}
              {locations.length > 0 ? (
                <Card style={styles.section} mode="outlined">
                  <Card.Content>
                    <View style={styles.sectionHeadInline}>
                      <Icon source="map-marker-outline" size={18} color={theme.colors.primary} />
                      <Text variant="titleSmall">
                        {locations.length > 1 ? `${locations.length} locations` : 'Location'}
                      </Text>
                    </View>
                    {locations.map((l, i) => {
                      const address = [l.street, l.city, [l.state, l.zip].filter(Boolean).join(' ')]
                        .map((s) => s?.trim())
                        .filter(Boolean)
                        .join(', ');
                      return (
                        <View key={l.id} style={{ marginTop: i === 0 ? 6 : 12 }}>
                          <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                            {l.name}
                          </Text>
                          {address ? (
                            <View style={styles.contactLine}>
                              <Icon source="map-marker" size={14} color={theme.colors.onSurfaceVariant} />
                              <Text
                                variant="bodySmall"
                                style={[styles.contactText, { color: theme.colors.onSurfaceVariant }]}
                              >
                                {address}
                              </Text>
                            </View>
                          ) : null}
                          {l.phone_number ? (
                            <View style={styles.contactLine}>
                              <Icon source="phone" size={14} color={theme.colors.onSurfaceVariant} />
                              <Text
                                variant="bodySmall"
                                style={[styles.contactText, { color: theme.colors.onSurfaceVariant }]}
                              >
                                {l.phone_number}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </Card.Content>
                </Card>
              ) : (
                <Text variant="bodyMedium" style={[styles.tabEmpty, { color: theme.colors.onSurfaceVariant }]}>
                  No location details yet.
                </Text>
              )}

              {/* Team — meet the providers (tap for profile + reviews) */}
              {providers.length > 0 ? (
                <>
                  <View style={styles.sectionHead}>
                    <Icon source="account-group-outline" size={18} color={theme.colors.primary} />
                    <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                      Team
                    </Text>
                  </View>
                  <Card style={{ marginTop: 8 }} mode="outlined">
                    <Card.Content style={{ paddingHorizontal: 0, paddingVertical: 4 }}>
                      {providers.map((p, i) => (
                        <View key={p.id}>
                          {i > 0 ? <Divider style={{ opacity: 0.4 }} /> : null}
                          <BarberRow businessId={businessId} provider={p} />
                        </View>
                      ))}
                    </Card.Content>
                  </Card>
                </>
              ) : null}

              {/* Cancellation policy */}
              {info?.policy && hasPolicy(info.policy) ? (
                <Card style={styles.section} mode="outlined">
                  <Card.Content>
                    <View style={styles.sectionHeadInline}>
                      <Icon source="information-outline" size={16} color={theme.colors.primary} />
                      <Text variant="labelLarge">Cancellation policy</Text>
                    </View>
                    {info.policy.cancellation_window_hours ? (
                      <Text variant="bodySmall" style={styles.policyLine}>
                        Cancel or reschedule at least {info.policy.cancellation_window_hours} hours
                        before your appointment.
                      </Text>
                    ) : null}
                    {info.policy.no_show_fee > 0 ? (
                      <Text variant="bodySmall" style={styles.policyLine}>
                        No-show fee: ${info.policy.no_show_fee.toFixed(0)}
                      </Text>
                    ) : null}
                    {info.policy.late_cancel_fee > 0 ? (
                      <Text variant="bodySmall" style={styles.policyLine}>
                        Late-cancellation fee: ${info.policy.late_cancel_fee.toFixed(0)}
                      </Text>
                    ) : null}
                    {info.policy.cancellation_policy ? (
                      <Text variant="bodySmall" style={styles.policyLine}>
                        {info.policy.cancellation_policy}
                      </Text>
                    ) : null}
                  </Card.Content>
                </Card>
              ) : null}
            </>
          ) : null}

          {/* -------------------------------------------------- REVIEWS TAB */}
          {tab === 'reviews' ? (
            <>
              {/* Filter: location-wide ("All") or by team member */}
              {providers.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.reviewFilter}
                >
                  <Chip
                    selected={reviewMember === null}
                    showSelectedOverlay
                    onPress={() => setReviewMember(null)}
                    style={styles.filterChip}
                  >
                    All
                  </Chip>
                  {providers.map((p) => (
                    <Chip
                      key={p.id}
                      selected={reviewMember === p.id}
                      showSelectedOverlay
                      onPress={() => setReviewMember(p.id)}
                      style={styles.filterChip}
                    >
                      {p.name}
                    </Chip>
                  ))}
                </ScrollView>
              ) : null}

              {reviewsLoading ? (
                <View style={{ paddingVertical: 24 }}>
                  <ActivityIndicator />
                </View>
              ) : shownReviews.length === 0 ? (
                <Text variant="bodyMedium" style={[styles.tabEmpty, { color: theme.colors.onSurfaceVariant }]}>
                  {reviewMember ? 'No reviews for this team member yet.' : 'No reviews yet.'}
                </Text>
              ) : (
                shownReviews.map((r) => (
                  <ReviewCard key={r.id} review={r} showMember={reviewMember === null} />
                ))
              )}
            </>
          ) : null}

          {/* ---------------------------------------------------- DEALS TAB */}
          {tab === 'deals' && loyalty?.is_active ? (
            <Card style={styles.section} mode="contained">
              <Card.Content>
                <View style={styles.sectionHeadInline}>
                  <Icon source="gift-outline" size={18} color={theme.colors.primary} />
                  <Text variant="titleSmall" style={{ fontWeight: '700' }}>
                    Loyalty rewards
                  </Text>
                </View>
                <Text variant="bodyMedium" style={{ marginTop: 6 }}>
                  Earn {loyalty.reward_percent}% off every {loyalty.reward_every} visits.
                </Text>
                {loyalty.description ? (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                    {loyalty.description}
                  </Text>
                ) : null}
                {myLoyalty ? (
                  <View style={{ marginTop: 12 }}>
                    <PunchCard
                      filled={loyaltyToNext}
                      total={myLoyalty.reward_every}
                      label={`${loyaltyToNext} of ${myLoyalty.reward_every} to your next reward`}
                    />
                    {loyaltyAvailable > 0 ? (
                      <Text variant="bodyMedium" style={{ fontWeight: '700', marginTop: 8 }}>
                        🎁 {loyaltyAvailable} reward{loyaltyAvailable > 1 ? 's' : ''} ready
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {/* Quick link straight into picking a date & time. */}
                <Button
                  mode="contained-tonal"
                  icon="calendar-plus"
                  style={{ marginTop: 14 }}
                  onPress={() => goBook()}
                >
                  Book a visit
                </Button>
              </Card.Content>
            </Card>
          ) : null}

          <Button mode="contained" icon="calendar-plus" style={styles.ctaBottom} onPress={() => goBook()}>
            Book an appointment
          </Button>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32 },
  header: { alignItems: 'center', paddingVertical: 8 },
  bizName: { fontWeight: '700', marginTop: 12, textAlign: 'center' },
  typeChip: { marginTop: 8 },
  cta: { marginTop: 20 },
  ctaBottom: { marginTop: 24 },
  section: { marginTop: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24 },
  sectionHeadInline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tabBar: { marginTop: 16 },
  tabEmpty: { marginTop: 16 },
  categoryLabel: { paddingHorizontal: 16, paddingVertical: 8 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  barberRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  barberRating: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  priceCol: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  policyLine: { marginTop: 4 },
  contactLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  contactText: { flex: 1 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewFilter: { gap: 8, paddingVertical: 12, paddingRight: 8 },
  filterChip: { marginRight: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});

export default withScreenErrorBoundary(BusinessProfileScreen);
