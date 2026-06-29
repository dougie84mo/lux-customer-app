import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

// Postgres Realtime subscriptions for the device control plane.
//
// Strategy: we invalidate React Query caches on Realtime events rather than
// patching cache data directly. That round-trips one extra fetch (~50ms)
// but avoids drift if the row shape ever changes — useQuery owns the source
// of truth.
//
// All three tables (`devices`, `device_commands`) are in the
// `supabase_realtime` publication, added in migration
// `0008_device_command_modes.sql`.
//
// We keep a long polling fallback (60s) on the query hooks themselves so
// the UI recovers if a channel drops events during reconnection — Realtime
// is at-most-once delivery on transient disconnects.

// Tears down any pre-existing channel registered under the same topic.
//
// supabase-js keys channels by topic in an internal registry, and React 19
// can reconnect a screen's effects (offscreen tab unhide, fast refresh)
// without first running the prior cleanup. When that happens,
// `supabase.channel(topic)` returns the still-subscribed instance, and
// adding listeners with `.on('postgres_changes', …)` throws
// "cannot add postgres_changes callbacks … after `subscribe()`".
// Removing by topic first guarantees we always start from a fresh channel.
export function removeChannelByTopic(topic: string) {
  // Channel.topic is stored with a `realtime:` prefix internally.
  const fullTopic = `realtime:${topic}`;
  for (const ch of supabase.getChannels()) {
    if (ch.topic === fullTopic) supabase.removeChannel(ch);
  }
}

// Subscribe to UPDATE events on a single device row. Used by the device
// detail screen so `current_mode`, health metrics, and status reflect
// firmware writes instantly.
export function useRealtimeDevice(deviceId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!deviceId) return;
    const topic = `device:${deviceId}`;
    removeChannelByTopic(topic);
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'devices',
          filter: `id=eq.${deviceId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['device', deviceId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId, qc]);
}

// Subscribe to every device row for one business. One channel per business
// is cheaper than one per device when listing many — used by the fleet
// list and the dashboard quick-access strip. Listens to INSERT/UPDATE/DELETE
// since a newly-paired device or an unpaired (archived) one should also
// reflect in the list.
export function useRealtimeBusinessDevices(businessId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!businessId) return;
    const topic = `business-devices:${businessId}`;
    removeChannelByTopic(topic);
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'devices',
          filter: `business_id=eq.${businessId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['devices', businessId] });
          qc.invalidateQueries({ queryKey: ['dashboard', businessId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId, qc]);
}

// Subscribe to booking_requests for one business so the staff inbox reflects
// new client requests and status changes live. Added to the realtime
// publication in migration 0016.
export function useRealtimeBookingRequests(businessId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!businessId) return;
    const topic = `business-booking-requests:${businessId}`;
    removeChannelByTopic(topic);
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'booking_requests',
          filter: `business_id=eq.${businessId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['booking-requests', businessId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId, qc]);
}

// Subscribe to a business's own look_assets so the look library reflects
// server-side processing transitions live: an upload going uploaded →
// processing → ready | failed is written by the process-look-asset Edge
// Function (service role), and without this the manager would have to pull to
// refresh. Filters to the business's own rows (LUX-library rows are static and
// owner_business_id is null, so they never match — which is fine). Added to the
// realtime publication in migration 0022.
export function useRealtimeLookAssets(businessId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!businessId) return;
    const topic = `business-look-assets:${businessId}`;
    removeChannelByTopic(topic);
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'look_assets',
          filter: `owner_business_id=eq.${businessId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['look-assets', businessId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId, qc]);
}

// Subscribe to the caller's own notification feed (migration 0033) so the bell
// badge + notification center update the instant a booking lifecycle event fires.
export function useRealtimeNotifications(userId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const topic = `notifications:${userId}`;
    removeChannelByTopic(topic);
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['notifications', userId] });
          qc.invalidateQueries({ queryKey: ['notifications-unread', userId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}

// Subscribe to the client's own sales so payment status (pending → succeeded,
// refunds, fee charges) reflects live across receipts + the bookings list
// without polling. Invalidates the payment caches on any change. `sales` is in
// the `supabase_realtime` publication (added 2026-06-28). RLS already limits the
// client to its own sales; the `created_by` filter just keeps the channel quiet.
// The pay/deposit screens additionally poll (`waitForSaleResolved`) as the
// authoritative per-flow confirmation.
export function useRealtimeMySales(userId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const topic = `my-sales:${userId}`;
    removeChannelByTopic(topic);
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales',
          filter: `created_by=eq.${userId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['my-receipts'] });
          qc.invalidateQueries({ queryKey: ['my-booking-requests'] });
          qc.invalidateQueries({ queryKey: ['my-appointment-sale'] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}

// Subscribe to command rows for one device. INSERT covers new commands the
// phone enqueued (cross-device echo when multiple operators are looking at
// the same mirror); UPDATE covers status transitions written by firmware
// service-role (PENDING → DELIVERED → COMPLETED / FAILED).
export function useRealtimeDeviceCommands(deviceId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!deviceId) return;
    const topic = `device-commands:${deviceId}`;
    removeChannelByTopic(topic);
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'device_commands',
          filter: `device_id=eq.${deviceId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['device-commands', deviceId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId, qc]);
}
