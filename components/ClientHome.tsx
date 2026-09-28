import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Button, Card, Icon, Surface, Text, TouchableRipple, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { useMyBookingRequests } from '@/lib/booking';
import { NotificationBell } from '@/components/NotificationBell';
import { useFormat } from '@/lib/format';

// Client home — the landing screen of the customer app. Booking-first: a clear
// CTA to find a business, quick links, a peek at upcoming bookings, and one-tap
// rebooking of places you've been.
export function ClientHome() {
  const theme = useTheme();
  const { t } = useTranslation(['discover', 'common']);
  const f = useFormat();
  const { session } = useAuth();
  const { data: requests } = useMyBookingRequests();

  const firstName = (session?.user.user_metadata?.name as string | undefined)?.split(' ')[0];

  const all = requests ?? [];
  const upcoming = all
    .filter((r) => r.status === 'CONFIRMED' || r.status === 'PENDING')
    .slice(0, 3);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.Content title={t('home.title')} />
        <NotificationBell />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="headlineSmall" style={{ fontWeight: '700' }}>
          {firstName ? t('home.greeting', { name: firstName }) : t('home.greetingNoName')}
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
          {t('home.subtitle')}
        </Text>

        <Button
          mode="contained"
          icon="storefront-outline"
          style={{ marginTop: 20 }}
          onPress={() => router.push('/(app)/discover')}
        >
          {t('home.findBusiness')}
        </Button>

        {/* Quick links */}
        <View style={styles.quickRow}>
          <QuickAction
            icon="calendar-check"
            label={t('home.myBookings')}
            onPress={() => router.push('/(app)/my-bookings')}
          />
          <QuickAction
            icon="account-circle-outline"
            label={t('common:tabs.account')}
            onPress={() => router.push('/(app)/account')}
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text variant="titleMedium" style={{ fontWeight: '700' }}>
            {t('home.upcoming')}
          </Text>
          <Text
            variant="labelLarge"
            style={{ color: theme.colors.primary }}
            onPress={() => router.push('/(app)/my-bookings')}
          >
            {t('home.seeAll')}
          </Text>
        </View>

        {upcoming.length === 0 ? (
          <Card>
            <Card.Content>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {t('home.emptyUpcoming')}
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
                        {r.status === 'CONFIRMED' ? t('home.confirmed') : t('home.requested')}
                      </Text>
                    </View>
                    <Text variant="bodySmall" style={{ marginTop: 2 }}>
                      {t('home.bookingLine', {
                        service: r.service_name ?? t('home.appointmentFallback'),
                        when: f.date(new Date(when), 'weekdayDateTime'),
                      })}
                    </Text>
                  </Card.Content>
                </Card>
              );
            })}
          </View>
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
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
