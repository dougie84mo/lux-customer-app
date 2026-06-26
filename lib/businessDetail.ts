import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

// Public business header for an arbitrary business (migration 0055). Use this
// instead of selecting `businesses` directly — RLS blocks non-members from
// reading that table. Returns null if the business isn't bookable (needs >=1
// active service + active location), so treat null as "not available".
export type BusinessPublic = {
  id: string;
  name: string;
  type: string;
  logo_url: string | null;
  description: string | null;
  avg_rating: number | null;
  review_count: number;
};

// Lets the business profile work without route params (deep link / QR entry).
// Discovery still passes the header as params for an instant first paint; this
// fills in the gaps and adds the rating, and is the sole source on a cold link.
export function useBusinessPublic(businessId?: string) {
  return useQuery({
    queryKey: ['business-public', businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<BusinessPublic | null> => {
      const { data, error } = await supabase.rpc('business_public', { p_business_id: businessId! });
      if (error) throw error;
      return ((data ?? [])[0] as BusinessPublic | undefined) ?? null;
    },
  });
}
