import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { SupportCategory } from './schemas';

// Contact support from inside the app. submit_support_ticket (0208, owned by
// ../app) is the help hub's ticket form endpoint; it validates everything
// again server-side and files the row in LUX's support queue. My requests
// reads the sender's own rows back through my_support_requests (0267).

/** Tells the support queue which app a ticket came from. */
export const SUPPORT_SOURCE_URL = 'app://booking/support';

export type SupportTicketInput = {
  category: SupportCategory;
  name: string;
  email: string;
  phone: string;
  message: string;
  lang: string;
  // "section/slug" of the help article the ticket was opened from.
  articleSlug?: string | null;
};

export type SupportRequestState = 'new' | 'answered' | 'resolved';

/** One message the signed-in person sent to support, as they may see it. The
 *  console's notes, assignee and working statuses never leave the server. */
export type SupportRequest = {
  id: string;
  created_at: string;
  category: string;
  message: string;
  /** The address the reply goes to (what they typed on the form). */
  email: string;
  state: SupportRequestState;
  answered_at: string | null;
};

/** The signed-in person's own support messages, newest first. */
export function useMySupportRequests(userId: string | undefined) {
  return useQuery({
    queryKey: ['support-requests', userId],
    enabled: !!userId,
    queryFn: async (): Promise<SupportRequest[]> => {
      const { data, error } = await supabase.rpc('my_support_requests');
      if (error) throw error;
      return (data ?? []) as SupportRequest[];
    },
  });
}

export function useSubmitSupportTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['support-requests'] }),
    mutationFn: async (input: SupportTicketInput): Promise<string> => {
      const { data, error } = await supabase.rpc('submit_support_ticket', {
        p_name: input.name,
        p_email: input.email,
        p_message: input.message,
        p_category: input.category,
        p_phone: input.phone || null,
        p_business_name: null,
        p_device_code: null,
        p_firmware_version: null,
        p_source_url: SUPPORT_SOURCE_URL,
        p_article_slug: input.articleSlug || null,
        p_lang: input.lang,
      });
      if (error) throw error;
      return data as string;
    },
  });
}
