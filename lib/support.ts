import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { SupportCategory } from './schemas';

// Contact support from inside the app. submit_support_ticket (0208, owned by
// ../app) is the help hub's ticket form endpoint; it validates everything
// again server-side and files the row in LUX's support queue. My requests
// reads the sender's own threads back (my_support_threads, my_support_thread,
// reply_to_support_request — 0268).

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

/** One request the signed-in person sent, as they may see it
 *  (my_support_threads, 0268). The console's notes, assignee and working
 *  statuses never leave the server. */
export type SupportThreadSummary = {
  id: string;
  created_at: string;
  category: string;
  /** Their first message. */
  message: string;
  /** The address the email copy of a reply goes to. */
  email: string;
  state: SupportRequestState;
  answered_at: string | null;
  last_activity_at: string;
  reply_count: number;
  /** A LUX Support reply they haven't opened yet. */
  unread: boolean;
};

export type SupportThreadMessage = {
  id: string;
  /** 'staff' shows as "LUX Support"; staff names never reach the phone. */
  author: 'staff' | 'member';
  body: string;
  created_at: string;
};

export type SupportThread = {
  id: string;
  created_at: string;
  category: string;
  email: string;
  state: SupportRequestState;
  /** Oldest first; the first entry is their original message. */
  messages: SupportThreadMessage[];
};

/** The signed-in person's own requests, most recent activity first. */
export function useMySupportThreads(userId: string | undefined) {
  return useQuery({
    queryKey: ['support-requests', userId],
    enabled: !!userId,
    queryFn: async (): Promise<SupportThreadSummary[]> => {
      const { data, error } = await supabase.rpc('my_support_threads');
      if (error) throw error;
      return (data ?? []) as SupportThreadSummary[];
    },
  });
}

/** How many requests have a reply they haven't opened (the badge on My requests). */
export function useUnreadSupportCount(userId: string | undefined): number {
  const { data } = useMySupportThreads(userId);
  return (data ?? []).filter((r) => r.unread).length;
}

/** One thread. Reading it marks it read on the server, so the list is
 *  refreshed after every load — and it must only load while the person is
 *  looking at it (`active`): tab screens stay mounted, and a background
 *  refetch would mark a new reply read before anyone saw it. */
export function useSupportThread(requestId: string | undefined, active: boolean) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['support-thread', requestId],
    enabled: !!requestId && active,
    queryFn: async (): Promise<SupportThread> => {
      const { data, error } = await supabase.rpc('my_support_thread', { p_request_id: requestId! });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['support-requests'] });
      return data as SupportThread;
    },
  });
}

/** Write back on a request. Answering an answered or resolved request
 *  reopens it for LUX Support. */
export function useReplyToSupportRequest(requestId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string): Promise<string> => {
      const { data, error } = await supabase.rpc('reply_to_support_request', {
        p_request_id: requestId!,
        p_body: body,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-thread', requestId] });
      queryClient.invalidateQueries({ queryKey: ['support-requests'] });
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
