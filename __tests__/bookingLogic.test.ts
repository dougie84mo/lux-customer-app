import {
  bookingStartMs,
  depositAmountCents,
  depositAppliesAtBooking,
  isBookingUpcoming,
  isPayable,
  isPaymentDue,
  paymentBalanceCents,
  startOfDayMs,
  type BookingLike,
  type DepositTiming,
} from '@/lib/bookingLogic';

// A confirmed, chargeable, unpaid booking at a fixed instant. Override per test.
const baseBooking = (over: Partial<BookingLike> = {}): BookingLike => ({
  status: 'CONFIRMED',
  paid: false,
  employee_id: 'emp-1',
  service_id: 'svc-1',
  confirmed_start: '2026-06-30T15:00:00.000Z',
  requested_start: '2026-06-30T15:00:00.000Z',
  ...over,
});

const MIN = 60_000;
const HOUR = 60 * MIN;

describe('depositAmountCents', () => {
  it('returns null when there is no deposit policy', () => {
    expect(depositAmountCents(null, 50)).toBeNull();
    expect(depositAmountCents({ deposit_type: 'none' }, 50)).toBeNull();
    expect(depositAmountCents(undefined, 50)).toBeNull();
  });

  it('charges the full price for a full deposit', () => {
    expect(depositAmountCents({ deposit_type: 'full' }, 45)).toBe(4500);
  });

  it('charges a fixed dollar amount regardless of price', () => {
    expect(depositAmountCents({ deposit_type: 'fixed', deposit_value: 10 }, 45)).toBe(1000);
  });

  it('charges a percentage of the service price', () => {
    // 20% of $45 = $9.00
    expect(depositAmountCents({ deposit_type: 'percent', deposit_value: 20 }, 45)).toBe(900);
  });

  it('treats a missing price as zero', () => {
    expect(depositAmountCents({ deposit_type: 'full' }, undefined)).toBe(0);
  });
});

describe('depositAppliesAtBooking', () => {
  it('is true only for an at_request deposit', () => {
    expect(depositAppliesAtBooking({ deposit_type: 'fixed', deposit_timing: 'at_request' })).toBe(
      true,
    );
  });

  it('is false for a timing this app does not implement, or no deposit', () => {
    // 0122 narrowed the column to 'at_request'; older rows are still guarded.
    expect(
      depositAppliesAtBooking({
        deposit_type: 'fixed',
        deposit_timing: 'on_confirm' as unknown as DepositTiming,
      }),
    ).toBe(false);
    expect(depositAppliesAtBooking({ deposit_type: 'none', deposit_timing: 'at_request' })).toBe(
      false,
    );
    expect(depositAppliesAtBooking(null)).toBe(false);
  });
});

describe('bookingStartMs', () => {
  it('prefers the confirmed time over the requested time', () => {
    const ms = bookingStartMs({
      confirmed_start: '2026-06-30T15:00:00.000Z',
      requested_start: '2026-06-30T09:00:00.000Z',
    });
    expect(ms).toBe(Date.parse('2026-06-30T15:00:00.000Z'));
  });

  it('falls back to the requested time when unconfirmed', () => {
    const ms = bookingStartMs({
      confirmed_start: null,
      requested_start: '2026-06-30T09:00:00.000Z',
    });
    expect(ms).toBe(Date.parse('2026-06-30T09:00:00.000Z'));
  });
});

describe('startOfDayMs', () => {
  it('zeroes the time-of-day for the given instant', () => {
    const now = Date.parse('2026-06-30T15:30:45.123Z');
    const d = new Date(startOfDayMs(now));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });
});

describe('isBookingUpcoming', () => {
  const now = Date.parse('2026-06-30T12:00:00.000Z');

  it('is upcoming for a live booking later today', () => {
    expect(isBookingUpcoming(baseBooking({ confirmed_start: '2026-06-30T18:00:00.000Z' }), now)).toBe(
      true,
    );
  });

  it('stays upcoming for a live booking earlier the same day', () => {
    // Same calendar day, before "now" — still counts as today, not past.
    expect(
      isBookingUpcoming(baseBooking({ confirmed_start: '2026-06-30T06:00:00.000Z' }), now),
    ).toBe(true);
  });

  it('is not upcoming for a booking on a prior day', () => {
    expect(
      isBookingUpcoming(baseBooking({ confirmed_start: '2026-06-29T18:00:00.000Z' }), now),
    ).toBe(false);
  });

  it('is not upcoming when declined or cancelled', () => {
    expect(isBookingUpcoming(baseBooking({ status: 'DECLINED' }), now)).toBe(false);
    expect(isBookingUpcoming(baseBooking({ status: 'CANCELLED' }), now)).toBe(false);
  });
});

describe('isPayable', () => {
  it('is payable when confirmed, unpaid, with provider + service', () => {
    expect(isPayable(baseBooking())).toBe(true);
  });

  it('is not payable once paid', () => {
    expect(isPayable(baseBooking({ paid: true }))).toBe(false);
  });

  it('is not payable without an assigned provider or service', () => {
    expect(isPayable(baseBooking({ employee_id: null }))).toBe(false);
    expect(isPayable(baseBooking({ service_id: null }))).toBe(false);
  });

  it('is not payable while still pending', () => {
    expect(isPayable(baseBooking({ status: 'PENDING' }))).toBe(false);
  });
});

describe('isPaymentDue', () => {
  const start = Date.parse('2026-06-30T15:00:00.000Z');
  const before = 30 * MIN;
  const after = 8 * HOUR;

  it('is due inside the window (during the appointment)', () => {
    expect(isPaymentDue(baseBooking(), start + HOUR, before, after)).toBe(true);
  });

  it('is due from the leading edge (30 min before)', () => {
    expect(isPaymentDue(baseBooking(), start - before, before, after)).toBe(true);
  });

  it('is not due before the window opens', () => {
    expect(isPaymentDue(baseBooking(), start - before - MIN, before, after)).toBe(false);
  });

  it('is not due after the window closes', () => {
    expect(isPaymentDue(baseBooking(), start + after + MIN, before, after)).toBe(false);
  });

  it('is never due for an unpayable booking, even in-window', () => {
    expect(isPaymentDue(baseBooking({ paid: true }), start + HOUR, before, after)).toBe(false);
  });
});

describe('paymentBalanceCents', () => {
  it('is service plus tip when there is no deposit', () => {
    expect(paymentBalanceCents(4500, 0, 900)).toBe(5400);
  });

  it('subtracts an applied deposit from the service', () => {
    expect(paymentBalanceCents(4500, 1000, 0)).toBe(3500);
  });

  it('never goes below the tip when the deposit exceeds the service', () => {
    expect(paymentBalanceCents(4500, 6000, 500)).toBe(500);
  });

  it('is zero when a deposit fully covers the service and there is no tip', () => {
    expect(paymentBalanceCents(4500, 4500, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Mirror photo consent prompt (0166/0168)
// ---------------------------------------------------------------------------
import { photoConsentPrompt } from '@/lib/bookingLogic';

describe('photoConsentPrompt', () => {
  const V = '2026-09-05';

  it('is hidden when the shop has not enabled capture', () => {
    expect(photoConsentPrompt(null, null, V)).toBe('hidden');
    expect(photoConsentPrompt({}, null, V)).toBe('hidden');
    expect(photoConsentPrompt({ photo_capture_enabled: false }, null, V)).toBe('hidden');
    // even an existing consent is irrelevant when the shop is off
    expect(
      photoConsentPrompt({ photo_capture_enabled: false }, { is_current: true, consent_version: V }, V),
    ).toBe('hidden');
  });

  it('offers the checkbox when capture is on and there is no consent', () => {
    expect(photoConsentPrompt({ photo_capture_enabled: true }, null, V)).toBe('checkbox');
    expect(photoConsentPrompt({ photo_capture_enabled: true }, undefined, V)).toBe('checkbox');
  });

  it('re-asks when the existing consent is on an older wording version', () => {
    expect(
      photoConsentPrompt({ photo_capture_enabled: true }, { is_current: false, consent_version: '2026-01-01' }, V),
    ).toBe('checkbox');
    // server says current but the app constant moved on — trust the app's version
    expect(
      photoConsentPrompt({ photo_capture_enabled: true }, { is_current: true, consent_version: '2026-01-01' }, V),
    ).toBe('checkbox');
  });

  it('shows the informational line when the client already agreed on the current version', () => {
    expect(
      photoConsentPrompt({ photo_capture_enabled: true }, { is_current: true, consent_version: V }, V),
    ).toBe('already');
  });
});

import { smsConsentPrompt, toE164US } from '@/lib/bookingLogic';

describe('toE164US', () => {
  it('normalises the common ways a US number is typed', () => {
    expect(toE164US('(610) 718-7528')).toBe('+16107187528');
    expect(toE164US('610.718.7528')).toBe('+16107187528');
    expect(toE164US('1 610 718 7528')).toBe('+16107187528');
    expect(toE164US('+1 610-718-7528')).toBe('+16107187528');
    expect(toE164US('  6107187528  ')).toBe('+16107187528');
  });

  it('refuses anything that is not a ten-digit NANP number', () => {
    expect(toE164US('')).toBeNull();
    expect(toE164US(null)).toBeNull();
    expect(toE164US('718-7528')).toBeNull();
    expect(toE164US('0610718752')).toBeNull(); // area code starting with 0
    expect(toE164US('610 018 7528')).toBeNull(); // exchange starting with 0
    expect(toE164US('+44 20 7946 0958')).toBeNull(); // not +1
    expect(toE164US('61071875289')).toBeNull(); // 11 digits not starting with 1
  });
});

describe('smsConsentPrompt', () => {
  const V = '2026-09-06';
  it('hides while the status is still loading', () => {
    expect(smsConsentPrompt(undefined, V)).toBe('hidden');
  });
  it('offers the checkbox when there is no current opt-in', () => {
    expect(smsConsentPrompt(null, V)).toBe('checkbox');
    expect(smsConsentPrompt({ sms_on: false, is_current: false, consent_version: null }, V)).toBe('checkbox');
    // opted in once but switched off since
    expect(smsConsentPrompt({ sms_on: false, is_current: true, consent_version: V }, V)).toBe('checkbox');
    // wording moved on since they agreed
    expect(smsConsentPrompt({ sms_on: true, is_current: false, consent_version: '2026-01-01' }, V)).toBe('checkbox');
    expect(smsConsentPrompt({ sms_on: true, is_current: true, consent_version: '2026-01-01' }, V)).toBe('checkbox');
  });
  it('shows the informational line when already opted in on the current wording', () => {
    expect(smsConsentPrompt({ sms_on: true, is_current: true, consent_version: V }, V)).toBe('already');
  });
});

import {
  BOOKING_UNAVAILABLE_MESSAGE,
  bookingEntitlement,
  bookingErrorMessage,
  isBookingEntitlementError,
} from '@/lib/bookingLogic';

// 0120's owner-facing trigger message, verbatim, as PostgREST hands it back.
const entitlementError = {
  code: 'P0001',
  message:
    "Booking is not included in this business's plan. Add a seat to start taking bookings.",
};

describe('bookingEntitlement', () => {
  it('reports what the server actually answered', () => {
    expect(bookingEntitlement({ data: true, isPending: false, isError: false })).toBe('enabled');
    expect(bookingEntitlement({ data: false, isPending: false, isError: false })).toBe('disabled');
  });

  it('stays optimistic while the check is genuinely in flight (no CTA flicker)', () => {
    expect(bookingEntitlement({ data: undefined, isPending: true, isError: false })).toBe('enabled');
  });

  it('does NOT read a failed check as bookable — that is the bug', () => {
    // Same `data === undefined` as loading, but settled in error. Before the
    // fix this collapsed into "bookable" and walked the client into a booking
    // the server was always going to refuse.
    expect(bookingEntitlement({ data: undefined, isPending: false, isError: true })).toBe('unknown');
    // A retry that errors again still counts as unknown, not enabled.
    expect(bookingEntitlement({ data: undefined, isPending: false, isError: true })).not.toBe(
      'enabled',
    );
  });

  it('treats a settled query with no answer as unknown too', () => {
    expect(bookingEntitlement({ data: undefined, isPending: false, isError: false })).toBe('unknown');
  });
});

describe('isBookingEntitlementError', () => {
  it('recognises 0120 raising from the BEFORE INSERT trigger', () => {
    expect(isBookingEntitlementError(entitlementError)).toBe(true);
  });

  it('does not claim unrelated failures', () => {
    expect(isBookingEntitlementError(null)).toBe(false);
    expect(isBookingEntitlementError(undefined)).toBe(false);
    expect(isBookingEntitlementError({ code: 'P0001', message: 'That time is no longer available.' })).toBe(
      false,
    );
    expect(isBookingEntitlementError({ code: '23505', message: 'duplicate key value' })).toBe(false);
    expect(isBookingEntitlementError({ message: 'Network request failed' })).toBe(false);
  });
});

describe('bookingErrorMessage', () => {
  const FALLBACK = 'Could not send your request';

  it('never shows a client the copy written for salon owners', () => {
    const shown = bookingErrorMessage(entitlementError, FALLBACK);
    expect(shown).toBe(BOOKING_UNAVAILABLE_MESSAGE);
    expect(shown).not.toMatch(/seat/i);
    expect(shown).not.toMatch(/plan/i);
  });

  it('passes every other error through with its own message', () => {
    expect(bookingErrorMessage({ code: 'P0001', message: 'That time is no longer available.' }, FALLBACK)).toBe(
      'That time is no longer available.',
    );
    expect(bookingErrorMessage({ message: 'Network request failed' }, FALLBACK)).toBe(
      'Network request failed',
    );
  });

  it('falls back when the error carries no message', () => {
    expect(bookingErrorMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(bookingErrorMessage({ code: '42501', message: '' }, FALLBACK)).toBe(FALLBACK);
  });
});
