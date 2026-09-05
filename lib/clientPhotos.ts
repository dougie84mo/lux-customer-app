import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

// One row in public.client_photos as the CLIENT sees it. Read access comes
// from migration 0026 (photos linked to a customer record you own); the
// consent columns are 0169. This file used to be a byte copy of the business
// app's lib/clientPhotos.ts, manager hooks included — those never worked here
// (RLS) and were removed with the consent work; client actions live in
// lib/photoConsent.ts.
export type ClientPhotoRow = {
  id: string;
  business_id: string;
  device_id: string | null;
  customer_id: string | null;
  appointment_id: string | null;
  storage_path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  taken_at: string;
  notes: string | null;
  created_at: string;
  consent_id: string | null;
  consent_version: string | null;
};

const PHOTO_COLUMNS =
  'id, business_id, device_id, customer_id, appointment_id, storage_path, mime_type, ' +
  'width, height, bytes, taken_at, notes, created_at, consent_id, consent_version';

// Photos taken of the signed-in CLIENT. Pass a businessId to narrow to one salon.
export function useMyPhotos(businessId?: string, limit = 100) {
  return useQuery({
    queryKey: ['my-photos', businessId ?? 'all', limit],
    queryFn: async (): Promise<ClientPhotoRow[]> => {
      let q = supabase
        .from('client_photos')
        .select(PHOTO_COLUMNS)
        .order('taken_at', { ascending: false })
        .limit(limit);
      if (businessId) q = q.eq('business_id', businessId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ClientPhotoRow[];
    },
  });
}

// Wraps createSignedUrl behind React Query so we don't re-issue a fresh URL
// for the same path on every re-render. Default 10-minute expiry.
export function useSignedPhotoUrl(storagePath: string | undefined, ttlSeconds = 600) {
  return useQuery({
    queryKey: ['photo-url', storagePath, ttlSeconds],
    enabled: !!storagePath,
    staleTime: (ttlSeconds - 30) * 1000,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .storage
        .from('client-photos')
        .createSignedUrl(storagePath!, ttlSeconds);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}
