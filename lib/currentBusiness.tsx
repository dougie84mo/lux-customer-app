import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './auth';
import { BusinessMembershipRow, useMyMemberships } from './businesses';
import { kvStorage } from './storage';

// SecureStore (native) only allows [A-Za-z0-9._-] in keys — no colons.
const STORAGE_KEY = 'lux.currentBusinessId';
const MODE_KEY = 'lux.appMode';

// The app is used by two personas out of one account:
//   'personal' — a client (book at businesses, view their own bookings).
//   'business' — an owner/manager/employee acting within a business.
// A user with no membership is always 'personal'. A user with memberships
// defaults to 'business' but can switch to their personal/client context.
export type AppMode = 'personal' | 'business';

type BusinessState = {
  // Persona / mode
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  /** True once memberships have loaded and the user belongs to ≥1 business. */
  isBusinessUser: boolean;

  // Business context (meaningful in 'business' mode)
  memberships: BusinessMembershipRow[];
  currentMembership: BusinessMembershipRow | null;
  currentBusinessId: string | undefined;
  setCurrentBusinessId: (id: string) => void;

  isLoading: boolean;
  error: Error | null;
};

const BusinessContext = createContext<BusinessState | null>(null);

// Single source of truth for "who am I acting as right now" — persona (mode)
// plus, in business mode, which business. Mounted once at the ROOT (above both
// the (app) and (client) route groups) so the redirect hub and both groups
// read the same state.
export function BusinessProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { data: memberships, isLoading, error } = useMyMemberships(session?.user.id);

  const [currentBusinessId, setCurrentBusinessIdState] = useState<string | null>(null);
  const [mode, setModeState] = useState<AppMode>('personal');
  const hydrated = useRef(false);
  const modeWasPersisted = useRef(false);

  // Hydrate persisted selection + mode once.
  useEffect(() => {
    let cancelled = false;
    Promise.all([kvStorage.getItem(STORAGE_KEY), kvStorage.getItem(MODE_KEY)]).then(
      ([storedBiz, storedMode]) => {
        if (cancelled) return;
        if (storedBiz) setCurrentBusinessIdState(storedBiz);
        if (storedMode === 'personal' || storedMode === 'business') {
          modeWasPersisted.current = true;
          setModeState(storedMode);
        }
        hydrated.current = true;
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Snap business selection to a valid membership: default to the first on
  // initial load, recover if the user lost access to the selected business.
  useEffect(() => {
    if (!hydrated.current) return;
    if (!memberships) return;
    if (memberships.length === 0) {
      if (currentBusinessId !== null) {
        setCurrentBusinessIdState(null);
        kvStorage.removeItem(STORAGE_KEY).catch(() => {});
      }
      return;
    }
    const stillValid = memberships.some((m) => m.business_id === currentBusinessId);
    if (!stillValid) {
      const first = memberships[0].business_id;
      setCurrentBusinessIdState(first);
      kvStorage.setItem(STORAGE_KEY, first).catch(() => {});
    }
  }, [memberships, currentBusinessId]);

  // Resolve mode once memberships are known. No membership ⇒ forced personal.
  // Has memberships + no explicit prior choice ⇒ default to business.
  useEffect(() => {
    if (!hydrated.current) return;
    if (!memberships) return;
    if (memberships.length === 0) {
      if (mode !== 'personal') setModeState('personal');
      return;
    }
    if (!modeWasPersisted.current && mode !== 'business') {
      setModeState('business');
    }
  }, [memberships, mode]);

  const setMode = useCallback((next: AppMode) => {
    modeWasPersisted.current = true;
    setModeState(next);
    kvStorage.setItem(MODE_KEY, next).catch(() => {});
  }, []);

  const setCurrentBusinessId = useCallback((id: string) => {
    setCurrentBusinessIdState(id);
    kvStorage.setItem(STORAGE_KEY, id).catch(() => {});
  }, []);

  const value = useMemo<BusinessState>(() => {
    const list = memberships ?? [];
    const current = list.find((m) => m.business_id === currentBusinessId) ?? null;
    return {
      mode,
      setMode,
      isBusinessUser: list.length > 0,
      memberships: list,
      currentMembership: current,
      currentBusinessId: current?.business_id,
      setCurrentBusinessId,
      isLoading,
      error: error ?? null,
    };
  }, [memberships, currentBusinessId, mode, setMode, setCurrentBusinessId, isLoading, error]);

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useCurrentBusiness() {
  const ctx = useContext(BusinessContext);
  if (!ctx) {
    throw new Error('useCurrentBusiness must be used inside BusinessProvider');
  }
  return ctx;
}

/** Convenience selector for routing/UX that only cares about persona. */
export function useAppMode() {
  const { mode, setMode, isBusinessUser, isLoading } = useCurrentBusiness();
  return { mode, setMode, isBusinessUser, isLoading };
}
