import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

// Loyalty program display (migration 0050). Redemption/discount itself ships
// with payments — this is display-only.

export type LoyaltyProgram = {
  is_active: boolean;
  reward_every: number;
  reward_percent: number;
  description: string | null;
};

export type MyLoyalty = {
  completed_visits: number;
  rewards_redeemed: number;
  reward_every: number;
  reward_percent: number;
  is_active: boolean;
};

export function useLoyaltyProgram(businessId?: string) {
  return useQuery({
    queryKey: ['loyalty-program', businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<LoyaltyProgram | null> => {
      const { data, error } = await supabase.rpc('get_loyalty_program_public', {
        p_business_id: businessId!,
      });
      if (error) throw error;
      return (data?.[0] as LoyaltyProgram) ?? null;
    },
  });
}

export function useMyLoyalty(businessId?: string) {
  return useQuery({
    queryKey: ['my-loyalty', businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<MyLoyalty | null> => {
      const { data, error } = await supabase.rpc('get_my_loyalty', {
        p_business_id: businessId!,
      });
      if (error) throw error;
      return (data?.[0] as MyLoyalty) ?? null;
    },
  });
}
