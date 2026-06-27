import { Redirect, Tabs } from 'expo-router';
import { Icon, useTheme } from 'react-native-paper';
import { useAuth } from '@/lib/auth';
import { usePushNotifications } from '@/lib/push';

// Customer app — a single client persona, so the tab bar is fixed (no
// business/personal branching). Screens that exist as files but aren't tabs
// (booking flow, photos, notifications, legal) stay navigable via router.push().
export default function AppLayout() {
  const { session, loading } = useAuth();
  const theme = useTheme();

  // Register for push whenever authenticated. No-ops until the EAS project id
  // exists (Dev Client); safe to mount now.
  usePushNotifications();

  if (loading) return null;
  if (!session) return <Redirect href="/(auth)/login" />;

  const renderIcon = (name: string) => {
    const TabIcon = ({ color, size }: { color: string; size: number }) => (
      <Icon source={name} color={color} size={size} />
    );
    TabIcon.displayName = `TabIcon(${name})`;
    return TabIcon;
  };

  const screenOptions = {
    headerShown: false,
    tabBarActiveTintColor: theme.colors.primary,
    tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
    tabBarStyle: {
      backgroundColor: theme.colors.surface,
      borderTopColor: theme.colors.surfaceVariant,
    },
    tabBarLabelStyle: { fontSize: 11 },
  };

  return (
    <Tabs backBehavior="history" screenOptions={screenOptions}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: renderIcon('home-variant') }} />
      <Tabs.Screen
        name="discover"
        options={{ title: 'Book', tabBarIcon: renderIcon('storefront-outline') }}
      />
      <Tabs.Screen
        name="my-bookings"
        options={{ title: 'Bookings', tabBarIcon: renderIcon('calendar-check') }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Account', tabBarIcon: renderIcon('account-circle-outline') }}
      />

      {/* Navigable, but not bottom-tab items. */}
      <Tabs.Screen name="business/[businessId]" options={{ href: null }} />
      <Tabs.Screen name="book/[businessId]" options={{ href: null }} />
      <Tabs.Screen name="pay/[requestId]" options={{ href: null }} />
      <Tabs.Screen name="provider/[userId]" options={{ href: null }} />
      <Tabs.Screen name="favorites" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="my-photos" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="legal/[doc]" options={{ href: null }} />
    </Tabs>
  );
}
