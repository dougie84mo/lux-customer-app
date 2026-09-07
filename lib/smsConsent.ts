// Text-message (SMS) opt-in — client side (migration 0174 in ../app/supabase).
//
// LUX texts a client only after they added a mobile number and switched
// texts on themselves: Settings › Text messages, or the unticked box on the
// booking confirm step. The server keeps an append-only record of every
// opt-in / opt-out (who, when, from which screen, which wording) because the
// carriers' 10DLC rules and the TCPA both ask for it. Replying STOP to any
// text opts out too (handled server-side once the provider is wired).
//
// SMS_CONSENT_VERSION must equal sms_consent_version() in the database. Bump
// both in the same release that changes SMS_CONSENT_CTA below.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

export const SMS_CONSENT_VERSION = '2026-09-07';

// The disclosure shown beside the switch / checkbox. It follows the carrier
// (Telnyx / TCR) opt-in template sentence for sentence — the 2026-09-07
// campaign rejection was for the wording drifting from it. Change it here, in
// prompts/SMS_TELNYX_RUNBOOK.md §3, and on theluxmirror.com/policies/text-messages
// together, and bump SMS_CONSENT_VERSION + sms_consent_version().
export const SMS_CONSENT_CTA =
  'By providing your phone number, you agree to receive SMS appointment confirmations, reminders and updates from LUX Mirror on behalf of the salons you book with. Message frequency may vary. Standard Message and Data Rates may apply. Reply STOP to opt out. Reply HELP for help. We will not share mobile information with third parties for promotional or marketing purposes.';

export const SMS_CONSENT_CHECKBOX_LABEL = 'Text me appointment updates';

export type SmsStatus = {
  phone_e164: string | null;
  sms_on: boolean;
  consent_version: string | null;
  is_current: boolean;
  changed_at: string | null;
};

export type SmsConsentSource = 'booking_confirm' | 'settings';

export function useMySmsStatus(enabled = true) {
  return useQuery({
    queryKey: ['my-sms-status'],
    enabled,
    queryFn: async (): Promise<SmsStatus | null> => {
      const { data, error } = await supabase.rpc('my_sms_status');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as SmsStatus | null;
    },
  });
}

export function useSetSmsConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      phoneE164: string | null;
      on: boolean;
      source: SmsConsentSource;
    }): Promise<SmsStatus | null> => {
      const { data, error } = await supabase.rpc('set_sms_consent', {
        p_phone_e164: input.phoneE164,
        p_on: input.on,
        p_source: input.source,
        p_consent_version: input.on ? SMS_CONSENT_VERSION : null,
        p_user_agent: null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as SmsStatus | null;
    },
    onSuccess: (row) => {
      if (row) qc.setQueryData(['my-sms-status'], row);
      qc.invalidateQueries({ queryKey: ['my-sms-status'] });
      qc.invalidateQueries({ queryKey: ['my-profile'] });
    },
  });
}
