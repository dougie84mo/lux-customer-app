import { Alert } from 'react-native';
import * as Linking from 'expo-linking';

// Business app : app://   |   Customer app (this repo) : luxbooking://
// One shared Supabase account; sessions are NOT shared across installs.
const BUSINESS_APP_SCHEME = 'app://';

/**
 * Deep-link into the LUX Business app. Falls back to an alert if it isn't
 * installed. Uses `openURL` (not `canOpenURL`) on purpose, so no native
 * LSApplicationQueriesSchemes / Android <queries> config or rebuild is needed.
 */
export async function openBusinessApp() {
  try {
    await Linking.openURL(BUSINESS_APP_SCHEME);
  } catch {
    Alert.alert(
      'LUX Business not installed',
      'Install the LUX Business app to manage your salon, team, and devices. ' +
        'You can sign in there with the same email and password.',
    );
  }
}
