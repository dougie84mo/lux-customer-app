import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';
import { getIdentities } from './googleAuth';

// Native Sign in with Apple (iOS only). Unlike Google's PKCE web-redirect flow
// (lib/googleAuth.ts), this never opens a browser: Apple's native sheet returns
// an identity token that goes straight to supabase.auth.signInWithIdToken, so
// there is no redirect URL, no landing route, and no client secret. The Apple
// provider in the Supabase dashboard just needs both apps' bundle IDs in its
// "Client IDs" list. Required by App Store guideline 4.8 because we offer
// Google sign-in.

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

// Apple sends the user's name ONLY on the very first authorization — never in
// the identity token, never again on later sign-ins — so Supabase can't
// populate it server-side (handle_new_user falls back to the email local-part,
// which for a Hide-My-Email address is a random string). Persist it to user
// metadata immediately; best-effort by design.
async function saveFullName(
  fullName: AppleAuthentication.AppleAuthenticationFullName | null
): Promise<void> {
  const parts = [fullName?.givenName, fullName?.middleName, fullName?.familyName].filter(
    (p): p is string => !!p && !!p.trim()
  );
  if (parts.length === 0) return;
  const name = parts.join(' ');
  try {
    const { data } = await supabase.auth.updateUser({
      data: {
        name,
        full_name: name,
        given_name: fullName?.givenName ?? undefined,
        family_name: fullName?.familyName ?? undefined,
      },
    });
    // handle_new_user already ran with the email-derived fallback; fix the row.
    // Silently skipped if RLS doesn't allow a self-update.
    const userId = data.user?.id;
    if (userId) {
      await supabase.from('users').update({ name }).eq('id', userId);
    }
  } catch {
    // non-critical; the user can edit their name in the app
  }
}

// Resolves true on success, false when the user dismissed Apple's sheet
// (mirrors signInWithGoogle's boolean-for-cancel convention); throws with a
// Snackbar-ready message otherwise. Success navigates via onAuthStateChange.
export async function signInWithApple(): Promise<boolean> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (err: any) {
    if (err?.code === 'ERR_REQUEST_CANCELED') return false;
    throw err;
  }
  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
  await saveFullName(credential.fullName);
  return true;
}

// There is no native "link Apple to the signed-in account" API in supabase-js
// (linkIdentity is web-redirect only, which would drag in the Services ID +
// 6-monthly secret rotation we deliberately avoid). Supabase auto-links an
// Apple identity to an existing account when the verified emails match;
// otherwise Apple is connected by signing in with it from the login screen.
export async function unlinkApple(): Promise<void> {
  const identities = await getIdentities();
  const apple = identities.find((i) => i.provider === 'apple');
  if (!apple) return;
  const { error } = await supabase.auth.unlinkIdentity(apple);
  if (error) throw error;
}
