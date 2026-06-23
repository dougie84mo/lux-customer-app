import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

// Local, per-device user preferences (no backend). Stored in AsyncStorage.

const PUSH_ENABLED_KEY = 'pref.pushEnabled';

// Whether THIS device should register for push notifications. Defaults to ON
// (matches the prior always-register behavior).
export async function getPushEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(PUSH_ENABLED_KEY);
    return v === null ? true : v === 'true';
  } catch {
    return true;
  }
}

async function setPushEnabledStored(next: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(PUSH_ENABLED_KEY, String(next));
  } catch {
    // best-effort; preference is non-critical
  }
}

// Reactive accessor for the push preference. `loaded` lets the UI avoid a flash
// of the default before AsyncStorage resolves.
export function usePushEnabled() {
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    getPushEnabled().then((v) => {
      if (active) {
        setEnabled(v);
        setLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const update = useCallback(async (next: boolean) => {
    setEnabled(next);
    await setPushEnabledStored(next);
  }, []);

  return { enabled, loaded, setEnabled: update };
}
