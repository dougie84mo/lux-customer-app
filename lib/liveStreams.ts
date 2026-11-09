// Live streams from a LUX mirror — client side (migration 0231 in ../app/supabase).
//
// A salon may stream an appointment to Facebook / Instagram only after the
// client in the chair agrees FOR THAT SESSION: here in LUX Booking
// (respond_live_consent, method 'client_app') or in person to the stylist
// (staff_attested, recorded by the business app). The client can stop a
// session they are in at any time (live-stop; the server forces reason
// consent_revoked), and can opt out of every salon at once
// (set_never_live_stream). Clients cannot select live_sessions — everything
// goes through my_live_stream_requests().
//
// STREAM_CONSENT_VERSION and STREAM_CONSENT_TEXT move together: changing the
// wording means bumping the version, here AND in the business app AND in
// stream_consent_version() in the database (a migration in ../app). A stale
// version is refused by respond_live_consent.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth';
import type { AppLocale } from './i18n';
import { supabase } from './supabase';

// Settings › Mirror photos › "Live streams" stays hidden until the feature
// launches. The consent screen itself is always reachable: it only opens
// from a real request (push / inbox).
export const LIVE_STREAMING_UI_ENABLED = false;

export const STREAM_CONSENT_VERSION = '2026-11-08';

// The paragraph the client agrees to, shown under "Streaming to: …". The
// English is the wording recorded with STREAM_CONSENT_VERSION; the Spanish is
// a faithful translation of it and changes with it.
export const STREAM_CONSENT_TEXT: Record<AppLocale, string> = {
  en:
    "The mirror's camera will broadcast live video of you to the accounts listed above. " +
    "People who can see those accounts can watch while it's live, and Facebook keeps the " +
    'broadcast on that account afterwards unless the salon deletes it. The salon may also ' +
    'save a recording to post later on its Instagram. No sound is broadcast. You can stop ' +
    'the stream at any time from this screen or by asking your stylist. Saying no won\'t ' +
    'affect your appointment.',
  es:
    'La cámara del espejo transmitirá video en vivo de ti a las cuentas indicadas arriba. ' +
    'Las personas que pueden ver esas cuentas podrán verlo mientras esté en vivo, y Facebook ' +
    'conserva la transmisión en esa cuenta después, a menos que el salón la elimine. El salón ' +
    'también puede guardar una grabación para publicarla más tarde en su Instagram. No se ' +
    'transmite sonido. Puedes detener la transmisión en cualquier momento desde esta pantalla ' +
    'o pidiéndoselo a tu estilista. Si dices que no, tu cita no se verá afectada.',
};

export function streamConsentText(locale: AppLocale): string {
  return STREAM_CONSENT_TEXT[locale] ?? STREAM_CONSENT_TEXT.en;
}

export type LiveStreamStatus = 'pending' | 'starting' | 'live';
export type LiveConsentMethod = 'client_app' | 'staff_attested' | 'no_client_on_camera';

export type MyLiveStreamRequest = {
  session_id: string;
  business_id: string;
  business_name: string;
  stylist_name: string | null;
  title: string | null;
  // Each destination's account label, or its kind when the label is missing.
  destinations: string[];
  status: LiveStreamStatus;
  consent_method: LiveConsentMethod | null;
  created_at: string;
};

// my_live_stream_requests() falls back to the destination kind when an
// account has no label; show those as the platform name (brand names, not
// translated).
const KIND_LABEL: Record<string, string> = {
  fb_live: 'Facebook',
  ig_live_producer: 'Instagram',
};

export function destinationLabel(raw: string): string {
  return KIND_LABEL[raw] ?? raw;
}

const REQUESTS_KEY = ['my-live-stream-requests'] as const;

// The caller's sessions that are waiting on them or on air. Pass `poll` while
// a screen using it is focused — the stylist starts / ends the stream from the
// business app and there is no realtime channel for it.
export function useMyLiveStreamRequests(opts: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: REQUESTS_KEY,
    queryFn: async (): Promise<MyLiveStreamRequest[]> => {
      const { data, error } = await supabase.rpc('my_live_stream_requests');
      if (error) throw error;
      return (data ?? []) as MyLiveStreamRequest[];
    },
    refetchInterval: opts.poll ? 5_000 : false,
    staleTime: 0,
  });
}

// Allow (records the current consent version) or decline (cancels the session).
export function useRespondLiveConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sessionId: string; allow: boolean }) => {
      const { error } = await supabase.rpc('respond_live_consent', {
        p_session_id: input.sessionId,
        p_allow: input.allow,
        p_consent_version: input.allow ? STREAM_CONSENT_VERSION : null,
      });
      if (error) throw error;
    },
    onSettled: () => {
      // Settled, not success: "this request has expired" also means the list is stale.
      qc.invalidateQueries({ queryKey: REQUESTS_KEY });
    },
  });
}

// functions.invoke surfaces non-2xx as a generic FunctionsHttpError; the
// function's JSON body carries the real reason (same as lib/payments.ts).
async function invokeError(error: unknown): Promise<Error> {
  const e = error as { message?: string; context?: Response };
  let detail = e.message ?? 'photos:live.errors.stopFailed';
  try {
    if (e.context) {
      const parsed = await e.context.json();
      if (parsed?.error) detail = parsed.error;
    }
  } catch {
    // keep the generic message
  }
  return new Error(detail);
}

// Stop a session I'm in — pending (cancels it), starting or live. Works
// whichever way consent was given.
export function useStopMyLiveStream() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sessionId: string }) => {
      const { error } = await supabase.functions.invoke('live-stop', {
        body: { session_id: input.sessionId },
      });
      if (error) throw await invokeError(error);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: REQUESTS_KEY });
    },
  });
}

// The standing "never stream me" choice (user_stream_preferences; no row = false).
export function useNeverLiveStream(opts: { enabled?: boolean } = {}) {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['never-live-stream', userId],
    enabled: !!userId && (opts.enabled ?? true),
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('user_stream_preferences')
        .select('never_live_stream')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return !!(data as { never_live_stream: boolean } | null)?.never_live_stream;
    },
  });
}

// Setting it to true also declines anything still pending (server side).
export function useSetNeverLiveStream() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { never: boolean }) => {
      const { error } = await supabase.rpc('set_never_live_stream', { p_never: input.never });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['never-live-stream'] });
      qc.invalidateQueries({ queryKey: REQUESTS_KEY });
    },
  });
}
