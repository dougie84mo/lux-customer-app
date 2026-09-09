// Pure booking / payment logic — deliberately free of React, React Native, and
// Supabase imports so it can be unit-tested in plain Node and reused across the
// bookings screen, the in-app pay prompt, and the scheduled reminders. All the
// callers below pass their own row types; we use structural ("…Like") shapes so
// this module doesn't depend back on lib/booking.

export type DepositType = 'none' | 'fixed' | 'percent' | 'full';
// Only 'at_request' is implemented (0122); 'on_confirm' was removed — it had no
// charge path on either side.
export type DepositTiming = 'at_request';

export type DepositPolicyLike = {
  deposit_type?: DepositType;
  deposit_value?: number; // fixed → dollars; percent → percent of service price
  deposit_timing?: DepositTiming;
};

// Cents a deposit would charge for a service, mirroring the server's derivation
// (the real amount is server-authoritative; this is for pre-charge display).
// Returns null when no deposit applies.
export function depositAmountCents(
  policy: DepositPolicyLike | null | undefined,
  servicePriceDollars: number | undefined,
): number | null {
  const t = policy?.deposit_type;
  if (!t || t === 'none') return null;
  const price = servicePriceDollars ?? 0;
  if (t === 'full') return Math.round(price * 100);
  if (t === 'fixed') return Math.round((policy?.deposit_value ?? 0) * 100);
  // percent: price(dollars) * value(percent) = cents (price * value/100 * 100).
  return Math.round(price * (policy?.deposit_value ?? 0));
}

// A deposit is taken when one is configured. The timing check is retained as a
// guard for rows written before 0122 narrowed the column to 'at_request'.
// What the confirm step shows about mirror photos (0166/0168):
//   'hidden'   — the shop has not enabled capture; say nothing.
//   'checkbox' — capture is on and the client has no current consent here.
//   'already'  — capture is on and the client already consented (current
//                version); show an informational line, no checkbox.
export type PhotoConsentPrompt = 'hidden' | 'checkbox' | 'already';

export function photoConsentPrompt(
  policy: { photo_capture_enabled?: boolean } | null | undefined,
  existing: { is_current: boolean; consent_version: string | null } | null | undefined,
  currentVersion: string,
): PhotoConsentPrompt {
  if (!policy?.photo_capture_enabled) return 'hidden';
  if (existing?.is_current && existing.consent_version === currentVersion) return 'already';
  return 'checkbox';
}

export function depositAppliesAtBooking(policy: DepositPolicyLike | null | undefined): boolean {
  return (
    !!policy?.deposit_type &&
    policy.deposit_type !== 'none' &&
    policy.deposit_timing === 'at_request'
  );
}

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED';

export type BookingLike = {
  status: BookingStatus;
  paid: boolean;
  employee_id: string | null;
  service_id: string | null;
  confirmed_start: string | null;
  requested_start: string;
};

// Effective appointment time in epoch ms: the confirmed time if set, else the
// originally requested time.
export function bookingStartMs(b: Pick<BookingLike, 'confirmed_start' | 'requested_start'>): number {
  return new Date(b.confirmed_start ?? b.requested_start).getTime();
}

// Local midnight for a given instant — the calendar-day boundary the bookings
// list uses so an appointment earlier today still counts as "today".
export function startOfDayMs(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// "Upcoming" while still live (requested/confirmed) and on today-or-later.
export function isBookingUpcoming(b: BookingLike, now: number): boolean {
  if (b.status !== 'PENDING' && b.status !== 'CONFIRMED') return false;
  return bookingStartMs(b) >= startOfDayMs(now);
}

// A booking the client can pay for: confirmed, with an assigned provider +
// service (both required server-side), and not already fully paid.
export function isPayable(b: BookingLike): boolean {
  return b.status === 'CONFIRMED' && !b.paid && !!b.employee_id && !!b.service_id;
}

// Window around the appointment where we actively nudge for payment. `beforeMs`
// starts the window before the appointment; `afterMs` keeps it open afterward
// (covers "during" and "just finished").
export function isPaymentDue(
  b: BookingLike,
  now: number,
  beforeMs: number,
  afterMs: number,
): boolean {
  if (!isPayable(b)) return false;
  const start = bookingStartMs(b);
  return now >= start - beforeMs && now <= start + afterMs;
}

// What the client actually owes: service minus any applied deposit (never below
// zero) plus the tip.
export function paymentBalanceCents(
  priceCents: number,
  depositCents: number,
  tipCents: number,
): number {
  return Math.max(0, priceCents - depositCents) + tipCents;
}

// --- Text messages (0174) -------------------------------------------------

// Normalise what a person types into a US/Canada mobile number in E.164 form,
// or null when it cannot be one. Accepts "(610) 718-7528", "610.718.7528",
// "1 610 718 7528", "+16107187528". Anything that is not exactly ten national
// digits (optionally preceded by 1) is refused rather than guessed — a wrong
// number here means texting a stranger.
export function toE164US(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    return digits.length === 11 && digits.startsWith('1') && /^1[2-9]\d{2}[2-9]\d{6}$/.test(digits)
      ? `+${digits}`
      : null;
  }
  let digits = trimmed.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  // NANP: area code and exchange cannot start with 0 or 1.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  return `+1${digits}`;
}

// What the confirm step shows about text messages:
//   'hidden'   — status not loaded yet (never block the booking on it).
//   'checkbox' — no current opt-in; offer the unticked box.
//   'already'  — opted in on the current wording; one informational line.
export type SmsConsentPrompt = 'hidden' | 'checkbox' | 'already';

export function smsConsentPrompt(
  status: { sms_on: boolean; is_current: boolean; consent_version: string | null } | null | undefined,
  currentVersion: string,
): SmsConsentPrompt {
  if (status === undefined) return 'hidden';
  if (status && status.sms_on && status.is_current && status.consent_version === currentVersion) {
    return 'already';
  }
  return 'checkbox';
}

// -------------------------------------------------------------- entitlement
// Booking is a plan entitlement (0120 + 0180): a business without an entitling
// subscription cannot take NEW bookings, enforced by a BEFORE INSERT trigger on
// booking_requests / appointments / waitlist_entries. The client reads the same
// answer up front via business_booking_enabled (0126) so it can say so politely
// instead of walking someone into a request the server will refuse.
//
// Three outcomes, because "we don't know" is NOT the same as "yes":
//   'enabled'  — the server said yes, or the check is still in flight. Being
//                optimistic while loading is deliberate: the CTA must not
//                flicker, and the trigger is the real enforcement anyway.
//   'disabled' — the server said no. Show the "not taking bookings" copy.
//   'unknown'  — the check SETTLED without an answer (it errored). Previously
//                indistinguishable from loading, so a failed check read as
//                "bookable". Callers decide: browsing surfaces stay open (one
//                RPC hiccup must not hide a business), but the booking action
//                re-checks rather than silently promising a booking.
export type BookingEntitlement = 'enabled' | 'disabled' | 'unknown';

export function bookingEntitlement(q: {
  data: boolean | undefined;
  isPending: boolean;
  isError: boolean;
}): BookingEntitlement {
  if (q.data === true) return 'enabled';
  if (q.data === false) return 'disabled';
  return q.isPending ? 'enabled' : 'unknown';
}

// What a client is told when the server refuses on entitlement grounds. The
// trigger's own message ("Add a seat to start taking bookings.") is addressed to
// the salon owner; a client can neither act on it nor should read it.
export const BOOKING_UNAVAILABLE_MESSAGE =
  "This business isn't taking online bookings right now.";

export type PostgrestErrorLike = {
  code?: string | null;
  message?: string | null;
};

// True only for 0120's entitlement rejection. P0001 alone is far too broad — it
// is the generic plpgsql RAISE code that every other booking guard uses too — so
// the message has to match as well, and an error carrying a different code is
// never ours.
export function isBookingEntitlementError(
  err: PostgrestErrorLike | null | undefined,
): boolean {
  if (!err) return false;
  const code = err.code ?? null;
  if (code !== null && code !== 'P0001') return false;
  const message = (err.message ?? '').toLowerCase();
  return message.includes('booking is not included') || message.includes('add a seat');
}

// Message for the booking Snackbar. Rewrites the entitlement rejection and
// NOTHING else — a slot that just got taken, a network drop or an RLS refusal
// keeps its own message rather than being disguised as "not taking bookings".
export function bookingErrorMessage(
  err: PostgrestErrorLike | null | undefined,
  fallback: string,
): string {
  if (isBookingEntitlementError(err)) return BOOKING_UNAVAILABLE_MESSAGE;
  return err?.message || fallback;
}
