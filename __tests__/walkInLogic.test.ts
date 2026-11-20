import {
  activeWalkInFor,
  canCancelWalkIn,
  formatCountdown,
  isWalkInUpcoming,
  rewriteWalkInLink,
  shortestWalkInWait,
  walkInMinutesLeft,
  walkInNotificationTarget,
  walkInSecondsLeft,
  type MyWalkInRequest,
  type WalkInBoardRow,
} from '@/lib/walkInLogic';

const NOW = new Date(2026, 10, 20, 14, 0, 0).getTime(); // 20 Nov 2026, 2:00 PM local
const at = (h: number, m = 0, dayOffset = 0) => new Date(2026, 10, 20 + dayOffset, h, m, 0).toISOString();

const request = (over: Partial<MyWalkInRequest> = {}): MyWalkInRequest => ({
  id: 'w1',
  business_id: 'b1',
  business_name: 'Studio Nine',
  service_name: 'Haircut',
  provider_name: null,
  status: 'PENDING',
  estimated_wait_minutes: 15,
  appointment_id: null,
  appointment_start: null,
  created_at: at(13, 55),
  expires_at: at(14, 5),
  ...over,
});

const barber = (over: Partial<WalkInBoardRow>): WalkInBoardRow => ({
  provider_id: 'p1',
  name: 'Ana',
  avatar_path: null,
  busy: false,
  queue_length: 0,
  wait_minutes: 0,
  ...over,
});

describe('isWalkInUpcoming', () => {
  it('keeps a pending request and an accepted visit for today upcoming', () => {
    expect(isWalkInUpcoming(request(), NOW)).toBe(true);
    // Accepted, visit earlier today: still today's business, like a booking.
    expect(isWalkInUpcoming(request({ status: 'ACCEPTED', appointment_start: at(9) }), NOW)).toBe(true);
  });

  it('moves yesterday’s accepted visit and every closed request to past', () => {
    expect(isWalkInUpcoming(request({ status: 'ACCEPTED', appointment_start: at(16, 0, -1) }), NOW)).toBe(false);
    expect(isWalkInUpcoming(request({ status: 'DECLINED' }), NOW)).toBe(false);
    expect(isWalkInUpcoming(request({ status: 'CANCELLED' }), NOW)).toBe(false);
    expect(isWalkInUpcoming(request({ status: 'EXPIRED' }), NOW)).toBe(false);
  });

  it('falls back to created_at for an accepted request with no visit time', () => {
    expect(isWalkInUpcoming(request({ status: 'ACCEPTED', created_at: at(10, 0, -2) }), NOW)).toBe(false);
  });
});

describe('activeWalkInFor', () => {
  it('finds the open request at this shop only', () => {
    const rows = [
      request({ id: 'other-shop', business_id: 'b2' }),
      request({ id: 'old', status: 'EXPIRED', created_at: at(9) }),
      request({ id: 'mine', status: 'ACCEPTED', appointment_start: at(14, 20) }),
    ];
    expect(activeWalkInFor(rows, 'b1', NOW)?.id).toBe('mine');
    expect(activeWalkInFor(rows, 'b3', NOW)).toBeNull();
    expect(activeWalkInFor(undefined, 'b1', NOW)).toBeNull();
  });

  it('prefers the pending request over an earlier accepted one', () => {
    const rows = [
      request({ id: 'accepted', status: 'ACCEPTED', appointment_start: at(10), created_at: at(9, 50) }),
      request({ id: 'pending' }),
    ];
    expect(activeWalkInFor(rows, 'b1', NOW)?.id).toBe('pending');
  });
});

describe('canCancelWalkIn', () => {
  it('offers cancel while pending or accepted for today, never once closed', () => {
    expect(canCancelWalkIn(request(), NOW)).toBe(true);
    expect(canCancelWalkIn(request({ status: 'ACCEPTED', appointment_start: at(14, 30) }), NOW)).toBe(true);
    expect(canCancelWalkIn(request({ status: 'ACCEPTED', appointment_start: at(14, 30, -1) }), NOW)).toBe(false);
    expect(canCancelWalkIn(request({ status: 'DECLINED' }), NOW)).toBe(false);
  });
});

describe('board + countdown helpers', () => {
  it('takes the shortest wait, ignoring barbers who cannot take a walk-in', () => {
    expect(shortestWalkInWait([barber({ wait_minutes: 25 }), barber({ wait_minutes: null }), barber({ wait_minutes: 10 })])).toBe(10);
    expect(shortestWalkInWait([barber({ wait_minutes: null })])).toBeNull();
    expect(shortestWalkInWait([])).toBeNull();
  });

  it('counts down to expiry and stops at zero', () => {
    expect(walkInSecondsLeft(at(14, 5), NOW)).toBe(300);
    expect(walkInSecondsLeft(at(13, 59), NOW)).toBe(0);
    expect(walkInSecondsLeft('not a date', NOW)).toBe(0);
    expect(formatCountdown(125)).toBe('2:05');
    expect(formatCountdown(0)).toBe('0:00');
  });

  it('counts the wait down from the visit time, else uses the estimate', () => {
    expect(walkInMinutesLeft({ appointment_start: at(14, 12), estimated_wait_minutes: 20 }, NOW)).toBe(12);
    expect(walkInMinutesLeft({ appointment_start: at(13, 50), estimated_wait_minutes: 20 }, NOW)).toBe(0);
    expect(walkInMinutesLeft({ appointment_start: null, estimated_wait_minutes: 20 }, NOW)).toBe(20);
  });
});

describe('walkInNotificationTarget', () => {
  it('routes the three walk-in types to their shop and request', () => {
    expect(
      walkInNotificationTarget('walk_in_accepted', { walk_in_request_id: 'w1', business_id: 'b1', wait_minutes: 10 }),
    ).toEqual({ businessId: 'b1', requestId: 'w1' });
    expect(walkInNotificationTarget('walk_in_expired', { business_id: 'b1' })).toEqual({ businessId: 'b1' });
  });

  it('ignores other types and payloads without a shop', () => {
    expect(walkInNotificationTarget('booking_confirmed', { business_id: 'b1' })).toBeNull();
    // The staff-facing type is not the client's to open.
    expect(walkInNotificationTarget('walk_in_request', { business_id: 'b1' })).toBeNull();
    expect(walkInNotificationTarget('walk_in_declined', { walk_in_request_id: 'w1' })).toBeNull();
    expect(walkInNotificationTarget('walk_in_declined', null)).toBeNull();
    expect(walkInNotificationTarget(undefined, {})).toBeNull();
  });
});

describe('rewriteWalkInLink', () => {
  const id = '0b6f2c0e-1111-4222-8333-444455556666';

  it('sends the shop QR link (?walkin=1) to the walk-in screen', () => {
    expect(rewriteWalkInLink(`https://theluxmirror.com/book/${id}?walkin=1`)).toBe(`/walk-in/${id}`);
    expect(rewriteWalkInLink(`https://theluxmirror.com/book/${id}/?utm_source=qr&walkin=1`)).toBe(`/walk-in/${id}`);
    expect(rewriteWalkInLink(`luxbooking://book/${id}?walkin=1`)).toBe(`/walk-in/${id}`);
    expect(rewriteWalkInLink(`/book/${id}?walkin=1`)).toBe(`/walk-in/${id}`);
    expect(rewriteWalkInLink(`book/${id}?walkin=true#top`)).toBe(`/walk-in/${id}`);
  });

  it('leaves every other link alone', () => {
    for (const link of [
      `https://theluxmirror.com/book/${id}`,
      `https://theluxmirror.com/book/${id}?walkin=0`,
      `https://theluxmirror.com/book/${id}?serviceId=s1`,
      `luxbooking://walk-in/${id}`,
      `luxbooking://google-auth?code=abc&walkin=1`,
      `/notbook/${id}?walkin=1`,
      '',
    ]) {
      expect(rewriteWalkInLink(link)).toBe(link);
    }
  });
});
