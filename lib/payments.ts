import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

// Client → business appointment payments (Stripe Connect). This app is a pure
// RPC/edge-function consumer; the heavy lifting (PaymentIntent on the platform,
// transfer to the shop, sale reconciliation) lives in the business app's
// `create-payment-intent` + `connect-webhook` edge functions. See
// prompts/PAYMENTS_HANDOFF.md.

// functions.invoke surfaces non-2xx as a generic FunctionsHttpError; dig the JSON
// body out of the error context for the real reason (mirrors the business app's
// lib/payments.ts invokeError).
async function invokeError(error: unknown): Promise<Error> {
  const e = error as { message?: string; context?: Response };
  let detail = e.message ?? 'Request failed';
  try {
    if (e.context) {
      const parsed = await e.context.json();
      if (parsed?.error) detail = parsed.error;
    }
  } catch {
    // keep the generic message
  }
  return new Error(detail);
}

// ============================================================================
// Create a PaymentIntent for one of MY appointments (the client pay path).
//
// The edge function authorizes the caller as the appointment's customer
// (customers.user_id = auth.uid()) and DERIVES the price from the appointment's
// service + assigned stylist — the client cannot assert items or prices. Only
// the tip is client-supplied. Requires the appointment to have an assigned
// employee_id + service_id (enforced server-side). Returns a client_secret the
// app hands to the native Payment Sheet.
// ============================================================================
export type CreatePaymentIntentInput = {
  businessId: string;
  appointmentId: string;
  tipCents?: number;
};

export function useCreatePaymentIntent() {
  return useMutation({
    mutationFn: async (
      input: CreatePaymentIntentInput,
    ): Promise<{ client_secret: string; sale_id: string; amount_cents: number }> => {
      const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: {
          business_id: input.businessId,
          appointment_id: input.appointmentId,
          tip_cents: input.tipCents ?? 0,
        },
      });
      if (error) throw await invokeError(error);
      if (!data?.client_secret) throw new Error('No client secret returned');
      return data as { client_secret: string; sale_id: string; amount_cents: number };
    },
  });
}

// ============================================================================
// Sale status — `pending` until the connect-webhook reconciles the charge; the
// money is only real once it reaches `succeeded`. RLS (migration 0057) lets the
// creator of a sale read it back, so the client who paid can poll their own.
// ============================================================================
export type SaleStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'canceled';

export async function fetchSaleStatus(saleId: string): Promise<SaleStatus | null> {
  const { data, error } = await supabase
    .from('sales')
    .select('status')
    .eq('id', saleId)
    .maybeSingle();
  if (error) throw error;
  return (data?.status as SaleStatus) ?? null;
}

// Poll a sale until the webhook moves it off pending/processing
// (succeeded/failed/etc.). The native Payment Sheet confirms the charge
// client-side, but the sale is only reconciled — and we should only show
// "paid" — once the webhook lands. Returns the resolved status, or `pending` if
// it didn't settle within the window (caller treats that as "captured,
// finalizing", NOT paid).
export async function waitForSaleResolved(
  saleId: string,
  opts?: { tries?: number; intervalMs?: number },
): Promise<SaleStatus> {
  const tries = opts?.tries ?? 12;
  const intervalMs = opts?.intervalMs ?? 1500;
  for (let i = 0; i < tries; i++) {
    const status = await fetchSaleStatus(saleId);
    if (status && status !== 'pending' && status !== 'processing') return status;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, intervalMs));
  }
  return 'pending';
}

// ============================================================================
// My sale for an appointment — used to render a "Paid" receipt and hide the Pay
// button once I've already paid. RLS only returns sales I created, so this can't
// see a staff in-person sale for the same appointment (the edge function guards
// against double-charging on that side). Prefers a succeeded sale, else the most
// recent attempt.
// ============================================================================
export type MyAppointmentSale = {
  id: string;
  status: SaleStatus;
  gross_cents: number;
  tip_cents: number;
  created_at: string;
};

// Set of MY booking-request ids that I've already paid (a succeeded sale exists
// for their appointment). Drives the "Paid" chip + hides the Pay button on the
// bookings list. my_booking_requests doesn't expose appointment_id, so we join
// two RLS-scoped list reads client-side: booking_requests (id → appointment_id,
// own rows only) and sales (succeeded, created_by = me). Both are small per user.
export function useMyPaidBookingIds() {
  return useQuery({
    queryKey: ['my-paid-booking-ids'],
    queryFn: async (): Promise<Set<string>> => {
      const { data: brs, error: brErr } = await supabase
        .from('booking_requests')
        .select('id, appointment_id');
      if (brErr) throw brErr;
      const withAppt = ((brs ?? []) as { id: string; appointment_id: string | null }[]).filter(
        (b) => b.appointment_id,
      );
      if (withAppt.length === 0) return new Set();

      const { data: sales, error: sErr } = await supabase
        .from('sales')
        .select('appointment_id')
        .in(
          'appointment_id',
          withAppt.map((b) => b.appointment_id),
        )
        .eq('status', 'succeeded');
      if (sErr) throw sErr;
      const paidAppts = new Set(
        ((sales ?? []) as { appointment_id: string }[]).map((s) => s.appointment_id),
      );

      const paidRequestIds = new Set<string>();
      for (const b of withAppt) {
        if (b.appointment_id && paidAppts.has(b.appointment_id)) paidRequestIds.add(b.id);
      }
      return paidRequestIds;
    },
  });
}

export function useMyAppointmentSale(appointmentId: string | undefined) {
  return useQuery({
    queryKey: ['my-appointment-sale', appointmentId],
    enabled: !!appointmentId,
    queryFn: async (): Promise<MyAppointmentSale | null> => {
      const { data, error } = await supabase
        .from('sales')
        .select('id, status, gross_cents, tip_cents, created_at')
        .eq('appointment_id', appointmentId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as MyAppointmentSale[];
      if (rows.length === 0) return null;
      return rows.find((r) => r.status === 'succeeded') ?? rows[0];
    },
  });
}
