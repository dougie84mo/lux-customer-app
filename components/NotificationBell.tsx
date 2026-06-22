import { StyleSheet, View } from 'react-native';
import { Badge, IconButton } from 'react-native-paper';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useUnreadNotificationCount } from '@/lib/notifications';
import { useRealtimeNotifications } from '@/lib/realtime';

// Drop-in app-bar bell with a live unread badge. Self-contained: reads the
// current user + unread count and subscribes to realtime, so it can be placed in
// any Appbar.Header with one line.
export function NotificationBell() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { data: count = 0 } = useUnreadNotificationCount(userId);
  useRealtimeNotifications(userId);

  return (
    <View style={styles.wrap}>
      <IconButton
        icon="bell-outline"
        onPress={() => router.push('/(app)/notifications')}
        accessibilityLabel="Notifications"
      />
      {count > 0 && (
        <Badge style={styles.badge} size={16}>
          {count > 99 ? '99+' : count}
        </Badge>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 4 },
});
