import { useMemo } from 'react';
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
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { BookingPolicy, BookingService, useBusinessBookingInfo } from '@/lib/booking';

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

// Business profile — the customer taps a business on Book and lands here first:
// a general profile (logo/name/type/description), its locations, and a dynamic
// service menu grouped by category. Header fields (logo/type/description) are
// passed as route params from the discovery list; locations/services/policy are
// fetched fresh. Tapping a service, or the primary CTA, continues into the
// booking flow (book/[businessId]).
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

  const locations = info?.locations ?? [];

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
          {/* Header */}
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

          {/* Locations */}
          {locations.length > 0 ? (
            <Card style={styles.section} mode="outlined">
              <Card.Content>
                <View style={styles.sectionHead}>
                  <Icon source="map-marker-outline" size={18} color={theme.colors.primary} />
                  <Text variant="titleSmall">
                    {locations.length > 1 ? `${locations.length} locations` : 'Location'}
                  </Text>
                </View>
                {locations.map((l, i) => (
                  <Text
                    key={l.id}
                    variant="bodyMedium"
                    style={{ marginTop: i === 0 ? 4 : 2, color: theme.colors.onSurfaceVariant }}
                  >
                    {l.name}
                  </Text>
                ))}
              </Card.Content>
            </Card>
          ) : null}

          {/* Service menu, grouped by category */}
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

          {/* Policy */}
          {info?.policy && hasPolicy(info.policy) ? (
            <Card style={styles.section} mode="outlined">
              <Card.Content>
                <View style={styles.sectionHead}>
                  <Icon source="information-outline" size={16} color={theme.colors.primary} />
                  <Text variant="labelLarge">Cancellation policy</Text>
                </View>
                {info.policy.cancellation_window_hours ? (
                  <Text variant="bodySmall" style={styles.policyLine}>
                    Cancel or reschedule at least {info.policy.cancellation_window_hours} hours before
                    your appointment.
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
  categoryLabel: { paddingHorizontal: 16, paddingVertical: 8 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  priceCol: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  policyLine: { marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});

export default withScreenErrorBoundary(BusinessProfileScreen);
