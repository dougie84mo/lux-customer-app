import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

// Public barber profile (bio / experience / specialties), readable by any
// authenticated client through a definer RPC — it only returns a row if the
// user is a bookable provider of the business (migration 0048).
export type BarberProfile = {
  id: string;
  name: string;
  avatar_path: string | null;
  bio: string | null;
  years_experience: number | null;
  specialties: string[];
};

export function useBarberProfile(businessId?: string, userId?: string) {
  return useQuery({
    queryKey: ['barber-profile', businessId, userId],
    enabled: !!businessId && !!userId,
    queryFn: async (): Promise<BarberProfile | null> => {
      const { data, error } = await supabase.rpc('get_bookable_provider_profile', {
        p_business_id: businessId!,
        p_user_id: userId!,
      });
      if (error) throw error;
      return (data?.[0] as BarberProfile) ?? null;
    },
  });
}
