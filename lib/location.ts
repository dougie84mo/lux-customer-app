import { useCallback, useState } from 'react';

export type Coords = { lat: number; lng: number };

// Foreground device-location helper for "near me" discovery. Permission is
// requested on demand (when the user taps the toggle), not at startup.
//
// IMPORTANT: expo-location is a NATIVE module. Importing it at module load
// crashes any dev client that wasn't built with it. So we lazy-`require` it
// inside request() behind a try/catch — the rest of the app runs fine in an
// older build, and "Near me" just reports that a rebuild is needed until the
// dev client includes the module.
export function useDeviceLocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async (): Promise<Coords | null> => {
    setLoading(true);
    setError(null);
    try {
      let Location: typeof import('expo-location');
      try {
        Location = require('expo-location') as typeof import('expo-location');
      } catch {
        setError('Location needs a new build of the app to enable “Near me”.');
        return null;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission is needed to sort by distance.');
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCoords(c);
      return c;
    } catch (e: any) {
      setError(e?.message ?? 'Could not get your location.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setCoords(null);
    setError(null);
  }, []);

  return { coords, loading, error, request, clear };
}
