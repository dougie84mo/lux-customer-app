import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

// Client reviews of a barber after a COMPLETED appointment (migration 0049).
// Ratings/reviews are public; submitting is gated server-side to the caller's
// own completed appointment.
export type Review = {
  id: string;
  rating: number;
  body: string | null;
  reviewer_name: string;
  created_at: string;
};

export function useMemberReviews(businessId?: string, memberId?: string) {
  return useQuery({
    queryKey: ['member-reviews', businessId, memberId],
    enabled: !!businessId && !!memberId,
    queryFn: async (): Promise<Review[]> => {
      const { data, error } = await supabase.rpc('get_member_reviews', {
        p_business_id: businessId!,
        p_member_id: memberId!,
      });
      if (error) throw error;
      return (data ?? []) as Review[];
    },
  });
}

export function useMemberRating(businessId?: string, memberId?: string) {
  return useQuery({
    queryKey: ['member-rating', businessId, memberId],
    enabled: !!businessId && !!memberId,
    queryFn: async (): Promise<{ avg_rating: number | null; review_count: number }> => {
      const { data, error } = await supabase.rpc('get_member_rating', {
        p_business_id: businessId!,
        p_member_id: memberId!,
      });
      if (error) throw error;
      return (data?.[0] as { avg_rating: number | null; review_count: number }) ?? {
        avg_rating: null,
        review_count: 0,
      };
    },
  });
}

export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      appointmentId: string;
      rating: number;
      body?: string | null;
      businessId: string;
      memberId: string;
    }) => {
      const { error } = await supabase.rpc('submit_review', {
        p_appointment_id: input.appointmentId,
        p_rating: input.rating,
        p_body: input.body ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['member-reviews', v.businessId, v.memberId] });
      qc.invalidateQueries({ queryKey: ['member-rating', v.businessId, v.memberId] });
    },
  });
}
