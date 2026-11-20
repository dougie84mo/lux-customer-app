// Walk-in requests — client side (migration 0244 in ../app/supabase).
//
// Someone standing in the shop picks a service, sees each barber's estimated
// wait, and sends a request a barber accepts or declines within 10 minutes.
// Every write is a definer RPC; walk_in_requests is readable by its requester
// under RLS and is in the realtime publication. Pure logic: ./walkInLogic.

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { removeChannelByTopic } from './realtime';
import { supabase } from './supabase';
import type { MyWalkInRequest, WalkInBoardRow } from './walkInLogic';

export type { MyWalkInRequest, WalkInBoardRow, WalkInStatus } from './walkInLogic';

const MY_REQUESTS_KEY = ['my-walk-in-requests'] as const;

// False = the shop has walk-ins off (or is not bookable): hide the feature.
export function useBusinessAcceptsWalkIns(businessId: string | undefined) {
  return useQuery({
    queryKey: ['business-accepts-walk-ins', businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('business_accepts_walk_ins_public', {
        p_business_id: businessId!,
      });
      if (error) throw error;
      return data === true;
    },
  });
}

// One row per barber taking walk-ins, shortest wait first. The wait depends on
// the service's duration, so the service id is part of the key. Pass `poll`
// while the board is on screen (20s).
export function useWalkInBoard(
  businessId: string | undefined,
  serviceId: string | undefined,
  opts: { poll?: boolean } = {},
) {
  return useQuery({
    queryKey: ['walk-in-board', businessId, serviceId ?? null],
    enabled: !!businessId && !!serviceId,
    queryFn: async (): Promise<WalkInBoardRow[]> => {
      const { data, error } = await supabase.rpc('walk_in_board_public', {
        p_business_id: businessId!,
        p_service_id: serviceId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as WalkInBoardRow[];
    },
    refetchInterval: opts.poll ? 20_000 : false,
    staleTime: 0,
  });
}

// The caller's walk-in requests from the last 30 days. Realtime
// (useRealtimeMyWalkIns) carries status changes; with `poll` it also refetches
// every 5s while one is PENDING, which is what turns an unanswered request
// into EXPIRED on screen.
export function useMyWalkInRequests(opts: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: MY_REQUESTS_KEY,
    queryFn: async (): Promise<MyWalkInRequest[]> => {
      const { data, error } = await supabase.rpc('my_walk_in_requests');
      if (error) throw error;
      return (data ?? []) as MyWalkInRequest[];
    },
    refetchInterval: (query) =>
      opts.poll && (query.state.data ?? []).some((r) => r.status === 'PENDING') ? 5_000 : false,
  });
}

// employeeId omitted = any barber. Server errors are readable English
// ("You already have an open walk-in request at this shop.") — show message.
export function useRequestWalkIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { businessId: string; serviceId: string; employeeId?: string | null }) => {
      const { data, error } = await supabase.rpc('request_walk_in', {
        p_business_id: input.businessId,
        p_service_id: input.serviceId,
        p_employee_id: input.employeeId ?? null,
      });
      if (error) throw error;
      return data as string; // request id
    },
    onSettled: () => {
      // Settled, not success: "already have an open request" means the list is stale.
      qc.invalidateQueries({ queryKey: MY_REQUESTS_KEY });
      qc.invalidateQueries({ queryKey: ['walk-in-board'] });
    },
  });
}

// Works while PENDING, or ACCEPTED before the visit starts. Resolves false
// when the server refused (already in the chair, already answered).
export function useCancelWalkInRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string): Promise<boolean> => {
      const { data, error } = await supabase.rpc('cancel_walk_in_request', { p_request_id: requestId });
      if (error) throw error;
      return data === true;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: MY_REQUESTS_KEY });
      qc.invalidateQueries({ queryKey: ['walk-in-board'] });
    },
  });
}

// Live status for the caller's own requests. Mounted once, in the
// authenticated layout — two mounts would share one topic and tear each other
// down (see removeChannelByTopic).
export function useRealtimeMyWalkIns(userId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const topic = `my-walk-ins:${userId}`;
    removeChannelByTopic(topic);
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'walk_in_requests',
          filter: `requester_user_id=eq.${userId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: MY_REQUESTS_KEY });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}
