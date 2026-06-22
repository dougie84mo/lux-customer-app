import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { usePathname } from 'expo-router';
import { useAuth } from './auth';
import { useCurrentBusiness } from './currentBusiness';
import { supabase } from './supabase';

// Self-hosted crash/error reporting — a no-vendor alternative to Sentry that
// writes to public.client_error_log (migration 0021). Best-effort: every path
// here swallows its own failures so the reporter can never crash the app, and
// it stays "wired but dark" until the table exists / a user is signed in.
//
// Limitations (by design — see 0021): only JS-level errors are captured (no
// native crashes, no symbolication), and pre-login errors can't be inserted
// (no JWT for RLS) so they only reach the console.

type ErrorContext = {
  userId?: string;
  businessId?: string | null;
  route?: string;
};

// The global JS error handler runs OUTSIDE React, so it can't read hooks. We
// keep the live auth/business/route in module state, refreshed by
// useErrorReporter(), and the handler reads from here.
let currentContext: ErrorContext = {};

export function setErrorContext(ctx: ErrorContext): void {
  currentContext = { ...currentContext, ...ctx };
}

function platformTag(): 'ios' | 'android' | 'web' | 'unknown' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'web') return 'web';
  return 'unknown';
}

const MAX_MESSAGE = 4000;
const MAX_STACK = 12000;

type ReportExtra = {
  fatal?: boolean;
  componentStack?: string | null;
  context?: Record<string, unknown>;
};

/**
 * Record a JS/render error to client_error_log. Never throws. No-ops (console
 * only) when there's no signed-in user, since RLS requires user_id = auth.uid().
 */
export async function reportError(error: unknown, extra?: ReportExtra): Promise<void> {
  try {
    const userId = currentContext.userId;
    const err = error instanceof Error ? error : new Error(String(error));

    // Always surface to the console for local dev regardless of remote logging.
    console.error('[errorLog]', err, extra?.componentStack ?? '');

    // No authenticated user → RLS would reject the insert. Skip the round-trip.
    if (!userId) return;

    const { error: insertError } = await supabase.from('client_error_log').insert({
      user_id: userId,
      business_id: currentContext.businessId ?? null,
      message: (err.message || 'Unknown error').slice(0, MAX_MESSAGE),
      stack: err.stack ? err.stack.slice(0, MAX_STACK) : null,
      component_stack: extra?.componentStack ? extra.componentStack.slice(0, MAX_STACK) : null,
      fatal: extra?.fatal ?? false,
      route: currentContext.route ?? null,
      app_version: Constants.expoConfig?.version ?? null,
      platform: platformTag(),
      context: extra?.context ?? {},
    });
    // Swallow — a logging failure (e.g. table not yet deployed) must stay silent.
    if (insertError) console.warn('[errorLog] insert failed', insertError.message);
  } catch {
    // Never let the reporter throw.
  }
}

// Install once. Chains the previous global handler so RN's default red-box /
// crash behaviour is preserved — we only add reporting on top.
let installed = false;

function installGlobalErrorHandler(): void {
  if (installed) return;
  const errorUtils = (globalThis as { ErrorUtils?: any }).ErrorUtils;
  if (!errorUtils?.getGlobalHandler) return;
  installed = true;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    reportError(error, { fatal: !!isFatal });
    previous?.(error, isFatal);
  });
}

/**
 * Mount once near the authenticated root. Installs the global JS error handler
 * and keeps the reporter's user/business/route context in sync so both the
 * handler and ScreenErrorBoundary attach the right tenant to every report.
 */
export function useErrorReporter(): void {
  const { session } = useAuth();
  const { currentBusinessId } = useCurrentBusiness();
  const pathname = usePathname();

  useEffect(() => {
    installGlobalErrorHandler();
  }, []);

  useEffect(() => {
    setErrorContext({
      userId: session?.user.id,
      businessId: currentBusinessId ?? null,
      route: pathname,
    });
  }, [session?.user.id, currentBusinessId, pathname]);
}
