import { PaperProvider } from 'react-native-paper';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { DuePaymentPrompt } from '@/components/DuePaymentPrompt';
import type { MyBookingRequest } from '@/lib/booking';
import { useMyBookingRequests } from '@/lib/booking';

// Keep the component hermetic: mock the data hooks (which otherwise pull in the
// Supabase client + native modules) and the router. The pure window logic in
// lib/bookingLogic stays real — that's what we're exercising through the UI.
jest.mock('@/lib/booking', () => ({ useMyBookingRequests: jest.fn() }));
jest.mock('@/lib/businessDetail', () => ({ useBusinessPublic: () => ({ data: null }) }));
jest.mock('@/lib/avatars', () => ({ avatarUrl: () => null, initialsOf: () => 'XX' }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockBookings = useMyBookingRequests as jest.Mock;
const pushMock = router.push as jest.Mock;

// Fixed "now" so the ±window math is deterministic regardless of the clock.
const NOW = Date.parse('2026-07-01T15:00:00.000Z');

const booking = (over: Partial<MyBookingRequest> = {}): MyBookingRequest => ({
  id: 'req-1',
  business_id: 'biz-1',
  business_name: 'Fade Factory',
  service_id: 'svc-1',
  service_name: 'Haircut',
  location_id: 'loc-1',
  location_name: 'Downtown',
  employee_id: 'emp-1',
  employee_name: 'Sam Patel',
  duration: 30,
  requested_start: '2026-07-01T15:00:00.000Z',
  confirmed_start: '2026-07-01T15:00:00.000Z',
  confirmed_end: '2026-07-01T15:30:00.000Z',
  checked_in_at: null,
  status: 'CONFIRMED',
  notes: null,
  created_at: '2026-07-01T10:00:00.000Z',
  paid: false,
  ...over,
});

const renderPrompt = () => render(<DuePaymentPrompt />, { wrapper: PaperProvider });

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  pushMock.mockClear();
  mockBookings.mockReset();
});

afterEach(() => {
  (Date.now as jest.Mock).mockRestore?.();
});

describe('DuePaymentPrompt', () => {
  it('nudges for a confirmed, unpaid booking happening now', () => {
    mockBookings.mockReturnValue({ data: [booking()] });
    renderPrompt();

    expect(screen.getByText('Time to pay?')).toBeTruthy();
    expect(screen.getByText('Fade Factory')).toBeTruthy();
    expect(screen.getByText(/Haircut/)).toBeTruthy();
    expect(screen.getByText('Pay now')).toBeTruthy();
  });

  it('stays hidden when the only booking is already paid', () => {
    mockBookings.mockReturnValue({ data: [booking({ paid: true })] });
    renderPrompt();
    expect(screen.queryByText('Time to pay?')).toBeNull();
  });

  it('stays hidden when the booking is outside the payment window', () => {
    // Two days out — well before the 30-min lead edge.
    mockBookings.mockReturnValue({
      data: [
        booking({
          confirmed_start: '2026-07-03T15:00:00.000Z',
          requested_start: '2026-07-03T15:00:00.000Z',
        }),
      ],
    });
    renderPrompt();
    expect(screen.queryByText('Time to pay?')).toBeNull();
  });

  it('stays hidden with no bookings at all', () => {
    mockBookings.mockReturnValue({ data: [] });
    renderPrompt();
    expect(screen.queryByText('Time to pay?')).toBeNull();
  });

  it('routes to the pay screen and dismisses when "Pay now" is tapped', () => {
    mockBookings.mockReturnValue({ data: [booking()] });
    renderPrompt();

    fireEvent.press(screen.getByText('Pay now'));

    expect(pushMock).toHaveBeenCalledTimes(1);
    const arg = pushMock.mock.calls[0][0];
    expect(arg.pathname).toBe('/(app)/pay/[requestId]');
    expect(arg.params.requestId).toBe('req-1');
    expect(arg.params.employeeName).toBe('Sam Patel');
    // Dismissed after tapping so it won't reappear over the pay screen.
    expect(screen.queryByText('Time to pay?')).toBeNull();
  });

  it('dismisses on "Not now" without navigating', () => {
    mockBookings.mockReturnValue({ data: [booking()] });
    renderPrompt();

    fireEvent.press(screen.getByText('Not now'));

    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Time to pay?')).toBeNull();
  });
});
