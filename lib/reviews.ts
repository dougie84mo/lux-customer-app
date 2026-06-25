import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
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

// A review tagged with the team member it's for — used for the business-wide
// ("location wide") reviews list, where each entry shows which barber it's about.
export type BusinessReview = Review & { member_id: string; member_name: string };

// Location-wide reviews: fan out get_member_reviews across every bookable member
// and merge newest-first. No business-wide RPC exists yet, so we aggregate the
// per-member ones we already have. A distinct query key keeps the tagged shape
// from colliding with useMemberReviews' plain Review cache.
export function useBusinessReviews(
  businessId: string | undefined,
  members: { id: string; name: string }[],
) {
  const results = useQueries({
    queries: members.map((m) => ({
      queryKey: ['member-reviews-tagged', businessId, m.id],
      enabled: !!businessId,
      queryFn: async (): Promise<BusinessReview[]> => {
        const { data, error } = await supabase.rpc('get_member_reviews', {
          p_business_id: businessId!,
          p_member_id: m.id,
        });
        if (error) throw error;
        return ((data ?? []) as Review[]).map((r) => ({
          ...r,
          member_id: m.id,
          member_name: m.name,
        }));
      },
    })),
  });
  const isLoading = results.some((r) => r.isLoading);
  const reviews = results
    .flatMap((r) => r.data ?? [])
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return { reviews, isLoading };
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
