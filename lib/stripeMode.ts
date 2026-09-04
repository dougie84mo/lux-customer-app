/*
 * Stripe test/live selection — decided by the SERVER, at runtime.
 *
 * Since migration 0163 the backend resolves test vs live per business (or per
 * user for client-only flows); the app no longer bakes a mode into the build.
 * Two contracts carry the answer down:
 *
 *   1. Edge Function `stripe-config` → { mode, publishable_key } for the
 *      signed-in caller. Fetched once after sign-in (useStripeConfig) and
 *      written into the store below, which StripeProvider follows.
 *   2. Every function that returns a client_secret (create-payment-intent,
 *      create-deposit-intent, create-setup-intent) also returns stripe_mode +
 *      publishable_key, so checkout can re-initialise the native SDK for THAT
 *      business right before it presents a sheet (see lib/checkout.ts).
 *
 * The server key is authoritative. EXPO_PUBLIC_STRIPE_MODE and the two
 * publishable keys in .env survive only as a fallback for the window before
 * the server has answered (pre-sign-in, or a dev box with no network) — they
 * never override what the server returns.
 *
 * Metro inlines `process.env.EXPO_PUBLIC_*` by matching the literal source
 * text at build time, so every var has to be referenced STATICALLY. A computed
 * read — process.env[`EXPO_PUBLIC_..._${mode}`] — is not inlined and comes back
 * undefined in a real build. Hence the explicit branch below; don't collapse it
 * into a lookup.
 *
 * Keep in sync with app/lib/stripeMode.ts — both apps charge on the same
 * platform account and read the same server contract.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from './auth';
import { queryClient } from './queryClient';
import { supabase } from './supabase';

export type StripeMode = 'test' | 'live';

export type StripeConfig = {
  mode: StripeMode;
  publishableKey: string | null;
};

// Where the currently resolved key came from. `env` is the pre-sign-in / dev
// fallback; `none` means payments are unusable until the server answers.
export type StripeConfigSource = 'server' | 'env' | 'none';

export type ResolvedStripeConfig = StripeConfig & { source: StripeConfigSource };

// The key is what Stripe honours, so the key decides the mode — never a
// declared value that could disagree with it.
export function stripeModeFor(key: string | null | undefined): StripeMode {
  return key?.startsWith('pk_live_') ? 'live' : 'test';
}

// ---------------------------------------------------------------------------
// Env fallback — used only until the server has answered.
// ---------------------------------------------------------------------------

const envMode: StripeMode = process.env.EXPO_PUBLIC_STRIPE_MODE === 'live' ? 'live' : 'test';

const envModeKey =
  envMode === 'live'
    ? process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE
    : process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST;

// Back-compat: the original single-key var still works when the mode-specific
// pair isn't set, so an un-migrated .env keeps running unchanged.
const legacyKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

export const envFallbackPublishableKey: string | undefined =
  envModeKey || legacyKey || undefined;

const envFallback: ResolvedStripeConfig = envFallbackPublishableKey
  ? {
      mode: stripeModeFor(envFallbackPublishableKey),
      publishableKey: envFallbackPublishableKey,
      source: 'env',
    }
  : { mode: 'test', publishableKey: null, source: 'none' };

// ---------------------------------------------------------------------------
// Store — a single module-level value so non-React code (checkout.ts) and
// React code (StripeProvider, the badge) agree on which key is in play.
// ---------------------------------------------------------------------------

let resolved: ResolvedStripeConfig = envFallback;
const listeners = new Set<() => void>();

export function getStripeConfig(): ResolvedStripeConfig {
  return resolved;
}

function publish(next: ResolvedStripeConfig) {
  const changed =
    next.mode !== resolved.mode ||
    next.publishableKey !== resolved.publishableKey ||
    next.source !== resolved.source;
  if (!changed) return;
  resolved = next;
  if (__DEV__) {
    console.log(
      `[stripe] ${next.mode} mode (${next.source}${
        next.publishableKey ? `, ${next.publishableKey.slice(0, 8)}…` : ', no key'
      })`,
    );
  }
  listeners.forEach((fn) => fn());
}

// Server-resolved config. A null key from the server (mode known, but that
// account has no publishable key configured) still counts as a server answer —
// it must NOT fall back to the env key, which could be the other environment.
export function setStripeConfig(config: StripeConfig) {
  publish({ mode: config.mode, publishableKey: config.publishableKey ?? null, source: 'server' });
}

// Back to the env fallback — on sign-out, so the next account starts clean.
export function resetStripeConfig() {
  publish(envFallback);
}

export function subscribeStripeConfig(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// ---------------------------------------------------------------------------
// Hook — subscribes to the store and keeps it fed from `stripe-config`.
// ---------------------------------------------------------------------------

const STRIPE_CONFIG_KEY = ['stripe-config'] as const;

export function useStripeConfig(): ResolvedStripeConfig {
  const { session } = useAuth();
  const userId = session?.user.id;
  const config = useSyncExternalStore(subscribeStripeConfig, getStripeConfig, getStripeConfig);

  // No body → the caller's own mode. Business-scoped answers ride along with
  // each client_secret instead (see lib/checkout.ts), so one fetch per session
  // is enough here.
  useQuery({
    queryKey: STRIPE_CONFIG_KEY,
    enabled: !!userId,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async (): Promise<StripeConfig> => {
      const { data, error } = await supabase.functions.invoke('stripe-config', { body: {} });
      if (error) throw error;
      const next: StripeConfig = {
        mode: data?.mode === 'live' ? 'live' : 'test',
        publishableKey: typeof data?.publishable_key === 'string' ? data.publishable_key : null,
      };
      setStripeConfig(next);
      return next;
    },
  });

  // Signed out (or switched accounts): drop the cached answer so the next user
  // is never served the previous one, and put the env fallback back.
  useEffect(() => {
    if (userId) return;
    queryClient.removeQueries({ queryKey: STRIPE_CONFIG_KEY });
    resetStripeConfig();
  }, [userId]);

  return config;
}
