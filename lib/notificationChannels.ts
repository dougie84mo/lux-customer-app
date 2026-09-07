import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

// Per-user push/email notification preferences (migration 0159 in ../app/supabase).
//
// Same table and hooks as the business app's lib/notificationChannels.ts —
// keep the two files in step. The row is keyed by USER: a client who also
// works at a salon has one set of switches, not two. The client app only
// shows the two categories that ever reach a client (booking activity and
// appointment reminders); the payments / payroll columns stay at their
// defaults and are never surfaced here.
export type NotificationCategory = 'bookings' | 'reminders' | 'payments' | 'payroll';

export type UserNotificationChannels = {
  push_bookings: boolean;
  push_reminders: boolean;
  push_payments: boolean;
  push_payroll: boolean;
  email_bookings: boolean;
  email_reminders: boolean;
  email_payments: boolean;
  email_payroll: boolean;
  email_product: boolean;
};

export const DEFAULT_NOTIFICATION_CHANNELS: UserNotificationChannels = {
  push_bookings: true,
  push_reminders: true,
  push_payments: true,
  push_payroll: true,
  email_bookings: true,
  email_reminders: true,
  email_payments: true,
  email_payroll: true,
  email_product: false,
};

const CHANNEL_SELECT =
  'push_bookings, push_reminders, push_payments, push_payroll, email_bookings, email_reminders, email_payments, email_payroll, email_product';

// The rows shown on the App and Email tabs of Settings › Notifications, in
// the client's words. The senders (notify-booking-*, the reminder cron) filter
// on exactly these keys.
export const CLIENT_NOTIFICATION_CATEGORIES: {
  key: Extract<NotificationCategory, 'bookings' | 'reminders'>;
  title: string;
  description: string;
  icon: string;
}[] = [
  {
    key: 'bookings',
    title: 'Booking activity',
    description: 'Request received, confirmed, declined, cancelled or changed by the salon',
    icon: 'calendar-check',
  },
  {
    key: 'reminders',
    title: 'Appointment reminders',
    description: 'Before an appointment you booked',
    icon: 'bell-ring-outline',
  },
];

export function useUserNotificationChannels(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-notification-channels', userId],
    enabled: !!userId,
    queryFn: async (): Promise<UserNotificationChannels> => {
      const { data, error } = await supabase
        .from('user_notification_channels')
        .select(CHANNEL_SELECT)
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? DEFAULT_NOTIFICATION_CHANNELS;
    },
  });
}

export function useUpsertUserNotificationChannels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; settings: UserNotificationChannels }) => {
      const { error } = await supabase.from('user_notification_channels').upsert(
        {
          user_id: input.userId,
          ...input.settings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
    },
    onMutate: async (vars) => {
      const key = ['user-notification-channels', vars.userId];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<UserNotificationChannels>(key);
      qc.setQueryData(key, vars.settings);
      return { previous, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['user-notification-channels', vars.userId] });
    },
  });
}

// Push tokens registered for this account — one row per install. Shown on the
// App tab so the client can tell whether the phone in their hand will ring.
export type PushTokenRow = {
  id: string;
  platform: string;
  device_name: string | null;
  last_used_at: string;
};

export function useMyPushTokens(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-push-tokens', userId],
    enabled: !!userId,
    queryFn: async (): Promise<PushTokenRow[]> => {
      const { data, error } = await supabase
        .from('user_push_tokens')
        .select('id, platform, device_name, last_used_at')
        .eq('user_id', userId!)
        .order('last_used_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PushTokenRow[];
    },
  });
}
