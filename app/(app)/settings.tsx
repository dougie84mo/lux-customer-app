import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, List, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

// Settings — a hub, laid out like the business app's: sectioned rows that
// each open their own screen. The forms themselves live on the sub-screens
// (settings-notifications, settings-photos, settings-account).
function SettingsScreen() {
  const theme = useTheme();
  const version = Constants.expoConfig?.version;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Settings" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
        <List.Section>
          <List.Subheader>Preferences</List.Subheader>
          <List.Item
            title="Notifications"
            description="Push, email and text messages"
            left={(p) => <List.Icon {...p} icon="bell-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/settings-notifications')}
          />
          {/* Mirror photo consent (0167): one switch per salon. */}
          <List.Item
            title="Mirror photos"
            description="Which salons may photograph you, delete photos"
            left={(p) => <List.Icon {...p} icon="camera-account" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/settings-photos')}
          />
        </List.Section>

        <List.Section>
          <List.Subheader>Account</List.Subheader>
          <List.Item
            title="Account & sign-in"
            description="Connected accounts, password, delete account"
            left={(p) => <List.Icon {...p} icon="account-circle-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/settings-account')}
          />
          <List.Item
            title="Privacy Policy"
            left={(p) => <List.Icon {...p} icon="shield-account-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/legal/privacy')}
          />
          <List.Item
            title="Terms of Service"
            left={(p) => <List.Icon {...p} icon="file-document-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/legal/terms')}
          />
        </List.Section>

        <View style={styles.footer}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            LUX Booking{version ? ` · v${version}` : ''}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
});

export default withScreenErrorBoundary(SettingsScreen);
