import { useMutation } from '@tanstack/react-query';
import { supabase } from './supabase';

// Account deletion (App Store 5.1.1(v), Play data safety). The delete-account
// Edge Function (owned by ../app/supabase/) erases and anonymizes the account
// server-side and revokes every session; it refuses with a human-readable
// reason while the caller still owns a business, is a billing contact, or has
// pending payouts in the business app.

// functions.invoke surfaces non-2xx as a generic FunctionsHttpError; dig the
// JSON body out of the error context for the real reason (mirrors lib/payments.ts).
async function invokeError(error: unknown): Promise<Error> {
  const e = error as { message?: string; context?: Response };
  let detail = e.message ?? 'Request failed';
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

export function useDeleteAccount() {
  return useMutation({
    mutationFn: async (): Promise<{ ok: true }> => {
      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: { confirm: 'DELETE' },
      });
      if (error) throw await invokeError(error);
      return data as { ok: true };
    },
    // The server already revoked the sessions; a local sign-out clears the
    // device without a network round-trip that would fail on a banned user.
    onSuccess: async () => {
      await supabase.auth.signOut({ scope: 'local' });
    },
  });
}
