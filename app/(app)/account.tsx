import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Avatar, Button, Card, Divider, List, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { NotificationBell } from '@/components/NotificationBell';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useMyProfile } from '@/lib/clientProfile';
import { useMyMemberships } from '@/lib/businesses';
import { openBusinessApp } from '@/lib/companionApp';
import { avatarUrl, initialsOf } from '@/lib/avatars';

// Account — a hub. Profile, photos, and settings each live on their own screen;
// this screen is a summary header + links + sign out.
function AccountScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id;
  const { data: profile } = useMyProfile(userId);
  // Only users who also belong to a business see the "open business app" link.
  const { data: memberships } = useMyMemberships(userId);
  const isBusinessUser = (memberships?.length ?? 0) > 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <NotificationBell />
        <Appbar.Content title="Account" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Identity summary */}
        <Card>
          <Card.Content style={styles.summaryRow}>
            {avatarUrl(profile?.avatar_path) ? (
              <Avatar.Image size={56} source={{ uri: avatarUrl(profile?.avatar_path)! }} />
            ) : (
              <Avatar.Text size={56} label={initialsOf(profile?.name)} />
            )}
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text variant="titleMedium" style={{ fontWeight: '700' }} numberOfLines={1}>
                {profile?.name ?? 'Your account'}
              </Text>
              {profile?.email ? (
                <Text
                  variant="bodySmall"
                  numberOfLines={1}
                  style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
                >
                  {profile.email}
                </Text>
              ) : null}
            </View>
          </Card.Content>
        </Card>

        {/* Links */}
        <Card style={{ marginTop: 16 }}>
          <List.Item
            title="Profile"
            description="Name, photo, and contact info"
            left={(p) => <List.Icon {...p} icon="account-circle-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/profile')}
          />
          <Divider />
          <List.Item
            title="Favorites"
            description="Businesses you've saved"
            left={(p) => <List.Icon {...p} icon="heart-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/favorites')}
          />
          <Divider />
          <List.Item
            title="My photos"
            description="Mirror photos shared with you"
            left={(p) => <List.Icon {...p} icon="image-multiple-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/my-photos')}
          />
          <Divider />
          <List.Item
            title="Settings"
            description="Password, preferences, legal"
            left={(p) => <List.Icon {...p} icon="cog-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/settings')}
          />
        </Card>

        {isBusinessUser && (
          <Card style={{ marginTop: 16 }}>
            <List.Item
              title="Open business app"
              description="Manage your salon — same login"
              left={(p) => <List.Icon {...p} icon="briefcase-outline" />}
              right={(p) => <List.Icon {...p} icon="open-in-new" />}
              onPress={openBusinessApp}
            />
          </Card>
        )}

        <Button
          mode="outlined"
          icon="logout"
          textColor={theme.colors.error}
          style={styles.signOut}
          onPress={() => supabase.auth.signOut()}
        >
          Sign out
        </Button>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  signOut: { marginTop: 24, borderColor: 'transparent' },
});

export default withScreenErrorBoundary(AccountScreen);
