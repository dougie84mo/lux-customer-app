import { useEffect } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { supabase } from './supabase';
import { removeChannelByTopic } from './realtime';

// One row in public.client_photos. Mirrors the migration 0009 schema.
export type ClientPhotoRow = {
  id: string;
  business_id: string;
  device_id: string | null;
  customer_id: string | null;
  appointment_id: string | null;
  command_id: string | null;
  storage_path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  taken_by: string | null;
  taken_at: string;
  notes: string | null;
  created_at: string;
};

const PHOTO_COLUMNS =
  'id, business_id, device_id, customer_id, appointment_id, command_id, ' +
  'storage_path, mime_type, width, height, bytes, taken_by, taken_at, notes, created_at';

export function usePhotosForDevice(deviceId: string | undefined, limit = 24) {
  return useQuery({
    queryKey: ['photos', 'device', deviceId, limit],
    enabled: !!deviceId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ClientPhotoRow[]> => {
      const { data, error } = await supabase
        .from('client_photos')
        .select(PHOTO_COLUMNS)
        .eq('device_id', deviceId!)
        .order('taken_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as ClientPhotoRow[];
    },
  });
}

export function usePhotosForCustomer(customerId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ['photos', 'customer', customerId, limit],
    enabled: !!customerId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ClientPhotoRow[]> => {
      const { data, error } = await supabase
        .from('client_photos')
        .select(PHOTO_COLUMNS)
        .eq('customer_id', customerId!)
        .order('taken_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as ClientPhotoRow[];
    },
  });
}

// Photos taken of the signed-in CLIENT. Migration 0026's RLS scopes
// client_photos rows to the caller's own customer records, so a plain select
// returns only the user's own photos. Pass a businessId to narrow to one salon.
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

export function usePhotosForBusiness(businessId: string | undefined, limit = 100) {
  return useQuery({
    queryKey: ['photos', 'business', businessId, limit],
    enabled: !!businessId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ClientPhotoRow[]> => {
      const { data, error } = await supabase
        .from('client_photos')
        .select(PHOTO_COLUMNS)
        .eq('business_id', businessId!)
        .order('taken_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as ClientPhotoRow[];
    },
  });
}

// Updates a photo row to assign it to a customer (or clear with null).
// Works under the existing manager-or-owner UPDATE policy on client_photos.
export function useAssignPhotoToCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      photoId: string;
      customerId: string | null;
    }) => {
      const { data, error } = await supabase
        .from('client_photos')
        .update({ customer_id: input.customerId })
        .eq('id', input.photoId)
        .select(PHOTO_COLUMNS)
        .single();
      if (error) throw error;
      return data as unknown as ClientPhotoRow;
    },
    onSuccess: (row, vars) => {
      qc.invalidateQueries({ queryKey: ['photos'] });
      if (vars.customerId) {
        qc.invalidateQueries({ queryKey: ['photos', 'customer', vars.customerId] });
      }
      if (row?.device_id) {
        qc.invalidateQueries({ queryKey: ['photos', 'device', row.device_id] });
      }
    },
  });
}

export function useUpdatePhotoNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { photoId: string; notes: string | null }) => {
      const { data, error } = await supabase
        .from('client_photos')
        .update({ notes: input.notes })
        .eq('id', input.photoId)
        .select(PHOTO_COLUMNS)
        .single();
      if (error) throw error;
      return data as unknown as ClientPhotoRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['photos'] });
    },
  });
}

export function useDeletePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photoId: string) => {
      // Storage blob is intentionally NOT deleted here — orphans are cheaper
      // than risking a half-deleted state. A cleanup-orphan-photos job sweeps
      // the bucket against the live row set on a schedule.
      const { error } = await supabase
        .from('client_photos')
        .delete()
        .eq('id', photoId);
      if (error) throw error;
      return photoId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['photos'] });
    },
  });
}

// Wraps createSignedUrl behind React Query so we don't re-issue a fresh URL
// for the same path on every re-render. Default 10-minute expiry — long
// enough to view, short enough that a leaked URL is low-impact.
export function useSignedPhotoUrl(storagePath: string | undefined, ttlSeconds = 600) {
  return useQuery({
    queryKey: ['photo-url', storagePath, ttlSeconds],
    enabled: !!storagePath,
    // Refresh ~30s before expiry.
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

// Realtime: any INSERT into client_photos for this device should pop the
// gallery without polling. Use alongside usePhotosForDevice.
export function useRealtimeDevicePhotos(deviceId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!deviceId) return;
    const topic = `device-photos:${deviceId}`;
    removeChannelByTopic(topic);
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_photos',
          filter: `device_id=eq.${deviceId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['photos', 'device', deviceId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId, qc]);
}
