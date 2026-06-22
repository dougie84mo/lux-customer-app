import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type BookableBusiness = {
  id: string;
  name: string;
  type: string;
  logo_url: string | null;
  description: string | null;
};

export type BookingLocation = { id: string; name: string };

export type BookingService = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration: number;
  category: string | null;
};

export type BookingPolicy = {
  cancellation_window_hours: number | null;
  no_show_fee: number;
  late_cancel_fee: number;
  cancellation_policy: string | null;
};

export type BookingRequestStatus = 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED';

export type MyBookingRequest = {
  id: string;
  business_id: string;
  business_name: string;
  service_id: string | null;
  service_name: string | null;
  location_id: string | null;
  location_name: string | null;
  // Effective provider: the confirmed appointment's employee, else the client's
  // preferred provider, else null ("any available"). Drives reschedule slots.
  employee_id: string | null;
  duration: number;
  requested_start: string;
  confirmed_start: string | null;
  confirmed_end: string | null;
  checked_in_at: string | null;
  status: BookingRequestStatus;
  notes: string | null;
  created_at: string;
};

// Staff-side view of a request (members can read booking_requests directly).
export type StaffBookingRequest = {
  id: string;
  business_id: string;
  location_id: string | null;
  service_id: string | null;
  requested_start: string;
  status: BookingRequestStatus;
  notes: string | null;
  created_at: string;
  customer: { id: string; name: string; phone: string | null } | null;
  service: { id: string; name: string; duration: number; price: number } | null;
  location: { id: string; name: string } | null;
};

// ---------------------------------------------------------------------------
// Client: discovery
// ---------------------------------------------------------------------------
export function useBookableBusinesses(
  query: string,
  types: string[] = [],
  categories: string[] = [],
) {
  return useQuery({
    queryKey: ['bookable-businesses', query, types, categories],
    queryFn: async (): Promise<BookableBusiness[]> => {
      const { data, error } = await supabase.rpc('search_bookable_businesses', {
        p_query: query.trim() || null,
        // Empty array = no filter (server treats null/empty the same).
        p_types: types.length > 0 ? types : null,
        p_categories: categories.length > 0 ? categories : null,
      });
      if (error) throw error;
      return (data ?? []) as BookableBusiness[];
    },
  });
}

// Active service categories across bookable businesses — drives the discovery
// category filter (migration 0027).
export function useServiceCategories() {
  return useQuery({
    queryKey: ['service-categories'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc('bookable_service_categories');
      if (error) throw error;
      return ((data ?? []) as { category: string }[]).map((r) => r.category);
    },
  });
}

export function useBusinessBookingInfo(businessId: string | undefined) {
  return useQuery({
    queryKey: ['business-booking-info', businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<{
      locations: BookingLocation[];
      services: BookingService[];
      policy: BookingPolicy | null;
    }> => {
      const [locRes, svcRes, polRes] = await Promise.all([
        supabase.rpc('business_locations_public', { p_business_id: businessId! }),
        supabase.rpc('business_services_public', { p_business_id: businessId! }),
        supabase.rpc('business_booking_policy_public', { p_business_id: businessId! }),
      ]);
      if (locRes.error) throw locRes.error;
      if (svcRes.error) throw svcRes.error;
      if (polRes.error) throw polRes.error;
      return {
        locations: (locRes.data ?? []) as BookingLocation[],
        services: (svcRes.data ?? []) as BookingService[],
        policy: ((polRes.data ?? [])[0] as BookingPolicy | undefined) ?? null,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Client: my requests
// ---------------------------------------------------------------------------
export function useMyBookingRequests() {
  return useQuery({
    queryKey: ['my-booking-requests'],
    queryFn: async (): Promise<MyBookingRequest[]> => {
      const { data, error } = await supabase.rpc('my_booking_requests');
      if (error) throw error;
      return (data ?? []) as MyBookingRequest[];
    },
  });
}

export function useRequestBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      businessId: string;
      locationId: string;
      serviceId: string;
      requestedStart: string; // ISO
      notes?: string;
      employeeId?: string; // preferred provider
    }) => {
      const { data, error } = await supabase.rpc('request_booking', {
        p_business_id: input.businessId,
        p_location_id: input.locationId,
        p_service_id: input.serviceId,
        p_requested_start: input.requestedStart,
        p_notes: input.notes?.trim() || null,
        p_employee_id: input.employeeId ?? null,
      });
      if (error) throw error;
      return data as string; // request id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-booking-requests'] });
    },
  });
}

// Client reschedules their own request. If it's still PENDING this just moves
// the requested time; if CONFIRMED, reschedule_booking_request (0032) moves the
// linked appointment too (clash-guarded for its provider).
export function useRescheduleBookingRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requestId: string; start: Date }) => {
      const { error } = await supabase.rpc('reschedule_booking_request', {
        p_request_id: input.requestId,
        p_start: input.start.toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-booking-requests'] });
      qc.invalidateQueries({ queryKey: ['available-days'] });
      qc.invalidateQueries({ queryKey: ['available-slots'] });
    },
  });
}

// Client self-check-in ("I'm here"). Stamps the linked appointment's
// checked_in_at via the client_check_in RPC (0036) and notifies the shop.
export function useClientCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc('client_check_in', { p_request_id: requestId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-booking-requests'] });
    },
  });
}

export function useCancelBookingRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc('cancel_booking_request', {
        p_request_id: requestId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-booking-requests'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Staff: review + respond
// ---------------------------------------------------------------------------
export function useBusinessBookingRequests(
  businessId: string | undefined,
  status: BookingRequestStatus | 'ALL' = 'PENDING',
) {
  return useQuery({
    queryKey: ['booking-requests', businessId, status],
    enabled: !!businessId,
    refetchInterval: 60_000, // realtime carries fast updates; safety-net poll
    queryFn: async (): Promise<StaffBookingRequest[]> => {
      let q = supabase
        .from('booking_requests')
        .select(
          'id, business_id, location_id, service_id, requested_start, status, notes, created_at, ' +
            'customer:customers(id, name, phone), service:services(id, name, duration, price), location:locations(id, name)',
        )
        .eq('business_id', businessId!)
        .order('requested_start', { ascending: true });
      if (status !== 'ALL') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as StaffBookingRequest[];
    },
  });
}

export function useRespondToBookingRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      requestId: string;
      action: 'CONFIRM' | 'DECLINE';
      employeeId?: string;
      start?: string;
      end?: string;
    }) => {
      const { data, error } = await supabase.rpc('respond_to_booking_request', {
        p_request_id: input.requestId,
        p_action: input.action,
        p_employee_id: input.employeeId ?? null,
        p_start: input.start ?? null,
        p_end: input.end ?? null,
      });
      if (error) throw error;
      return data as string | null; // appointment id on confirm
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['booking-requests'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
      void vars;
    },
  });
}
