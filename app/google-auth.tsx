import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';

// Landing route for the Google OAuth deep-link redirect (luxbooking://google-auth).
// The session exchange itself is done in lib/googleAuth.ts (which opened the auth
// session); this screen only exists so the redirect resolves to a real route
// instead of expo-router's "Unmatched Route". It waits briefly for the session to
// appear (sign-in) — for account linking the session is already present — then
// routes into the app.
export default function GoogleAuthCallback() {
  const { session } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(id);
  }, []);

  if (session) return <Redirect href="/(app)" />;
  if (timedOut) return <Redirect href="/" />;

  return (
    <View style={styles.center}>
      <ActivityIndicator />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
