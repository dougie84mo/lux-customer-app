// Pure walk-in logic (no Supabase / React imports, so Jest can load it bare).
// Backend: migration 0244 in ../app/supabase. Hooks live in ./walkIn.

export type WalkInStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';

export type MyWalkInRequest = {
  id: string;
  business_id: string;
  business_name: string;
  service_name: string;
  // The barber who accepted, else the one asked for, else null ("any barber").
  provider_name: string | null;
  // my_walk_in_requests() already reports a PENDING row past expires_at as EXPIRED.
  status: WalkInStatus;
  estimated_wait_minutes: number | null;
  appointment_id: string | null;
  // Start of the queued visit once a barber accepted.
  appointment_start: string | null;
  created_at: string;
  expires_at: string;
};

export type WalkInBoardRow = {
  provider_id: string;
  name: string;
  avatar_path: string | null;
  busy: boolean;
  queue_length: number;
  // null = cannot take a walk-in today.
  wait_minutes: number | null;
};

export const WALK_IN_NOTIFICATION_TYPES = ['walk_in_accepted', 'walk_in_declined', 'walk_in_expired'] as const;

function startOfDayMs(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// When the visit is (accepted) or when it was asked for (everything else).
export function walkInWhenMs(r: Pick<MyWalkInRequest, 'appointment_start' | 'created_at'>): number {
  return new Date(r.appointment_start ?? r.created_at).getTime();
}

// "Upcoming" in My bookings: still waiting on the shop, or accepted with the
// visit today or later. Same calendar-day boundary as isBookingUpcoming.
export function isWalkInUpcoming(r: MyWalkInRequest, now: number): boolean {
  if (r.status === 'PENDING') return true;
  if (r.status !== 'ACCEPTED') return false;
  return walkInWhenMs(r) >= startOfDayMs(now);
}

// How long after its time a finished request still counts as "the one I am
// looking at". Past this the walk-in screen goes back to a fresh request.
export const WALK_IN_STALE_MS = 2 * 60 * 60 * 1000;

// Still worth opening the walk-in screen to: waiting on the shop, or answered
// (accepted, declined, expired, cancelled) within the last two hours. An
// accepted visit that is still ahead counts too. Without the cut-off, scanning
// the shop's code the next morning showed last night's "You're in" instead of
// a new request (found on the 2026-11-21 test run).
export function isWalkInCurrent(r: MyWalkInRequest, now: number): boolean {
  if (r.status === 'PENDING') return true;
  return walkInWhenMs(r) >= now - WALK_IN_STALE_MS;
}

// The request the walk-in screen opens straight to: the caller's PENDING, or
// ACCEPTED and still current, request at this shop. Newest first when there
// are several.
export function activeWalkInFor(
  requests: MyWalkInRequest[] | undefined,
  businessId: string | undefined,
  now: number,
): MyWalkInRequest | null {
  if (!businessId) return null;
  const mine = (requests ?? [])
    .filter((r) => r.business_id === businessId && isWalkInUpcoming(r, now) && isWalkInCurrent(r, now))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return mine.find((r) => r.status === 'PENDING') ?? mine[0] ?? null;
}

// Cancel is offered while the shop has not answered, and after an accept until
// the day is over. The server has the last word (a visit already in the chair
// returns false).
export function canCancelWalkIn(r: MyWalkInRequest, now: number): boolean {
  return r.status === 'PENDING' || (r.status === 'ACCEPTED' && isWalkInUpcoming(r, now));
}

// Shortest wait across the board: what "Any barber" gets. null when nobody
// can take a walk-in today.
export function shortestWalkInWait(board: WalkInBoardRow[] | undefined): number | null {
  const waits = (board ?? []).map((b) => b.wait_minutes).filter((w): w is number => typeof w === 'number');
  return waits.length > 0 ? Math.min(...waits) : null;
}

// Whole seconds left before a PENDING request expires (never negative).
export function walkInSecondsLeft(expiresAt: string, now: number): number {
  const ms = new Date(expiresAt).getTime() - now;
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0;
}

// 125 → "2:05".
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Minutes until the queued visit, counted down from appointment_start when the
// shop accepted; the stored estimate otherwise.
export function walkInMinutesLeft(
  r: Pick<MyWalkInRequest, 'appointment_start' | 'estimated_wait_minutes'>,
  now: number,
): number | null {
  if (r.appointment_start) {
    const ms = new Date(r.appointment_start).getTime() - now;
    if (Number.isFinite(ms)) return Math.max(0, Math.ceil(ms / 60_000));
  }
  return r.estimated_wait_minutes;
}

// Where a walk_in_* notification (inbox row or push payload) opens. Both carry
// business_id and walk_in_request_id in `data`. null = not a walk-in
// notification, or one without a shop to open.
export function walkInNotificationTarget(
  type: unknown,
  data: unknown,
): { businessId: string; requestId?: string } | null {
  if (typeof type !== 'string' || !(WALK_IN_NOTIFICATION_TYPES as readonly string[]).includes(type)) return null;
  const d = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  if (typeof d.business_id !== 'string' || !d.business_id) return null;
  return {
    businessId: d.business_id,
    ...(typeof d.walk_in_request_id === 'string' && d.walk_in_request_id
      ? { requestId: d.walk_in_request_id }
      : {}),
  };
}

// The shop's QR code is the public booking link with ?walkin=1
// (https://theluxmirror.com/book/<businessId>?walkin=1). expo-router would open
// that as the booking wizard; send it to the walk-in screen instead. Accepts a
// full URL (https or the app scheme) or a bare path; anything else is returned
// untouched.
export function rewriteWalkInLink(path: string): string {
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/[^/?#]*)?\/*book\/([^/?#]+)\/?\?([^#]*)/i.exec(path);
  if (!m) return path;
  const walkIn = m[2].split('&').some((pair) => {
    const [key, value] = pair.split('=');
    return key === 'walkin' && (value === '1' || value === 'true');
  });
  return walkIn ? `/walk-in/${m[1]}` : path;
}
