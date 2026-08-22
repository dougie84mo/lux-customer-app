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

// Whether this business's plan lets it take NEW bookings (migration 0120's
// business_booking_enabled, surfaced to the client by 0126).
//
// Needed as its own read because business_public() returns null for THREE
// different reasons — no active service, no active location, or no booking
// entitlement — and the profile screen has to tell a client "this business
// doesn't take bookings through LUX" rather than a bare "not available". It
// also can't infer it from a null: discovery passes the name and type as route
// params, so the screen renders a complete-looking profile either way.
//
// Undefined while loading is treated as bookable by callers, so the primary CTA
// doesn't flicker. That is safe to be optimistic about: the real enforcement is
// the BEFORE INSERT trigger from 0120, not this.
export function useBusinessBookingEnabled(businessId?: string) {
  return useQuery({
    queryKey: ['business-booking-enabled', businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('business_booking_enabled', {
        b_id: businessId!,
      });
      if (error) throw error;
      return data !== false;
    },
  });
}
