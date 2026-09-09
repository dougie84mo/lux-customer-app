import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useBusinessBookingEnabled } from '@/lib/businessDetail';
import { supabase } from '@/lib/supabase';

// The real client pulls in SecureStore/AsyncStorage/crypto native modules; the
// hook only ever calls .rpc(), so that's all we stand in for.
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

const rpc = supabase.rpc as unknown as jest.Mock;

// No retries: an errored query must settle immediately so the test asserts on
// the settled state rather than the retry backoff. gcTime 0 + clear() keep the
// cache from leaving a garbage-collection timer running past the suite.
let client: QueryClient;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const renderEntitlement = () => renderHook(() => useBusinessBookingEnabled('biz-1'), { wrapper });

beforeEach(() => {
  rpc.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

afterEach(() => {
  client.clear();
  client.unmount();
});

describe('useBusinessBookingEnabled', () => {
  it('is optimistic while the check is still in flight', () => {
    rpc.mockReturnValue(new Promise(() => {})); // never settles
    const { result } = renderEntitlement();
    // Loading must not flicker the CTA off.
    expect(result.current.entitlement).toBe('enabled');
  });

  it("reports 'disabled' when the business has no booking entitlement", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const { result } = renderEntitlement();
    await waitFor(() => expect(result.current.entitlement).toBe('disabled'));
  });

  it("reports 'enabled' when the business is entitled", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const { result } = renderEntitlement();
    await waitFor(() => expect(result.current.entitlement).toBe('enabled'));
  });

  it("reports 'unknown' — never 'enabled' — when the RPC itself fails", async () => {
    // The bug: a failed entitlement check used to be indistinguishable from
    // loading (data === undefined) and so read as "bookable", walking the client
    // all the way to an insert the 0120 trigger was always going to refuse.
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } });
    const { result } = renderEntitlement();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.entitlement).toBe('unknown');
    expect(result.current.entitlement).not.toBe('enabled');
  });
});
