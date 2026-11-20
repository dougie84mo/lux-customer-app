// Portfolio consent — client side (migration 0254 in ../app/supabase).
//
// A SEPARATE consent from mirror photos (lib/photoConsent.ts): "Let my
// barbers show my photos in their portfolio". One switch for the whole
// account, off by default, and only the client can turn it on. When it is
// on, a barber at a shop the client visits may publish before/after photos
// from their visits in the barber's public portfolio. Switching it off
// removes every such portfolio photo at once (set_my_portfolio_consent);
// the public image files follow within 24 hours.
//
// PORTFOLIO_CONSENT_VERSION must equal portfolio_consent_version() in the
// database. The wording it records is PORTFOLIO_CONSENT_LABEL /
// PORTFOLIO_CONSENT_EXPLANATION below, which locales/en/photos.json
// (portfolioConsent.label / .explanation) must match word for word — a Jest
// test checks it. Change the wording ⇒ bump both versions in one release.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

export const PORTFOLIO_CONSENT_VERSION = '2026-11-20';

export const PORTFOLIO_CONSENT_LABEL = 'Let my barbers show my photos in their portfolio';

export const PORTFOLIO_CONSENT_EXPLANATION =
  "When this is on, a barber at a shop you visit can choose before / after photos from your visits to show in their public portfolio on LUX Booking and the shop's web page. Your name is never shown with them. Turn this off at any time and those photos are removed from portfolios within 24 hours. Your mirror photos stay private to you and the shop either way.";

export type MyPortfolioConsent = {
  id: string;
  consent_version: string;
  granted_at: string;
};

// The caller's live consent row, or null (RLS: own rows only).
export function useMyPortfolioConsent() {
  return useQuery({
    queryKey: ['my-portfolio-consent'],
    queryFn: async (): Promise<MyPortfolioConsent | null> => {
      const { data, error } = await supabase
        .from('client_portfolio_consents')
        .select('id, consent_version, granted_at')
        .is('revoked_at', null)
        .maybeSingle();
      if (error) throw error;
      return (data as MyPortfolioConsent | null) ?? null;
    },
  });
}

// Current = a live row on the wording shown today.
export function isPortfolioConsentCurrent(c: MyPortfolioConsent | null | undefined): boolean {
  return !!c && c.consent_version === PORTFOLIO_CONSENT_VERSION;
}

/** Returns how many portfolio photos were removed (0 when switching on). */
export function useSetPortfolioConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { on: boolean }): Promise<number> => {
      const { data, error } = await supabase.rpc('set_my_portfolio_consent', {
        p_on: input.on,
        p_consent_version: input.on ? PORTFOLIO_CONSENT_VERSION : null,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-portfolio-consent'] });
    },
  });
}
