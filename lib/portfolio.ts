import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

// Barber portfolios (migration 0246): photos of their own work a barber chose
// to publish. Both reads are definer RPCs open to anon + signed-in callers and
// return nothing unless the shop is publicly bookable and the person is one of
// its bookable providers. The files sit in a PUBLIC bucket, so no signed URLs.
export const PORTFOLIO_BUCKET = 'portfolio-images';

// The fields every surface needs to draw a photo (grid tile, strip tile, viewer).
export type PortfolioImage = {
  id: string;
  // The finished cut — the "after" when before_path is set.
  storage_path: string;
  // Present only for a before/after pair.
  before_path: string | null;
  caption: string | null;
  service_name: string | null;
};

export type PortfolioPhoto = PortfolioImage & {
  created_at: string;
};

export type BusinessPortfolioPhoto = PortfolioPhoto & {
  user_id: string;
  provider_name: string;
};

// Public CDN url for a stored portfolio path, or null when unset. Absolute
// URLs pass through (same rule as lib/avatars.ts — seeded data uses them).
export function portfolioImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from(PORTFOLIO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// One barber's portfolio, already in the order they arranged it.
export function useProviderPortfolio(businessId?: string, userId?: string) {
  return useQuery({
    queryKey: ['provider-portfolio', businessId, userId],
    enabled: !!businessId && !!userId,
    queryFn: async (): Promise<PortfolioPhoto[]> => {
      const { data, error } = await supabase.rpc('provider_portfolio_public', {
        p_business_id: businessId!,
        p_user_id: userId!,
      });
      if (error) throw error;
      return (data ?? []) as PortfolioPhoto[];
    },
  });
}

// The newest work across a shop's barbers (the server caps the limit at 48).
export function useBusinessPortfolio(businessId?: string, limit = 12) {
  return useQuery({
    queryKey: ['business-portfolio', businessId, limit],
    enabled: !!businessId,
    queryFn: async (): Promise<BusinessPortfolioPhoto[]> => {
      const { data, error } = await supabase.rpc('business_portfolio_public', {
        p_business_id: businessId!,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as BusinessPortfolioPhoto[];
    },
  });
}
