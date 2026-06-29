import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { BookingService } from './booking';

// weekday: 0 = Sunday … 6 = Saturday (matches Postgres extract(dow)).
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type ScheduleDay = {
  id: string;
  business_id: string;
  user_id: string;
  weekday: number;
  is_working: boolean;
  start_time: string; // 'HH:MM:SS'
  end_time: string;
};

export type BookableProvider = { id: string; name: string; avatar_path?: string | null };

// Sentinel for the "Any available" provider choice in the booking UI. The
// request is stored with preferred_employee_id = null; staff assign the actual
// provider at confirm (the clash check in respond_to_booking_request enforces
// the chosen provider is free).
export const ANY_PROVIDER_ID = '__any__';

// ---------------------------------------------------------------------------
// Schedule read / write (staff side)
// ---------------------------------------------------------------------------
export function useStaffSchedule(businessId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ['staff-schedule', businessId, userId],
    enabled: !!businessId && !!userId,
    queryFn: async (): Promise<ScheduleDay[]> => {
      const { data, error } = await supabase
        .from('staff_schedules')
        .select('id, business_id, user_id, weekday, is_working, start_time, end_time')
        .eq('business_id', businessId!)
        .eq('user_id', userId!)
        .order('weekday');
      if (error) throw error;
      return (data ?? []) as ScheduleDay[];
    },
  });
}

export function useUpsertScheduleDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      businessId: string;
      userId: string;
      weekday: number;
      isWorking: boolean;
      startTime: string; // 'HH:MM'
      endTime: string;
    }) => {
      const { error } = await supabase.from('staff_schedules').upsert(
        {
          business_id: input.businessId,
          user_id: input.userId,
          weekday: input.weekday,
          is_working: input.isWorking,
          start_time: input.startTime,
          end_time: input.endTime,
        },
        { onConflict: 'business_id,user_id,weekday' },
      );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['staff-schedule', vars.businessId, vars.userId] });
    },
  });
}

// Convenience: stamp a default Mon-Fri 9-5 week for a member.
export function useApplyDefaultSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { businessId: string; userId: string }) => {
      const rows = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        business_id: input.businessId,
        user_id: input.userId,
        weekday,
        is_working: weekday >= 1 && weekday <= 5,
        start_time: '09:00',
        end_time: '17:00',
      }));
      const { error } = await supabase
        .from('staff_schedules')
        .upsert(rows, { onConflict: 'business_id,user_id,weekday' });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['staff-schedule', vars.businessId, vars.userId] });
    },
  });
}

// Owner grants/revokes a member's right to edit their own schedule.
export function useSetScheduleAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { membershipId: string; allowed: boolean; businessId: string }) => {
      const { error } = await supabase
        .from('business_memberships')
        .update({ can_manage_own_schedule: input.allowed })
        .eq('id', input.membershipId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['team-members', vars.businessId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Schedule exceptions / time off (migration 0038) + per-member booking horizon
// ---------------------------------------------------------------------------
export type ExceptionRecurrence = 'once' | 'weekly' | 'monthly_nth' | 'monthly_dom';

export type ScheduleException = {
  id: string;
  business_id: string;
  user_id: string;
  recurrence: ExceptionRecurrence;
  start_date: string;          // YYYY-MM-DD ('once': range start; recurring: "from")
  end_date: string | null;     // 'once': range end (null=single day); recurring: "until"
  weekday: number | null;      // 0=Sun..6=Sat (weekly / monthly_nth)
  nth: number | null;          // monthly_nth: 1..5, or -1 = last
  month_days: number[] | null; // monthly_dom: day-of-month numbers (1..31)
  note: string | null;
  created_at: string;
};

export function useScheduleExceptions(
  businessId: string | undefined,
  userId: string | undefined,
) {
  return useQuery({
    queryKey: ['schedule-exceptions', businessId, userId],
    enabled: !!businessId && !!userId,
    queryFn: async (): Promise<ScheduleException[]> => {
      const { data, error } = await supabase
        .from('schedule_exceptions')
        .select('id, business_id, user_id, recurrence, start_date, end_date, weekday, nth, month_days, note, created_at')
        .eq('business_id', businessId!)
        .eq('user_id', userId!)
        .order('start_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ScheduleException[];
    },
  });
}

export type NewScheduleException = {
  businessId: string;
  userId: string;
  recurrence: ExceptionRecurrence;
  startDate: string;
  endDate?: string | null;
  weekday?: number | null;
  nth?: number | null;
  monthDays?: number[] | null;
  note?: string | null;
};

// Availability cache keys to drop whenever a member's time off / horizon changes.
function invalidateAvailability(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['available-days'] });
  qc.invalidateQueries({ queryKey: ['available-slots'] });
  qc.invalidateQueries({ queryKey: ['available-days-any'] });
  qc.invalidateQueries({ queryKey: ['available-slots-any'] });
}

export function useAddScheduleException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewScheduleException) => {
      const { error } = await supabase.from('schedule_exceptions').insert({
        business_id: input.businessId,
        user_id: input.userId,
        recurrence: input.recurrence,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        weekday: input.weekday ?? null,
        nth: input.nth ?? null,
        month_days: input.monthDays ?? null,
        note: input.note?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['schedule-exceptions', vars.businessId, vars.userId] });
      invalidateAvailability(qc);
    },
  });
}

export function useDeleteScheduleException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; businessId: string; userId: string }) => {
      const { error } = await supabase.from('schedule_exceptions').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['schedule-exceptions', vars.businessId, vars.userId] });
      invalidateAvailability(qc);
    },
  });
}

// Per-member booking horizon (business_memberships.max_booking_horizon_days).
// null = no limit (the booking UI's default lookahead applies).
export function useSetBookingHorizon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { membershipId: string; days: number | null; businessId: string }) => {
      const { error } = await supabase
        .from('business_memberships')
        .update({ max_booking_horizon_days: input.days })
        .eq('id', input.membershipId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['team-members', vars.businessId] });
      invalidateAvailability(qc);
    },
  });
}

// Dormant dev helper — no longer wired to any screen (the seeded mock
// providers are now standing seed data). Kept (and the function deployed) in
// case mock providers are needed again. Note: re-running creates NEW members
// (random emails), it doesn't reset the existing ones.
export function useSeedMockTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { businessId: string; count?: number }) => {
      const { data, error } = await supabase.functions.invoke('seed-mock-team', {
        body: { business_id: input.businessId, count: input.count },
      });
      if (error) throw error;
      return data as { ok: true; created: { id: string; name: string }[] };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['team-members', vars.businessId] });
      qc.invalidateQueries({ queryKey: ['employees', vars.businessId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Per-member slot timing (migration 0044): the interval bookable times appear
// on + a buffer between appointments. null interval = the 30-min default.
// ---------------------------------------------------------------------------
export type MemberBookingSettings = {
  slot_interval_minutes: number | null;
  buffer_minutes: number;
};

export const SLOT_INTERVAL_OPTIONS = [5, 10, 15, 20, 30, 60];
export const BUFFER_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60];

export function useMemberBookingSettings(
  businessId: string | undefined,
  userId: string | undefined,
) {
  return useQuery({
    queryKey: ['member-booking-settings', businessId, userId],
    enabled: !!businessId && !!userId,
    queryFn: async (): Promise<MemberBookingSettings> => {
      const { data, error } = await supabase
        .from('member_booking_settings')
        .select('slot_interval_minutes, buffer_minutes')
        .eq('business_id', businessId!)
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      // No row yet → defaults (30-min interval, no buffer).
      return data ?? { slot_interval_minutes: null, buffer_minutes: 0 };
    },
  });
}

export function useUpsertMemberBookingSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      businessId: string;
      userId: string;
      slotIntervalMinutes: number | null;
      bufferMinutes: number;
    }) => {
      const { error } = await supabase.from('member_booking_settings').upsert(
        {
          business_id: input.businessId,
          user_id: input.userId,
          slot_interval_minutes: input.slotIntervalMinutes,
          buffer_minutes: input.bufferMinutes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'business_id,user_id' },
      );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['member-booking-settings', vars.businessId, vars.userId] });
      invalidateAvailability(qc);
    },
  });
}

// ---------------------------------------------------------------------------
// Booking-side: providers + available slots
// ---------------------------------------------------------------------------
export function useBookableProviders(businessId: string | undefined) {
  return useQuery({
    queryKey: ['bookable-providers', businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<BookableProvider[]> => {
      // v2 (0043) adds avatar_path so the picker can show provider faces.
      const { data, error } = await supabase.rpc('bookable_providers_v2', {
        p_business_id: businessId!,
        p_service_id: null,
      });
      if (error) throw error;
      return (data ?? []) as BookableProvider[];
    },
  });
}

// Providers capable of a given service (member_services, migration 0037).
// Falls back to all bookable providers semantics server-side: a member with no
// capabilities set can do everything. Use this in the booking provider picker.
export function useBookableProvidersForService(
  businessId: string | undefined,
  serviceId: string | undefined,
) {
  return useQuery({
    queryKey: ['bookable-providers-service', businessId, serviceId],
    enabled: !!businessId && !!serviceId,
    queryFn: async (): Promise<BookableProvider[]> => {
      // v2 (0043): same capability filter as bookable_providers_for_service,
      // plus avatar_path for the picker.
      const { data, error } = await supabase.rpc('bookable_providers_v2', {
        p_business_id: businessId!,
        p_service_id: serviceId!,
      });
      if (error) throw error;
      return (data ?? []) as BookableProvider[];
    },
  });
}

// Services a specific provider can do — the inverse of
// useBookableProvidersForService. Capability-filtered server-side
// (services_for_provider, migration 0061): a member with no member_services rows
// can do everything, so this returns all active services for them. Powers
// provider-first booking ("pick a barber → see only their services"). Same shape
// as business_services_public, so it drops into BookingService directly.
export function useServicesForProvider(
  businessId: string | undefined,
  userId: string | undefined,
) {
  return useQuery({
    queryKey: ['services-for-provider', businessId, userId],
    enabled: !!businessId && !!userId,
    queryFn: async (): Promise<BookingService[]> => {
      const { data, error } = await supabase.rpc('services_for_provider', {
        p_business_id: businessId!,
        p_user_id: userId!,
      });
      if (error) throw error;
      return (data ?? []) as BookingService[];
    },
  });
}

// Returns the upcoming dates (as 'YYYY-MM-DD' keys) that have at least one
// bookable slot for a provider, so the date picker can show only days that
// actually have availability instead of letting the user guess. Disabled until
// provider + duration are known. `days` is the size of the lookahead window.
export function useAvailableDays(
  businessId: string | undefined,
  userId: string | undefined,
  durationMinutes: number | undefined,
  fromKey: string | undefined,
  days = 30,
) {
  return useQuery({
    queryKey: ['available-days', businessId, userId, durationMinutes, fromKey, days],
    enabled: !!businessId && !!userId && !!durationMinutes && !!fromKey,
    // Availability changes the moment anyone books — never serve it stale.
    staleTime: 0,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc('available_days', {
        p_business_id: businessId!,
        p_user_id: userId!,
        p_duration: durationMinutes!,
        p_from: fromKey!,
        p_days: days,
      });
      if (error) throw error;
      // Postgres returns each date as a 'YYYY-MM-DD' string already.
      return (data ?? []) as string[];
    },
  });
}

// "Any available" variants — union across all bookable providers (migration
// 0025). Used when the client doesn't care which provider they see.
export function useAvailableDaysAny(
  businessId: string | undefined,
  durationMinutes: number | undefined,
  fromKey: string | undefined,
  days = 30,
  serviceId?: string,
) {
  return useQuery({
    queryKey: ['available-days-any', businessId, durationMinutes, fromKey, days, serviceId ?? null],
    enabled: !!businessId && !!durationMinutes && !!fromKey,
    staleTime: 0,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc('available_days_any', {
        p_business_id: businessId!,
        p_duration: durationMinutes!,
        p_from: fromKey!,
        p_days: days,
        p_service_id: serviceId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as string[];
    },
  });
}

export function useAvailableSlotsAny(
  businessId: string | undefined,
  dateKey: string | undefined,
  durationMinutes: number | undefined,
  serviceId?: string,
) {
  return useQuery({
    queryKey: ['available-slots-any', businessId, dateKey, durationMinutes, serviceId ?? null],
    enabled: !!businessId && !!dateKey && !!durationMinutes,
    staleTime: 0,
    queryFn: async (): Promise<Date[]> => {
      const { data, error } = await supabase.rpc('available_slots_any', {
        p_business_id: businessId!,
        p_date: dateKey!,
        p_duration: durationMinutes!,
        p_service_id: serviceId ?? null,
      });
      if (error) throw error;
      return ((data ?? []) as string[]).map((iso) => new Date(iso));
    },
  });
}

// Returns available slot start times (Date[]) for a provider on a date.
// dateKey is 'YYYY-MM-DD'. Disabled until provider + duration are known.
export function useAvailableSlots(
  businessId: string | undefined,
  userId: string | undefined,
  dateKey: string | undefined,
  durationMinutes: number | undefined,
) {
  return useQuery({
    queryKey: ['available-slots', businessId, userId, dateKey, durationMinutes],
    enabled: !!businessId && !!userId && !!dateKey && !!durationMinutes,
    staleTime: 0,
    queryFn: async (): Promise<Date[]> => {
      const { data, error } = await supabase.rpc('available_slots', {
        p_business_id: businessId!,
        p_user_id: userId!,
        p_date: dateKey!,
        p_duration: durationMinutes!,
      });
      if (error) throw error;
      return ((data ?? []) as string[]).map((iso) => new Date(iso));
    },
  });
}
