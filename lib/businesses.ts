import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

export type BusinessMembershipRow = {
  id: string;
  business_id: string;
  role: 'OWNER' | 'MANAGER' | 'EMPLOYEE' | 'ADMIN';
  is_active: boolean;
  permissions: string[];
  business: {
    id: string;
    name: string;
    type: 'BARBER' | 'SALON' | 'SPA';
    logo_url: string | null;
  } | null;
};

export type BusinessRow = {
  id: string;
  name: string;
  type: 'BARBER' | 'SALON' | 'SPA';
  logo_url: string | null;
  description: string | null;
  // Cancellation / no-show policy (migration 0044). Fees are saved now but only
  // charged once the payments slice ships.
  cancellation_window_hours: number | null;
  no_show_fee: number;
  late_cancel_fee: number;
  cancellation_policy: string | null;
};

export function useBusiness(businessId: string | undefined) {
  return useQuery({
    queryKey: ['business', businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<BusinessRow | null> => {
      const { data, error } = await supabase
        .from('businesses')
        .select(
          'id, name, type, logo_url, description, cancellation_window_hours, no_show_fee, late_cancel_fee, cancellation_policy',
        )
        .eq('id', businessId!)
        .maybeSingle();
      if (error) throw error;
      return data as BusinessRow | null;
    },
  });
}

// Update just the booking policy (separate from profile basics). Server enforces
// the window in the client cancel/reschedule RPCs.
export function useUpdateBookingPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      cancellationWindowHours: number | null;
      noShowFee: number;
      lateCancelFee: number;
      cancellationPolicy: string | null;
    }) => {
      const { error } = await supabase
        .from('businesses')
        .update({
          cancellation_window_hours: input.cancellationWindowHours,
          no_show_fee: input.noShowFee,
          late_cancel_fee: input.lateCancelFee,
          cancellation_policy: input.cancellationPolicy?.trim() || null,
        })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['business', vars.id] });
      qc.invalidateQueries({ queryKey: ['business-booking-policy', vars.id] });
    },
  });
}

export function useUpdateBusiness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      name: string;
      type: 'BARBER' | 'SALON' | 'SPA';
      logoUrl?: string | null;
      description?: string | null;
    }) => {
      const { error } = await supabase
        .from('businesses')
        .update({
          name: input.name.trim(),
          type: input.type,
          logo_url: input.logoUrl?.trim() || null,
          description: input.description?.trim() || null,
        })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['business', vars.id] });
      qc.invalidateQueries({ queryKey: ['memberships'] });
    },
  });
}

export function useMyMemberships(userId: string | undefined) {
  return useQuery({
    queryKey: ['memberships', userId],
    enabled: !!userId,
    queryFn: async (): Promise<BusinessMembershipRow[]> => {
      const { data, error } = await supabase
        .from('business_memberships')
        .select(
          'id, business_id, role, is_active, permissions, business:businesses(id, name, type, logo_url)',
        )
        .eq('user_id', userId!)
        .eq('is_active', true);
      if (error) throw error;
      return (data ?? []) as unknown as BusinessMembershipRow[];
    },
  });
}
