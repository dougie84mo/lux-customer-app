import { useQuery } from '@tanstack/react-query';
import { STATUS_FEED_URL } from '@/constants/support';
import { parseStatusFeed, StatusService } from './statusLogic';

// Data for the System status screen. Two independent questions:
//   1. What does LUX's status page report?  (useSystemStatus)
//   2. Can THIS phone reach LUX right now?   (useCloudReachable)
// Asked separately because the answers differ exactly when it matters: the
// status page is hosted apart from LUX's cloud, so it still loads when the
// cloud is down, and a phone with no signal can reach neither.

const TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

/** The services on status.theluxmirror.com with their current state. */
export function useSystemStatus() {
  return useQuery({
    queryKey: ['system-status'],
    staleTime: 60_000,
    queryFn: async (): Promise<StatusService[]> => {
      const res = await fetchWithTimeout(STATUS_FEED_URL);
      if (!res.ok) throw new Error(`status feed answered ${res.status}`);
      return parseStatusFeed(await res.json());
    },
  });
}

/** One live request from this phone to LUX's health check (status-health, the
 *  endpoint the status page itself polls). Resolves false instead of failing:
 *  "can't reach" is an answer here, not an error. */
export function useCloudReachable() {
  return useQuery({
    queryKey: ['system-status', 'reachable'],
    staleTime: 0,
    retry: false,
    queryFn: async (): Promise<boolean> => {
      try {
        const res = await fetchWithTimeout(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/status-health`,
        );
        return res.ok;
      } catch {
        return false;
      }
    },
  });
}
