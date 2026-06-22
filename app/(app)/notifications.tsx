import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Icon,
  Text,
  useTheme,
} from 'react-native-paper';
import { useCallback } from 'react';
import { router, useFocusEffect, type Href } from 'expo-router';
import { formatDistanceToNow } from 'date-fns';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useManualRefresh } from '@/hooks/use-manual-refresh';
import { useAuth } from '@/lib/auth';
import {
  NotificationRow,
  useMarkNotificationsRead,
  useNotifications,
} from '@/lib/notifications';
import { useRealtimeNotifications } from '@/lib/realtime';
import { clearDeliveredNotifications } from '@/lib/push';

// Icon per notification type; unknown types fall back to a bell.
const TYPE_ICON: Record<string, string> = {
  booking_confirmed:            'calendar-check',
  booking_declined:             'calendar-remove',
  appointment_cancelled:        'calendar-remove',
  appointment_rescheduled:      'calendar-clock',
  booking_cancelled_by_client:  'calendar-remove',
  booking_rescheduled_by_client:'calendar-clock',
  client_checked_in:            'map-marker-check',
  reminder:                     'bell-ring',
};

// Where tapping a notification takes you. Staff-facing types go to the staff
// surfaces; everything else is client-facing → My Bookings.
function routeFor(type: string): Href {
  if (type === 'booking_rescheduled_by_client') return '/(app)/booking-requests';
  if (type === 'booking_cancelled_by_client') return '/(app)/appointments';
  if (type === 'client_checked_in') return '/(app)/appointments';
  return '/(app)/my-bookings';
}

function NotificationsScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id;
  const { data, isLoading, error, refetch } = useNotifications(userId);
  const { refreshing, onRefresh } = useManualRefresh(refetch);
  const markRead = useMarkNotificationsRead();
  useRealtimeNotifications(userId);

  // Viewing the in-app center means the user has seen them — clear the OS shade
  // + app-icon badge (Android launcher badge is tray-driven). Runs each focus.
  useFocusEffect(
    useCallback(() => {
      clearDeliveredNotifications();
    }, []),
  );

  const hasUnread = (data ?? []).some((n) => !n.read_at);

  const onMarkAllRead = () => {
    markRead.mutate(undefined);
    clearDeliveredNotifications();
  };

  const onPressItem = (item: NotificationRow) => {
    if (!item.read_at) markRead.mutate([item.id]);
    router.push(routeFor(item.type));
  };

  const renderItem = ({ item }: { item: NotificationRow }) => {
    const unread = !item.read_at;
    return (
      <Pressable
        onPress={() => onPressItem(item)}
        style={[
          styles.row,
          { backgroundColor: unread ? theme.colors.surfaceVariant : 'transparent' },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: theme.colors.secondaryContainer }]}>
          <Icon
            source={TYPE_ICON[item.type] ?? 'bell-outline'}
            size={20}
            color={theme.colors.onSecondaryContainer}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="titleSmall" style={{ fontWeight: unread ? '700' : '500' }}>
            {item.title}
          </Text>
          {item.body ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
              {item.body}
            </Text>
          ) : null}
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
          </Text>
        </View>
        {unread && <View style={[styles.dot, { backgroundColor: theme.colors.primary }]} />}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Notifications" />
        {hasUnread && (
          <Appbar.Action
            icon="check-all"
            onPress={onMarkAllRead}
            accessibilityLabel="Mark all read"
          />
        )}
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
        <FlatList
          data={data ?? []}
          keyExtractor={(n) => n.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon source="bell-outline" size={36} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
                You&apos;re all caught up.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  list: { padding: 12, gap: 6, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
});

export default withScreenErrorBoundary(NotificationsScreen);
