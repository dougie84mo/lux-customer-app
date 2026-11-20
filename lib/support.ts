import { useMutation } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { SupportCategory } from './schemas';

// Contact support from inside the app. submit_support_ticket (0208, owned by
// ../app) is the help hub's ticket form endpoint; it validates everything
// again server-side and files the row in LUX's support queue. Nothing in the
// app reads tickets back, so there is no cache to invalidate.

/** Tells the support queue which app a ticket came from. */
export const SUPPORT_SOURCE_URL = 'app://booking/support';

export type SupportTicketInput = {
  category: SupportCategory;
  name: string;
  email: string;
  phone: string;
  message: string;
  lang: string;
};

export function useSubmitSupportTicket() {
  return useMutation({
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
        p_article_slug: null,
        p_lang: input.lang,
      });
      if (error) throw error;
      return data as string;
    },
  });
}
