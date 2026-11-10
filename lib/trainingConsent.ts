// LUX AI training consent — client side (0236 in ../app/supabase).
//
// One LUX-wide switch: "Help improve LUX's hairstyle AI". Off by default.
// When on, a salon that has ALSO opted in (and where you agreed to mirror
// photos) may take still frames of you for training LUX's own hair and face
// model. Switching off takes every frame already taken out of the training
// set at once (set_my_ai_training_consent stamps them excluded).
//
// TRAINING_CONSENT_VERSION must equal training_consent_version() in the
// database and the constant in ../app/lib/trainingCapture.ts.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

export const TRAINING_CONSENT_VERSION = '2026-11-09';

// The wording recorded with TRAINING_CONSENT_VERSION. Not translated (like
// the photo consent sentence); other languages show a summary above it.
export const TRAINING_CONSENT_TEXT = [
  'What is captured: still frames from a LUX mirror during a salon visit, with the usual on-screen notice before each one.',
  "What for: training LUX's own hair and face model, which runs on the mirror.",
  'Who sees them: LUX engineers and a labelling contractor under a confidentiality agreement. Never other salons or other clients, and they do not appear in your photos.',
  'How long: until you switch this off, or 24 months at most.',
  'How to stop: switch this off. Frames already taken leave the training set immediately.',
  'A salon also has to take part separately, and you must have agreed to mirror photos there.',
];

export type MyTrainingConsent = {
  allowed: boolean;
  consent_version: string | null;
  consented_at: string | null;
};

// The caller's own row (RLS: select own). No row = never opted in.
export function useMyTrainingConsent() {
  return useQuery({
    queryKey: ['my-training-consent'],
    queryFn: async (): Promise<MyTrainingConsent | null> => {
      const { data, error } = await supabase
        .from('user_ai_training_consents')
        .select('allowed, consent_version, consented_at')
        .maybeSingle();
      if (error) throw error;
      return (data as MyTrainingConsent | null) ?? null;
    },
  });
}

// Current = on, and on the wording shown today.
export function isTrainingConsentCurrent(c: MyTrainingConsent | null | undefined): boolean {
  return !!c?.allowed && c.consent_version === TRAINING_CONSENT_VERSION;
}

export function useSetTrainingConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { on: boolean }) => {
      const { error } = await supabase.rpc('set_my_ai_training_consent', {
        p_on: input.on,
        p_consent_version: input.on ? TRAINING_CONSENT_VERSION : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-training-consent'] });
    },
  });
}

// Does this salon take part? For the line on the booking confirm step.
export function useBusinessTrainingCapture(businessId: string | undefined) {
  return useQuery({
    queryKey: ['business-training-capture', businessId],
    enabled: !!businessId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('business_training_capture_public', {
        p_business_id: businessId!,
      });
      if (error) throw error;
      return !!data;
    },
  });
}
