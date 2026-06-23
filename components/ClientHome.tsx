import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Button, Card, Chip, Icon, Surface, Text, TouchableRipple, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { useAuth } from '@/lib/auth';
import { useMyBookingRequests } from '@/lib/booking';
import { NotificationBell } from '@/components/NotificationBell';

// Client home — the landing screen of the customer app. Booking-first: a clear
// CTA to find a business, quick links, a peek at upcoming bookings, and one-tap
// rebooking of places you've been.
export function ClientHome() {
  const theme = useTheme();
  const { session } = useAuth();
  const { data: requests } = useMyBookingRequests();

  const firstName =
    (session?.user.user_metadata?.name as string | undefined)?.split(' ')[0] ?? 'there';

  const all = requests ?? [];
  const upcoming = all
    .filter((r) => r.status === 'CONFIRMED' || r.status === 'PENDING')
    .slice(0, 3);

  // Distinct businesses the client has booked before — for one-tap rebooking.
  const recent = (() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const r of all) {
      if (seen.has(r.business_id)) continue;
      seen.add(r.business_id);
      out.push({ id: r.business_id, name: r.business_name });
      if (out.length >= 6) break;
    }
    return out;
  })();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <NotificationBell />
        <Appbar.Content title="LUX Booking" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="headlineSmall" style={{ fontWeight: '700' }}>
          Hi {firstName}
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
          Book your next appointment at a LUX salon.
        </Text>

        <Button
          mode="contained"
          icon="storefront-outline"
          style={{ marginTop: 20 }}
          onPress={() => router.push('/(app)/discover')}
        >
          Find a business to book
        </Button>

        {/* Quick links */}
        <View style={styles.quickRow}>
          <QuickAction
            icon="calendar-check"
            label="My bookings"
            onPress={() => router.push('/(app)/my-bookings')}
          />
          <QuickAction
            icon="account-circle-outline"
            label="Account"
            onPress={() => router.push('/(app)/account')}
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text variant="titleMedium" style={{ fontWeight: '700' }}>
            Upcoming
          </Text>
          <Text
            variant="labelLarge"
            style={{ color: theme.colors.primary }}
            onPress={() => router.push('/(app)/my-bookings')}
          >
            See all
          </Text>
        </View>

        {upcoming.length === 0 ? (
          <Card>
            <Card.Content>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                No upcoming bookings yet. Tap “Find a business” to request your first appointment.
              </Text>
            </Card.Content>
          </Card>
        ) : (
          <View style={{ gap: 8 }}>
            {upcoming.map((r) => {
              const when = r.confirmed_start ?? r.requested_start;
              return (
                <Card key={r.id} onPress={() => router.push('/(app)/my-bookings')}>
                  <Card.Content>
                    <View style={styles.rowBetween}>
                      <Text variant="titleSmall" style={{ fontWeight: '600', flex: 1 }}>
                        {r.business_name}
                      </Text>
                      <Text
                        variant="labelMedium"
                        style={{
                          color: r.status === 'CONFIRMED' ? '#2e7d32' : theme.colors.onSurfaceVariant,
                        }}
                      >
                        {r.status === 'CONFIRMED' ? 'Confirmed' : 'Requested'}
                      </Text>
                    </View>
                    <Text variant="bodySmall" style={{ marginTop: 2 }}>
                      {r.service_name ?? 'Appointment'} · {format(new Date(when), 'EEE MMM d, h:mm a')}
                    </Text>
                  </Card.Content>
                </Card>
              );
            })}
          </View>
        )}

        {/* Book again — places you've been before */}
        {recent.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                Book again
              </Text>
            </View>
            <View style={styles.chipWrap}>
              {recent.map((b) => (
                <Chip
                  key={b.id}
                  icon="repeat"
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/book/[businessId]',
                      params: { businessId: b.id, name: b.name },
                    })
                  }
                >
                  {b.name}
                </Chip>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Surface style={styles.quickCard} elevation={1}>
      <TouchableRipple onPress={onPress} style={styles.quickRipple} borderless>
        <View style={styles.quickInner}>
          <Icon source={icon} size={24} color={theme.colors.primary} />
          <Text variant="labelLarge" style={{ marginTop: 6 }}>
            {label}
          </Text>
        </View>
      </TouchableRipple>
    </Surface>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  quickRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  quickCard: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  quickRipple: { borderRadius: 12 },
  quickInner: { alignItems: 'center', paddingVertical: 18 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 12,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
