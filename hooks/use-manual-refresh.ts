import { useCallback, useState } from 'react';

// RefreshControl should reflect ONLY a user-initiated pull-to-refresh — never a
// background refetch. Binding `refreshing` to React Query's `isRefetching` makes
// the pull-spinner appear on every `refetchInterval` tick and every realtime
// invalidation (e.g. a device heartbeat), which nudges the scroll position up
// and down for no user-visible reason.
//
// This hook keeps a local flag that is true only while the promise from an
// explicit pull is in flight, so background polling stays silent.
export function useManualRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    return Promise.resolve(refetch()).finally(() => setRefreshing(false));
  }, [refetch]);
  return { refreshing, onRefresh };
}
