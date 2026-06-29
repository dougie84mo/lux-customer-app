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
// Deposit at booking — charges a deposit (or full prepay) against a booking
// REQUEST (no appointment yet). The edge function authorizes the request's
// client (or staff), derives the amount from the service price + the business
// deposit policy, and returns a client_secret for the on-session Payment Sheet.
// When staff later confirm the request, a trigger links the deposit to the new
// appointment and final checkout auto-deducts it.
//
// mode: 'deposit' = the policy amount | 'full' = prepay the whole price.
// Guards (surfaced as errors): one deposit per request (409 if already paid);
// deposit_type='none' + mode:'deposit' → 400 (use 'full' for optional prepay).
// ============================================================================
export type DepositMode = 'deposit' | 'full';

export function useCreateDepositIntent() {
  return useMutation({
    mutationFn: async (input: {
      businessId: string;
      bookingRequestId: string;
      mode: DepositMode;
    }): Promise<{ client_secret: string; sale_id: string; amount_cents: number }> => {
      const { data, error } = await supabase.functions.invoke('create-deposit-intent', {
        body: {
          business_id: input.businessId,
          booking_request_id: input.bookingRequestId,
          mode: input.mode,
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

// Note: the bookings list now reads its paid state from the `paid` flag on
// my_booking_requests (migration 0068) — a single source of truth — rather than
// a client-side booking_requests×sales join, which could disagree with the pay
// screen and leave a paid booking showing "Pay now".

// ============================================================================
// Receipts / payment history — the client's own sales (RLS: created_by = me),
// enriched with business + service names. my_booking_requests doesn't expose
// appointment_id, so we map appointment → service via the client's own
// booking_requests, and resolve names through the public RPCs (the client isn't
// a member, so it can't read businesses/services directly).
// ============================================================================
export type Receipt = {
  id: string;
  kind: string; // 'sale' | 'deposit' | 'no_show_fee' | 'late_cancel_fee' | …
  status: SaleStatus;
  gross_cents: number;
  tip_cents: number;
  currency: string;
  created_at: string;
  businessName: string | null;
  serviceName: string | null;
};

export function useMyReceipts() {
  return useQuery({
    queryKey: ['my-receipts'],
    queryFn: async (): Promise<Receipt[]> => {
      const { data, error } = await supabase
        .from('sales')
        .select('id, appointment_id, business_id, kind, gross_cents, tip_cents, currency, status, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as {
        id: string;
        appointment_id: string | null;
        business_id: string;
        kind: string;
        gross_cents: number;
        tip_cents: number;
        currency: string;
        status: SaleStatus;
        created_at: string;
      }[];
      if (rows.length === 0) return [];

      // appointment → service_id, via my own booking_requests (RLS select-own).
      const apptIds = [...new Set(rows.map((r) => r.appointment_id).filter(Boolean))] as string[];
      const apptToServiceId = new Map<string, string | null>();
      if (apptIds.length > 0) {
        const { data: brs, error: brErr } = await supabase
          .from('booking_requests')
          .select('appointment_id, service_id')
          .in('appointment_id', apptIds);
        if (brErr) throw brErr;
        for (const b of (brs ?? []) as { appointment_id: string | null; service_id: string | null }[]) {
          if (b.appointment_id) apptToServiceId.set(b.appointment_id, b.service_id);
        }
      }

      // business → name + (service_id → name), via public RPCs.
      const bizIds = [...new Set(rows.map((r) => r.business_id).filter(Boolean))] as string[];
      const bizName = new Map<string, string>();
      const svcName = new Map<string, Map<string, string>>();
      await Promise.all(
        bizIds.map(async (bid) => {
          const [pubRes, svcRes] = await Promise.all([
            supabase.rpc('business_public', { p_business_id: bid }),
            supabase.rpc('business_services_public', { p_business_id: bid }),
          ]);
          const name = ((pubRes.data ?? [])[0] as { name?: string } | undefined)?.name;
          if (name) bizName.set(bid, name);
          const m = new Map<string, string>();
          for (const s of (svcRes.data ?? []) as { id: string; name: string }[]) m.set(s.id, s.name);
          svcName.set(bid, m);
        }),
      );

      return rows.map((r) => {
        const serviceId = r.appointment_id ? apptToServiceId.get(r.appointment_id) ?? null : null;
        const serviceName = serviceId ? svcName.get(r.business_id)?.get(serviceId) ?? null : null;
        return {
          id: r.id,
          kind: r.kind,
          status: r.status,
          gross_cents: r.gross_cents,
          tip_cents: r.tip_cents,
          currency: r.currency,
          created_at: r.created_at,
          businessName: bizName.get(r.business_id) ?? null,
          serviceName,
        };
      });
    },
  });
}

export function useMyAppointmentSale(appointmentId: string | undefined) {
  return useQuery({
    queryKey: ['my-appointment-sale', appointmentId],
    enabled: !!appointmentId,
    queryFn: async (): Promise<MyAppointmentSale | null> => {
      // Only full payments (kind 'sale') count as "paid" here — a deposit is
      // partial, so the balance is still owed and the pay screen should let the
      // client pay it (the server auto-deducts the deposit).
      const { data, error } = await supabase
        .from('sales')
        .select('id, status, gross_cents, tip_cents, created_at')
        .eq('appointment_id', appointmentId!)
        .eq('kind', 'sale')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as MyAppointmentSale[];
      if (rows.length === 0) return null;
      return rows.find((r) => r.status === 'succeeded') ?? rows[0];
    },
  });
}
