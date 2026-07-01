// Pure booking / payment logic — deliberately free of React, React Native, and
// Supabase imports so it can be unit-tested in plain Node and reused across the
// bookings screen, the in-app pay prompt, and the scheduled reminders. All the
// callers below pass their own row types; we use structural ("…Like") shapes so
// this module doesn't depend back on lib/booking.

export type DepositType = 'none' | 'fixed' | 'percent' | 'full';
export type DepositTiming = 'at_request' | 'on_confirm';

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

// A deposit is taken in the customer app only when configured AND timed to the
// booking request (on_confirm deposits are charged staff-side at confirm).
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
