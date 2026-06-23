import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { UserIdentity } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Ensure any pending auth web session is finished when the app regains focus.
WebBrowser.maybeCompleteAuthSession();

// The deep link the OAuth redirect returns to. MUST be allow-listed in
// Supabase Auth → URL Configuration → Redirect URLs (customer app scheme is
// `luxbooking://`; the business app uses `app://`). A wildcard `luxbooking://**`
// covers this path.
const redirectTo = Linking.createURL('google-auth');

// PKCE redirect → Supabase session. supabase-js stored the code verifier during
// signInWithOAuth/linkIdentity; here we exchange the returned ?code= for a session.
async function completeFromRedirectUrl(url: string): Promise<void> {
  const { queryParams } = Linking.parse(url);
  const errorCode = queryParams?.error_code ?? queryParams?.error;
  if (errorCode) {
    throw new Error(String(queryParams?.error_description ?? errorCode));
  }
  const code = typeof queryParams?.code === 'string' ? queryParams.code : undefined;
  if (!code) throw new Error('Google did not return an authorization code.');
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
}

// Drive the in-app browser for an OAuth URL and finish the session. Returns
// false if the user dismissed/cancelled the browser (not an error).
async function runOAuth(url: string): Promise<boolean> {
  const res = await WebBrowser.openAuthSessionAsync(url, redirectTo);
  if (res.type !== 'success') return false; // cancel / dismiss
  await completeFromRedirectUrl(res.url);
  return true;
}

/**
 * Sign in (or sign up) with Google via the web-redirect flow. Resolves true on
 * success, false if the user backed out. Throws on a real error.
 */
export async function signInWithGoogle(): Promise<boolean> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start Google sign-in.');
  return runOAuth(data.url);
}

/**
 * Link Google to the CURRENTLY signed-in account (so either method logs into the
 * same identity). Requires "Manual linking" enabled in Supabase Auth settings.
 */
export async function linkGoogle(): Promise<boolean> {
  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start Google linking.');
  return runOAuth(data.url);
}

/** The signed-in user's linked identities (e.g. email, google). */
export async function getIdentities(): Promise<UserIdentity[]> {
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) throw error;
  return data?.identities ?? [];
}

/**
 * Unlink Google. Supabase refuses to remove a user's only sign-in method, so the
 * caller should keep email/password (or another identity) in place.
 */
export async function unlinkGoogle(): Promise<void> {
  const identities = await getIdentities();
  const google = identities.find((i) => i.provider === 'google');
  if (!google) return;
  const { error } = await supabase.auth.unlinkIdentity(google);
  if (error) throw error;
}
