// Mirror photo consent — client side (migrations 0165–0173 in ../app/supabase).
//
// A LUX mirror may photograph you only at a shop whose owner has accepted the
// photo terms AND where you have agreed: the checkbox when you book (0168),
// the switch in Settings › Mirror photos (record_customer_photo_consent), or
// in person to the shop's staff. You can withdraw per shop at any time and
// delete any photo of yourself (0172). The server refuses a capture without a
// current consent; these hooks only read state and call the RPCs.
//
// PHOTO_CONSENT_VERSION must equal photo_consent_version() in the database.
// Bump both in the same release that changes the wording below.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

export const PHOTO_CONSENT_VERSION = '2026-09-05';

// The one sentence the client agrees to. Kept short on purpose — the detail is
// in the privacy policy, which the card links to.
export function photoConsentSentence(shopName: string | null | undefined): string {
  const shop = shopName?.trim() || 'this salon';
  return `I agree that ${shop} may take my photo with the LUX mirror and keep it in my LUX photos.`;
}

export type MyPhotoConsent = {
  business_id: string;
  business_name: string;
  customer_id: string;
  consent_id: string | null;
  consent_version: string | null;
  granted_at: string | null;
  source: 'booking' | 'client_app' | 'staff' | null;
  is_current: boolean;
};

// Every shop that has capture enabled where the caller has a client record,
// with whether their consent is current there.
export function useMyPhotoConsents() {
  return useQuery({
    queryKey: ['my-photo-consents'],
    queryFn: async (): Promise<MyPhotoConsent[]> => {
      const { data, error } = await supabase.rpc('my_photo_consents');
      if (error) throw error;
      return (data ?? []) as MyPhotoConsent[];
    },
  });
}

export function useGrantPhotoConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { customerId: string }) => {
      const { error } = await supabase.rpc('record_customer_photo_consent', {
        p_customer_id: input.customerId,
        p_source: 'client_app',
        p_consent_version: PHOTO_CONSENT_VERSION,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-photo-consents'] });
    },
  });
}

export function useRevokePhotoConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { customerId: string }) => {
      const { error } = await supabase.rpc('revoke_customer_photo_consent', {
        p_customer_id: input.customerId,
        p_reason: 'client_revoked',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-photo-consents'] });
    },
  });
}

// Delete a photo of yourself. Object first (storage policy "client-photos
// delete own client" needs the row to still exist), then the row
// (client_photos_delete_own_client). If the object removal fails the row
// still goes, which already makes the object unreadable; the nightly sweeper
// reaps the orphan.
export function useDeleteMyPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { photoId: string; storagePath: string }) => {
      try {
        await supabase.storage.from('client-photos').remove([input.storagePath]);
      } catch {
        // see above — the row delete is what matters
      }
      const { error } = await supabase.from('client_photos').delete().eq('id', input.photoId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-photos'] });
    },
  });
}

// Delete every photo of yourself at one shop (Settings › Mirror photos).
export function useDeleteMyPhotosAtBusiness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { businessId: string }) => {
      const { data, error } = await supabase
        .from('client_photos')
        .select('id, storage_path')
        .eq('business_id', input.businessId);
      if (error) throw error;
      const rows = (data ?? []) as { id: string; storage_path: string }[];
      if (rows.length === 0) return 0;
      try {
        await supabase.storage.from('client-photos').remove(rows.map((r) => r.storage_path));
      } catch {
        // see useDeleteMyPhoto
      }
      const { error: delErr } = await supabase
        .from('client_photos')
        .delete()
        .in('id', rows.map((r) => r.id));
      if (delErr) throw delErr;
      return rows.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-photos'] });
    },
  });
}
