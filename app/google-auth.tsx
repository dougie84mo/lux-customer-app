import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { Redirect, type Href } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { consumePostOAuthRoute } from '@/lib/googleAuth';

// Landing route for the Google OAuth deep-link redirect (luxbooking://google-auth).
// The session exchange itself is done in lib/googleAuth.ts (which opened the auth
// session); this screen only exists so the redirect resolves to a real route
// instead of expo-router's "Unmatched Route". It waits briefly for the session to
// appear (sign-in) — for account linking the session is already present — then
// routes to wherever the flow stashed (sign-in → app home, linking → Settings).
export default function GoogleAuthCallback() {
  const { session } = useAuth();
  const [timedOut, setTimedOut] = useState(false);
  // null until the stashed route resolves. We must NOT redirect before this is
  // set: in the account-linking flow the session is already present on mount, so
  // redirecting on the default would race past the stashed Settings route and
  // bounce the user to home instead.
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    consumePostOAuthRoute().then((r) => setTarget(r ?? '/(app)'));
    const id = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(id);
  }, []);

  if (session && target) return <Redirect href={target as Href} />;
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
